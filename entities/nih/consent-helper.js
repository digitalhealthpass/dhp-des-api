/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
* 
*/

const uuid = require('uuid');

const generateConsentReceipt = (
    entityData, holderId
) => {
    const currentDate = new Date();

    const consentReceipt = entityData.consentInfo;
    consentReceipt.collectionMethod = 'Data subject initiated via Digital Wallet';
    consentReceipt.consentReceiptID = uuid.v4();
    consentReceipt.consentTimestamp = Math.round(currentDate.getTime() / 1000);
    consentReceipt.piiPrincipalId = holderId;

    return consentReceipt;
}

const generateConsentRevoke = (
    entityData, holderId
) => {
    const currentDate = new Date();

    const consentRevoke = {};
    consentRevoke.version = entityData.consentInfo.version;
    consentRevoke.consentRevokeId = uuid.v4();
    consentRevoke.consentRevokeTimestamp = Math.round(currentDate.getTime() / 1000);

    consentRevoke.piiPrincipal = [];
    consentRevoke.piiPrincipal.push({ id : holderId});
    
    if (entityData.consentInfo.piiControllers) {
        consentRevoke.piiControllers = entityData.consentInfo.piiControllers.reduce(
            (acc, c) => {
                acc.push(c.piiController);
                return acc;
            }, []
        );
    }

    if (entityData.consentInfo.services) {
        consentRevoke.services = entityData.consentInfo.services.reduce(
            (acc, c) => {
                acc.push(c.service);
                return acc;
            }, []
        );
    }

    return consentRevoke;
}

module.exports = {
    generateConsentReceipt,
    generateConsentRevoke
};
