/* eslint-disable max-lines-per-function */
/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 *
 */
// todo rename file to code-doc-helper.js

const { getGdprLogger, CRUD_OPERATION } = require('dhp-logging-lib/gdpr');
const entityHelper = require('../entities');
const constants = require('./constants');
const config = require('../config');
const utils = require('../utils/index');
const notificationHelper = require('./notification-helper');
const CloudantHelper = require('./cloudantHelper');
const Logger = require('../config/logger');

const gdprLogger = getGdprLogger();
const logger = new Logger('register-code-helper');
const CODE_STATUS = {
    NEW: 'new',
    USED: 'used',
    GLOBAL: 'global'
};

let batchMaxErrorThreshold = 20;
if (config.csv && config.csv.batchMaxErrorThreshold)
    batchMaxErrorThreshold = config.csv.batchMaxErrorThreshold;

const prepareDbName = (organization, dbName) => {
    return `${organization}-${dbName}`;
};

// build Cloudant doc for a registration code
const buildRegCodeDoc = (code, expiration, isGlobal) => {
    const currentDate = new Date();
    const createdTimestamp = Math.round(currentDate.getTime() / 1000);
    const updatedTimestamp = createdTimestamp;
    const expirationTimestamp = expiration;

    let doc = {
        status: isGlobal ? CODE_STATUS.GLOBAL : CODE_STATUS.NEW,
        createdTimestamp,
        updatedTimestamp,
        expirationTimestamp,
    };

    // if code is an object, it has extra user registration fields
    if (typeof code === 'object') {
        doc = {
            ...doc,
            ...code,
        };
        doc._id = code.registerCode;
        delete doc._rev;
    } else {
        doc._id = code;
        doc.registerCode = code;
    }

    return doc;
};

const prepareRegCodeDocs = (txID, codeList, expiration, isGlobal) => {
    logger.debug('Preparing registration code docs', txID);
    const uploadErrs = [];
    const regCodeDocs = [];

    const minLen = config.registrationCode.minLength;
    const maxLen = config.registrationCode.maxLength;
    codeList.forEach((code) => {
        const regCode = typeof code === 'object' ? code.registerCode : code;
        if (regCode.length < minLen || regCode.length > maxLen) {
            uploadErrs.push({
                error: 'invalid',
                reason: `Code must be between ${minLen} and ${maxLen} characters`,
                registerCode: regCode,
            });
        } else {
            regCodeDocs.push(buildRegCodeDoc(code, expiration, isGlobal));
        }
    });
    return { regCodeDocs, uploadErrs };
};

const prepareRegistrationCodesRes = (txID, uploadDocs, uploadErrs) => {
    logger.debug('Preparing response for saving registration code docs in Cloudant', txID);
    const uploadResObject = {};
    let status;
    let message;
    if (uploadErrs.length === 0) {
        status = 201;
        message = 'Registration codes uploaded successfully';
    } else if (uploadDocs.length === 0) {
        status = 400;
        message = 'No registration codes uploaded';
    } else {
        status = 409;
        message = 'Some registration codes uploaded successfully';
    }
    uploadResObject.docs = uploadDocs;
    uploadResObject.errs = uploadErrs;
    uploadResObject.status = status;
    uploadResObject.message = message;
    return uploadResObject;
};

