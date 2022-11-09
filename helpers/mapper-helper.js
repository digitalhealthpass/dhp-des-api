/* eslint-disable no-underscore-dangle */
/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 */

const constants = require('./constants');
const CloudantHelper = require('./cloudantHelper');
const Logger = require('../config/logger');
const cacheHelper = require('./cache-helper');

const logger = new Logger('mapper-helper');

const createNewMapper = async (txID, req) => {
    const cloudantHelper = CloudantHelper.getInstance(txID);

    const dbORG = constants.DB_NAMES.MAPPER;
    const mapperDocs = req.body;

    try {
        // making mapperid in request as primary key
        mapperDocs._id = mapperDocs.mapperName;

        logger.info(`Attempting to create row in ${dbORG} database`, txID);
        const cloudantRes = await cloudantHelper.createDocument(txID, null, mapperDocs, dbORG);
        if (cloudantRes.ok) {
            // Keeping async operation to add in shared Cache Memory
            cacheHelper.set(mapperDocs.mapperName, mapperDocs);

            return { status: 201, message: `Created mapper successfully` };
        }
        const errMsg = `Failed to create row in ${dbORG} database`;
        logger.error(errMsg, txID);
        return { status: 400, message: errMsg };
    } catch (error) {
        const message = `Error occurred creating mapper: ${error.message}`;
        logger.error(message, txID);
        return { status: error.statusCode, message };
    }
};

const getMapperFullDataByName = async (txID, mapperName) => {

    const mapper = await cacheHelper.get(mapperName);
    if (mapper) {
        return mapper;
    }
    const cloudantHelper = CloudantHelper.getInstance(txID);
    const dbName = constants.DB_NAMES.MAPPER;

    try {
        logger.debug(`Attempting to retrieve mapper ${mapperName} from ${dbName} database`, txID);
        const readDoc = await cloudantHelper.readDocumentSafe(txID, mapperName, dbName);
        if (readDoc.status !== 200) {
            logger.warn(`Mapper ${mapperName} not found in ${dbName} database`, txID);
            return null;
        }
        // Keeping async operation to add data in shared Cache Memory
        cacheHelper.set(mapperName, readDoc.data);

        return readDoc.data;
    } catch (error) {
        logger.error(`Error occurred querying mapper from ${dbName} database: ${error.message}`, txID);
        return null;
    }
};

const getMapperByName = async (txID, mapperName) => {
    const fullData = await getMapperFullDataByName(txID, mapperName);
    if (fullData) {
        return fullData.mapper;
    }
    return null;
};

const updateMapper = async (txID, mapperData, reqBody) => {
    const cloudantHelper = CloudantHelper.getInstance(txID);
    const dbOrg = constants.DB_NAMES.MAPPER;

    const orgDocs = reqBody;
    orgDocs._id = mapperData._id;
    orgDocs._rev = mapperData._rev;
    orgDocs.mapperName = mapperData.mapperName;

    try {
        logger.info(`Attempting to update ${mapperData._id} in ${dbOrg} database`, txID);
        const cloudantRes = await cloudantHelper.updateDocument(txID, mapperData._id, mapperData._rev, orgDocs, dbOrg);
        if (cloudantRes.ok) {
            // Keeping async operation to move shared Cache Memory to re-set later.
            cacheHelper.remove(orgDocs.mapperName);
            return { status: 200, message: 'Updated mapper successfully' };
        }
        const errMsg = `Failed to update row for ${mapperData._id} in ${dbOrg} database`;
        logger.error(errMsg, txID);
        return { status: 400, message: errMsg };
    } catch (error) {
        const message = `Error occurred updating mapper: ${error.message}`;
        logger.error(message, txID);
        return { status: error.statusCode, message };
    }
};

const getAllMappers = async (txID) => {
    const cloudantHelper = CloudantHelper.getInstance(txID);
    const dbName = constants.DB_NAMES.MAPPER;

    logger.debug(`Attempting to retrieve mappers from ${dbName} database`, txID);

    const query = {
        selector: {
            _id: {
                $gt: null
            }
        }
    };

    const readDoc = await cloudantHelper.queryDocuments(txID, query, dbName);

    return readDoc.docs;
};

const deleteMapper = async (txID, mapperId, mapperData) => {
    const cloudantHelper = CloudantHelper.getInstance(txID);
    const dbName = constants.DB_NAMES.MAPPER;
    try {
        await cloudantHelper.deleteDocumentSafe(txID, mapperData._id, mapperData._rev, dbName);
        // Keeping async operation to remove from shared Cache Memory
        cacheHelper.remove(mapperData.mapperName);
        return { status: 200, message: `Delete mapper ${mapperId} successfully` };
    } catch (error) {
        const errMsg = `Error occurred deleting mapper ${mapperId}: ${error.message}`;
        logger.error(errMsg, txID);
        return { status: error.statusCode, message: errMsg };
    }
};

module.exports = {
    createNewMapper,
    updateMapper,
    deleteMapper,
    getAllMappers,
    getMapperByName,
    getMapperFullDataByName
};
