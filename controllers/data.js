/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 */

const CloudantHelper = require('../helpers/cloudantHelper');
const constants = require('../helpers/constants');
const csvHelper = require('../helpers/csv-helper');
const dataHelper = require('../helpers/data-helper');
const entityHelper = require('../entities');
const { logAndSendErrorResponse, validateReqBody } = require('../utils/index');
const Logger = require('../config/logger');

const logger = new Logger('data-controller');

// Entry point for POST /data/upload as json input
// eslint-disable-next-line complexity
exports.uploadData = async (req, res) => {
    const token = req.headers.authorization;
    const txID = req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID];
    logger.info('Entering POST /data/upload controller', txID);

    // Make sure entity is defined in input
    if (!req.body || !req.body.organization || req.body.organization.length === 0) {
        const errMsg = 'Missing organization';
        logger.response(400, `Failed to upload data: ${errMsg}`, txID);
        return res.status(400).json({
            error: {
                message: errMsg,
            },
        });
    }
    const regEntity = req.body.organization;

    const errMsg = validateReqBody(txID, req.body, ['batch']);
    if (errMsg) {
        logger.response(400, `Failed to upload data: ${errMsg}`, txID);
        return res.status(400).json({
            error: {
                message: errMsg,
            },
        });
    };

    try {
        // Make sure entity has entry in organization DB
        const regEntityData = await entityHelper.getRegEntity(txID, regEntity);
        if (!regEntityData) {
            const errMsg = `Invalid organization ${regEntity}, no configuration found`;
            logger.response(400, `Failed to upload data: ${errMsg}`, txID);
            return res.status(400).json({
                error: {
                    message: errMsg,
                },
            });
        }
        const entityHelperName = regEntityData.entityType || regEntity;

        // Make sure entity has data helper ('{entity}-data-helper')
        const existEntityHelpers = await entityHelper.existRegEntityHelpers(txID, entityHelperName);
        if (!existEntityHelpers) {
            const errMsg = `Invalid organization ${regEntity}, no entity helpers found`;
            logger.response(400, `Failed to upload data: ${errMsg}`, txID);
            return res.status(400).json({
                error: {
                    message: errMsg,
                },
            });
        }

        let {credentialType} = req.params;
        if (credentialType) {
            const key = regEntityData.mappers.download[credentialType];
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

        // process both json upload api and csv upload, in same way        
        const batchToProcess = await csvHelper.uploadBatchItemsForProcessing(
            txID,
            req,
            regEntity,
            txID,
            credentialType,
            req.body.batch
        );

        // eslint-disable-next-line global-require, import/no-dynamic-require
        const entityDataHelper = require(`../entities/${entityHelperName}/data-helper`);

        logger.debug(`Attempting to upload data for organization ${regEntity}`, txID);
        const batchInfo = {
            batch: batchToProcess,
            fileName: req.body.fileName,
            batchID: txID,
        };
        
        entityDataHelper.uploadEntityData(txID, req, token, regEntityData, batchInfo, credentialType);
        
        logger.response(200, `Successfully received data for uploading for organization ${regEntity}`, txID);
        return res.status(200).json({
            message: `Data received for uploading: ${txID}`,
        });
    } catch (err) {
        return logAndSendErrorResponse(txID, res, err, 'uploadData');
    }
};

// Entry point for POST /data/upload/file
exports.uploadDataFile = async (req, res) => {
    const token = req.headers.authorization;
    const txID = req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID];
    logger.info('Entering POST /data/upload/file controller', txID);
    const regEntity = req.body.organization;
    const fileValidationErr = csvHelper.validateCsvUpload(txID, req);
    if (fileValidationErr) {
        logger.response(400, `Failed to upload data file: ${fileValidationErr}`, txID);
        return res.status(400).json({
            error: {
                message: fileValidationErr,
            },
        });
    }


    try {
        // Make sure entity has entry in organization DB
        const regEntityData = await entityHelper.getRegEntity(txID, regEntity);
        if (!regEntityData) {
            const errMsg = `Invalid organization ${regEntity}, no configuration found`;
            logger.response(400, `Failed to upload data file: ${errMsg}`, txID);
            return res.status(400).json({
                error: {
                    message: errMsg,
                },
            });
        }
        const entityHelperName = regEntityData.entityType || regEntity;

        // Make sure entity has data helper ('{entity}-data-helper')
        const existEntityHelpers = await entityHelper.existRegEntityHelpers(txID, entityHelperName);
        if (!existEntityHelpers) {
            const errMsg = `Invalid organization ${regEntity}, no entity helpers found`;
            logger.response(400, `Failed to upload data file: ${errMsg}`, txID);
            return res.status(400).json({
                error: {
                    message: errMsg,
                },
            });
        }

        // eslint-disable-next-line global-require, import/no-dynamic-require
        const entityDataHelper = require(`../entities/${entityHelperName}/data-helper`);

        logger.debug(`Attempting to parse uploaded CSV file for organization ${regEntity}`, txID);
        // upload csv data and begin processing
        return csvHelper.parseCredential(txID, req, res, token, regEntityData, entityDataHelper.uploadEntityData);
    } catch (err) {
        return logAndSendErrorResponse(txID, res, err, 'uploadDataFile');
    }
};