// get Cloudant doc for a code (verification or registration code) and
// validates the code by checking 'status' field, and 'expiration' field is not-expired.
// Returns the doc
// eslint-disable-next-line complexity
const validateCodeDoc = async (txID, req, entity, code) => {
    logger.debug(`Validating registration code doc for code ${code}`, txID);
    const cloudantHelper = CloudantHelper.getInstance(txID);
    const dbName = `${entity}-${constants.DB_NAMES.REGISTER}`;

    try {
        logger.debug(`Attempting to read registration code doc for code ${code}`, txID);
        const readDoc = await cloudantHelper.readDocumentSafe(txID, code, dbName);
        if (readDoc.status !== 200) {
            const errorMsg = `Registration code doc not found for code ${code}`;
            logger.error(errorMsg, txID);
            return { status: 404, message: errorMsg };
        }

        const registrationData = readDoc.data;

        const holderId = await entityHelper.getHolderId(
            txID, entity, registrationData
        );
        if (holderId) {
            gdprLogger.log(req, holderId, CRUD_OPERATION.READ);
        }

        if ((registrationData.status !== CODE_STATUS.NEW) && (registrationData.status !== CODE_STATUS.GLOBAL)) {
            // eslint-disable-next-line max-len
            const errorMsg = `Registration code status is '${registrationData.status}', but a code can only be used once - status must be ${CODE_STATUS.NEW}`;
            logger.error(errorMsg, txID);
            return { status: 400, message: errorMsg };
        }

        const currentDate = new Date();
        const currentTimestamp = Math.round(currentDate.getTime() / 1000);
        if (currentTimestamp >= registrationData.expirationTimestamp) {
            const errorMsg = `Registration code expired at ${registrationData.expirationTimestamp}`;
            logger.error(errorMsg, txID);
            return { status: 400, message: errorMsg };
        }

        // Clean up old verfication code doc if it exists
        if (registrationData.verificationCode) {
            const readDoc = await cloudantHelper.readDocumentSafe(
                txID, String(registrationData.verificationCode), dbName
            );
            if (readDoc.status !== 200 && readDoc.status !== 404) {
                // eslint-disable-next-line max-len
                const errorMsg = `Failed to validate registration code ${registrationData.verificationCode}`;
                logger.error(errorMsg, txID);
                return { status: readDoc.status, message: errorMsg };
            }
            if (readDoc.status !== 404) {
                const verificationData = readDoc.data
                await cloudantHelper.deleteDocumentSafe(
                    txID, verificationData._id, verificationData._rev, dbName
                );
            }
        }

        return { status: 200, message: `Registration code ${code} is valid`, data: registrationData };
    } catch (error) {
        const errMsg = `Failed to validate registration code ${code}: ${error.message}`;
        logger.error(errMsg, txID);
        return { status: 500, message: errMsg };
    }
};

const readCodeDoc = async (txID, entity, code) => {
    logger.debug('readCodeDoc()', txID);
    const cloudantHelper = CloudantHelper.getInstance(txID);
    const dbName = `${entity}-${constants.DB_NAMES.REGISTER}`;
    try {
        logger.debug(`Attempting to read registration code doc for code ${code}`, txID);
        const readDoc = await cloudantHelper.readDocumentSafe(txID, code, dbName);
        if (readDoc.status !== 200) {
            const warnMsg = `Registration code doc for code ${code} not found`;
            logger.warn(warnMsg, txID);
            return { status: 404, message: warnMsg };
        }

        const registrationData = readDoc.data;

        return { status: 200, message: `Registration code doc found for code ${code}`, data: registrationData };
    } catch (error) {
        const errMsg = `Failed to read registration code doc for ${code}: ${error.message}`;
        logger.error(errMsg, txID);
        return { status: 500, message: errMsg };
    }
};

const sendMFAHolderEmailNotification = async (txID, req, user, entity, entityData) => {
    try {
        if (entityData.emailTemplate && entityData.emailTemplate.RegistrationCode) {
            const emailContent = {
                "subject": entityData.emailTemplate.RegistrationCode.subject,
                "content": notificationHelper.getNotificationText(txID, 
                    entityData.emailTemplate.RegistrationCode.content, entity, user.registerCode)
            }
            await notificationHelper.sendEmailNotification(
                txID,
                req,
                user[constants.NOTIFICATION_TYPE.EMAIL],
                emailContent
            );
        } else {
            const errMsg = `Email template is not defined in organization`;
            return {
                status: 500,
                message: errMsg
            };
        }
        
    } catch (err) {
        return {
            status: 500,
            message: err.message
        };
    }
    return {
        status: 200
    };
};

