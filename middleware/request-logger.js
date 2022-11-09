/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 */

const { v4: uuidv4 } = require('uuid');
const requestIp = require('request-ip');

const constants = require('../helpers/constants');
const Logger = require('../config/logger');

const logger = new Logger('request-logger');

// eslint-disable-next-line no-unused-vars
const logRequestInfo = (req, res, next) => {
    let transactionID = req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID];
    if (!transactionID) {
        // add a transactionID header to every incoming request so we can track it in the logs
        transactionID = uuidv4();
        req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID] = transactionID;
    }

    logger.debug(`Incoming request: ${req.method} ${req.originalUrl}`, transactionID);
    logger.debug(`Request headers: ${JSON.stringify(req.headers, null, 4)}`, transactionID);
    logger.safeDebug('Request body:', req.body, transactionID);

    const callerIp = requestIp.getClientIp(req);

    const loggerValues = {
        'transactionId': transactionID,
        'callerIp': callerIp,
        'requestUrl': `${constants.BASE_URL}${req.originalUrl}`,
    }
    req.local = loggerValues;

    return next();
};

module.exports = logRequestInfo;
