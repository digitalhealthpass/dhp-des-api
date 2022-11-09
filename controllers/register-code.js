/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 */

const entityHelper = require('../entities');
const constants = require('../helpers/constants');
const registerCodeHelper = require('../helpers/register-code-helper');
const utils = require('../utils/index');
const Logger = require('../config/logger');

const logger = new Logger('register-code-controller');

const generateRegistrationCodes = async (txID, req, res) => {
    logger.debug('generateRegistrationCodes()', txID);

    const entity = req.params.entity.toLowerCase();
    const howmany = req.params.howmany || 1;
    const regCodesLogMsg = `registration codes for organization ${entity}`;

    const entityData = await entityHelper.getRegEntity(txID, entity);
    if (!entityData) {
        const errMsg = `Invalid entity: ${entity}`;
        logger.response(400, `Failed to generate ${regCodesLogMsg}: ${errMsg}`, txID);
        return res.status(400).json({
            error: {
                message: errMsg,
            },
        });
    }

    const codes = utils.generateRegCodes(howmany);

    const expirationRes = utils.getRegCodeExpiration(req.query);
    if (expirationRes.status !== 200) {
        logger.response(expirationRes.status, `Failed to generate ${regCodesLogMsg}: ${expirationRes.message}`, txID);
        return res.status(expirationRes.status).json({
            error: {
                message: expirationRes.message,
            },
        });
    }
    const { expiration } = expirationRes;

    logger.debug(`Attempting to generate ${regCodesLogMsg}`, txID);
    const resBody = await registerCodeHelper.updateRegistrationCodes(txID, req, entity, codes, expiration);
    const resMsg = resBody.message.replace('uploaded', 'generated');
    if (resBody.status !== 201) {
        logger.response(resBody.status, resMsg, txID);
    } else {
        logger.response(201, `Successfully generated ${regCodesLogMsg}`)
    }
    return res.status(resBody.status).json({
        message: resMsg,
        docs: resBody.docs,
        errors: resBody.errs,
    });
};

exports.generate = async (req, res) => {
    const txID = req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID];
    try {
        return await generateRegistrationCodes(txID, req, res);
    } catch (err) {
        return utils.logAndSendErrorResponse(txID, res, err, 'generate registration codes');
    }
};

const uploadRegistrationCodes = async (txID, req, res) => {
    logger.safeDebug('uploadRegistrationCodes()', req.body, txID);
    // TODO: logic here is almost identical to that of generateRegistrationCodes() - need to consolidate
    const entity = req.params.entity.toLowerCase();
    const regCodesLogMsg = `registration codes for organization ${entity}`;

    const errMsg = utils.validateReqBody(txID, req.body, constants.REG_UPLOAD.REQUIRED);
    if (errMsg) {
        logger.response(400, `Failed to upload ${regCodesLogMsg}: ${errMsg}`, txID);
        return res.status(400).json({
            error: {
                message: errMsg,
            },
        });
    };

    const entityData = await entityHelper.getRegEntity(txID, entity);
    if (!entityData) {
        const errMsg = `Invalid entity: ${entity}`;
        logger.response(400, `Failed to upload ${regCodesLogMsg}: ${errMsg}`, txID);
        return res.status(400).json({
            error: {
                message: errMsg,
            },
        });
    }

    const codes = req.body.registrationCodes;
    let isGlobal = false;
    if(entityData.globalRegCodeAllowed === true && req.body.isGlobal === true){
        isGlobal = true;
    }

    const expirationRes = utils.getRegCodeExpiration(req.query);
    if (expirationRes.status !== 200) {
        const errMsg = `Failed to upload ${regCodesLogMsg}: ${expirationRes.message}`;
        logger.response(expirationRes.status, errMsg, txID);
        return res.status(expirationRes.status).json({
            error: {
                message: expirationRes.message,
            },
        });
    }
    const { expiration } = expirationRes;

    logger.debug(`Attempting to upload ${regCodesLogMsg}`, txID);
    const resBody = await registerCodeHelper.updateRegistrationCodes(txID, req, entity, codes, expiration, isGlobal);
    if (resBody.status !== 201) {
        const errMsg = `Failed to upload ${regCodesLogMsg}: ${resBody.message}`;
        logger.response(resBody.status, errMsg, txID);
    } else {
        logger.response(201, `Successfully generated ${regCodesLogMsg}`);
    }
    return res.status(resBody.status).json({
        message: resBody.message,
        docs: resBody.docs,
        errors: resBody.errs,
    });
};

exports.upload = async (req, res) => {
    const txID = req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID];
    try {
        return await uploadRegistrationCodes(txID, req, res);
    } catch (err) {
        return utils.logAndSendErrorResponse(txID, res, err, 'upload registration codes');
    }
};

// eslint-disable-next-line complexity
const queryRegisterCodes = async (req, res, txID) => {
    logger.info('Entering GET /register-code/codes controller', txID);

    const howmany = Number(req.params.howmany);
    if (Number.isNaN(howmany) || howmany < 1 || howmany > 200) {
        const errMsg = `Invalid quantity: ${req.params.howmany} (must be number between 1 and 200)`;
        logger.response(400, `Failed to query registration codes: ${errMsg}`, txID);
        return res.status(400).json({
            error: {
                message: errMsg,
            },
        });
    }

    const { status } = req.query;
    if (status && status !== registerCodeHelper.CODE_STATUS.NEW && status !== registerCodeHelper.CODE_STATUS.USED) {
        const errMsg = `Invalid status: ${status} (must be 'new' or 'used')`;
        logger.response(400, `Failed to query registration codes: ${errMsg}`, txID);
        return res.status(400).json({
            error: {
                message: errMsg,
            },
        });
    }

    const entity = req.params.entity.toLowerCase();
    const entityData = await entityHelper.getRegEntity(txID, entity);
    if (!entityData) {
        const errMsg = `Invalid entity: ${entity}`;
        logger.response(400, `Failed to query registration codes: ${errMsg}`, txID);
        return res.status(400).json({
            error: {
                message: errMsg,
            },
        });
    }

    logger.debug(`Attempting to query ${howmany} registration codes from Cloudant`, txID);
    const resBody = await registerCodeHelper.queryRegistrationCodes(txID, req, entity, howmany, status);
    if (resBody.status !== 200) {
        const errMsg = `Failed to query registration codes: ${resBody.message}`;
        logger.response(resBody.status, errMsg, txID);
    } else {
        logger.response(200, `Successfully queried registration codes`, txID);
    }
    return res.status(resBody.status).json({
        message: resBody.message,
        docs: resBody.docs,
    });
};

exports.query = async (req, res) => {
    const txID = req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID];
    try {
        return await queryRegisterCodes(req, res, txID);
    } catch (err) {
        return utils.logAndSendErrorResponse(txID, res, err, 'query registration codes');
    }
};
