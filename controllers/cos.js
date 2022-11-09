/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
* 
*/
const zlib = require('zlib');
const { getGdprLogger, CRUD_OPERATION } = require('dhp-logging-lib/gdpr');
const dataHelper = require('../helpers/data-helper');
const constants = require('../helpers/constants');
const CosHelper = require('../helpers/cos-helper');
const profileHelper = require('../helpers/profile-helper');
const entityHelper = require('../entities');
const { logAndSendErrorResponse } = require('../utils/index');
const Logger = require('../config/logger');

const logger = new Logger('cos-controller');
const gdprLogger = getGdprLogger();

const publicKeyTypes = [
    constants.PUBLIC_KEY_TYPE.IOS,
    constants.PUBLIC_KEY_TYPE.ANDROID,
];

const cosReturnFormats = [
    'json',
    'zip'
]

// Entry point for GET /cos/:entity
exports.getCOSFileNames = async (req, res) => {
    const txID = req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID];
    logger.info('Entering GET /cos/:entity controller', txID);

    // Make sure entity is defined in input
    if (!req.params.entity) {
        return res.status(400).json({
            error: {
                message: 'Missing organization',
            },
        });
    }
    const regEntity = req.params.entity;
    const {maxKeys} = req.query;

    try {
        // Make sure entity has entry in organization DB
        const regEntityData = await entityHelper.getRegEntity(txID, regEntity);
        if (!regEntityData) {
            return res.status(400).json({
                error: {
                    message: `Invalid organization: ${regEntity}`,
                },
            });
        }

        const cosHelper = CosHelper.getInstance(txID);
        const fileList = await cosHelper.getAllFiles(txID, regEntity, maxKeys);
        
        const successMsg = `Successfully retrieved COS file names for organization ${regEntity}`;
        logger.response(200, successMsg, txID);
        return res.status(200).json({
            message: successMsg,
            payload: fileList,
        });

    } catch (err) {
        return logAndSendErrorResponse(txID, res, err, 'getCOSFileNames');
    }
}

// Entry point for GET /cos/:entity/:filename
exports.getCOSFile = async (req, res) => {
    const txID = req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID];
    logger.info('Entering GET /cos/:entity/:filename controller', txID);

    // Make sure entity is defined in input
    if (!req.params.entity) {
        return res.status(400).json({
            error: {
                message: 'Missing organization',
            },
        });
    }

    // Make sure entity is defined in input
    if (!req.params.filename) {
        return res.status(400).json({
            error: {
                message: 'Missing filename',
            },
        });
    }

    const regEntity = req.params.entity;
    const { filename } = req.params;

    try {
        // Make sure entity has entry in organization DB
        const regEntityData = await entityHelper.getRegEntity(txID, regEntity);
        if (!regEntityData) {
            return res.status(400).json({
                error: {
                    message: `Invalid organization: ${regEntity}`,
                },
            });
        }

        const cosHelper = CosHelper.getInstance(txID);
        const fileContent = await cosHelper.getFile(txID, regEntity, filename);

        gdprLogger.logCOS(req, filename, CRUD_OPERATION.READ, regEntity);
        
        logger.response(200, `Successfully retrieved COS file ${filename} for organization ${regEntity}`, txID);
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
        return res.status(200).send(fileContent);
    } catch (err) {
        const errMsg = `Error retrieving COS file ${filename} for organization ${regEntity} - ${err.message}`;
        logger.error(errMsg, txID);
        return res.status(400).json({ 
            error: {
                message: errMsg
            }
        });
    }
}

const validateGetCOSFilesByHolderId = (req) => {
    // Make sure entity is defined in input
    if (!req.params.entity) {
        return {
            status: 400,
            message: 'Missing entity'
        };
    }

    // Make sure holderId is defined in input
    if (!req.params.holderId) {
        return {
            status: 400,
            message: 'Missing holderId'
        };
    }

    if (!req.query.signatureValue) {
        return {
            status: 400,
            message: 'Missing signatureValue'
        };
    }

    if (!publicKeyTypes.includes(req.query.publicKeyType)) {
        return {
            status: 400,
            message: 'Missing publicKeyType'
        };
    }

    if (!req.query.format) {
        // default
        req.query.format = 'zip';
    } else if (!cosReturnFormats.includes(req.query.format)) {
        return {
            status: 400,
            message: `format must be one of the following: ${cosReturnFormats}`
        };
    }

    return {
        status: 200
    };
}