// eslint-disable-next-line complexity
const submitData = async (req, res, validateSelfAttestedSignature) => {
    const token = req.headers.authorization; // needed to call APIs to submit data

    const txID = req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID];
    logger.info('Entering POST /data/submit controller', txID);

    // Make sure entity is defined in input
    if (!req.body || !req.body.organization || req.body.organization.length === 0) {
        const errMsg = 'Missing organization';
        logger.response(400, `Failed to submit data: ${errMsg}`, txID);
        return res.status(400).json({
            error: {
                message: 'Missing organization',
            },
        });
    }
    const regEntity = req.body.organization.toLowerCase();

    try {
        // Make sure entity has entry in organization DB
        const regEntityData = await entityHelper.getRegEntity(txID, regEntity);
        if (!regEntityData) {
            const errMsg = `Invalid organization ${regEntity}, no configuration found`;
            logger.response(400, `Failed to submit data to organization ${regEntity}: ${errMsg}`, txID);
            return res.status(400).json({
                error: {
                    message: errMsg,
                },
            });
        }
        const entityHelperName = regEntityData.entityType || regEntity;
        // get required fields from data validator
        // eslint-disable-next-line global-require, import/no-dynamic-require
        const dataValidator = require(`../entities/${entityHelperName}/data-validator`);
        const errMsg = validateReqBody(txID, req.body, dataValidator.getSubmitRequiredFields());
        if (errMsg) {
            logger.response(400, `Failed to submit data to organization ${regEntity}: ${errMsg}`, txID);
            return res.status(400).json({
                error: {
                    message: errMsg,
                },
            });
        };
        
        // Make sure entity has helpers
        const existEntityHelpers = await entityHelper.existRegEntityHelpers(txID, entityHelperName);
        if (!existEntityHelpers) {
            const errMsg = `Invalid organization ${regEntity}, no entity helpers found`;
            logger.response(400, `Failed to submit data to organization ${regEntity}: ${errMsg}`, txID);
            return res.status(400).json({
                error: {
                    message: errMsg,
                },
            });
        }

        logger.debug(`Attempting to submit data to organization ${regEntity}`, txID);
        // eslint-disable-next-line global-require, import/no-dynamic-require
        const entityDataHelper = require(`../entities/${entityHelperName}/data-helper`);
        const resBody = await entityDataHelper.submitEntityData(
            txID, req, token, regEntityData, req.body, validateSelfAttestedSignature
        );
        if (resBody.status !== 200) {
            logger.response(
                resBody.status,
                `Failed submit data to organization ${regEntity}: ${resBody.message}`,
                txID
            );
        } else {
            logger.response(200, `Successfully submitted data to organization ${regEntity}`, txID);
        }
        return res.status(resBody.status).json({
            message: resBody.message,
            payload: resBody.data,
        });
    } catch (err) {
        return logAndSendErrorResponse(txID, res, err, 'submitData');
    }
};

exports.getBatchIDs = async (req, res) => {
    const txID = req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID];
    const { entity } = req.params;
    const { role } = req.query;
    const batchIDsLogMsg = `batchIDs for organization ${entity} and role ${role}`;

    const supportedRoles = [constants.APP_ID_ROLES.TEST_ADMIN, constants.APP_ID_ROLES.REGISTRATION_ADMIN];
    if (!supportedRoles.includes(role)) {
        const errMsg = `Unsupported role '${role}'. Must be one of ${supportedRoles.join(', ')}`;
        logger.response(400, `Failed to query ${batchIDsLogMsg}: ${errMsg}`, txID);
        return res.status(400).json({ error: { message: errMsg } });
    }

    try {
        logger.debug(`Attempting to query ${batchIDsLogMsg}`, txID);
        const batches = await csvHelper.queryBatchIDs(txID, entity, role);

        logger.response(200, `Successfully queried ${batchIDsLogMsg}, resultsize ${batches.length}`, txID);
        return res.status(200).json({ payload: { role, batches } });
    } catch (err) {
        return logAndSendErrorResponse(txID, res, err, 'getBatchIDs');
    }
};

// Entry point for depreciated POST /data/
exports.submitDataDeprecated = async (req, res) => {
    submitData(req, res, false);
}

