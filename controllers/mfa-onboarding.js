/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 */

/* eslint-disable max-lines-per-function */
const moment = require('moment');

const holderOnboard = require('./onboarding');
const entityHelper = require('../entities');
const constants = require('../helpers/constants');
const csvHelper = require('../helpers/csv-helper');
const registerCodeHelper = require('../helpers/register-code-helper');
const mfaHelper = require('../helpers/mfa-helper');
const utils = require('../utils/index');
const Logger = require('../config/logger');

const logger = new Logger('mfa-onboard-controller');

const validateUserList = (users) => {
    if (!users || !Array.isArray(users)) {
        return 'Must supply a list of users';
    }
    if (users.length === 0) {
        return 'User list cannot be empty';
    }
    return '';
};

const buildCodeDocsForUserList = (users) => {
    // create deep copy of users array
    const usersWithCodes = users.map((user) => JSON.parse(JSON.stringify(user)));
    const codes = utils.generateRegCodes(usersWithCodes.length);

    for (let i = 0; i < usersWithCodes.length; i += 1) {
        const userInfo = usersWithCodes[i];

        userInfo.registerCode = codes[i];
        // TODO: populate code doc based on entity or entityName
        userInfo.uid = utils.hashStrings([userInfo.id, userInfo.clientName]);
        userInfo.name = { givenName: userInfo.givenName, familyName: userInfo.familyName };
        delete userInfo.givenName;
        delete userInfo.familyName;
    }

    return usersWithCodes;
};

const processUsers = async (txID, req, res, entity, sourceDocs) => {
    logger.debug(`processUsers: ${sourceDocs.length} users`);
    const userListErr = validateUserList(sourceDocs);
    if (userListErr) {
        const errMsg = `Error processing user list: ${userListErr}`;
        logger.response(400, `Failed to pre-register users: ${errMsg}`, txID);
        return res.status(400).json({
            error: {
                message: errMsg,
            },
        });
    }

    const entityData = await entityHelper.getRegEntity(txID, entity);
    if (!entityData) {
        const errMsg = `Invalid entity: ${entity}`;
        logger.response(400, `Failed to pre-register users: ${errMsg}`, txID);
        return res.status(400).json({
            error: {
                message: errMsg,
            },
        });
    }

    // TODO: after universal link is functional,
    // switch from using REG_CODE_TEXT_ANDROID / REG_CODE_TEXT_IOS to REG_CODE_TEXT
    const androidMsgField = constants.NOTIFICATION_MSG.REG_CODE_TEXT_ANDROID;
    if (!(androidMsgField in entityData)) {
        // eslint-disable-next-line max-len
        const errMsg = `Organization ${entity} configuration does not include notification text field '${androidMsgField}'`;
        logger.response(500, `Failed to pre-register users: ${errMsg}`, txID);
        return res.status(500).json({
            message: errMsg,
        });
    }

    const iosMsgField = constants.NOTIFICATION_MSG.REG_CODE_TEXT_IOS;
    if (!(iosMsgField in entityData)) {
        const errMsg = `Organization ${entity} configuration does not include notification text field '${iosMsgField}'`;
        logger.response(500, `Failed to pre-register users: ${errMsg}`, txID);
        return res.status(500).json({
            message: errMsg,
        });
    }

    const androidNotifyTemplate = entityData[androidMsgField];
    const iosNotifyTemplate = entityData[iosMsgField];
    const notificationParams = {
        androidNotifyTemplate,
        iosNotifyTemplate,
    }
    const sourceDocsWithCodes = buildCodeDocsForUserList(sourceDocs);
    const { expiration } = utils.getRegCodeExpiration({});
    const registrationResults = await registerCodeHelper.processPreRegistrationItems(
        txID,
        req,
        entity,
        sourceDocs,
        sourceDocsWithCodes,
        expiration,
        notificationParams
    );
    return registrationResults;
};

// process a list of users - JSON list in request body
exports.processUserList = async (req, res) => {
    const txID = req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID];
    const entity = req.body.organization;
    const { users } = req.body;

    try {
        const uploadResults = await processUsers(txID, req, res, entity, users);
        if (uploadResults.status !== 200) {
            logger.response(uploadResults.status, `Failed to pre-register users: ${uploadResults.message}`, txID);
        } else {
            logger.response(200, 'Successfully pre-registered users', txID);
        }
        return res.status(uploadResults.status).json({
            message: uploadResults.message,
            docs: uploadResults.regCodeDocs,
            errors: uploadResults.failedRows,
        });
    } catch (err) {
        return utils.logAndSendErrorResponse(txID, res, err, 'processUserList');
    }
};

const processBatchUsers = async (txID, req, res, entity, sourceDocs) => {
    const uploadResults = await processUsers(txID, req, res, entity, sourceDocs);

    const submittedTimestamp = moment().toISOString();
    const rowCount = sourceDocs.length;
    const { fileName } = req.body;

    const failedRows = utils.getFailedPreRegRows(txID, sourceDocs, uploadResults.regCodeDocs);

    csvHelper.saveUploadResults(txID,
        entity,
        constants.APP_ID_ROLES.REGISTRATION_ADMIN,
        fileName,
        rowCount,
        uploadResults.successCount,
        failedRows,
        uploadResults.batchFailureMessages,
        submittedTimestamp);
};

