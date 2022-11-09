/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 */
const moment = require('moment');
const Bottleneck = require('bottleneck');
const jslt = require('jslt');

const { getGdprLogger, CRUD_OPERATION } = require('dhp-logging-lib/gdpr');
const constants = require('../../helpers/constants');
const config = require('../../config');
const CloudantHelper = require('../../helpers/cloudantHelper');
const entityHelper = require('..');
const entityIdHelper = require('./id-helper');
const csvHelper = require('../../helpers/csv-helper');
const profileHelper = require('../../helpers/profile-helper');
const hpassHelper = require('../../helpers/hpass-helper');
const postboxHelper = require('../../helpers/postbox-helper');
const notificationHelper = require('../../helpers/notification-helper');
const mapperHelper = require('../../helpers/mapper-helper');
const utils = require('../../utils/index');
const Logger = require('../../config/logger');

const gdprLogger = getGdprLogger();
const logger = new Logger('holder-download-data-helper');

// error threshold for batch processing abort 
let batchMaxErrorThreshold = 20;
if (config.csv && config.csv.batchMaxErrorThreshold)
    batchMaxErrorThreshold = config.csv.batchMaxErrorThreshold;

const updateStats = async (txID, entity, statDocs, submissionTimestamp) => {
    const dbName = `${entity}-${constants.DB_NAMES.STATS}`;
    const cloudantHelper = CloudantHelper.getInstance(txID);
    const uploadDocs = {};

    try {
        // populate data to upload, adding timestamp        
        statDocs.forEach((statDoc) => {
            // eslint-disable-next-line no-param-reassign
            statDoc.submissionTimestamp = submissionTimestamp;
            logger.debug(`statdoc -- ${JSON.stringify(statDoc)}`, txID);
        });
        uploadDocs.docs = statDocs;
        logger.debug('Attempting to create stat docs in bulk', txID);
        const cloudantRes = await cloudantHelper.createDocumentBulk(txID, '', uploadDocs, dbName);
        logger.safeInfo('Successfully created stat docs', cloudantRes, txID);
    } catch (error) {
        const message = `Error occurred creating stat docs: ${error.message}`;
        logger.error(message, txID);
    }
};

// get display color associated with test result
const getDisplayColor = (txID, testResult, entityData) => {
    logger.debug('Attempting to get display color for test result', txID);
    let display = '';
    if ('displayColors' in entityData) {
        display = entityData.displayColors[testResult] || '';
    }
    logger.debug(`Display color for testResult=${testResult} is ${display}`, txID);
    return display;
};

const prepareCredentialData = async (txID, reqBody, entityData, credentialType) => {
    // maybe need to modify
    const display = getDisplayColor(txID, reqBody.testResult, entityData);

    const holderID = entityIdHelper.getHolderID(reqBody);
    logger.debug(`Preparing test result credential data for ${holderID}`, txID);
    const mapperName = entityData.mappers.download[credentialType].mapper;
    const mapper = await mapperHelper.getMapperByName(txID, mapperName);

    const data = jslt.transform(reqBody, mapper);
    return {
        id: holderID,
        display,
        ...data
    };
};

