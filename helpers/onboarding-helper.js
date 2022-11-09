/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 */

/* eslint-disable max-len */


const constants = require('./constants');
const hpassHelper = require('./hpass-helper');
const postboxHelper = require('./postbox-helper');
const profileHelper = require('./profile-helper');
const userHelper = require('./user-helper');
const registerCodeHelper = require('./register-code-helper');
const utils = require('../utils/index');
const Logger = require('../config/logger');

const logger = new Logger('onboarding-helper');

// FOR TESTING PURPOSES ONLY!!!
// Encrypts and uploads consent receipt + three credentials to postbox for testing POST /data API
// NOTE: The required documentId is logged
// eslint-disable-next-line no-unused-vars, max-params
const testUploadPostboxData = async (txID, credProfile, credId, key, iv, token, boxLink, boxToken) => {
    const credTemp = {
        "@context": {
            "cred": "https://www.w3.org/2018/credentials/v1"
        },
        // eslint-disable-next-line max-len
        "id": "did:hpass:hpassmsp:326154139805929658112786998782875574410195742971#vc-390f42c1-bc40-44fd-adf3-130416c7b4e1",
        "type": [
            "VerifiableCredential"
        ],
        "issuer": "did:hpass:hpassmsp:326154139805929658112786998782875574410195742971",
        "issuanceDate": "2020-10-30T03:27:28Z",
        "expirationDate": "2021-12-17T00:00:00Z",
        "credentialSchema": {
            "id": "did:hpass:hpassmsp:326154139805929658112786998782875574410195742971;id=tempscan;version=0.1",
            "type": "JsonSchemaValidator2018"
        },
        "credentialSubject": {
            "date": "2018-12-10T13:45:00.000Z",
            "display": "red",
            "id": "whatever-is-required-by-usecase",
            "temperature": 101,
            "type": "Temperature",
            "units": "F"
        },
        "proof": {
            "created": "2020-10-30T03:27:28Z",
            "creator": "did:hpass:hpassmsp:326154139805929658112786998782875574410195742971#key-7",
            "nonce": "919c28fc-2214-4753-8685-e95f53adbd8e",
            // eslint-disable-next-line max-len
            "signatureValue": "MEUCIEjQ1jTKepQIg8-E_XdNJiId9k9XzZqOgU2clEFuXEN7AiEAyYXYiy76nLjhe6Fuzp9CYPH12bJv9YtOXUnyYwLkz0k",
            "type": "EcdsaSecp256r1Signature2019"
        }
    };

    const currentDate = new Date();
    const currentTimestamp = currentDate.getTime() / 1000;
    const consentReceipt = {
        consentReceiptID: 'ef521a17-0b7c-4f74-a03b-e397d7cecd1f',
        consentTimestamp: currentTimestamp,
    };
    const payload = [
        consentReceipt, credProfile, credId, credTemp
    ];

    const encryptedHex = utils.encrypt(
        JSON.stringify(payload),
        Buffer.from(key),
        iv,
        constants.CRYPTO.ALGORITHM,
        txID
    );

    try {
        const postboxRes = await postboxHelper.uploadDocument('test-only', token, boxLink, boxToken,
            'registrationCard', encryptedHex);
        if (postboxRes && postboxRes.data && postboxRes.data.payload) {
            logger.info(`DOCUMENT ID FOR POST /data: ${postboxRes.data.payload.id}`, txID);
        }
    } catch (err) {
        logger.error(`DOCUMENT ID FOR POST /data NOT AVAILABLE DUE TO EXCEPTION: ${JSON.stringify(err)}`, txID);
    }
};

// validate profile for a new holder, removed validation for registration code.
const validateNewHolder = async (txID, req, entity, holderID) => {
    // holder profile doc must not exist in Cloudant
    logger.debug(`Validating holder ${holderID} as new, checking for an existing profile doc in Cloudant`, txID);
    const exists = await profileHelper.existProfile(txID, req, entity, holderID);
    if (exists) {
        const errMsg = `Profile for ${holderID} in organization ${entity} already exists`;
        logger.error(errMsg, txID);
        const error = { response: { status: 400, data: errMsg } };
        throw error;
    }
}

