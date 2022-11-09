/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
* 
*/

exports.getHolderID = (reqBody) => {
    return reqBody.id || reqBody.publicKey;
}

exports.validateHolderID = (reqBody) => {
    if (reqBody.id || reqBody.publicKey) {
        return true;
    }
    return false;
}

exports.holderIDField = 'id';