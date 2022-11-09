/* eslint-disable no-param-reassign */
/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 *
 */

const moment = require('moment');
const path = require('path');

const { isBinaryFileSync } = require("isbinaryfile");
const csvtojson = require('csvtojson');
const crypto = require('crypto');

const { getGdprLogger, CRUD_OPERATION } = require('dhp-logging-lib/gdpr');
const entityHelper = require('../entities');
const utils = require('../utils');
const config = require('../config');
const Logger = require('../config/logger');
const constants = require('./constants');
const CloudantHelper = require('./cloudantHelper');

const gdprLogger = getGdprLogger();
const logger = new Logger('csv-helper');
let configUserListRowMax = 4000;
let configTestResultRowMax = 4000;
let configChunkSize = 200;
let batchMaxErrorThreshold = 20;
if (config.csv) {
    if (config.csv.testResultRowMax)
        configTestResultRowMax = config.csv.testResultRowMax;
    if (config.csv.userListRowMax)
        configUserListRowMax = config.csv.userListRowMax;
    if (config.csv.chunkSize)
        configChunkSize = config.csv.chunkSize;
    if (config.csv.batchMaxErrorThreshold)
        batchMaxErrorThreshold = config.csv.batchMaxErrorThreshold;
}

// Map to find the BatchReport doc-type used in Cloudant storage for corresponding "role" query param
const roleToDoctypeMap = new Map();
roleToDoctypeMap.set(constants.APP_ID_ROLES.TEST_ADMIN, constants.DOC_TYPE.TESTRESULT_BATCH_REPORT);
roleToDoctypeMap.set(constants.APP_ID_ROLES.REGISTRATION_ADMIN, constants.DOC_TYPE.PREREG_BATCH_REPORT);

const validateHeaders = (providedHeaders, requiredHeaders) => {
    return requiredHeaders.every((header) => providedHeaders.includes(header));
};

const validateBatchHeaders = (txID, res, headers, requiredHeaders) => {
    const areHeadersValid = validateHeaders(headers, requiredHeaders);
    if (!areHeadersValid) {
        const errMsg = `Invalid headers in CSV file. Required headers: ${requiredHeaders.join(',')}`;
        logger.response(400, `Failed to parse CSV file: ${errMsg}`, txID);
        return res.status(400).json({
            error: {
                message: errMsg,
            },
        });
    }
    return undefined;
}

const validateCsvUpload = (txID, req) => {
    if (!req.files || !req.files.file) {
        return 'Missing CSV file'
    }
    const fileName = req.files.file.name;
    const fileExtension = path.extname(fileName);
    const fileMimeType = req.files.file.mimetype;
    const fileData = req.files.file.data;
    const fileSize = req.files.file.size;

    if (fileExtension !== '.csv') {
        return 'Required extension is .csv';
    }
    if (fileMimeType !== 'text/csv') {
        return 'Required mimetype is text/csv';
    }
    const isBinary = isBinaryFileSync(fileData, fileSize);
    if (isBinary) {
        return 'Binary file is not allowed';
    }

    req.body.fileName = fileName;
    const entity = req.body.organization;
    const requiredFields = ['organization', 'fileName'];
    const hasAllFields = requiredFields.every((field) => req.body[field] && req.body[field].length > 0);
    if (!hasAllFields) {
        return `Missing required form fields for CSV batch upload: ${requiredFields.join(', ')}`;
    }

    const fileHash = crypto.createHash('md5').update(fileData).digest("hex");
    logger.info(`File uploaded:: org: ${entity} fileName: ${fileName} md5: ${fileHash}`, txID);
    return undefined;
};

const queryBatchItems = async (txID, entity, batchID, docType) => {
    const cloudantHelper = CloudantHelper.getInstance(txID);
    const dbName = `${entity}-${constants.DB_NAMES.BATCH_QUEUE}`;
    // TODO, for processing flow, we may want use 'limit', if we hit bottleneck
    const query = {
        selector: {
            batchID,
            type: docType,
        },
        sort: [{ "rowID": "asc" }],
    };

    logger.debug(`Attempting to query batch items by batchID=${batchID} in ${dbName} database`, txID);
    try {
        const { docs } = await cloudantHelper.queryDocuments(txID, query, dbName);
        return docs;
    } catch (err) {
        const errMsg = `Error occurred querying docs with batchID=${batchID} in ${dbName} database: ${err.message}`;
        logger.error(errMsg, txID);
        throw new Error(errMsg);
    }
};

