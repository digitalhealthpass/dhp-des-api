/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
* 
*/
const constants = require('../../helpers/constants');

exports.getRequiredFields = (regEntityData) => {
    return regEntityData.userData;
}

exports.getOrgFields = () => {
    return constants.ORGS_FIELDS.REQUIRED
}

exports.getSubmitRequiredFields = () => {
    return ['publicKey', 'documentId'];
}