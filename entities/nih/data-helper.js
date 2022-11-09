/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 */

const { getGdprLogger, CRUD_OPERATION } = require('dhp-logging-lib/gdpr');
const { CRED_TYPE } = require('dhp-verify-nodejs-lib');
const entityIdHelper = require('./id-helper');
const constants = require('../../helpers/constants');
const CloudantHelper = require('../../helpers/cloudantHelper');
const CosHelper = require('../../helpers/cos-helper');
const dataHelper = require('../../helpers/data-helper');
const postboxHelper = require('../../helpers/postbox-helper');
const profileHelper = require('../../helpers/profile-helper');
const utils = require('../../utils/index');
const Logger = require('../../config/logger');

const logger = new Logger('nih-data-helper');
const gdprLogger = getGdprLogger();

const updateStats = async (txID, entity, statDocs, submissionTimestamp) => {
    const dbName = `${entity}-${constants.DB_NAMES.STATS}`;
    const cloudantHelper = CloudantHelper.getInstance(txID);
    const uploadDocs = {};

    try {
        // Populate data to upload, adding timestamp
        statDocs.forEach((statDoc) => {
            // eslint-disable-next-line no-param-reassign
            statDoc.submissionTimestamp = submissionTimestamp;
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

const saveHolderCosInfo = async (txID, entity, holderID, documentId) => {
    const dbName = `${entity}-${constants.DB_NAMES.COS_INFO}`;
    const cloudantHelper = CloudantHelper.getInstance(txID);
    const cosInfo = {
        holder_id: holderID,
        createdTimestamp: Math.round(new Date().getTime() / 1000),
    };

    try {
        logger.debug('Attempting to save holder cos info', txID);
        const cloudantRes = await cloudantHelper.createDocument(txID, documentId, cosInfo, dbName);
        logger.safeInfo('Successfully saved holder cos info', cloudantRes, txID);
        return { status: 201, message: 'Successfully saved holder cos info', documentId };
    } catch (error) {
        const message = `Error occurred saving holder cos info: ${error}`;
        logger.error(message, txID);
        return { status: 500, message: 'Internal error saving holder cos info' };
    }
};

const submitData = async (txID, entity, data) => {
    const cosHelper = CosHelper.getInstance(txID);
    const fileName = `${txID}.json`;

    try {
        logger.debug('Attempting to submit data (write to COS)', txID);
        await cosHelper.createFile(txID, entity, fileName, data);
        return { status: 200, message: 'Successfully submitted data', fileName };
    } catch (error) {
        const message = `Error occurred submitting data: ${error}`;
        logger.error(message, txID);
        return { status: 500, message: 'Internal error submitting data' };
    }
};

const deletePostboxDocument = async (
    txID, token, documentId, linkId, docToken
) => {
    try {
        postboxHelper.deleteDocument(
            txID, token, documentId, linkId, docToken
        );
    } catch(e) {
        logger.warn(`Unable to delete postbox document with id ${documentId}. ${e.message}`)
    }
}

// eslint-disable-next-line complexity, max-lines-per-function
const submitEntityData = async (
    txID, req, token, entityData, reqBody, validateSelfAttestedSignature
) => {
    logger.safeDebug('submitEntityData:', reqBody, txID);

    // Get user profile data
    const holderID = entityIdHelper.getHolderID(reqBody);
    logger.debug(`Attempting to get profile doc for ${holderID}`, txID);
    const query = await profileHelper.getProfileDoc(txID, req, entityData.entity, holderID);
    if (query.status !== 200) {
        logger.error(`Failed to get profile doc for ${holderID}`, txID);
        const error = { response: { status: query.status, data: query.message } };
        throw error;
    }
    const profileData = query.data;

    // Call dhp-postbox-api with document ID and password to get uploaded file content
    logger.debug(`Attempting to download document ${reqBody.documentId} from Postbox`, txID);
    const postboxRes = await postboxHelper.downloadDocumentSafe(
        txID,
        token,
        reqBody.documentId,
        reqBody.link,
        profileData.uploadToken
    );
    const postboxData = postboxRes.data.payload.content;

    // Decrypt uploaded file content that is base64-encoded
    logger.debug(`Attemping to decrypt payload content of document ${reqBody.documentId}`, txID);
    const decryptedPostboxData = utils.decrypt(
        Buffer.from(postboxData, 'base64'),
        Buffer.from(profileData.symmetricKey.value, 'base64'),
        Buffer.from(profileData.symmetricKey.iv, 'base64'),
        profileData.symmetricKey.algorithm,
        txID
    );

    const creds = JSON.parse(decryptedPostboxData);

    const statDocs = []; // Array of docs to be added to DB upon success
    const validCreds = []; // Array of submitted credentials {id, type} to be returned to caller
    const invalidCreds = []; // Array of non-submitted credentials {id, type} to be returned to caller
    const submissionData = []; // Array of credentials to be submitted to NIH
    let consentReceiptId = null; // ID of valid consent receipt
    let consentSignatureError = ''; // Error message for invalid consent signature

    // Verify consent receipt and each credential
    for (let i = 0; i < creds.length; i += 1) {
        const cred = creds[i];
        
        if ('consentReceiptID' in cred) {
            logger.debug(`Processing consent receipt ${cred.consentReceiptID}`, txID);
            if (consentReceiptId) {
                logger.warn('Found multiple consent receipts, ignoring', txID);
            } else if (dataHelper.verifyConsentReceipt(cred, txID)) {
                if (validateSelfAttestedSignature) {
                    // eslint-disable-next-line no-await-in-loop
                    const verifyRes = await dataHelper.verifySelfAttestedCredential(
                        reqBody.publicKey, reqBody.publicKeyType, cred, entityData
                    );
                    if (verifyRes.success) {
                        consentReceiptId = cred.consentReceiptID;
                        submissionData.push(cred);
                    } else {
                        consentSignatureError = verifyRes.message;
                        logger.warn(`Consent recipt contains an invalid signature. ${verifyRes.message}`)
                        // eslint-disable-next-line no-await-in-loop
                        await deletePostboxDocument(
                            txID, token, reqBody.documentId, reqBody.linkId, profileData.uploadToken
                        );
                    }
                } else {
                    consentReceiptId = cred.consentReceiptID;
                    submissionData.push(cred);
                }
            } else {
                logger.warn('Found invalid consent receipt, ignoring', txID);
            }
        } else if (cred.type && cred.type.includes('VerifiableCredential')) {
            logger.debug(`Processing verifiable credential ${cred.id}`, txID);
            try {
                logger.debug(`Attempting to verify credential ${cred.id} with issuerId ${entityData.issuerId}`, txID);
                // eslint-disable-next-line no-await-in-loop
                const verifyRes = await dataHelper.verifyCredential(cred, entityData);
                if (verifyRes.success) {
                    // validate if the credential is allow, if not return error or empty?
                    const mapperName = utils.getMapperName(cred, CRED_TYPE.IDHP, entityData);
                    if (!mapperName) {
                        logger.warn(`Found invalid, unsupport type of credential ${cred.id}}`, txID);
                        invalidCreds.push({
                            credentialType: dataHelper.getCredentialType(cred),
                            credentialId: cred.id,
                            reason: `unsupport type of credential: ${cred.credentialSchema.id}`,
                        });
                    } else {
                        // eslint-disable-next-line no-await-in-loop
                        const transform = await utils.jsltTransform(txID, cred, mapperName);
                        if (transform) {
                            logger.debug(`Found valid verifiable, transformable credential ${cred.id}`, txID);
                            submissionData.push(transform);
                            validCreds.push({
                                credentialType: dataHelper.getCredentialType(cred),
                                credentialId: cred.id,
                            });
        
                            // Prepare data for stats db (submissionTime will be set later so it's consistent)
                            const statDoc = {
                                [entityIdHelper.holderIDField]: holderID,
                                credID: cred.id,
                                schemaID: cred.credentialSchema.id,
                                submissionID: txID,
                                credType: cred.credentialSubject.type,
                            };
                            statDocs.push(statDoc);
                        } else {
                            logger.debug(`Found non-transformable credential ${cred.id}`, txID);
                            invalidCreds.push({
                                credentialType: dataHelper.getCredentialType(cred),
                                credentialId: cred.id,
                                reason: 'Credential not transformable',
                            });
                        }
                    }
                } else {
                    logger.warn(`Found invalid, verifiable credential ${cred.id}: ${verifyRes.message}`, txID);
                    invalidCreds.push({
                        credentialType: dataHelper.getCredentialType(cred),
                        credentialId: cred.id,
                        reason: `Credential not valid: ${verifyRes.message}`,
                    });
                }
            } catch (err) {
                logger.error(`Error occurred verifying/transforming credential ${cred.id}: ${err.message}}`, txID);
                const error = {
                    response: {
                        status: 500,
                        data: `Error verifying/transforming credential ${cred.id}`,
                    },
                };
                throw error;
            }
        } else {
            logger.warn(`Found non-verifiable credential: ${JSON.stringify(cred)}`, txID);
            invalidCreds.push({
                credentialType: dataHelper.getCredentialType(cred),
                credentialId: cred.id,
                reason: 'Credential not verifiable',
            });
        }
    }

    if (!consentReceiptId) {
        const errMsg =
            `Failed to submit data for ${holderID}, no valid consent receipt found. ${consentSignatureError}`;
        logger.error(errMsg, txID);
        return { status: 400, message: errMsg, data: {} };
    }

    if (!validCreds.length) {
        const errMsg = `Failed to submit data for ${holderID}, no valid credential found`;
        logger.error(errMsg, txID);

        if (!invalidCreds.length) {
            return { status: 400, message: errMsg, data: {} };
        }
        return {
            status: 400,
            message: errMsg,
            data: {
                credentialsNotProcessed: invalidCreds,
            },
        };
    }

    // TODO: Finalize submission file, send to NIH (for now, stash in COS)
    const submissionTimestamp = new Date().toISOString();
    logger.safeDebug('Submission data:', submissionData, txID);
    const submitRes = await submitData(txID, entityData.entity, submissionData);
    if (submitRes.status !== 200) {
        logger.error(`Failed to submit data for ${holderID}`, txID);
        return submitRes;
    }

    gdprLogger.log(req, holderID, CRUD_OPERATION.CREATE);

    // Used for GDPR audit purposes
    logger.debug('Attempt to save holder cos info');
    const holderInfoRes = await saveHolderCosInfo(txID, entityData.entity, holderID, submitRes.fileName);
    if (holderInfoRes.status !== 201) {
        logger.error(`Failed to save holder cos info for ${holderID}`, txID);
        return holderInfoRes;
    }

    // Add submissionTimestamp to each stats DB row, add all rows to DB
    logger.debug(`Attempting to update stat docs`, txID);
    await updateStats(txID, entityData.entity, statDocs, submissionTimestamp);

    return {
        status: 200,
        message: 'Data submitted',
        fileName: submitRes.fileName,
        data: {
            credentialsProcessed: validCreds,
            credentialsNotProcessed: invalidCreds,
        },
    };
};

// eslint-disable-next-line no-unused-vars
const uploadEntityData = async (txID, req, token, entityData, batch) => {
    return {
        status: 501,
        message: 'uploadEntityData is not implemented',
    };
};

module.exports = {
    submitEntityData,
    uploadEntityData,
};