const sendMFAHolderSMSNotification = async (txID, request, entity, user, notificationParams) => {
    try {
        // send sms with registration code to holder
        const androidTextMsg = notificationHelper.getNotificationText(
            txID,
            notificationParams.androidNotifyTemplate,
            entity,
            user.registerCode
        );
        const iosTextMsg = notificationHelper.getNotificationText(
            txID,
            notificationParams.iosNotifyTemplate,
            entity,
            user.registerCode
        );
        // eslint-disable-next-line no-await-in-loop
        await notificationHelper.sendMFAHolderNotification(
            txID,
            request,
            user[constants.NOTIFICATION_TYPE.PHONE],
            iosTextMsg,
            androidTextMsg,
        );
    } catch (err) {
        return {
            status: 500,
            message: err.message
        };
    }
    return {
        status: 200
    };
};

const processPreRegistration = async (txID, request, entity, user, cloudantRes, notificationParams, entityData) => {
    // check cloudant response
    if (!cloudantRes.ok) {
        return {
            status: 500,
            message: cloudantRes.reason
        };
    }

    if (entityData.userRegistrationConfig.flow.holderNotification == null 
        || entityData.userRegistrationConfig.flow.holderNotification) {
        if (user.mobile && user.mobile !== "") {
            return sendMFAHolderSMSNotification(txID, request, entity, user, notificationParams);
        } if (user.email){
            return sendMFAHolderEmailNotification(txID, request, user, entity, entityData);   
        } 
        return {
            status: 500,
            message: "Neither mobile nor email was input!"
        };
        
    } 
    return {
        status: 200
    };
    
};

// create registration codes for mfa user registration with csv files
// compared to updateRegistrationCodes(), this function returns more explicit errors for use with UI
// eslint-disable-next-line complexity
const processPreRegistrationItems = async (
    txID,
    req,
    entity,
    sourceDocs,
    sourceDocsWithCodes,
    expiration,
    notificationParams
) => {
    logger.debug(`processPreRegistrationItems() for ${entity}`, txID);
    const cloudantHelper = CloudantHelper.getInstance(txID);
    const registerDB = prepareDbName(entity, constants.DB_NAMES.REGISTER);
    const batchQueueDB = prepareDbName(entity, constants.DB_NAMES.BATCH_QUEUE);

    try {
        logger.debug('Attempting to build registration code docs', txID);

        const regCodeDocs = sourceDocsWithCodes.map(
            (sourceDocWithCode) => buildRegCodeDoc(sourceDocWithCode, expiration)
        );

        // upload valid rows to cloudant
        logger.debug('Attempting to upload registration code docs to database', txID);
        const registerDocs = { docs: regCodeDocs };
        const bulkCloudantRes = await cloudantHelper.createDocumentBulk(txID, '', registerDocs, registerDB);

        let errCount = 0;
        let successCount = 0;
        const batchFailureMessages = [];

        const entityIdHelper = await entityHelper.getEntityIdHelper(txID, entity);
        const entityData = await entityHelper.getRegEntity(txID, entity);
        if (!entityIdHelper) {

            const abortMsg = `Batch processing aborted because invalid organization ${entity}, helper not found`;
            logger.error(`${txID} : ${abortMsg}`, txID);
            batchFailureMessages.push(abortMsg);

            return { status: 200, successCount, batchFailureMessages, regCodeDocs };
        }

        for (let i = 0; i < regCodeDocs.length; i += 1) {
            const regCodeDoc = regCodeDocs[i];
            const cloudantRes = bulkCloudantRes[i];

            const sourceDoc = sourceDocs[i];
            const sourceDocID = sourceDocs[i]._id;
            const sourceDocRev = sourceDocs[i]._rev;
            const hasCloudantDoc = '_id' in sourceDocs[i] && '_rev' in sourceDocs[i];

            // eslint-disable-next-line no-await-in-loop
            const { status, message} = await processPreRegistration(
                txID,
                req,
                entity,
                regCodeDoc,
                cloudantRes,
                notificationParams,
                entityData
            );
            if (status === 200) {
                logger.debug(`Successfully processed pre-registration: ${regCodeDoc.rowID}`, txID);
                if (hasCloudantDoc) {
                    // if successfully processed, delete source data from DB
                    // eslint-disable-next-line max-len
                    logger.debug(`Attempting to delete pre-registration source data from ${batchQueueDB} database`, txID);
                    // eslint-disable-next-line no-await-in-loop
                    await cloudantHelper.deleteDocumentSafe(txID, sourceDocID, sourceDocRev, batchQueueDB);
                }

                const holderId = entityIdHelper.getHolderID(regCodeDoc);
                if (holderId) {
                    gdprLogger.log(req, holderId, CRUD_OPERATION.CREATE);
                }

                successCount += 1;
            } else {
                const errMsg = `Failed to process pre-registration : ${message}`;
                logger.error(errMsg, txID);
                regCodeDoc.errorMessage = errMsg;

                // if failed to process, update source doc with error message
                if (hasCloudantDoc) {
                    sourceDoc.errorMessage = errMsg;
                    // eslint-disable-next-line max-len
                    logger.debug(`Attempting to update pre-registration source data with error=${message} in ${batchQueueDB} database`, txID);
                    // eslint-disable-next-line no-await-in-loop
                    await cloudantHelper.updateDocumentSafe(txID, sourceDocID, sourceDocRev, sourceDoc, batchQueueDB);
                }
                errCount += 1;
            }

            if (errCount >= batchMaxErrorThreshold) {
                const abortMsg = `Batch processing abandoned after ${errCount} failures`;
                logger.error(`${txID} : ${abortMsg}`, txID);
                batchFailureMessages.push(abortMsg);
                break;
            }
        }
        return { status: 200, successCount, batchFailureMessages, regCodeDocs };
    } catch (error) {
        const errMsg = `Error occurred when processing pre-registration items: ${error.message}`;
        logger.error(errMsg, txID);
        return { status: error.statusCode, message: errMsg };
    }
};

