/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
* 
*/

const Logger = require('../../config/logger');
const entityIdHelper = require('./id-helper');

const constants = require('../../helpers/constants');

const logger = new Logger('nih-user-helper');

// Prepare user data for credential
const prepareUserCredentialData = async (txID, reqBody, entityData) => {
    const holderID = entityIdHelper.getHolderID(reqBody);
    try {
        const data = {
            type: constants.GENERATED_CREDENTIAL_TYPE.USER_CREDENTIAL,
            id: holderID,
            key: reqBody.publicKey
        }
        entityData.userData.forEach((item) => {
            data[item] = reqBody[item];
        });
        const issuer = {
            name: entityData.consentInfo.piiControllers[0].piiController
        }
        data.issuer = issuer;
        return data;
    } catch (error) {
        const errMsg = `Failed to prepare user credential data for ${holderID}: ${error.message}`;
        logger.error(errMsg, txID);
        return null;
    }
}

module.exports = {
    prepareUserCredentialData
};