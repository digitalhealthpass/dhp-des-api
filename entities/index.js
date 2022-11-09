/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 */

const fs = require('fs');

const constants = require('../helpers/constants');
const utils = require('../utils/index');
const entityDownloadIdHelper = require("./holder-download/id-helper");
const CloudantHelper = require('../helpers/cloudantHelper');
const Logger = require('../config/logger');

const logger = new Logger('entities');

// Validates entity exists, returns object if true, null otherwise
const getRegEntity = async (txID, entity) => {

    const cloudantHelper = CloudantHelper.getInstance(txID);
    const dbName = constants.DB_NAMES.ORG;

    try {
        logger.debug(`Attempting to retrieve entity ${entity} from ${dbName} database`, txID);
        const readDoc = await cloudantHelper.readDocumentSafe(txID, entity, dbName);
        if (readDoc.status !== 200) {
            // eslint-disable-next-line max-len
            logger.warn(`Entity ${entity} not found in ${dbName} database. Status: ${readDoc.status}; Message: ${readDoc.message}`, txID);
            return null;
        }
        return readDoc.data;
    } catch (error) {
        logger.error(`Error occurred querying entity from ${dbName} database: ${error.message}`, txID);
        return null;
    }
};

const getAllRegEntities = async (txID) => {
    const cloudantHelper = CloudantHelper.getInstance(txID);
    const dbName = constants.DB_NAMES.ORG;

    logger.debug(`Attempting to retrieve registered entities from ${dbName} database`, txID);

    const query = {
        selector: {
            entity: { $exists: true },
            _id: {
                $gt: null
            }
        },
        fields: ['entity']
    };

    const readDoc = await cloudantHelper.queryDocuments(txID, query, dbName);

    return readDoc.docs
        ? readDoc.docs.reduce(
            (acc, e) => {
                acc.push(e.entity);
                return acc;
            },[])
        : [];
};

const getAllEntityClients = async (txID, entity) => {
    const cloudantHelper = CloudantHelper.getInstance(txID);
    const dbName = constants.DB_NAMES.ORG;

    logger.debug(`Attempting to retrieve registered clients for entity ${entity} from ${dbName} database`, txID);

    const query = {
        selector: {
            organization: entity,
            clientName: { $exists: true },
            _id: {
                $gt: null
            }
        }
    };

    const readDoc = await cloudantHelper.queryDocuments(txID, query, dbName);
    return readDoc.docs;
};

// Validates that registration entity helpers exist
// Returns true if they exist, false otherwise
const existRegEntityHelpers = async (txID, entity) => {
    try {
        const helperFiles = [
            'profile-helper.js', 'user-helper.js', 'data-helper.js', 'consent-helper.js'
        ];

        for (let i = 0; i < helperFiles.length; i += 1) {
            const helperPath = `./entities/${entity}/${helperFiles[i]}`;
            const doesHelperExist = fs.existsSync(helperPath);
            if (!doesHelperExist) {
                return false;
            }
        }
        return true;
    } catch(err) {
        logger.safeError('Internal error - Unable to query file system for entity helpers', err, txID);
        return false;
    }
};

const getClient = async (txID, entity, clientName) => {
    logger.debug(`Fetching client from Cloudant: ${clientName}`, txID);

    const cloudantHelper = CloudantHelper.getInstance(txID);
    const dbName = constants.DB_NAMES.ORG;
    const clientId = utils.hashStrings([entity, clientName]);
    
    try {
        const readDoc = await cloudantHelper.readDocumentSafe(txID, clientId, dbName);
        if (readDoc.status !== 200) {
            logger.warn(`Client ${clientName} not found in ${dbName} database`, txID);
            return null;
        }
        return readDoc.data;
    } catch (error) {
        logger.error(`Error occurred querying client ${clientName} in ${dbName} database: ${error.message}`, txID);
        return null;
    }
};

const getEntityIdHelper = async (txID, entity) => {
    const regEntity = entity.toLowerCase();
    const regEntityData = await getRegEntity(txID, regEntity);
    if (!regEntityData) {
        logger.error(`Invalid organization ${regEntity}, no configuration found`, txID);
        return undefined;
    }

    const entityHelperName = regEntityData.entityType || regEntity;

    if (entityHelperName === 'holder-download') {
        return entityDownloadIdHelper;
    }

    // Make sure entity has id helper ('{entity}-id-helper')
    const existEntityHelpers = await existRegEntityHelpers(txID, entityHelperName);
    if (!existEntityHelpers) {
        logger.error(`Invalid organization ${regEntity}, no entity helpers found`, txID);
        return undefined;
    }

    // eslint-disable-next-line global-require, import/no-dynamic-require
    return require(`../entities/${entityHelperName}/id-helper`);
}

const getHolderId = async (txID, entity, body) => {
    const entityIdHelper = await getEntityIdHelper(txID, entity);
    if (!entityIdHelper) {
        return undefined;
    }

    return entityIdHelper.getHolderID(body);
}

module.exports = {
    getRegEntity,
    getAllRegEntities,
    existRegEntityHelpers,
    getClient,
    getAllEntityClients,
    getEntityIdHelper,
    getHolderId,
};
