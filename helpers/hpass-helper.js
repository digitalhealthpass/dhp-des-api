/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 */

const axios = require('axios');

const constants = require('./constants');
const config = require('../config');
const tlsHelper = require('./tls-helper');
const utils = require('../utils/index');
const Logger = require('../config/logger');

const logger = new Logger('hpass-helper');

const hpassAPI = axios.create({
    baseURL: `${config.hpassAPI.hostname}`,
    timeout: config.timeout,
    httpsAgent: tlsHelper.getAgentHeaderForSelfSignedCerts(),
    headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
    },
});

// eslint-disable-next-line max-params
const createCredential = async (txID, token, type, issuerID, schemaID, data, reqBody, expirationDate, credType) => {
    logger.debug('createCredential()', txID);
    let createCredentialPath = '/credentials';
    if (type === constants.CREDENTIAL_TYPES.string) {
        createCredentialPath += '?type=string';
    }

    const credentialReqBody = {
        schemaID,
        data,
        type: credType || []
    };

    if (expirationDate) {
        credentialReqBody.expirationDate = expirationDate;
        logger.debug('Requesting to generate a new credential with expirationDate', txID);
    }

    if (data.obfuscation) {
        credentialReqBody.obfuscation = reqBody.obfuscation;
        logger.debug('Requesting to generate a new credential with obfuscation', txID);
    }

    return hpassAPI.post(createCredentialPath, credentialReqBody, {
        headers: {
            Authorization: token,
            [constants.REQUEST_HEADERS.ISSUER_ID]: issuerID,
            [constants.REQUEST_HEADERS.TRANSACTION_ID]: txID,
        },
    });
};

// Creates healthpass credential and makes sure content exists, otherwise throws error
// eslint-disable-next-line max-params
const createCredentialSafe = async (txID, token, type, issuerId, schemaId, data, reqBody, expirationDate, credType) => {
    logger.debug('createCredentialSafe()', txID);
    let credentials;
    try {
        logger.debug(`Attempting to create credential by issuerId=${issuerId} with schemaId=${schemaId}`)
        // eslint-disable-next-line max-len
        credentials = await createCredential(txID, token, type, issuerId, schemaId, data, reqBody, expirationDate, credType);
    } catch (err) {
        const { errorStatus, errorMsg } = utils.getErrorInfo(txID, err);
        logger.error(
            // eslint-disable-next-line max-len
            `Error occurred calling HealthPass create credential API, issuerId=${issuerId} schemaId=${schemaId}: ${errorStatus} ${errorMsg}`, 
            txID
        );
        const error = { response: { status: errorStatus, data: errorMsg } };
        throw error;
    }

    if (!credentials || !credentials.data || !credentials.data.payload) {
        // eslint-disable-next-line max-len
        const errMsg = `Failed to create credential, HealthPass API returned incomplete data, issuerId=${issuerId} schemaId=${schemaId}`;
        logger.error(errMsg, txID);
        const error = { response: { status: 500, data: errMsg } };
        throw error;
    }
    return credentials;
};

module.exports = {
    hpassAPI,
    createCredential,
    createCredentialSafe,
};