// inserting/uploading new registration codes
const updateRegistrationCodes = async (txID, req, entity, codes, expiration, isGlobal) => {
    logger.safeDebug(`updateRegistrationCodes() for ${entity} with codes:`, codes, txID);

    const cloudantHelper = CloudantHelper.getInstance(txID);
    const dbName = prepareDbName(entity, constants.DB_NAMES.REGISTER);

    try {
        const uploadDocs = [];

        const { regCodeDocs, uploadErrs } = prepareRegCodeDocs(txID, codes, expiration, isGlobal);
        const registerDocs = { docs: regCodeDocs };

        logger.debug('Attempting to create registration code docs in Cloudant', txID);
        const cloudantRes = await cloudantHelper.createDocumentBulk(txID, '', registerDocs, dbName);
        for (let i = 0; i < registerDocs.docs.length; i += 1) {
            const doc = registerDocs.docs[i];
            const cres = cloudantRes[i];
            if ('error' in cres) {
                logger.warn(`Failed to save registration code doc ${doc._id}`, txID);
                if (cres.error === 'conflict') {
                    cres.registerCode = doc._id;
                    delete cres.id;

                    // eslint-disable-next-line no-await-in-loop
                    const valRes = await validateCodeDoc(txID, req, entity, cres.registerCode);
                    if (valRes.status === 400) {
                        // This tells us code is used or expired
                        cres.reason = valRes.message;
                    } else if (valRes.status === 200) {
                        cres.reason = 'Registration code doc already exists in Database';
                    }
                }
                uploadErrs.push(cres);
            } else {
                delete doc._id;
                uploadDocs.push(doc);
            }
        }
        return prepareRegistrationCodesRes(txID, uploadDocs, uploadErrs);
    } catch (error) {
        const errMsg = `Error occurred when creating register codes: ${error.message}`;
        logger.error(errMsg, txID);
        return { status: error.statusCode, message: errMsg };
    }
};

