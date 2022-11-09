/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 *
 */
const crypto = require('crypto');

const { getGdprLogger, CRUD_OPERATION } = require('dhp-logging-lib/gdpr');
const constants = require('./constants');
const CloudantHelper = require('./cloudantHelper');
const config = require('../config');
const Logger = require('../config/logger');
const entityHelper = require('../entities');
const utils = require('../utils/index');

const gdprLogger = getGdprLogger();
const logger = new Logger('profile-helper');
const postboxHelper = require('./postbox-helper');

// Prepare profile data for credential
const prepareProfileCredentialData = async (txID, postboxData, holderID, entity, entityData) => {
    const regEntity = entity.toLowerCase();

    const entityHelperName = entityData.entityType || regEntity;
    const existEntityHelpers = await entityHelper.existRegEntityHelpers(txID, entityHelperName);
    if (!existEntityHelpers) {
        logger.error(`Failed to prepare profile credential data, no entity helpers exist for entity ${entity}`, txID);
        return null;
    }

    // eslint-disable-next-line global-require, import/no-dynamic-require
    const entityProfileHelper = require(`../entities/${entityHelperName}/profile-helper`);
    return entityProfileHelper.prepareProfileCredentialData(txID, postboxData, holderID, entity, entityData);
};

const buildPostboxUrl = (headers) => {
    let postboxUrl;
    if (headers.host && headers['x-forwarded-proto']) {
        postboxUrl = `${headers['x-forwarded-proto']}://${headers.host}/api/v1/postbox/api/v1`;
    } else {
        postboxUrl = `${config.postboxAPI.hostname}/api/v1`;
    }
    return postboxUrl;
};

const buildPostboxUploadUrl = (headers) => {
    const postboxUrl = buildPostboxUrl(headers);
    return `${postboxUrl}/documents`;
};

const buildPostboxDownloadUrl = (headers, linkId) => {
    const postboxUrl = buildPostboxUrl(headers);
    return `${postboxUrl}/links/${linkId}/attachments`;
};

// eslint-disable-next-line max-len, max-params
const assembleProfileDoc = (postboxUploadUrl, postboxDownloadUrl, uploadLinkId, uploadToken, downloadLinkId, downloadToken, holderIDField, holderID) => {
    const profileDoc = {
        [holderIDField]: holderID,
        url: postboxUploadUrl, // keep url for backward compatibility with nih
        uploadUrl: postboxUploadUrl,
        downloadUrl: postboxDownloadUrl,
        uploadLinkId,
        uploadToken,
        downloadLinkId,
        downloadToken,
    };

    // Generate symmetric key to save in appropriate places
    const symKey = crypto.randomBytes(constants.CRYPTO.KEY_LENGTH);
    const ivValue = crypto.randomBytes(constants.CRYPTO.IV_LENGTH);
    const symKeyEncoded = symKey.toString('base64');
    const ivValueEncoded = ivValue.toString('base64');
    const encKey = {
        value: symKeyEncoded,
        iv: ivValueEncoded,
        algorithm: constants.CRYPTO.ALGORITHM
    }
    profileDoc.symmetricKey = encKey;
    return profileDoc;
};

const createPostboxLinks = async (txID, holderId, token) => {
    // Call dhp-postbox-api to get upload URL and password
    let postboxData;
    try {
        const postboxRes = await postboxHelper.createLink(txID, holderId, token);
        postboxData = postboxRes.data;
    } catch (err) {
        const { errorStatus, errorMsg } = utils.getErrorInfo(txID, err);
        const errMsg = `Failed to call Postbox createLink API: ${errorStatus} ${errorMsg}`;
        logger.error(errMsg, txID);
        const error = { response: { status: errorStatus, data: errMsg } };
        throw error;
    }

    return postboxData;
};