const createProfileCredential = async (txID, token, reqBody, entity, entityData, holderID, profileData) => {
    // generate profile data (based on schema) for input into HealthPass
    logger.debug(`Preparing profile credential data for ${holderID}`, txID);
    const profileCredData = await profileHelper.prepareProfileCredentialData(
        txID,
        profileData,
        holderID,
        entity,
        entityData
    );
    if (!profileCredData) {
        const errMsg = `Failed to prepare profile credential data for ${holderID}`;
        logger.error(errMsg, txID);
        const error = { response: { status: 500, data: errMsg } };
        throw error;
    }

    let expirationDate;
    if (entityData.mappers) {
        logger.debug('Calculating upload/download expiration date for profile credential');
        const secondsUntilExpiration = entityData.mappers.reg.profile.credentialExpiry;
        expirationDate = utils.calculateCredentialExpirationDate(secondsUntilExpiration);
    } else if ('profileCredentialExpiry' in entityData) {
        // this is for NIH
        logger.debug('Calculating expiration date for profile credential');
        const secondsUntilExpiration = entityData.profileCredentialExpiry;
        expirationDate = utils.calculateCredentialExpirationDate(secondsUntilExpiration);
    }

    // call healthpass-api to generate profile credential
    const issuerID = entityData.issuerId;

    let schemaID;
    if (entityData.mappers) {
        schemaID = entityData.mappers.reg.profile.schemaId;
    } else {
        schemaID = entityData.profileSchema;
    }
    logger.debug(`Creating profile credential for ${holderID} by issuerId=${issuerID} with schemaId=${schemaID}`, txID);
    const profileCredential = await hpassHelper.createCredentialSafe(
        txID,
        token,
        constants.CREDENTIAL_TYPES.string,
        entityData.issuerId,
        schemaID,
        profileCredData,
        reqBody,
        expirationDate
    );
    return profileCredential;
}

const createUserCredential = async (txID, token, reqBody, entity, entityData) => {
    // generate user data (based on schema) for input into HealthPass
    logger.debug('Preparing user credential data', txID);
    const userData = await userHelper.prepareUserCredentialData(txID, reqBody, entityData, entity);
    if (!userData) {
        const errMsg = 'Failed to prepare user credential data';
        logger.error(errMsg, txID);
        const error = { response: { status: 500, data: errMsg } };
        throw error;
    }

    let expirationDate;
    if (entityData.mappers) {
        logger.debug('Calculating upload/download expiration date for user credential');
        const secondsUntilExpiration = entityData.mappers.reg.profile.credentialExpiry;
        expirationDate = utils.calculateCredentialExpirationDate(secondsUntilExpiration);
    } else if ('userCredentialExpiry' in entityData) {
        logger.debug('Calculating expiration date for user credential');
        const secondsUntilExpiration = entityData.userCredentialExpiry;
        expirationDate = utils.calculateCredentialExpirationDate(secondsUntilExpiration);
    }

    // call healthpass-api to generate ID credential
    const issuerID = entityData.issuerId;

    let schemaID;
    if (entityData.mappers) {
        schemaID = entityData.mappers.reg.holder.schemaId;
    } else {
        schemaID = entityData.userSchema;
    }
    logger.debug(`Attempting to create user credential by issuerId=${issuerID} with schemaId=${schemaID}`, txID);
    const userCredential = await hpassHelper.createCredentialSafe(
        txID,
        token,
        constants.CREDENTIAL_TYPES.string,
        entityData.issuerId,
        schemaID,
        userData,
        reqBody,
        expirationDate,
        [constants.CRED_TYPE.ID]
    );
    return userCredential;
}

const saveProfileDocAndRegistrationStatus = async (txID, req, entity, holderIDField, holderID, profileData, isGeneric) => {
    logger.debug('saveProfileDocAndRegistrationStatus()', txID);
    // Create profile in database with appropriate information
    let update = await profileHelper.saveProfileDoc(txID, req, holderIDField, holderID, entity, profileData);
    if (update.status !== 200) {
        logger.error(`Failed to saveProfileDoc for ${holderID}`, txID);
        const error = { response: { status: update.status, data: update.message } };
        throw error;
    }
    // Update status only when not generic holder
    if(isGeneric === false){
        // Update Registration CodeDoc to reflect code is used, roll back profile update if error
        update = await registerCodeHelper.deleteRegCodeRelatedDocs(txID, entity, req.body.registrationCode);
        if (update.status !== 200) {
            logger.error(`Failed to update registration code ${req.body.registrationCode} status to used`, txID);
            logger.info(`Attempting to roll back and delete profile doc for ${holderID}`, txID);
            const deleted = await profileHelper.deleteProfileDoc(txID, req, entity, holderID);

            if (!deleted) {
                const errMsg = `Failed to roll back and delete profile doc for ${holderID} after registration code error`;
                logger.error(errMsg, txID);
                const error = { response: { status: 400, data: errMsg } };
                throw error;
            }
            const error = { response: { status: update.status, data: update.message } };
            throw error;
        }

    }
    
}