const prepareCredential = async (txID, token, reqBody, entityData, 
    profileData, credentialData, credentialType) => {
        
    if(reqBody.idGeneration){
        // eslint-disable-next-line no-param-reassign
        ['id', 'display'].forEach(e => delete credentialData[e]);
    }
    // get test result credential expiration date
    let expirationDate;
    if ('credentialExpiry' in entityData.mappers.download[credentialType]) {
        const secondsUntilExpiration = entityData.mappers.download[credentialType].credentialExpiry;
        expirationDate = utils.calculateCredentialExpirationDate(secondsUntilExpiration);
    }

    const issuerID = entityData.issuerId;
    const schemaID = entityData.mappers.download[credentialType].schemaId;
    const credType = entityData.mappers.download[credentialType].type || [];

    // create test result credential
    logger.debug(`Attempting to create test result credential by issuer=${issuerID} with schema=${schemaID}`, txID);
    let credential;
    try {
        const credentialResult = await hpassHelper.createCredentialSafe(
            txID,
            token,
            reqBody.type,
            issuerID,
            schemaID,
            credentialData,
            reqBody,
            expirationDate,
            credType
        );
        credential = credentialResult.data.payload;
    } catch (err) {
        // eslint-disable-next-line max-len
        const errMsg = `Failed to create test result credential by issuer=${issuerID} with schema=${schemaID}: ${err.response.data}}`;
        logger.error(errMsg, txID);
        throw new Error(errMsg);
    }

    // encrypt test result credential
    logger.debug('Attempting to encrypt test result credential', txID);
    const encryptedCredential = utils.encrypt(
        JSON.stringify(credential),
        Buffer.from(profileData.symmetricKey.value, 'base64'), // TODO: make encoding type an option
        Buffer.from(profileData.symmetricKey.iv, 'base64'),
        profileData.symmetricKey.algorithm,
        txID
    );

    return {
        credential,
        encryptedCredential
    }
};

const createCredential = async (txID, token, reqBody, entityData, profileData, credentialType) => {
    const credentialData = await prepareCredentialData(txID, reqBody, entityData, credentialType);
    try {
        const { credential, encryptedCredential } = await prepareCredential(
            txID,
            token,
            reqBody,
            entityData,
            profileData,
            credentialData,
            credentialType
        );
        return {
            credential,
            encryptedCredential
        }
    } catch (err) {
        const errMsg = `Failed to prepare credential: ${err.message}}`;
        logger.error(errMsg, txID);
        throw new Error(errMsg);
    }
};

const uploadCredential = async (txID, token, profileData, encryptedCredential, credentialType) => {
    // upload test result credential to postbox
    logger.debug(`Attempting to upload credential to Postbox`, txID);
    try {
        const postboxRes = await postboxHelper.uploadDocumentSafe(
            txID,
            token,
            profileData.downloadLinkId,
            profileData.downloadToken,
            credentialType,
            encryptedCredential
        );
        if (postboxRes && postboxRes.data && postboxRes.data.payload) {
            logger.info(`Uploaded test result credential to Postbox as documentId ${postboxRes.data.payload.id}`, txID);
        }
    } catch (err) {
        const { errorMsg } = utils.getErrorInfo(txID, err);
        const errMsg = `Failed to uploadDocument to PostBox: ${errorMsg}}`;
        logger.error(errMsg, txID);
        throw new Error(errMsg);
    }
    return null;
};