// querying registration codes
// eslint-disable-next-line complexity
const queryRegistrationCodes = async (txID, req, entity, num, status) => {
    logger.debug('queryRegistrationCodes()', txID);
    const dbName = prepareDbName(entity, constants.DB_NAMES.REGISTER);
    const cloudantHelper = CloudantHelper.getInstance(txID);

    try {
        const queryParams = {
            selector: {},
            limit: Number(num),
        };
        if (status) queryParams.selector.status = status;

        const queriedDocs = await cloudantHelper.queryDocuments(txID, queryParams, dbName);
        logger.info(`Queried ${num} registration code docs in Cloudant`, txID);
        if (!queriedDocs || !queriedDocs.docs || queriedDocs.docs.length === 0) {
            let warnMsg;
            if (status) {
                warnMsg = `No registration codes found with status ${status}`;
            } else {
                warnMsg = 'No registration codes found';
            }
            logger.warn(warnMsg, txID);
            return { status: 404, message: warnMsg, docs: [] };
        }

        const entityIdHelper = await entityHelper.getEntityIdHelper(txID, entity);
        if (!entityIdHelper) {
            return {
                status: 400,
                message: `Invalid organization ${entity}, helper not found`
            }
        }
        
        const codes = queriedDocs.docs.map((code) => {
            // eslint-disable-next-line no-param-reassign
            delete code._id;
            // eslint-disable-next-line no-param-reassign
            delete code._rev;

            const holderId = entityIdHelper.getHolderID(code);
            if (holderId) {
                gdprLogger.log(req, holderId, CRUD_OPERATION.READ);
            }
            return code;
        });

        return { status: 200, message: 'Registration codes found', docs: codes };
    } catch (error) {
        const errMsg = `Failed to query registration codes: ${error.message}`;
        logger.error(errMsg, txID);
        return { status: 500, message: 'Internal error querying registration codes', docs: [] };
    }
};

// eslint-disable-next-line complexity
const validateVerificationCode = async (txID, req, entity, code) => {
    logger.debug('validateVerificationCode()', txID);

    const dbName = prepareDbName(entity, constants.DB_NAMES.REGISTER);
    const cloudantHelper = CloudantHelper.getInstance(txID);

    try {
        let badCode = false;
        if (Number.isNaN(code))
            badCode = true;

        const codeValue = parseInt(code, 10);
        if (codeValue <= 0)
            badCode = true;

        if (badCode) {
            const errMsg = 'Incorrect verification code format';
            logger.response(500, errMsg, txID);
            return { status: 500, message: `${errMsg}`, data: {} };
        }

        const readDoc = await cloudantHelper.readDocumentSafe(
            txID, String(codeValue), dbName
        );
        if (readDoc.status !== 200) {
            const warnMsg = 'Verification code doc not found';
            logger.warn(warnMsg, txID);
            return { status: 404, message: warnMsg, data: {} };
        }

        const codeDoc = readDoc.data;

        if (codeDoc.verificationStatus !== CODE_STATUS.NEW) {
            // eslint-disable-next-line max-len
            const errorMsg = `Verification code status is '${codeDoc.verificationStatus}', but a code can only be used once - status must be ${CODE_STATUS.NEW}`;
            logger.error(errorMsg, txID);
            return { status: 400, message: errorMsg };
        }
        
        const holderId = await entityHelper.getHolderId(txID, entity, codeDoc);
        if (holderId) {
            gdprLogger.log(req, holderId, CRUD_OPERATION.READ);
        }

        // check verification code expiration timestamp
        const currentDate = new Date();
        const currentTimestamp = Math.round(currentDate.getTime() / 1000);
        if (currentTimestamp >= codeDoc.expirationTimestamp) {
            const errorMsg = `Verification code has already expired`;
            logger.error(errorMsg, txID);
            return { status: 400, message: errorMsg, date: {} };
        }

        return { status: 200, message: 'Verification code found', data: codeDoc };
    } catch (error) {
        const errMsg = `Failed to query verification code: ${error.message}`;
        logger.error(errMsg, txID);
        return { status: 500, message: 'Internal error querying verification code', data: {} };
    }
};