const registerHolder = async (txID, req, entity, entityData, holderIDField, holderID, isGeneric=false) => {
    logger.debug('registerHolder()', txID);
    const reqBody = req.body;
    const token = req.headers.authorization;

    let profileData;
    let profileCredential;
    let userCredential;

    try {
        await validateNewHolder(txID, req, entity, holderID);
    } catch (err) {
        const { errorStatus, errorMsg } = utils.getErrorInfo(txID, err);
        const errMsg = `Pre-onboarding validation failed for ${holderID}: ${errorMsg}`;
        logger.error(errMsg, txID);
        return { status: errorStatus, message: errMsg };
    }

    try {
        profileData = await profileHelper.buildProfileData(req, txID, holderIDField, holderID);
    } catch (err) {
        const { errorStatus, errorMsg } = utils.getErrorInfo(txID, err);
        const errMsg = `Failed to prepare profile data for holder ${holderID}: ${errorMsg}`;
        logger.error(errMsg, txID);
        return { status: errorStatus, message: errMsg };
    }

    try {
        profileCredential = await createProfileCredential(txID, token, reqBody, entity, entityData, holderID, profileData);
        userCredential = await createUserCredential(txID, token, reqBody, entity, entityData);
    } catch (err) {
        const { errorStatus, errorMsg } = utils.getErrorInfo(txID, err);
        const errMsg = `Failed to create credential for holder ${holderID}: ${errorMsg}`;
        logger.error(errMsg, txID);
        return { status: errorStatus, message: errMsg };
    }

    // save profile credential id (without issuer DID prefix) to profile data
    try {
        const profileCredDID = profileCredential.data.payload.id;
        const profileCredID = utils.getCredentialIDFromDID(profileCredDID);
        if (!profileCredID) {
            const errMsg = `Failed to parse profile credential ID from credential DID ${profileCredDID}`;
            logger.warn(errMsg, txID);
        }

        profileData.profileCredID = profileCredID;
    } catch (err) {
        const errMsg = `Failed to parse profile credential ID from credential DID: ${err.message}`;
        logger.warn(errMsg, txID);
    }
   
    try {
        await saveProfileDocAndRegistrationStatus(txID, req, entity, holderIDField, holderID, profileData, isGeneric);
    } catch (err) {
        const { errorStatus, errorMsg } = utils.getErrorInfo(txID, err);
        const errMsg = `Failed to save profile doc and registration status for holder ${holderID}: ${errorMsg}`;
        logger.error(errMsg, txID);
        return { status: errorStatus, message: errMsg };
    }

    // During testing/development, uncomment the following line to populate postbox with data
    // await testUploadPostboxData(txID, profileCredential.data.payload, userCredential.data.payload, Buffer.from(symKey), ivValue, token, boxLink, boxToken);

    return {
        status: 200,
        payload: [profileCredential.data.payload, userCredential.data.payload]
    }
}

// Deletes user registration
const deleteRegistration = async (txID, req, token, entityData, profileData, holderID) => {
    logger.debug('deleteRegistration()', txID);
    // Call dhp-postbox-api to delete upload link and all associated documents
    try {
        logger.debug(`Attempting to delete postbox links for holder ${holderID}`, txID);
        // TODO delegate to profile-helper for cleanup

        // delete download link
        let postboxRes = await postboxHelper.deleteLink(txID, token, profileData.downloadLinkId, profileData.downloadToken);
        if (postboxRes.status !== 200) {
            const errMsg = `Failed to delete Postbox download link for holder ${holderID}`;
            logger.error(errMsg, txID);
            return { status: postboxRes.status, message: errMsg };
        }

        // delete upload link
        postboxRes = await postboxHelper.deleteLink(txID, token, profileData.uploadLinkId, profileData.uploadToken);
        if (postboxRes.status !== 200) {
            const errMsg = `Failed to delete Postbox upload link for holder ${holderID}`;
            logger.error(errMsg, txID);
            return { status: postboxRes.status, message: errMsg };
        }
    } catch (err) {
        logger.error(`Error occurred calling Postbox deleteLink API: ${err.message}`, txID);
        return { status: 500, message: 'Error occurred calling Postbox deleteLink API' };
    }

    // Delete profile from profile DB
    try {
        logger.debug(`Attempting to delete profile doc for holder ${holderID}`, txID);
        const success = await profileHelper.deleteProfileDoc(txID, req, entityData.entity, holderID);
        if (success) {
            const successMsg = `Successfully deleted profile doc for ${holderID}`;
            logger.info(successMsg, txID);
            return { status: 200, message: successMsg };
        }
        const errMsg = `Failed to delete profile doc for ${holderID}`;
        logger.error(errMsg, txID);
        return { status: 500, message: errMsg };
    } catch (err) {
        logger.error(`Error occurred calling Cloudant delete document API: ${err.message}`, txID);
        return { status: 500, message: `Error occurred deleting profile doc for holder ${holderID}` };
    }
}

module.exports = {
    registerHolder,
    deleteRegistration,
    createUserCredential,
};