// eslint-disable-next-line 
const createUploadCredential = async (txID, req, token, entityData, reqBody, credentialType) => {
    // Note: does not check for duplicate credentials
    const holderID = entityIdHelper.getHolderID(reqBody);

    // get user profile data
    logger.debug(`Attempting to get profile doc for ${holderID}`, txID);
    const profileDataRes = await profileHelper.getProfileDoc(txID, req, entityData.entity, holderID);
    if (profileDataRes.status !== 200) {
        logger.error(`Failed to get profile doc for ${holderID}`, txID);
        return {
            status: profileDataRes.status,
            message: profileDataRes.message,
        };
    }
    const profileData = profileDataRes.data;
    const { profileCredID } = profileData;

    const clientData = await entityHelper.getClient(txID, entityData.entity, reqBody.clientName);
    if (!clientData) {
        return {
            status: 500,
            message: `Failed to get client for organization: ${entityData.entity}, clientName: ${reqBody.clientName}`
        };
    }

    let userNotifyDestination = "";
    let androidTextMsg = "";
    let iosTextMsg = ""
    let emailContent = null;
    if (reqBody.mobile && reqBody.mobile !== "") {
        // TODO: after universal link is functional,
        // switch from using DATA_INGEST_TEXT_ANDROID / DATA_INGEST_TEXT_IOS to only DATA_INGEST_TEXT 
        const androidMsgField = constants.NOTIFICATION_MSG.DATA_INGEST_TEXT_ANDROID;
        if (!(androidMsgField in clientData)) {
            // eslint-disable-next-line max-len
            const errMsg = `Test result notification template '${androidMsgField}' is not configured for ${clientData.clientName}`;
            logger.error(errMsg, txID);
            return {
                status: 500,
                message: errMsg,
            };
        }
        
        logger.debug('Attempting to get test result notification text from Android template', txID);
        const androidNotifyTemplate = clientData[androidMsgField];
        androidTextMsg = notificationHelper.getNotificationText(
            txID,
            androidNotifyTemplate,
            entityData.entity,
            '',
            profileCredID
        );

        const iosMsgField = constants.NOTIFICATION_MSG.DATA_INGEST_TEXT_IOS;
        if (!(iosMsgField in clientData)) {
            // eslint-disable-next-line max-len
            const errMsg = `Test result notification template '${iosMsgField}' is not configured for ${clientData.clientName}`;
            logger.error(errMsg, txID);
            return {
                status: 500,
                message: errMsg,
            };
        }
        logger.debug('Attempting to get test result notification text from iOS template', txID);
        const iosNotifyTemplate = clientData[iosMsgField];
        iosTextMsg = notificationHelper.getNotificationText(
            txID,
            iosNotifyTemplate,
            entityData.entity,
            '',
            profileCredID
        );

        if (!(constants.NOTIFICATION_TYPE.PHONE in reqBody)) {
            // eslint-disable-next-line max-len
            const errMsg = `'${constants.NOTIFICATION_TYPE.PHONE}' field is required in order to notify holder of test result availability`;
            logger.error(errMsg, txID);
            return {
                status: 500,
                message: errMsg,
            };
        }
        userNotifyDestination = reqBody.mobile;
    } else if (reqBody.email){
        userNotifyDestination = reqBody.email;

        const emailMsgField = constants.NOTIFICATION_MSG.DATA_INGEST_TEXT;
        if (!(emailMsgField in clientData)) {
            // eslint-disable-next-line max-len
            const errMsg = `Test result notification template '${emailMsgField}' is not configured for ${clientData.clientName}`;
            logger.error(errMsg, txID);
            return {
                status: 500,
                message: errMsg,
            };
        }
        
        logger.debug('Attempting to get test result notification text from template', txID);
        const notifyTemplate = clientData[emailMsgField];
        const textMsg = notificationHelper.getNotificationText(
            txID,
            notifyTemplate,
            entityData.entity,
            '',
            profileCredID
        );
        emailContent = {"subject":"Data Ingest Result", "content": textMsg};
    }
    
    try {
        const { credential, encryptedCredential } = await createCredential(
            txID,
            token,
            reqBody,
            entityData,
            profileData,
            credentialType
        );

        await uploadCredential(txID, token, profileData, encryptedCredential, credentialType);
        
        if (entityData.userRegistrationConfig.flow.holderNotification == null 
            || entityData.userRegistrationConfig.flow.holderNotification) {
            if (reqBody.mobile && reqBody.mobile !== "") {
                // notify user via sms that test result is available to download from postbox        
                logger.info('Attempting to send test result availability notification to holder', txID);
                await notificationHelper.sendMFAHolderNotification(
                    txID,
                    req,
                    userNotifyDestination,
                    iosTextMsg,
                    androidTextMsg,
                );
            } else if (reqBody.email) {
                await notificationHelper.sendEmailNotification(
                    txID,
                    req,
                    userNotifyDestination,
                    emailContent
                );
            }
        }
        const statDoc = {
            submissionID: txID,
            id: holderID,
            credID: credential.id,
            schemaID: credential.credentialSchema.id,
            credType: credential.credentialSubject.type,
        };
        return {
            status: 200,
            message: '',
            statDoc
        };
    } catch (err) {
        return {
            status: 400,
            message: err.message
        }
    }
}

const submitEntityData = async (
    // eslint-disable-next-line no-unused-vars
    txID, req, token, entityData, reqBody, validateSelfAttestedSignature
) => {
    return {
        status: 501,
        message: 'submitEntityData is not implemented',
    }
};

