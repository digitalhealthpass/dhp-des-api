/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
* 
*/
const jslt = require('jslt');
const constants = require('../../helpers/constants');
const Logger = require('../../config/logger');
const mapperHelper = require('../../helpers/mapper-helper');

const logger = new Logger('holder-download-profile-helper');

const prepareProfileCredentialData = async (
    txID, profileData, holderID, entity, entityData
) => {
    try {
        // assemble postbox details
        const download = {
            id: holderID,
            url: profileData.downloadUrl,
            linkId: profileData.downloadLinkId,
            passcode: profileData.downloadToken,
        };

        const profileMapperName = entityData.mappers.reg.profile.mapper;
        const mapper = await mapperHelper.getMapperByName(txID, profileMapperName);
        if (mapper) {
            const data = jslt.transform(entityData, mapper);
            return {
                type: constants.GENERATED_CREDENTIAL_TYPE.PROFILE_CREDENTIAL,
                orgId: entity,
                technical: {
                    download,
                    symmetricKey: profileData.symmetricKey,
                },
                ...data
            };
        } 
        const errMsg = `Failed to get profile mapper ${profileMapperName}`;
        logger.error(errMsg, txID);
        return null;
        
    } catch (error) {
        const errMsg = `Failed to prepare profile credential data for ${holderID}: ${error.message}`;
        logger.error(errMsg, txID);
        return null;
    }
};

const getHolderIDFromProfileCredential = (profileCredential) => {
    return profileCredential.credentialSubject.technical.download.id;
};

module.exports = {
    prepareProfileCredentialData,
    getHolderIDFromProfileCredential,
};