const uploadChunk = async (txID, req, entity, batchID, docType, itemIndexStart, batch) => {
    const cloudantHelper = CloudantHelper.getInstance(txID);
    const dbName = `${entity}-${constants.DB_NAMES.BATCH_QUEUE}`;

    const entityIdHelper = await entityHelper.getEntityIdHelper(txID, entity);
    if (!entityIdHelper) {
        const errMsg = `Invalid organization ${entity}, helper not found`;
        logger.error(errMsg, txID);
        throw new Error(errMsg);
    }
    
    logger.debug(`Attempting to save docs, type=${docType} batchID=${batchID} to ${dbName} database`, txID);
    batch.forEach((item, i) => {
        item.type = docType;
        item.batchID = batchID;
        const holderId = entityIdHelper.getHolderID(item);
        if (holderId) {
            gdprLogger.log(req, holderId, CRUD_OPERATION.CREATE);        
        }
        // TODO: add row validation and set rowID in dev route and remove this redundant assignment
        if (!('rowID' in item)) 
            item.rowID = itemIndexStart + i;
    });
    const batchDocs = { docs: batch };

    try {
        // TODO: save errors in response
        await cloudantHelper.createDocumentBulk(txID, '', batchDocs, dbName);
        logger.info(`Successfully saved docs with batchID=${batchID} to ${dbName} database`, txID);
    } catch (err) {
        const errMsg = `Error occurred saving docs with batchID=${batchID} to ${dbName} database: ${err.message}`;
        logger.error(errMsg, txID);
        throw new Error(errMsg);
    }
};

