/* eslint-disable no-underscore-dangle */
/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 */

const constants = require('./constants');
const utils = require('../utils/index');
const CloudantHelper = require('./cloudantHelper');
const Logger = require('../config/logger');

const logger = new Logger('client-helper');

const createClient = async (txID, reqBody) => {
    const cloudantHelper = CloudantHelper.getInstance(txID);
    const dbOrg = constants.DB_NAMES.ORG;
    const clientDoc = reqBody;

    try {
        const client = clientDoc.clientName;
        clientDoc._id = utils.hashStrings([clientDoc.organization, clientDoc.clientName]);

        logger.info(`Attempting to create row for client ${client} in ${dbOrg} database`, txID);
        const cloudantRes = await cloudantHelper.createDocument(txID, null, clientDoc, dbOrg);
        if (cloudantRes.ok) {
            const successMsg = `Created client ${client} successfully with _id=${clientDoc._id}`;
            logger.info(successMsg, txID);
            return { 
                status: 201, 
                message: successMsg
            };
        }
        const errMsg = `Failed to create row for ${client} in ${dbOrg} database`;
        logger.error(errMsg, txID);
        return { status: 400, message: errMsg };
    } catch (error) {
        const errMsg = `Error occurred creating row for client in ${dbOrg} database: ${error.message}`;
        logger.error(errMsg, txID);
        return { status: error.statusCode, message: errMsg };
    }
};

const updateClient = async (txID, clientData, reqBody) => {
    const cloudantHelper = CloudantHelper.getInstance(txID);
    const dbOrg = constants.DB_NAMES.ORG;

    const clientDoc = reqBody;
    clientDoc._id = clientData._id;
    clientDoc._rev = clientData._rev;

    try {
        const client = clientDoc.clientName;
        logger.info(`Attempting to update client ${client} in ${dbOrg} database`, txID);
        // eslint-disable-next-line max-len
        const cloudantRes = await cloudantHelper.updateDocument(txID, clientData._id, clientData._rev, clientDoc, dbOrg);
        if (cloudantRes.ok) {
            return { status: 200, message: `Updated client ${client} successfully` };
        }

        const errMsg = `Failed to update client ${client} in ${dbOrg} database`;
        logger.error(errMsg, txID);
        return { status: 400, message: errMsg };
    } catch (error) {
        const message = `Error occurred updating client in ${dbOrg} database: ${error.message}`;
        logger.error(message, txID);
        return { status: error.statusCode, message };
    }
};

module.exports = {
    createClient,
    updateClient,
};
