/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
* 
*/
const constants = require('../../helpers/constants');

exports.getRequiredFields = () => {
    return [];
}

exports.getOrgFields = () => {
    return constants.ORGS_FIELDS.MAPPER_REQUIRED
}

exports.getSubmitRequiredFields = () => {
    return ['publicKey', 'publicKeyType', 'documentId'];
}