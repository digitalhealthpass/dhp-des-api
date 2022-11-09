/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
* 
*/

const utils = require('../../utils/index');

exports.getHolderID = (reqBody) => {
    return utils.hashStrings([reqBody.id, reqBody.clientName]);
}

exports.validateHolderID = (reqBody) => {
    if (reqBody.id && reqBody.clientName) {
        return true;
    }
    return false;
}

exports.holderIDField = 'id';