const uploadBatchItemsForProcessing = async (
    txID, req, regEntity, batchID, docType, batch
) => {
    const batchLength = batch.length;
    try {
        let startIndex = 0;
        while (batch.length > 0) {
            const nextChunk = batch.splice(0, configChunkSize);
            // eslint-disable-next-line no-await-in-loop
            await uploadChunk(txID,
                req,
                regEntity,
                batchID,
                docType,
                startIndex,
                nextChunk);

            logger.debug(`Queued upload: batchID ${batchID}, chunkSize ${nextChunk.length},\
                startIndex ${startIndex}`, txID);
            startIndex += nextChunk.length;
        }
    } catch (err) {
        // eslint-disable-next-line max-len
        const errMsg = `Error occurred uploading batch of ${batch.length} docs with batchID ${batchID}: ${err.message}`;
        logger.error(errMsg, txID);
        throw new Error(errMsg);
    }

    // Uploaded items from above may not be ready in Cloudant when queryBatchItems is called
    // Below retries 3 times until counts match, else throw error.
    for (let i = 1; i < 4; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        const queriedBatchItems = await queryBatchItems(txID, regEntity, batchID, docType);

        if (queriedBatchItems.length === batchLength) {
            return queriedBatchItems;
        }

        logger.warn(`Batch items not ready.  Expected ${batchLength} but got ${queriedBatchItems.length}`);
        // eslint-disable-next-line no-await-in-loop
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const errMsg = `Batch items not ready after 3 retries`;
    logger.error(errMsg, txID);
    throw new Error(errMsg);
}

const validateRowCount = (
    txID, res, max, csv
) => {
    if (csv.length <= max) {
        return undefined;
    }

    const errMsg = `Row count ${csv.length} exceeds the limit of ${max}`;
    logger.response(400, `Failed to parse CSV file: ${errMsg}`, txID);
    return res.status(400).json({
        error: {
            message: errMsg,
        },
    });
}

const parseHeaders = (csvString) => {

    let index = csvString.indexOf('\r\n')

    if(index === -1){
        index = csvString.indexOf('\n')
    }

    if (index > -1) {
        const headers = csvString.substring(0, index);
        return headers.split(',');
    }
    return csvString.split(',')
}

// TODO: make CSV processing logic more generic
const parseCredential = async (txID, req, res, token, entityData, processDataFunc) => {
    const entity = req.body.organization;
    const { fileName } = req.body;
    const batchID = txID;

    const csvString = req.files.file.data.toString('utf8');
    const headers = parseHeaders(csvString);
    
    const headerValidationResponse = validateBatchHeaders(txID, res, headers, constants.CREDENTIAL_HEADERS);
    if (headerValidationResponse) {
        return headerValidationResponse;
    }

    const batch = await csvtojson().fromString(csvString);

    let {credentialType} = req.params;
    if (credentialType) {
        const key = entityData.mappers.download[credentialType];
        if (!key) {
            // error need to return
            const errMsg = `credentialType: ${credentialType} is not supported`;
            logger.response(400, `Failed to process: ${errMsg}`, txID);
            return res.status(400).json({
                error: {
                    message: errMsg,
                },
            });
        }
    } else {
        // default
        credentialType = "default";
    }

    const rowCountValidationResponse = validateRowCount(
        txID, res, configTestResultRowMax, batch
    );
    if (rowCountValidationResponse) {
        return rowCountValidationResponse;
    }

    // validate all rows
    const validateRes = utils.validateRows(txID, batch, headers, batchMaxErrorThreshold);
    const { validatedRows, invalidRows } = validateRes.data;
    if (validateRes.status !== 200) {
        return res.status(400).json({
            error: {
                message: validateRes.message,
                payload: {
                    failedRows: invalidRows,
                }
            }
        });
    }

    try {
        const retrievedBatch = await uploadBatchItemsForProcessing(
            txID, req, entity, batchID, credentialType, validatedRows);
        if (processDataFunc) {
            const batchInfo = {
                batch: retrievedBatch,
                fileName,
                batchID
            };
            processDataFunc(txID, req, token, entityData, batchInfo, credentialType);
        }
    } catch (err) {
        logger.response(400, `Failed to parse CSV file: ${err.message}`, txID);
        return res.status(400).json({
            error: {
                message: err.message,
            },
        });
    }

    // return 200 to caller after file data has been successfully uploaded
    // do not wait for data to be processed
    logger.response(200, `Successfully parsed CSV file and uploaded TestResult for batchID ${batchID}`, txID);
    return res.status(200).json({
        message: 'Successfully parsed CSV file and uploaded the data',
        batchID,
    });
};

// TODO: make CSV processing logic more generic
// process a CSV list of users for mfa user-registration
// fields -> object that holds the entity name and the file contents
// processDataFunc -> function that handles the list of users that are parsed from the file
const parseUserList = async (txID, req, res, processDataFunc) => {
    const entity = req.body.organization;
    const batchID = txID;

    const csvString = req.files.file.data.toString('utf8')
    const users = await csvtojson().fromString(csvString);
    const entityData = await entityHelper.getRegEntity(txID, entity);

    const headers = parseHeaders(csvString);

    let headerValidationResponse = null;
    if (entityData.preRegRequiedFields) {
        headerValidationResponse = validateBatchHeaders(txID, res, headers, entityData.preRegRequiedFields);
    } else {
        headerValidationResponse = validateBatchHeaders(txID, res, headers, constants.MFA_USER_REGISTRATION_FIELDS);
    }
    
    if (headerValidationResponse) {
        return headerValidationResponse;
    }

    const rowCountValidationResponse = validateRowCount(
        txID, res, configUserListRowMax, users
    );
    if (rowCountValidationResponse) {
        return rowCountValidationResponse;
    }

    // validate all rows
    const validateRes = utils.validateRows(txID, users, headers, batchMaxErrorThreshold);
    const { validatedRows, invalidRows } = validateRes.data;
    if (validateRes.status !== 200) {
        return res.status(400).json({
            error: {
                message: validateRes.message,
                payload: {
                    failedRows: invalidRows,
                }
            }
        });
    }

    try {
        const retrievedBatch = await uploadBatchItemsForProcessing(
            txID, req, entity, batchID, constants.DOC_TYPE.PREREG_ITEM, validatedRows);

        if (processDataFunc) {
            processDataFunc(txID, req, res, entity, retrievedBatch);
        }
    } catch (err) {
        logger.response(400, `Failed to parse CSV file: ${err.message}`, txID);
        return res.status(400).json({
            error: {
                message: err.message,
            },
        });
    }

    logger.response(200, `Successfully parsed CSV file and uploaded UserList for batchID ${batchID}`, txID);
    return res.status(200).json({
        message: 'Successfully parsed CSV file and uploaded data',
        batchID: txID,
    });
};

// TODO: due to ongoing refactor efforts, our logic isn't organized well so there's no good place to
//       put the below functions, leaving them here for now to group them alongside related functions
/* eslint-disable max-params */
const saveUploadResults = (
    txID,
    entity,
    role,
    fileName,
    rowCount,
    successCount,
    failedRows,
    batchFailureMessages,
    submittedTimestamp) => {

    const cloudant = CloudantHelper.getInstance(txID);
    const dbName = `${entity}-${constants.DB_NAMES.BATCH}`;
    const batchReportDoctype = roleToDoctypeMap.get(role);

    const resultDoc = {
        type: batchReportDoctype,
        batchID: txID,
        rowCount,
        successCount,
        failureCount: failedRows.length,
        failedRows,
        batchFailureMessages,
        fileName,
        submittedTimestamp,
    };

    logger.info(`Attempting to save batch report ${batchReportDoctype}:
        rowCount ${rowCount}, success ${successCount}, failures ${failedRows.length}`,
    txID);
    cloudant.createDocument(txID, '', resultDoc, dbName);
};

/* -- TODO move all batch related management func to separate helper file --  */

const queryBatchIDs = async (txID, entity, role) => {
    const cloudant = CloudantHelper.getInstance(txID);
    const dbName = `${entity}-${constants.DB_NAMES.BATCH}`;

    const batchReportDoctype = roleToDoctypeMap.get(role);
    const selector = {};
    if (batchReportDoctype) {

        selector.type = batchReportDoctype;
        logger.debug(`Attempting to query batchID docs in ${dbName} database`, txID);
        const query = { selector, fields: ['batchID'] };
        const { docs } = await cloudant.queryDocuments(txID, query, dbName);
        return docs;
    }

    logger.error(`Unexpected query for BatchIDs with role ${role}`, txID);
    return [];
};

const buildSingleBatchReport = (batchID, docs) => {
    const report = {
        batchID,
        submittedTimestamp: undefined,
        fileName: undefined,
        rowCount: 0,
        successCountTotal: 0,
        failureCountTotal: 0,
        failedRows: [],
    };

    docs.forEach((doc) => {
        // TODO: should we add checks to make sure it's always consistent? should theoretically never happen
        if (!report.fileName) report.fileName = doc.fileName;
        if (!report.batchFailureMessages) report.batchFailureMessages = doc.batchFailureMessages;

        report.rowCount += doc.rowCount;
        report.successCountTotal += doc.successCount;
        report.failureCountTotal += doc.failureCount;
        report.failedRows = report.failedRows.concat(doc.failedRows);

        const docTimestamp = moment(doc.submittedTimestamp);
        const reportTimestamp = moment(report.submittedTimestamp);
        if (docTimestamp.isBefore(reportTimestamp)) report.submittedTimestamp = doc.submittedTimestamp;
    });

    return report;
};

const logGdprBatchReport = async (txID, req, entity, batchDocs) => {
    const entityIdHelper = await entityHelper.getEntityIdHelper(txID, entity);
    if (!entityIdHelper) {
        return;
    }
    batchDocs.docs.forEach((doc) => {
        const holderId = entityIdHelper.getHolderID(doc);
        if (holderId) {
            gdprLogger.log(req, holderId, CRUD_OPERATION.READ);
        }
    });
}

const getSingleBatchReport = async (txID, req, entity, role, batchID, limit, bookmark) => {
    const cloudant = CloudantHelper.getInstance(txID);
    const dbName = `${entity}-${constants.DB_NAMES.BATCH}`;

    const batchReportDoctype = roleToDoctypeMap.get(role);
    const query = {
        selector: {
            batchID,
            type: batchReportDoctype
        }
    };
    // optional, bookmark based limit
    if (!Number.isNaN(limit)) {
        const limitValue = parseInt(limit, 10);
        if (limitValue > 0)
            query.limit = limitValue;
    }
    if (bookmark)
        query.bookmark = bookmark;

    const batchDocs = await cloudant.queryDocuments(txID, query, dbName);
    logGdprBatchReport(req, txID, entity, batchDocs);
    logger.debug(`  query resultsize ${batchDocs.docs.length}`, txID);
    return {
        payload: buildSingleBatchReport(batchID, batchDocs.docs),
        bookmark: batchDocs.bookmark
    };
};

// eslint-disable-next-line
const getPreregUsersReport = async (txID, req, entity, limit, bookmark, startTimestamp, endTimestamp, batchID) => {
    const cloudant = CloudantHelper.getInstance(txID);
    const dbName = `${entity}-${constants.DB_NAMES.REGISTER}`;
    const query = {
        selector: {
            "type": "PreRegItem"
        },
        fields: [
            "name",
            "mobile",
            "email",
            "registerCode"
        ]
    };
    // add filter on createdTimestamp
    if(startTimestamp && endTimestamp) {
        query.selector.createdTimestamp = {
            "$gt" : Number(startTimestamp),
            "$lt" : Number(endTimestamp)
        }
    } else if (startTimestamp) {
        query.selector.createdTimestamp = {
            "$gt" : Number(startTimestamp)
        }
    } else if (endTimestamp) {
        query.selector.createdTimestamp = {
            "$lt" : Number(endTimestamp)
        }
    }

    if (batchID) {
        query.selector.batchID = batchID;
    }

    // optional, bookmark based limit
    if (!Number.isNaN(limit)) {
        const limitValue = parseInt(limit, 10);
        if (limitValue > 0)
            query.limit = limitValue;
    }
    if (bookmark)
        query.bookmark = bookmark;

    const batchDocs = await cloudant.queryDocuments(txID, query, dbName);
    logGdprBatchReport(req, txID, entity, batchDocs);
    logger.debug(`  query resultsize ${batchDocs.docs.length}`, txID);
    return {
        payload: batchDocs.docs,
        bookmark: batchDocs.bookmark
    };
};

const buildMultiBatchReport = (docs) => {
    const groupedDocs = {};
    docs.forEach((doc) => {
        if (doc.batchID in groupedDocs) {
            groupedDocs[doc.batchID].push(doc);
        } else {
            groupedDocs[doc.batchID] = [doc];
        }
    });

    const report = [];
    Object.entries(groupedDocs).forEach(([batchID, docs]) => {
        report.push(buildSingleBatchReport(batchID, docs));
    });

    return report;
};

const getAllBatchesReport = async (txID, req, entity, role, startDate, endDate, limit, bookmark) => {
    const cloudant = CloudantHelper.getInstance(txID);
    const dbName = `${entity}-${constants.DB_NAMES.BATCH}`;

    const batchReportDoctype = roleToDoctypeMap.get(role);

    // todo sort, if needed
    const selector = {
        type: batchReportDoctype,
    }
    if (startDate || endDate) {
        selector.submittedTimestamp = {
            "$gte": startDate,
            "$lt": endDate
        }
    }

    const query = {
        selector
    };
    // optional , bookmark based limit
    if (!Number.isNaN(limit)) {
        const limitValue = parseInt(limit, 10);
        if (limitValue > 0)
            query.limit = limitValue;
    }
    if (bookmark)
        query.bookmark = bookmark;

    logger.debug(`Attempting to query doctype ${batchReportDoctype}`, txID);
    const batchDocs = await cloudant.queryDocuments(txID, query, dbName);
    logger.debug(`  query resultsize ${batchDocs.docs.length}`, txID);
    logGdprBatchReport(req, txID, entity, batchDocs);
    return {
        payload: buildMultiBatchReport(batchDocs.docs),
        bookmark: batchDocs.bookmark
    };
};

module.exports = {
    validateCsvUpload,
    parseCredential,
    parseUserList,
    saveUploadResults,
    uploadBatchItemsForProcessing,
    queryBatchIDs,
    getSingleBatchReport,
    getAllBatchesReport,
    getPreregUsersReport
};
