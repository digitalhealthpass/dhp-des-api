/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
* 
*/
const jslt = require('jslt');
const entityIdHelper = require('./id-helper');
const Logger = require('../../config/logger');
const constants = require('../../helpers/constants');
const mapperHelper = require('../../helpers/mapper-helper');

const logger = new Logger('holder-download-user-helper');

// Prepare user data for credential
const prepareUserCredentialData = async (txID, reqBody, entityData) => {
    const holderID = entityIdHelper.getHolderID(reqBody);
    try {    
        const userMapperName = entityData.mappers.reg.holder.mapper;
        const mapper = await mapperHelper.getMapperByName(txID, userMapperName);

        if (mapper){
            const transData = jslt.transform(reqBody, mapper);

            return {
                type: constants.GENERATED_CREDENTIAL_TYPE.USER_CREDENTIAL,
                id: holderID,
                ...transData
            };
        } 
        const errMsg = `Failed to get user mapper ${userMapperName}`;
        logger.error(errMsg, txID);
        return null;
        
    } catch (error) {
        const errMsg = `Failed to generate user credential data for ${holderID}: ${error.message}`;
        logger.error(errMsg, txID);
        return null;
    }
}

module.exports = {
    prepareUserCredentialData
};