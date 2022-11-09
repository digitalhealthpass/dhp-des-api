/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
* 
*/
const jslt = require('jslt');
const uuid = require('uuid');
const mapperHelper = require('../../helpers/mapper-helper');
const Logger = require('../../config/logger');

const logger = new Logger('consent-helper');

const generateConsentReceipt = async (
    entityData, holderId, txID
) => {
    const consentSchema = entityData.mappers.consent.receipt.mapper;
    const mapper = await mapperHelper.getMapperByName(txID, consentSchema);
    if (mapper) {
        const consentReceipt = jslt.transform(entityData.consentInfo, mapper);
        const currentDate = new Date();
        consentReceipt.consentId = uuid.v4();
        consentReceipt.consentTimestamp = Math.round(currentDate.getTime() / 1000);
        consentReceipt.principal.id = holderId;
        consentReceipt.principal.key = holderId;

        return consentReceipt;
    } 

    const message = `Cannot load ConsentReceipt mapper ${consentSchema} from database`;
    logger.warn(message, txID);
    return {};
}

const generateConsentRevoke = async (
    entityData, holderId, txID
) => {
    const consentRevokeSchema = entityData.mappers.consent.revoke.mapper;
    const mapper = await mapperHelper.getMapperByName(txID, consentRevokeSchema);
    if (mapper) {
        const consentRevoke = jslt.transform(entityData.consentInfo, mapper);
        const currentDate = new Date();
        consentRevoke.consentRevokeId = uuid.v4();
        consentRevoke.consentRevokeTimestamp = Math.round(currentDate.getTime() / 1000);
        consentRevoke.principal = {};
        consentRevoke.principal.id = holderId;
        consentRevoke.principal.key = holderId;

        return consentRevoke;
    } 
    const message = `Cannot load ConsentRevoke mapper ${consentRevokeSchema} from database`;
    logger.warn(message, txID);
    return {};
    
}

module.exports = {
    generateConsentReceipt,
    generateConsentRevoke
};