// callback func: main entry point of test result csv processing
const uploadEntityData = async (txID, req, token, entityData, batchInfo, credentialType) => {
    const { batch, fileName, batchID } = batchInfo;
    const rowCount = batch.length;
    logger.debug(`${batchID} : uploadEntityData for file ${fileName} , rowCount ${rowCount}`, txID);
    const submittedTimestamp = moment().toISOString();

    const cloudant = CloudantHelper.getInstance(txID);
    const dbName = `${entityData.entity}-${constants.DB_NAMES.BATCH_QUEUE}`;

    const limiter = new Bottleneck({
        minTime: constants.PROCESS_DATA_MIN_SEC,
        maxConcurrent: 1
    });

    const wrappedCreateCredential = limiter.wrap(
        async (txID, token, entityData, item) => {
            let errStatus = false;
            const hasCloudantDoc = '_id' in item && '_rev' in item;
            const { status, message, statDoc } = await createUploadCredential(
                txID,
                req,
                token,
                entityData,
                item,
                credentialType
            );
            const holderId = await entityHelper.getHolderId(
                txID, entityData.entity, item
            );
            if (status === 200) {
                logger.debug(`Success UploadCredential: ${item.rowID}`, txID);
                if (hasCloudantDoc) {
                    // if successfully processed, delete source data from DB
                    logger.debug(`Attempting to delete test result source data from ${dbName} database`, txID);
                    await cloudant.deleteDocumentSafe(txID, item._id, item._rev, dbName);
                    if (holderId) {
                        gdprLogger.log(req, holderId, CRUD_OPERATION.DELETE);
                    }
                }
            } else {
                errStatus = true;
                const errMsg = `Failed to create and upload test result credential for id ${item.id}: ${message}`;
                logger.error(errMsg, txID);

                // if failed to process, update source doc with error message
                if (hasCloudantDoc) {
                    // eslint-disable-next-line max-len
                    logger.debug(`Attempting to update test result source data with error=${message} in ${dbName} database`, txID);

                    const docWithError = item;
                    docWithError.errorMessage = errMsg;
                    await cloudant.updateDocumentSafe(txID, item._id, item._rev, docWithError, dbName);
                    if (holderId) {
                        gdprLogger.log(req, holderId, CRUD_OPERATION.UPDATE);
                    }
                }
            }
            return { item, statDoc, errStatus };
        });

    const statDocs = [];
    const processedItems = [];
    let errCount = 0;
    let successCount = 0;
    const batchFailureMessages = [];

    /* eslint-disable no-await-in-loop, no-restricted-syntax */
    for (const item of batch) {
        logger.debug(`Test Result: batchID ${batchID}, rowID ${item.rowID}`, txID);

        const result = await wrappedCreateCredential(txID, token, entityData, item);
        if (result.errStatus)
            errCount += 1;
        else
            successCount += 1;
        
        if (result.item)
            processedItems.push(result.item);
        if (result.statDoc)
            statDocs.push(result.statDoc);
        
        if (errCount >= batchMaxErrorThreshold) {
            const abortMsg = `Batch processing abandoned after ${errCount} failures`;
            logger.error(`${batchID} : ${abortMsg}`, txID);
            batchFailureMessages.push(abortMsg);
            break;
        }
    }

    // eslint-disable-next-line max-len
    logger.info(`batchID ${batchID}: rowCount ${rowCount}, successCount ${successCount}, failureCount ${errCount}`, txID);
    logger.debug(`Attempting to save statsDoc, size ${statDocs.length}`, txID);
    await updateStats(txID, entityData.entity, statDocs, submittedTimestamp);

    logger.debug(`Saving UploadResults for batch ${batchID}`, txID);
    await csvHelper.saveUploadResults(txID,
        entityData.entity,
        constants.APP_ID_ROLES.TEST_ADMIN,
        fileName,
        rowCount,
        successCount,
        utils.getFailedRows(txID, processedItems),
        batchFailureMessages,
        submittedTimestamp);
};

module.exports = {
    submitEntityData,
    uploadEntityData
};