const returnCosItemsInProperFormat = (
    req, res, txID, format, cosFiles, regEntity, holderId
) => {
    if (format === 'json') {
        const message = `Successfully retrieved files for organization ${regEntity} by holder ${holderId}`;
        return res.status(200).json({ 
            message,
            payload: cosFiles
        });
    }
    const message = `Successfully retrieved file ${txID}.zip for organization ${regEntity} by holder ${holderId}`;
    logger.response(200, message, txID);
    gdprLogger.log(req, holderId, CRUD_OPERATION.READ);

    res.setHeader('Content-type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename=${txID}.zip`);
    
    const gzip = zlib.createGzip();
    gzip.pipe(res);

    gzip.write(JSON.stringify(cosFiles));
    gzip.end();

    return res.status(200);
}

// Entry point for GET /cos/:entity/owner/:holderId
exports.getCOSFilesByHolderId = async (req, res) => {
    const txID = req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID];
    logger.info('Entering GET /cos/:entity/owner/:holderId controller', txID);

    const validationResponse = validateGetCOSFilesByHolderId(req);
    if (validationResponse.status !== 200) {
        return res.status(validationResponse.status).json({
            error: {
                message: validationResponse.message,
            },
        });
    }

    const regEntity = req.params.entity;
    const { holderId } = req.params;
    const dateRange = {
        startDate: req.query.startDate,
        endDate: req.query.endDate
    };
    const { publicKeyType, signatureValue } = req.query;

    try {
        const doc = await profileHelper.getProfileDoc(txID, req, regEntity, holderId);
        if (doc.status !== 200) {
            const errMsg = `Invalid holder ID ${holderId}: ${doc.message}`;
            logger.response(doc.status, `Failed to getting public key: ${errMsg}`, txID);
            return res.status(doc.status).json({
                error: {
                    message: errMsg,
                },
            });
        }

        const credential = {
            cosAccess: {
                proof: {
                    creator: doc.data._id,
                    signatureValue,
                }
            }
        };

        const entityData = await entityHelper.getRegEntity(txID, regEntity);
        if (!entityData) {
            const errMsg = `Invalid organization ${regEntity}, no configuration found`;
            logger.response(400, `Failed to get COS files: ${errMsg}`, txID);
            return res.status(400).json({
                error: {
                    message: errMsg,
                },
            });
        }

        const verifyResult = await dataHelper.verifySelfAttestedCredential(
            holderId, publicKeyType, credential, entityData
        );
        
        if (verifyResult.error) {
            logger.error(verifyResult.error, txID);
            return res.status(500).json({
                error: {
                    message: verifyResult.message,
                },
            });
        }

        if (verifyResult.success === false) {
            const errMsg = `Invalid signature: ${verifyResult.message}`;
            logger.response(401, `${errMsg}`, txID);
            return res.status(401).json({
                error: {
                    message: errMsg,
                },
            });
        }

        const cosHelper = CosHelper.getInstance(txID);
        const result = await cosHelper.getAllFilesForHolder(txID, regEntity, holderId, dateRange);
        if (result.status !== 200) {
            return res.status(result.status).json({
                error: {
                    message: result.message,
                },
            });
        }

        return returnCosItemsInProperFormat(
            req, res, txID, req.query.format, result.filesContents, regEntity, holderId
        );

    } catch (err) {
        // eslint-disable-next-line max-len
        const errMsg = `Error retrieving COS files for organization ${regEntity} by holder ${holderId} - ${err.message}`;
        logger.error(errMsg, txID);
        return res.status(400).json({ 
            error: {
                message: errMsg,
            }
        });
    }

}

// Entry point for DELETE /cos/:entity/:filename
exports.deleteCOSFile = async (req, res) => {
    const txID = req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID];
    logger.info('Entering DELETE /cos/:entity/:filename controller', txID);

    // Make sure entity is defined in input
    if (!req.params.entity) {
        return res.status(400).json({
            error: {
                message: 'Missing organization',
            },
        });
    }

    // Make sure entity is defined in input
    if (!req.params.filename) {
        return res.status(400).json({
            error: {
                message: 'Missing filename',
            },
        });
    }

    const regEntity = req.params.entity;
    const { filename } = req.params;

    try {
        // Make sure entity has entry in organization DB
        const regEntityData = await entityHelper.getRegEntity(txID, regEntity);
        if (!regEntityData) {
            return res.status(400).json({
                error: {
                    message: `Invalid organization: ${regEntity}`,
                },
            });
        }

        const cosHelper = CosHelper.getInstance(txID);

        try {
            await cosHelper.deleteFile(txID, regEntity, filename);
            gdprLogger.logCOS(req, filename, CRUD_OPERATION.DELETE, regEntity);
        } catch (error) {
            logger.error(error.message, txID);
            return res.status(error.statusCode).send({
                message: error.message,
            });
        }
        
        const successMsg = `Successfully deleted COS file ${filename} for organization ${regEntity}`;
        logger.response(200, successMsg, txID);

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
        return res.status(200).send({
            message: successMsg,
        });
    } catch (err) {
        const errMsg = `Error deleting COS file ${filename} - ${err.message}`;
        logger.error(errMsg, txID);
        return res.status(400).json({ 
            error: {
                message: errMsg
            }
        });
    }
}