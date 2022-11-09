/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
* 
*/

const generateConsentReceipt = (
    // eslint-disable-next-line no-unused-vars
    entityData, holderId
) => {
    return {
        status: 501,
        message: 'generateConsentReceipt is not implemented',
    }
}

const generateConsentRevoke = (
    // eslint-disable-next-line no-unused-vars
    entityData, holderId
) => {
    return {
        status: 501,
        message: 'generateConsentRevoke is not implemented',
    }
}

module.exports = {
    generateConsentReceipt,
    generateConsentRevoke
};
