/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
* 
*/

const constants = require('../../helpers/constants');
const Logger = require('../../config/logger');

const logger = new Logger('nih-profile-helper');

// eslint-disable-next-line max-params
const prepareProfileCredentialData = async (
    txID, profileData, holderID, entity, entityData
) => {
    try {
        const poBox = {
            id: holderID,
            url: profileData.url,
            linkId: profileData.uploadLinkId,
            passcode: profileData.uploadToken,
            symmetricKey: profileData.symmetricKey,
        };
        // TODO refactor to new structure: technical > download|upload|symmetricKey
        const data = {
            type: constants.GENERATED_CREDENTIAL_TYPE.PROFILE_CREDENTIAL,
            orgId: entity,
            consentInfo: entityData.consentInfo,
            technical: { poBox },
            termination: entityData.termination
        };
        data.consentInfo.piiPrincipalId = holderID;
        return data;
    } catch (error) {
        const errMsg = `Failed to prepare profile credential data for ${holderID}: ${error.message}`;
        logger.error(errMsg, txID);
        return null;
    }
};

const getHolderIDFromProfileCredential = (profileCredential) => {
    return profileCredential.credentialSubject.technical.poBox.id;
};

const getLinkIdFromProfileCredential = (profileCredential) => {
    return profileCredential.credentialSubject.technical.poBox.linkId;
}

module.exports = {
    prepareProfileCredentialData,
    getHolderIDFromProfileCredential,
    getLinkIdFromProfileCredential
};