const buildProfileData = async (req, txId, holderIDField, holderID) => {
    const authToken = req.headers.authorization;
    
    const uploadPostboxRes = await createPostboxLinks(txId, holderID, authToken);
    const postboxUploadUrl = buildPostboxUploadUrl(req.headers);

    const downloadPostboxRes = await createPostboxLinks(txId, holderID, authToken);
    const downloadLinkId = downloadPostboxRes.payload.id;
    const postboxDownloadUrl = buildPostboxDownloadUrl(req.headers, downloadLinkId);
    
    return assembleProfileDoc(
        postboxUploadUrl,
        postboxDownloadUrl,
        uploadPostboxRes.payload.id,
        uploadPostboxRes.payload.password,
        downloadLinkId,
        downloadPostboxRes.payload.password,
        holderIDField,
        holderID
    );
}

// Get profile from profile DB
const getProfileDoc = async (txID, req, entity, holderID) => {
    const dbName = `${entity}-${constants.DB_NAMES.PROFILE}`;
    const cloudantHelper = CloudantHelper.getInstance(txID);
    try {
        const readDoc = await cloudantHelper.readDocumentSafe(txID, holderID, dbName);
        if (readDoc.status !== 200) {
            const warnMsg = `Profile doc for ${holderID} in organization ${entity} not found in Database`;
            logger.warn(warnMsg, txID);
            return { status: 404, message: warnMsg };
        }
        gdprLogger.log(req, holderID, CRUD_OPERATION.READ);
        return { status: 200, data: readDoc.data };
    } catch (error) {
        const errMsg = `Failed to read profile doc ${holderID} from Database : ${error.message}`;
        logger.error(errMsg, txID);
        return { status: 500, message: `Error occurred getting profile doc ${holderID} from Database` };
    }
};

// Get all profiles from profile DB
const getAllProfileDocs = async (txID, req, entity) => {
    const dbName = `${entity}-${constants.DB_NAMES.PROFILE}`;
    const cloudantHelper = CloudantHelper.getInstance(txID);
    try {
        const query = {
            selector: {
                _id: {
                    $gt: null
                }
            },
            fields: [
                "_id"
            ],
        };
        const readDoc = await cloudantHelper.queryDocuments(txID, query, dbName);
        gdprLogger.log(req, CRUD_OPERATION.READ);
        return { status: 200, data: readDoc.docs };
    } catch (error) {
        const errMsg = `Failed to read all profile docs from Database : ${error.message}`;
        logger.error(errMsg, txID);
        return { status: 500, message: `Error occurred getting all profile docs from Database` };
    }
};

// Queries the specified entity's profile DB for the specified holderID, returns true if found, false otherwise
const existProfile = async (txID, req, entity, holderID) => {
    const cloudantHelper = CloudantHelper.getInstance(txID);
    const dbName = `${entity}-${constants.DB_NAMES.PROFILE}`;

    try {
        const readDoc = await cloudantHelper.readDocumentSafe(txID, holderID, dbName);
        if (readDoc.status !== 200) {
            logger.info(`Profile doc ${holderID} not found in Database`, txID);
            return false;
        }
        gdprLogger.log(req, holderID, CRUD_OPERATION.READ);
        return true;
    } catch (error) {
        logger.error(
            `Error occurred checking whether profile doc ${holderID} exists in Cloudant: ${error.message}`,
            txID
        );
        return false;
    }
};