// Marks as used the specified code doc, in the specified entity's registration DB
// eslint-disable-next-line complexity
const updateCodeDocStatusToUsed = async (txID, req, entity, code) => {
    const cloudantHelper = CloudantHelper.getInstance(txID);
    const dbName = `${entity}-${constants.DB_NAMES.REGISTER}`;

    try {
        const readDoc = await cloudantHelper.readDocumentSafe(txID, code, dbName);
        if (readDoc.status !== 200) {
            const msg = `Failed to read code doc ${code} from Database`;
            logger.error(msg, txID);
            return { status: 400, message: msg };
        }
        const doc = readDoc.data;

        if (doc.status !== CODE_STATUS.NEW && doc.status !== CODE_STATUS.GLOBAL) {
            // eslint-disable-next-line max-len
            const errorMsg = `Code status is ${doc.status}, but a code can only be used once - status must be ${CODE_STATUS.NEW}`;
            logger.error(errorMsg, txID);
            return { status: 400, message: errorMsg };
        }
        // Update not required for global regcode. 
        if(doc.status !== CODE_STATUS.GLOBAL){
            const currentDate = new Date();
            const currentTimestamp = Math.round(currentDate.getTime() / 1000);
            doc.updatedTimestamp = currentTimestamp;
            doc.status = CODE_STATUS.USED;

            logger.debug(`Attempting to update code doc for code ${code} in Cloudant`, txID);
            const updateDoc = await cloudantHelper.updateDocument(txID, doc._id, doc._rev, doc, dbName);
            if (!updateDoc || !updateDoc.ok) {
                const errMsg = `Failed to update code doc for code ${code} in Database`;
                logger.error(errMsg, txID);
                return { status: 500, message: errMsg };
            }
        }
        return { status: 200, message: `Successfully updated code doc for code ${code}` };
    } catch (error) {
        logger.error(`Error occurred updating code doc in Cloudant: ${error.message}`, txID);
        // Because document has specific _id, check for conflict (NOT server error)
        if (error.message && error.message.includes('conflict')) {
            return { status: 400, message: `Multiple simultaneous attempts to update code doc for code ${code}` };
        }
        return { status: 500, message: `Internal error updating code document for code ${code}` };
    }
};

// eslint-disable-next-line complexity
const deleteRegCodeRelatedDocs = async (txID, entity, registrationCode) => {
    const cloudantHelper = CloudantHelper.getInstance(txID);
    const dbName = `${entity}-${constants.DB_NAMES.REGISTER}`;

    try {
        const readDoc = await cloudantHelper.readDocumentSafe(txID, registrationCode, dbName);
        if (readDoc.status !== 200) {
            const msg = `Failed to read code doc ${registrationCode} from Database`;
            logger.error(msg, txID);
            return { status: 400, message: msg };
        }
        const doc = readDoc.data;

        if (doc.status !== CODE_STATUS.NEW && doc.status !== CODE_STATUS.GLOBAL) {
            // eslint-disable-next-line max-len
            const errorMsg = `Code status is ${doc.status}, but a code can only be used once - status must be ${CODE_STATUS.NEW}`;
            logger.error(errorMsg, txID);
            return { status: 400, message: errorMsg };
        }
        // Update not required for global regcode. 
        if(doc.status !== CODE_STATUS.GLOBAL){
            // delete the doc
            await cloudantHelper.deleteDocument(txID, registrationCode, doc._rev, dbName);
            const {verificationCode} = doc;
            if (verificationCode) {
                const verificationData = 
                    await cloudantHelper.readDocumentSafe(txID, verificationCode, dbName);
                if (verificationData.status === 200) {
                    await cloudantHelper.deleteDocument(txID, verificationCode, verificationData.data._rev, dbName);
                }
            }
        }
        return { status: 200, message: `Successfully updated code doc for code ${registrationCode}` };
    } catch (error) {
        logger.error(`Error occurred updating code doc in Cloudant: ${error.message}`, txID);
        // Because document has specific _id, check for conflict (NOT server error)
        if (error.message && error.message.includes('conflict')) {
            return { status: 400, 
                message: `Multiple simultaneous attempts to update code doc for code ${registrationCode}` };
        }
        return { status: 500, message: `Internal error updating code document for code ${registrationCode}` };
    }
};

