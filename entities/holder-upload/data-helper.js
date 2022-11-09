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
const metadataHelper = require('../../helpers/metadata-helper');
const utils = require('../../utils/index');
const Logger = require('../../config/logger');

const logger = new Logger('upload-data-helper');
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

// eslint-disable-next-line complexity
const getStatDocInfo = (cred, credType) => {
    switch(credType) {
        case CRED_TYPE.DCC:
            if (cred.v) {
                return {
                    credID: cred.v[0].ci,
                    credType: `${CRED_TYPE.DCC} VACCINATION`,
                }
            }
            if (cred.r) {
                return {
                    credID: cred.r[0].ci,
                    credType: `${CRED_TYPE.DCC} RECOVERY`,
                }
            }
            if (cred.t) {
                return {
                    credID: cred.t[0].ci,
                    credType: `${CRED_TYPE.DCC} TEST`,
                }
            }
            return {}
        case CRED_TYPE.SHC:
            return {
                credID: cred.nbf,
                credType: cred.vc.type[1],
            }
        case CRED_TYPE.OA:
            return {
                credID: cred.data.id.substring(44),
                credType: cred.data.name.substring(44),
            }
        default:
            return {
                credID: cred.id || undefined,
                schemaID: cred.credentialSchema ? cred.credentialSchema.id : undefined,
                credType: cred.credentialSchema ? cred.credentialSubject.type : undefined,
            }
    }
}

const getProfileData = async (txID, req, entityData, holderID) => {
    logger.debug(`Attempting to get profile doc for ${holderID}`, txID);
    const query = await profileHelper.getProfileDoc(txID, req, entityData.entity, holderID);
    if (query.status !== 200) {
        logger.error(`Failed to get profile doc for ${holderID}`, txID);
        const error = { response: { status: query.status, data: query.message } };
        throw error;
    }
    return query.data;
}

const downLoadDocument = async (txID, token, reqBody, profileData) => {
    logger.debug(`Attempting to download document ${reqBody.documentId} from Postbox`, txID);
    const postboxRes = await postboxHelper.downloadDocumentSafe(
        txID,
        token,
        reqBody.documentId,
        reqBody.link,
        profileData.uploadToken
    );
    return postboxRes.data.payload.content;
}


// eslint-disable-next-line
const validateConsent = async (txID, cred, holderID, entityData, reqBody, token, profileData, validateSelfAttestedSignature) => {
    const result = {};
    if (dataHelper.verifyConsentReceipt(cred, txID)) {
        if (validateSelfAttestedSignature) {
            const verifyRes = await dataHelper.verifySelfAttestedCredential(
                holderID, reqBody.publicKeyType, cred, entityData
            );
            if (verifyRes.success) {
                result.isValid = true;
                result.metaData = {}
                if(entityData.verifierConfigId){
                    try {
                        const transData = await metadataHelper.generateMetadata(txID, verifyRes);
                        // eslint-disable-next-line max-depth
                        if (transData.metadata) {
                            result.metaData = transData.metadata;
                        }
                    } catch (error) {
                        logger.error(`Error occurred generating metadata : ${error.message}}`, txID);
                        result.isValid = false;
                        result.errorMessage = error.message;
                    }
                }
            } else if (verifyRes.error) {
                logger.error(verifyRes.error, txID);
                result.isValid = false;
            } else {
                result.errorMessage = verifyRes.message;
                result.isValid = false;
                logger.warn(`Consent recipt contains an invalid signature. ${verifyRes.message}`)
                await deletePostboxDocument(
                    txID, token, reqBody.documentId, reqBody.linkId, profileData.uploadToken
                );
            }
        } else {
            result.isValid = true;
            result.metaData = {};
        }
    } else {
        logger.warn('Found invalid consent receipt, ignoring', txID);
        result.isValid = false;
    }

    return result;
}