// Constructs a user profile from the specified parameters and inserts into the specified entity's profile DB
// eslint-disable-next-line max-params
const saveProfileDoc = async (txID, req, holderIDField, holderID, entity, profileData) => {
    const cloudantHelper = CloudantHelper.getInstance(txID);
    const dbName = `${entity}-${constants.DB_NAMES.PROFILE}`;

    try {
        const readDoc = await cloudantHelper.readDocumentSafe(txID, holderID, dbName);
        if (readDoc.status === 200) {
            const errMsg = `Profile doc ${holderID} already exists in Database`;
            logger.error(errMsg, txID);
            return { status: 400, message: errMsg };
        }

        const newDoc = profileData;
        logger.safeDebug('Attempting to save profile doc in Cloudant:', newDoc, txID);

        const updateDoc = await cloudantHelper.createDocument(txID, holderID, newDoc, dbName);
        if (!updateDoc || !updateDoc.ok) {
            const errMsg = `Failed to createDocument in Database for profile for ${holderID}`;
            logger.error(errMsg, txID);
            return { status: 500, message: errMsg };
        }
        gdprLogger.log(req, holderID, CRUD_OPERATION.CREATE);
        return {
            status: 200,
            message: `Successfully saved profile doc ${holderID}`
        };
    } catch (error) {
        logger.error(`Error occurred saving profile doc for ${holderID} in Cloudant: ${error.message}`, txID);

        // Because document has specific _id, check for conflict (NOT server error)
        if (error.message && error.message.includes('conflict')) {
            return {
                status: 400,
                message: `Multiple simultaneous attempts to save profile doc for ${holderID}`
            };
        }
        return {
            status: 500,
            message: `Internal error saving profile doc for ${holderID}`
        };
    }
};

const updateGenericHolderProfile = async (txID, req, holderID, entity, profileData) => {
    const cloudantHelper = CloudantHelper.getInstance(txID);
    const dbName = `${entity}-${constants.DB_NAMES.PROFILE}`;

    try {
        const readDoc = await cloudantHelper.readDocumentSafe(txID, holderID, dbName);
        if (readDoc.status !== 200) {
            const errMsg = `Profile doc ${holderID} not exists in Database`;
            logger.error(errMsg, txID);
            return { status: 400, message: errMsg };
        }
        const updatedDoc = {
            ...readDoc.data,
            ...profileData,
        }

        const updateDoc = await cloudantHelper.updateDocumentSafe(txID, holderID, 
            readDoc.data._rev, updatedDoc, dbName);

        if (!updateDoc || !updateDoc.data || !updateDoc.data.ok) {
            const errMsg = `Failed to updateDocument in Database for generic profile for ${holderID}`;
            logger.error(errMsg, txID);
            return { status: 500, message: errMsg };
        }
        return {
            status: 200,
            message: `Successfully updated generic profile doc ${holderID}`
        };
    } catch (error) {
        logger.error(`Error occurred updating generic profile doc for ${holderID} in Cloudant: ${error.message}`, txID);
        return {
            status: 500,
            message: `Internal error updating generic profile doc for ${holderID}`
        };
    }
};

// Removes a user profile from the specified entity's profile DB
const deleteProfileDoc = async (txID, req, entity, holderID) => {
    const cloudantHelper = CloudantHelper.getInstance(txID);
    const dbName = `${entity}-${constants.DB_NAMES.PROFILE}`;

    try {
        const readDoc = await cloudantHelper.readDocumentSafe(txID, holderID, dbName);
        if (readDoc.status !== 200) {
            logger.error(
                `Failed to readDocumentSafe before deletion, profile doc ${holderID} not found in Database`,
                txID
            );
            return false;
        }
        const doc = readDoc.data;

        logger.debug(`Attempting to delete profile doc ${holderID} in Cloudant`, txID);

        const result = await cloudantHelper.deleteDocument(txID, doc._id, doc._rev, dbName);
        if (result !== null && result.ok) {
            gdprLogger.log(req, holderID, CRUD_OPERATION.DELETE);
            return true;
        }
        
        return false;
    } catch (error) {
        logger.error(`Error occurred deleting profile doc ${holderID} in Cloudant: ${error.message}`, txID);
        return false;
    }
};

module.exports = {
    prepareProfileCredentialData,
    buildPostboxUploadUrl,
    buildPostboxDownloadUrl,
    assembleProfileDoc,
    buildProfileData,
    existProfile,
    getProfileDoc,
    getAllProfileDocs,
    saveProfileDoc,
    deleteProfileDoc,
    updateGenericHolderProfile
};
