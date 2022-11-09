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

const logger = new Logger('holder-upload-user-helper');

// Prepare user data for credential
const prepareUserCredentialData = async (txID, reqBody, entityData) => {
    const holderID = entityIdHelper.getHolderID(reqBody);
    try {

        const userSchema = entityData.mappers.reg.holder.mapper;
        const mapper = await mapperHelper.getMapperByName(txID, userSchema);
        if (mapper) {
            const data = jslt.transform(reqBody, mapper);
            data.type = constants.GENERATED_CREDENTIAL_TYPE.USER_CREDENTIAL;
            data[entityIdHelper.holderIDField] = holderID;
            data.organization = entityData.entity;

            // TODO need to remove this line
            data.id = holderID;
            return data;
        } 
        const errMsg = `Failed to get User mapper ${userSchema}`;
        logger.error(errMsg, txID);
        return null;
        
    } catch (error) {
        const errMsg = `Failed to prepare user credential data for ${holderID}: ${error.message}`;
        logger.error(errMsg, txID);
        return null;
    }
}

module.exports = {
    prepareUserCredentialData
};