// eslint-disable-next-line
const validateCredentials = async (txID, cred, entityData, holderID) => {
    const result = {};
    let verifyRes = null;
    try {
        logger.debug(`Attempting to verify credential with issuerId ${entityData.issuerId}`, txID);
        // eslint-disable-next-line no-await-in-loop
        verifyRes = await dataHelper.verifyCredential(cred, entityData);

        const verifiableCredential = verifyRes.credential;
        const { credID, schemaID, credType} = getStatDocInfo(verifiableCredential || cred, verifyRes.credType);

        if (verifyRes.error) {
            const msg = `${verifyRes.message} : ${verifyRes.error}`
            logger.error(msg , txID);
        }
        if (!verifyRes.success || verifyRes.credType === CRED_TYPE.UNKNOWN) {
            logger.warn(
                `Found non-verifiable credential :: ${JSON.stringify(cred)} :: ${verifyRes.message}`, txID
            );
            result.isValid = false;
            result.invalidCred = {
                // TODO: get these for other creds
                credentialType: dataHelper.getCredentialType(cred, verifyRes.credType),
                credentialId: credID,
                reason: `Credential not valid: ${verifyRes.message}`,
            };
        } else {

            let dataForm;
            const { isDataTransform } = entityData;
            if(isDataTransform) {
                const mapperName = utils.getMapperName(verifiableCredential, verifyRes.credType, entityData);
                if (mapperName) {
                    // eslint-disable-next-line no-await-in-loop
                    dataForm = await utils.jsltTransform(txID, verifiableCredential, mapperName);
                }
            }
            logger.debug(`Found valid verifiable, transformable credential ${credID}`, txID);
            result.credential = dataForm || cred;
            result.metaData = {}
            if(entityData.verifierConfigId){
                try {
                    const transData = await metadataHelper.generateMetadata(txID, verifyRes);
                    if (transData.metadata) {
                        result.metaData = transData.metadata;
                    }
                } catch (error) {
                    logger.error(`Error occurred generating metadata : ${error.message}}`, txID);
                    result.isValid = false;
                    result.invalidCred = {
                        // TODO: get these for other creds
                        credentialType: dataHelper.getCredentialType(cred),
                        credentialId: credID,
                        reason: `Credential not valid: ${error.message}`,
                    };
                    return result;
                }
            }
            // TODO: get these for other creds
            result.validCred = {
                credentialType: dataHelper.getCredentialType(verifiableCredential, credType),
                credentialId: credID,
            };
            // Prepare data for stats db (submissionTime will be set later so it's consistent)
            result.statDoc = {
                [entityIdHelper.holderIDField]: holderID,
                credID,
                schemaID,
                submissionID: txID,
                credType,
            };
            result.isValid = true;
        }
    } catch (err) {
        logger.error(`Error occurred verifying/transforming credential ${cred.id}: ${err.stack}}`, txID);
        result.isValid = false;
        result.invalidCred = {
            credentialType: dataHelper.getCredentialType(cred, verifyRes.credType),
            credentialId: cred.id || undefined,
            reason: `Credential not valid: ${err.message}`,
        };
    }
    return result;
}

// eslint-disable-next-line
const submitEntityData = async (
    txID, req, token, entityData, reqBody, validateSelfAttestedSignature
) => {
    const {includeFileName} = reqBody;
    logger.safeDebug('submitEntityData:', reqBody, txID);

    // Get user profile data
    const holderID = entityIdHelper.getHolderID(reqBody);
    const profileData = await getProfileData(txID, req, entityData, holderID);

    // Call dhp-postbox-api with document ID and password to get uploaded file content
    const postboxData = await downLoadDocument(txID, token, reqBody, profileData);

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
    const submissionData = []; // Array of credentials to be submitted to the organization
    let consentReceiptId = null; // ID of valid consent receipt
    let consentError = ''; // Error message for invalid consent signature
    const submissionMetaData = [];

    // Verify consent receipt and each credential
    for (let i = 0; i < creds.length; i += 1) {
        const cred = creds[i];
        if (typeof cred === 'object' && 'consentId' in cred) {
            logger.debug(`Processing consent receipt ${cred.consentId}`, txID);
            if (consentReceiptId) {
                logger.warn('Found multiple consent receipts, ignoring', txID);
            } else {
                // eslint-disable-next-line no-await-in-loop
                const consentValidationResult = await validateConsent(txID, cred, holderID, entityData, 
                    reqBody, token, profileData, validateSelfAttestedSignature);
                if (consentValidationResult.isValid) {
                    consentReceiptId = cred.consentId;
                    submissionData.push(cred);
                    submissionMetaData.push(consentValidationResult.metaData)
                } else if (consentValidationResult.errorMessage) {
                    consentError = consentValidationResult.errorMessage;
                }
            }
        } else {
            logger.debug(`Processing verifiable credential`, txID);
            // eslint-disable-next-line no-await-in-loop
            const validationResult = await validateCredentials(txID, cred, entityData, holderID);
            if (validationResult.isValid) {
                statDocs.push(validationResult.statDoc);
                validCreds.push(validationResult.validCred);
                submissionData.push(validationResult.credential);
                if (validationResult.metaData) {
                    submissionMetaData.push(validationResult.metaData);
                }
            } else if (validationResult.invalidCred) {
                invalidCreds.push(validationResult.invalidCred);
            }
        }
    }

    if (!consentReceiptId) {
        const errMsg =
            `Failed to submit data for ${holderID}, no valid consent receipt found. ${consentError}`;
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

    // TODO: Finalize submission file, send to the organization (for now, stash in COS)
    const submissionTimestamp = new Date().toISOString();
    submissionData.push({'metadata': submissionMetaData});
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
    const result = {
        status: 200,
        message: 'Data submitted',
        fileName: submitRes.fileName,
        data: {
            credentialsProcessed: validCreds,
            credentialsNotProcessed: invalidCreds
        },
    };
    if (includeFileName) {
        result.data.fileName = submitRes.fileName;
    }
    return result;
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