// process a list of users - CSV list from file
exports.processUserListFromFile = async (req, res) => {
    const txID = req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID];

    const fileValidationErr = csvHelper.validateCsvUpload(txID, req);
    if (fileValidationErr) {
        logger.response(400, `Failed to pre-register users: ${fileValidationErr}`, txID);
        return res.status(400).json({
            error: {
                message: fileValidationErr,
            },
        });
    }

    try {
        return csvHelper.parseUserList(txID, req, res, processBatchUsers);
    } catch (err) {
        return utils.logAndSendErrorResponse(txID, res, err, 'processUserListFromFile');
    }
};

const doValidateVerificationCode = async (txID, req, res) => {
    logger.debug('doValidateVerificationCode()', txID);

    let entity = req.body.organization;
    if (!entity) {
        const errMsg = 'Must specify "organization" in request body';
        logger.response(400, `Failed to validate verification code: ${errMsg}`, txID);
        return res.status(400).json({ error: { message: errMsg } });
    }
    entity = entity.toLowerCase();
    const verificationCode = req.params.code;

    const verCodeLogMsg = `verification code for organization ${entity}`;

    logger.debug(`Checking if entity ${entity} is onboarded`, txID);
    const entityData = await entityHelper.getRegEntity(txID, entity);
    if (!entityData) {
        const errMsg = `Invalid entity: ${entity}`;
        logger.response(400, `Failed to validate ${verCodeLogMsg}: ${errMsg}`, txID);
        return res.status(400).json({
            error: {
                message: errMsg
            },
        });
    }

    // validate verification code: query and check verification status
    const queryRes = await registerCodeHelper.validateVerificationCode(txID, req, entity, verificationCode);
    if (queryRes.status !== 200) {
        const errMsg = `Verification code is invalid: ${queryRes.message}`;
        logger.response(queryRes.status, `Failed to validate ${verCodeLogMsg}: ${errMsg}`, txID);
        return res.status(queryRes.status).json({
            error: {
                message: errMsg
            }
        });
    }

    const verificationCodeDoc = queryRes.data;

    // update verification code status
    verificationCodeDoc.verificationStatus = registerCodeHelper.CODE_STATUS.USED;

    const updateResp = await registerCodeHelper.updateCodeDoc(txID, req, entity, verificationCodeDoc);
    if (updateResp.status !== 200) {
        logger.response(updateResp, `Failed to validate ${verCodeLogMsg}: ${updateResp.message}`, txID);
        return res.status(updateResp.status).json({
            error: {
                message: updateResp.message
            }
        });
    }

    const successMsg = `Successfully validated ${verCodeLogMsg}`;
    logger.response(200, successMsg, txID);
    return res.status(200).json({
        message: successMsg,
        registrationCode: verificationCodeDoc.registerCode,
    });
};

// eslint-disable-next-line complexity
const doSubmitRegistrationAndOnboard = async (txID, req, res) => {
    logger.debug('doSubmitRegistrationAndOnboard()', txID);
    const entity = req.body.organization;
    const regLogMsg = `registration in organization ${entity}`;
    try {
        const resBody = await holderOnboard.onboardHolder(txID, req, res);
        if (resBody.status === 200) {
            const successMsg = `Successfully submitted ${regLogMsg}`;
            logger.response(200, successMsg, txID);
            return res.status(200).json({
                message: successMsg,
                payload: resBody.payload,
            });
        }

        const errMsg = `Failed to submit ${regLogMsg}: ${resBody.message}`;
        logger.response(resBody.status, errMsg, txID);
        return res.status(resBody.status).json({
            error: {
                message: errMsg
            }
        })
    } catch (err) {
        const errMsg = `Failed to submit ${regLogMsg}: ${err.message}`;
        logger.response(500, errMsg, txID);
        return res.status(500).json({
            error: {
                message: errMsg
            },
        });
    }
};

exports.validateRegistrationCode = async (req, res) => {
    const txID = req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID];
    try {
        let entity = req.body.organization;
        if (!entity) {
            const errMsg = 'Must specify "organization" in request body';
            logger.response(400, `Failed to validate registration code: ${errMsg}`, txID);
            return res.status(400).json({ error: { message: errMsg } });
        }

        entity = entity.toLowerCase();
        const regCode = req.params.code;
        const {regInfo} = req.body;

        const validateRes = await mfaHelper.validateRegCode(txID, req, entity, regCode);
        if (validateRes.status !== 200) {
            logger.response(
                validateRes.status,
                `Failed to validate registration code for organization ${entity}: ${validateRes.message}`,
                txID
            );
            return res.status(validateRes.status).json({
                error: {
                    message: validateRes.message
                }
            });
        }

        logger.response(200, validateRes.message, txID);
        if (regInfo) {
            return res.status(200).json({
                message: validateRes.message,
                payload: validateRes.regInfo
            });
        } 
        return res.status(200).json({
            message: validateRes.message
        });        
    } catch (err) {
        return utils.logAndSendErrorResponse(txID, res, err, 'validateRegistrationCode');
    }
};

exports.validateVerificationCode = async (req, res) => {
    const txID = req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID];
    try {
        return await doValidateVerificationCode(txID, req, res);
    } catch (err) {
        return utils.logAndSendErrorResponse(txID, res, err, 'validateVerificationCode');
    }
};

exports.submitRegistration = async (req, res) => {
    const txID = req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID];
    try {
        return await doSubmitRegistrationAndOnboard(txID, req, res);
    } catch (err) {
        return utils.logAndSendErrorResponse(txID, res, err, 'submitRegistration');
    }
};