// Entry point for POST /data/submit
exports.submitData = async (req, res) => {
    submitData(req, res, true);
}

// get processing-status report on all batches related to an org
exports.getAllBatchReport = async (req, res) => {
    const txID = req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID];
    const { entity } = req.params;
    const { role, startDate, endDate, limit, bookmark } = req.query;

    const batchReportsLogMsg = `batch reports for organization ${entity} and role ${role}`;

    const supportedRoles = [constants.APP_ID_ROLES.TEST_ADMIN, constants.APP_ID_ROLES.REGISTRATION_ADMIN];
    if (!role || !supportedRoles.includes(role)) {
        const errMsg = `Role must be one of ${supportedRoles.join(', ')}`;
        logger.response(400, `Failed to get ${batchReportsLogMsg}: ${errMsg}`, txID);
        return res.status(400).json({ error: { message: errMsg } });
    }

    try {
        logger.debug(`Attempting to get ${batchReportsLogMsg}`, txID);
        const batchRes = await csvHelper.getAllBatchesReport(
            txID, req, entity, role, startDate, endDate, limit, bookmark
        );
        logger.response(200, `Successfully retrieved ${batchReportsLogMsg}`, txID);
        return res.status(200).json({
            payload: batchRes.payload,
            bookmark: batchRes.bookmark
        });
    } catch (err) {
        return logAndSendErrorResponse(txID, res, err, 'getAllBatchReport');
    }
};

// get processing-status report on a batch
exports.getBatchReport = async (req, res) => {
    const txID = req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID];
    const { entity, batchID } = req.params;
    const { role, limit, bookmark } = req.query;
    const batchReportLogMsg = `batch report for organization ${entity} and batchID ${batchID}`;

    const supportedRoles = [constants.APP_ID_ROLES.TEST_ADMIN, constants.APP_ID_ROLES.REGISTRATION_ADMIN];
    if (!role || !supportedRoles.includes(role)) {
        const errMsg = `Role must be one of ${supportedRoles.join(', ')}`;
        logger.response(400, `Failed to get batch report for organization ${entity}: ${errMsg}`, txID);
        return res.status(400).json({ error: { message: errMsg } });
    }

    try {
        logger.debug(`Attempting to get ${batchReportLogMsg}`, txID);
        const batchRes = await csvHelper.getSingleBatchReport(txID, req, entity, role, batchID, limit, bookmark);
        logger.response(200, `Successfully retrieved ${batchReportLogMsg}`, txID);
        return res.status(200).json({
            payload: batchRes.payload,
            bookmark: batchRes.bookmark
        });
    } catch (err) {
        return logAndSendErrorResponse(txID, res, err, 'getBatchReport');
    }
};

// Entry point for GET /data/{entity}/report
exports.getReport = async (req, res) => {
    const txID = req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID];
    logger.info('Entering GET /data/report controller', txID);

    const { entity } = req.params;
    const { start, end, offset } = req.query;

    const shift = offset || 0;
    const errorMessage = dataHelper.validateReportDates(start, end, shift);
    if (errorMessage) {
        return res.status(400).json({
            error: {
                message: errorMessage,
            },
        });
    }

    const query = dataHelper.buildReportCloudantQuery(start, end, shift);
    logger.debug(`Cloudant query input: ${JSON.stringify(query)}`, txID);
    const statsDB = `${entity}-${constants.DB_NAMES.STATS}`;

    try {
        const cloudantHelper = CloudantHelper.getInstance(txID);
        const { docs } = await cloudantHelper.queryDocuments(txID, query, statsDB);
        logger.response(200, 'Successfully retrieved report', txID);
        return res.status(200).json({ payload: dataHelper.buildReport(docs, shift) });
    } catch (err) {
        return logAndSendErrorResponse(txID, res, err, 'getReport');
    }
};

// List users
exports.getPreregUsers = async (req, res) => {
    const txID = req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID];
    const { entity } = req.params;
    const { limit, bookmark, startTimestamp, endTimestamp, batchID } = req.query;
    const batchReportLogMsg = `Prereg users report for organization ${entity}`;

    try {
        logger.debug(`Attempting to get ${batchReportLogMsg}`, txID);
        const batchRes = await csvHelper.getPreregUsersReport(txID, req, entity, 
            limit, bookmark, startTimestamp, endTimestamp, batchID);
        logger.response(200, `Successfully retrieved ${batchReportLogMsg}`, txID);
        return res.status(200).json({
            payload: batchRes.payload,
            bookmark: batchRes.bookmark
        });
    } catch (err) {
        return logAndSendErrorResponse(txID, res, err, 'getPreregUsers');
    }
};