const createVerificationCodeDoc = async (
    txID, entity, verificationCode, registrationDocID, registerCode
) => {
    const cloudantHelper = CloudantHelper.getInstance(txID);
    const dbName = `${entity}-${constants.DB_NAMES.REGISTER}`;
    
    const currentDate = new Date();
    const currentTimestamp = Math.round(currentDate.getTime() / 1000);

    const expirationTimestamp = utils.getVerificationCodeExpiration();
    logger.debug(`Generating verification code expiration date: ${expirationTimestamp}`, txID);

    const id = String(verificationCode)

    const verificationCodeDoc = {
        verificationCode,
        createdTimestamp: currentTimestamp,
        expirationTimestamp,
        verificationStatus: CODE_STATUS.NEW,
        registerCode,
        registrationDocID
    }

    try {
        logger.debug('Attempting to create verification code doc', txID);
        const cloudantRes = await cloudantHelper.createDocument(
            txID, id, verificationCodeDoc, dbName
        );
        
        if (!cloudantRes.ok) {
            const errMsg = `Failed to create verification code doc ${id} in Database`;
            logger.error(errMsg, txID);
            return { status: 500, message: errMsg };
        }

        return { status: 200, message: `Successfully created verification code doc ${id} in Database` };
    } catch (error) {
        logger.error(`Error occurred creating verification code doc ${id} in Cloudant: ${error.message}`, txID);
        return { status: error.statusCode, message: `Internal error creating verification code doc ${id}` };
    }
}

// Update a code doc that was previously read (must include cloudant _rev field)
const updateCodeDoc = async (txID, req, entity, updatedCodeDoc) => {
    const cloudantHelper = CloudantHelper.getInstance(txID);
    const dbName = `${entity}-${constants.DB_NAMES.REGISTER}`;
    const doc = updatedCodeDoc;

    try {
        const currentDate = new Date();
        const currentTimestamp = Math.round(currentDate.getTime() / 1000);
        doc.updatedTimestamp = currentTimestamp;

        logger.debug(`Attempting to update code doc ${doc._id} in Cloudant`, txID);
        const updateDoc = await cloudantHelper.updateDocument(txID, doc._id, doc._rev, doc, dbName);
        if (!updateDoc || !updateDoc.ok) {
            const errMsg = `Failed to update code doc ${doc._id} in Database`;
            logger.error(errMsg, txID);
            return { status: 500, message: errMsg };
        }

        const holderId = await entityHelper.getHolderId(txID, entity, doc);
        if (holderId) {
            gdprLogger.log(req, holderId, CRUD_OPERATION.UPDATE);
        }

        return { status: 200, message: `Successfully updated code doc ${doc._id} in Database` };
    } catch (error) {
        logger.error(`Error occurred updating code doc ${doc._id} in Cloudant: ${error.message}`, txID);
        // Because document has specific _id, check for conflict (NOT server error)
        if (error.message && error.message.includes('conflict')) {
            return { status: 400, message: `Multiple simultaneous attempts to update code doc ${doc._id}` };
        }
        return { status: 500, message: `Internal error updating code doc ${doc._id}` };
    }
};

const deleteCodeDoc = async (txID, entity, docID, docRev) => {
    const cloudantHelper = CloudantHelper.getInstance(txID);
    const dbName = `${entity}-${constants.DB_NAMES.REGISTER}`;
    try {
        logger.debug(`Attempting to delete code doc ${docID} in Database`, txID);
        await cloudantHelper.deleteDocument(txID, docID, docRev, dbName);

        return { status: 200, message: 'Deleted code document' };
    } catch (error) {
        const errMsg = `Failed to delete code doc ${docID} in Database: ${error.message}`;
        logger.error(errMsg, txID);
        return { status: 500, message: errMsg };
    }
};

module.exports = {
    CODE_STATUS,
    prepareDbName,
    buildRegCodeDoc,
    prepareRegCodeDocs,
    validateCodeDoc,
    readCodeDoc,
    createVerificationCodeDoc,
    updateCodeDoc,
    updateCodeDocStatusToUsed,
    deleteRegCodeRelatedDocs,
    deleteCodeDoc,
    processPreRegistrationItems,
    updateRegistrationCodes,
    queryRegistrationCodes,
    validateVerificationCode,
};
