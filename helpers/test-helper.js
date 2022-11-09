/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
* 
*/

const crypto = require('crypto');
const { generateKeyPairSync } = require('crypto'); 
const cloudIamHelper = require('./cloud-iam-helper');
const appIdHelper = require('./app-id-helper');
const onboardingHelper = require('./onboarding-helper');
const organizationHelper = require('./organization-helper');
const postboxHelper = require('./postbox-helper');
const utils = require('../utils/index');
const Logger = require('../config/logger');
const constants = require('./constants');

const logger = new Logger('test-helper');

const testGenerateKeyPair = (txID) => {
    try {
        const { publicKey, privateKey } = generateKeyPairSync('rsa',
            {
                modulusLength: 2048,  // the length of your key in bits   
                publicKeyEncoding: {
                    type: 'spki',       // recommended to be 'spki' by the Node.js docs
                    format: 'pem'
                },
                privateKeyEncoding: {
                    type: 'pkcs1',      // recommended to be 'pkcs8' by the Node.js docs
                    format: 'pem'
                }
            });
        const emulatePublicKeyFromBody = publicKey.split('\n').slice(1, -2).join('');
        return {
            publicKey: emulatePublicKeyFromBody,
            privateKey: privateKey.toString()
        };
    } catch (err) {
        logger.error(`Failed to generate key pair: ${err.message}`, txID);
    }
    return null;
};
// generates test consent receipt
// encrypts and uploads credential payload to holder's postbox
// returns postbox documentId
const uploadCredToPostboxTest = async (txID, token, holderID, regEntityData, 
    idCredential, profileData, testCredential) => {
    const currentDate = new Date();
    const currentTimestamp = currentDate.getTime() / 1000;

    // use new method to create receipt
    // TODO make it as required field for consentInfo
    let consentReceipt = null;
    if (regEntityData.consentInfo) {
        consentReceipt = await organizationHelper.createConsentReceipt(txID, 
            regEntityData, holderID, regEntityData.entityType);
        consentReceipt = consentReceipt.payload;
    } else {
        // Question if no consentInfo how to handle
        consentReceipt = {
            consentReceiptID: profileData.uploadLinkId,
            consentTimestamp: currentTimestamp,
        };
    }

    // add sign value TODO need to check if proof exist
    if (!consentReceipt.proof) {
        consentReceipt.proof = {};
    }

    // sign consent info
    const JSONSignature = crypto.sign('sha256', Buffer.from(JSON.stringify(consentReceipt)), {
        key: global.privateKey,
        padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
    });
   
    consentReceipt.proof.signatureValue = Buffer.from(JSONSignature).toString('base64');

    const payload = [consentReceipt, idCredential, testCredential];

    // encrypts payload
    const encryptedHex = utils.encrypt(
        JSON.stringify(payload),
        Buffer.from(profileData.symmetricKey.value, 'base64'),
        Buffer.from(profileData.symmetricKey.iv, 'base64'),
        profileData.symmetricKey.algorithm,
        txID
    );

    // upload to postbox
    try {
        const postboxRes = await postboxHelper.uploadDocument(
            txID,
            token,
            profileData.uploadLinkId,
            profileData.uploadToken,
            testCredential.credentialSubject ? testCredential.credentialSubject.type : undefined,
            encryptedHex
        );
        if (postboxRes && postboxRes.data && postboxRes.data.payload) {
            logger.info(`Test document uploaded to Postbox with documentId: ${postboxRes.data.payload.id}`, txID);
            return postboxRes.data.payload.id;
        }
    } catch (err) {
        logger.error(`Failed to upload document to Postbox: ${err.message}`, txID);
    }
    return null;
}

// onboard test holder
// returns test holder's profile and id credentials
const onboardHolderTest = async (txID, entity, entityData, req, registrationCode, holderIDField) => {    
    // TODO holder id should be publickey
    const { publicKey, privateKey } = testGenerateKeyPair(txID);
    global.privateKey = privateKey;
    const testHolderID = publicKey;

    req.body.registrationCode = registrationCode;
    req.body[holderIDField] = testHolderID;
    
    const holderCredentials = await onboardingHelper.registerHolder(
        txID,
        req,
        entity,
        entityData,
        holderIDField,
        testHolderID
    );
    return holderCredentials;
}

const registerAppIDUser = async(txID, cloudIamToken, email, password, displayName, roleName, attributes) => {
    const userGUID = await appIdHelper.registerUser(txID, cloudIamToken, email, password, displayName);
    await appIdHelper.loginAppID(txID, email, password);
    const userSubID = await appIdHelper.getUserSubID(txID, cloudIamToken, userGUID);
    await appIdHelper.addAttributes(txID, cloudIamToken, userSubID, attributes);
    await appIdHelper.assignRoleToUser(txID, cloudIamToken, userSubID, roleName);
    return userGUID;
};

const registerRegAdminAppIDUser = async (txID, organization, password) => {
    const prefix = constants.APP_ID_ROLES.DES_PREFIX;
    const cloudIamToken = await cloudIamHelper.getCloudIAMToken(txID);

    const email = `${organization}regadmin@poc.com`;
    const displayName = `${organization} Registration Admin`;
    const roleName = `${prefix}-${constants.APP_ID_ROLES.REGISTRATION_ADMIN}`;

    const regUserGUID = await registerAppIDUser(txID, 
        cloudIamToken.access_token, email, password, displayName, roleName, {org: organization});
    return regUserGUID;
};

const registerTestAdminAppIDUser = async (txID, organization, password) => {
    const prefix = constants.APP_ID_ROLES.DES_PREFIX;
    const cloudIamToken = await cloudIamHelper.getCloudIAMToken(txID);

    const email = `${organization}testadmin@poc.com`;
    const displayName = `${organization} Test Admin`;
    const roleName = `${prefix}-${constants.APP_ID_ROLES.TEST_ADMIN}`;

    const testUserGUID = await registerAppIDUser(txID, 
        cloudIamToken.access_token, email, password, displayName, roleName, {org: organization});
    return testUserGUID;
};

const registerDataAdminAppIDUser = async (txID, organization, password) => {
    const prefix = constants.APP_ID_ROLES.DES_PREFIX;
    const cloudIamToken = await cloudIamHelper.getCloudIAMToken(txID);

    const email = `${organization}dataadmin@poc.com`;
    const displayName = `${organization} Data Admin`;
    const roleName = `${prefix}-${constants.APP_ID_ROLES.DATA_ADMIN}`;

    const dataUserGUID = await registerAppIDUser(txID, 
        cloudIamToken.access_token, email, password, displayName, roleName, {org: organization});
    return dataUserGUID;
};

const registerAdminAppIDUser = async (txID, reqBody) => {
    const cloudIamToken = await cloudIamHelper.getCloudIAMToken(txID);

    const {email, displayName, roleName, password, organizations} = reqBody;

    const dataUserGUID = await registerAppIDUser(txID, 
        cloudIamToken.access_token, email, password, displayName, roleName, {orgs: organizations});
    return dataUserGUID;
};

const deleteAppIDUser = async (txID, userGUID) => {
    const cloudIamToken = await cloudIamHelper.getCloudIAMToken(txID);
    
    await appIdHelper.deleteUser(txID, cloudIamToken.access_token, userGUID);
};

module.exports = {
    uploadCredToPostboxTest,
    onboardHolderTest,
    registerRegAdminAppIDUser,
    registerTestAdminAppIDUser,
    registerDataAdminAppIDUser,
    registerAdminAppIDUser,
    deleteAppIDUser,
    testGenerateKeyPair
};
