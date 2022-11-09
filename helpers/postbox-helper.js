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

const logger = new Logger('postbox-helper');

// Note: onboarding an issuer takes awhile so the timeout here needs to be higher than the others
const postboxAPI = axios.create({
    baseURL: `${config.postboxAPI.hostname}/api/v1`,
    timeout: config.timeout,
    httpsAgent: tlsHelper.getAgentHeaderForSelfSignedCerts(),
    headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
    },
});

const createLink = async (txID, holderId, token) => {
    logger.debug('createLink()', txID);
    const postboxLinkPath = '/links';

    const createReqBody = {
        no_expiration: true,
        owner: holderId,
    };

    return postboxAPI.post(postboxLinkPath, createReqBody, {
        headers: {
            Authorization: token,
            [constants.REQUEST_HEADERS.TRANSACTION_ID]: txID,
        },
    });
};

const uploadDocument = async (txID, token, argLink, argPassword, argName, argContent) => {
    logger.debug('uploadDocument()', txID);
    const postboxDocsPath = '/documents';

    const date = new Date();
    date.setDate(date.getDate() + constants.POSTBOX_DOC_EXPIRES_IN);
    const expiration = `${date.toISOString().slice(0, -5)}Z`;

    const uploadReqBody = {
        link: argLink,
        password: argPassword,
        content: argContent,
        expires_at: expiration,
        name: argName,
    };

    return postboxAPI.post(postboxDocsPath, uploadReqBody, {
        headers: {
            Authorization: token,
            [constants.REQUEST_HEADERS.TRANSACTION_ID]: txID,
        },
    });
};

const uploadDocumentSafe = async (txID, token, argLink, argPassword, argName, argContent) => {
    logger.debug('uploadDocumentSafe()', txID);
    let postboxRes;
    try {
        postboxRes = await uploadDocument(txID, token, argLink, argPassword, argName, argContent);
    } catch (err) {
        const { errorStatus, errorMsg } = utils.getErrorInfo(txID, err);
        logger.error(`Error occurred calling Postbox upload document API: ${errorStatus} ${errorMsg}`, txID);
        const error = { response: { status: errorStatus, data: errorMsg } };
        throw error;
    }
    return postboxRes;
};

const deleteLink = async (txID, token, linkID, linkToken) => {
    logger.debug('deleteLink()', txID);
    let postboxLinkPath = '/links/';
    postboxLinkPath += linkID;

    return postboxAPI.delete(postboxLinkPath, {
        headers: {
            Authorization: token,
            [constants.REQUEST_HEADERS.TRANSACTION_ID]: txID,
            [constants.REQUEST_HEADERS.POSTBOX_TOKEN]: linkToken,
        },
    });
};

const downloadDocument = async (txID, token, docID, linkID, docToken) => {
    logger.debug('downloadDocument()', txID);
    let postboxDocsPath = '/documents/';
    postboxDocsPath += docID;

    const headers = {
        Authorization: token,
        [constants.REQUEST_HEADERS.TRANSACTION_ID]: txID,
        [constants.REQUEST_HEADERS.POSTBOX_TOKEN]: docToken
    }

    if (linkID) {
        headers[constants.REQUEST_HEADERS.LINK_ID] = linkID;
    } else {
        logger.warn(`downloadDocument called without linkId`, txID);
    }

    return postboxAPI.get(postboxDocsPath, {
        headers,
    });
};

// Downloads postbox document and makes sure content exists, otherwise throws error
const downloadDocumentSafe = async (txID, token, docId, linkId, docToken) => {
    logger.debug('downloadDocumentSafe()', txID);
    let postboxRes;
    try {
        logger.debug(`Attempting to download document ${docId} from Postbox`, txID);
        postboxRes = await downloadDocument(txID, token, docId, linkId, docToken);
    } catch (err) {
        const { errorStatus, errorMsg } = utils.getErrorInfo(txID, err);
        logger.error(`Error occurred calling Postbox download document API: ${errorStatus} ${errorMsg}`, txID);
        const error = { response: { status: errorStatus, data: errorMsg } };
        throw error;
    }

    // Verify the document exists and has content
    if (!postboxRes || !postboxRes.data || postboxRes.data.type !== 'document') {
        const warnMsg = `Document ${docId} not found in Postbox`;
        logger.warn(warnMsg, txID);
        const error = { response: { status: 400, data: warnMsg } };
        throw error;
    }
    if (!postboxRes.data.payload || !postboxRes.data.payload.content) {
        const warnMsg = `Document ${docId} exists in Postbox but is empty`;
        logger.warn(warnMsg, txID);
        const error = { response: { status: 400, data: warnMsg } };
        throw error;
    }
    return postboxRes;
};

const deleteDocument = (txID, token, docId, linkId, docToken) => {
    logger.debug('deleteDocument()', txID);
    const postboxDocsPath = `/documents/${docId}`;

    const headers = {
        Authorization: token,
        [constants.REQUEST_HEADERS.TRANSACTION_ID]: txID,
        [constants.REQUEST_HEADERS.POSTBOX_TOKEN]: docToken
    }

    if (linkId) {
        headers[constants.REQUEST_HEADERS.LINK_ID] = linkId;
    } else {
        logger.warn(`deleteDocument called without linkId`, txID);
    }

    return postboxAPI.delete(postboxDocsPath, {
        headers,
    });
};

module.exports = {
    createLink,
    uploadDocument,
    uploadDocumentSafe,
    deleteLink,
    downloadDocument,
    downloadDocumentSafe,
    deleteDocument
};
