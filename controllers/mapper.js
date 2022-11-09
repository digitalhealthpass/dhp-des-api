/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 */

const constants = require('../helpers/constants');
const { jsltTransform } = require('../utils');
const mapperHelper = require('../helpers/mapper-helper');
const { logAndSendErrorResponse, validateReqBody } = require('../utils/index');
const Logger = require('../config/logger');

const logger = new Logger('mapper-controller');

const addNewMapper = async (req, res, txID) => {
    logger.info('Entering POST /mapper controller', txID);
    
    // validate request schema *TODO* need to work on schema.
    let errMsg = validateReqBody(txID, req.body, constants.MAPPER_REGISTRATION_FIELDS.REQUIRED);
    if (errMsg) {
        logger.response(400, `Failed to add new mapper: ${errMsg}`, txID);
        return res.status(400).json({
            error: {
                message: errMsg,
            },
        });
    };
    if (constants.MAPPER_REGISTRATION_FIELDS.TYPE_REQUIRED.indexOf(req.body.type) <= -1){
        errMsg = "Type value doesn't be expected";
        logger.response(400, `Failed to add new mapper: ${errMsg}`, txID);
        return res.status(400).json({
            error: {
                message: errMsg,
            },
        });
    }
    logger.debug(`Attempting to add maper`, txID);
    try {
        const resBody = await mapperHelper.createNewMapper(txID, req);
        if (resBody.status !== 201) {
            logger.response(resBody.status, `Failed to add mapper: ${resBody.message}`, txID);
            return res.status(resBody.status).json({
                error: {
                    message: resBody.message
                }
            });
        }
        logger.response(201, 'Sucessfully add mapper', txID);
        return res.status(resBody.status).json({
            message: resBody.message,
        });
        
    } catch (err) {
        return logAndSendErrorResponse(txID, res, err, 'addNewMapper');
    }
};

exports.addMapper = async (req, res) => {
    const txID = req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID];
    await addNewMapper(req, res, txID);
};

const updateMapper = async (req, res, mapperName, txID) => {

    logger.info('Entering PUT /mapper controller', txID);
    // validate request schema *TODO* need to work on schema.
    const errMsg = validateReqBody(txID, req.body, ["mapper"]);
    if (errMsg) {
        logger.response(400, `Failed to update mapper: ${errMsg}`, txID);
        return res.status(400).json({
            error: {
                message: errMsg,
            },
        });
    };

    if (!mapperName) {
        const errMsg = `Must maperId in request body`;
        logger.response(400, `Failed to update mapper: ${errMsg}`, txID);
        return res.status(400).json({ 
            error: { 
                message: errMsg
            } 
        });
    }

    const mapperData = await mapperHelper.getMapperFullDataByName(txID, mapperName);
    
    try {
        logger.debug(`Attempting to update mapper ${mapperName}`, txID);
        const resBody = await mapperHelper.updateMapper(txID, mapperData, req.body);
        if (resBody.status !== 200) {
            logger.response(resBody.status, `Failed to update mapper: ${resBody.message}`, txID);
        } else {
            logger.response(200, `Successfully; updated mapper ${mapperName}`, txID);
        }
        return res.status(resBody.status).json({
            message: resBody.message
        });
    } catch (err) {
        return logAndSendErrorResponse(txID, res, err, 'updateMapper');
    }
};

exports.update = async (req, res) => {
    const txID = req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID];
    const mapperName = req.body.mapperName || req.params.mapperName;

    await updateMapper(req, res, mapperName, txID);
};

const getMappers = async (req, res, txID) => {
    logger.info('Entering GET /mappers controller', txID);
    try {
        const mappers = await mapperHelper.getAllMappers(txID);
        logger.response(200, `Successfully retrieved mappers`, txID);
        return res.status(200).json({
            payload: { mappers }
        });
    } catch (err) {
        return logAndSendErrorResponse(txID, res, err, 'getMappers');
    }
}

exports.get = async (req, res) => {
    const txID = req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID];
    await getMappers(req, res, txID);
}

const deleteMapper = async (res, mapperName, txID) => {
    logger.info('Entering DELETE /mapper controller', txID);
    
    try {
        // Get entity data
        logger.debug(`Checking if mapper ${mapperName} is exist`, txID);
        const mapperData = await mapperHelper.getMapperFullDataByName(txID, mapperName);
        if (!mapperData) {
            logger.warn(`Mapper ${mapperData} does not exist in database but proceeding with delete`, txID);
        }

        logger.debug(`Attempting to delete mapper ${mapperName}`, txID);
        const resBody = await mapperHelper.deleteMapper(txID, mapperName, mapperData);
        const payload = {
            message: resBody.message,
        };
        if (resBody.status !== 200) {
            payload.errors = resBody.payload;
            logger.response(resBody.status, `Failed to delete mapper ${mapperName}: ${resBody.message}`, txID);
        } else {
            logger.response(200, `Successfully delete mapper ${mapperName}`, txID);
        }
        return res.status(resBody.status).json(payload);
    } catch (err) {
        return logAndSendErrorResponse(txID, res, err, 'deleteMapper');
    }
};

exports.getMapper = async (req, res) => {
    const txID = req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID];
    const {mapperName} = req.params;
    logger.info('Entering Get specifical mapper controller', txID);
    try {
        // Get entity data
        logger.debug(`Checking if mapper ${mapperName} is exist`, txID);
        const mapperData = await mapperHelper.getMapperByName(txID, mapperName);
        if (!mapperData) {
            logger.warn(`Mapper ${mapperName} does not exist in database`, txID);
            const payload = {
                message: 'Mapper does not exist in database'
            };
            return res.status(404).json(payload);
        }
        return res.status(200).json(mapperData);
    } catch (err) {
        return logAndSendErrorResponse(txID, res, err, 'getMapper');
    }
}

exports.delete = async (req, res) => {
    const txID = req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID];
    const {mapperName} = req.params;

    await deleteMapper(res, mapperName, txID);
};

// Entry point for POST /data/transform
// NOTE: this is just a placeholder endpoint - will be fleshed out for the admin dashboard
exports.jsltTransform = async (req, res) => {
    const txID = req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID];

    logger.info('Entering POST /mapper/transform controller', txID);
    try {
        const { credential } = req.body;
        const { mapperName } = req.body;
        const transformation = await jsltTransform(txID, credential, mapperName);
        logger.response(200, 'Successfully transformed data', txID);
        return res.status(200).json({ payload: transformation });
    } catch (err) {
        return logAndSendErrorResponse(txID, res, err, 'jsltTransform');
    }
};
