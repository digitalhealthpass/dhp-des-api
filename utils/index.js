/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 *
 */

const crypto = require('crypto');
const jslt = require('jslt');
const fs = require('fs');
const moment = require('moment');
const path = require('path');
const phone = require('phone');
const uuid = require('uuid');

const { CRED_TYPE } = require('dhp-verify-nodejs-lib');
const CloudantHelper = require('../helpers/cloudantHelper');
const config = require('../config');
const constants = require('../helpers/constants');
const CosHelper = require('../helpers/cos-helper');
const Logger = require('../config/logger');
const cloudIamHelper = require('../helpers/cloud-iam-helper');
const mapperHelper = require("../helpers/mapper-helper");
const cacheHelper = require("../helpers/cache-helper");

const logger = new Logger('index');
// eslint-disable-next-line max-len
const emailRegex = /[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?/;

exports.setGlobalVariables = async (txID) => {
    const credentialDic = await mapperHelper.getMapperByName(txID, constants.CREDENTIAL_DICTIONARY);
    await cacheHelper.set(constants.CREDENTIAL_DICTIONARY, credentialDic);
}

// eslint-disable-next-line complexity
exports.setupScopesRoles = async (txID) => {
    try {
        const prefix = constants.APP_ID_ROLES.DES_PREFIX;
        const cloudIamToken = await cloudIamHelper.getCloudIAMToken(txID);
        // eslint-disable-next-line global-require
        const appIdHelper = require('../helpers/app-id-helper');
        // check if 3 admins roles exist.
        const roles = await appIdHelper.getRoles(txID, cloudIamToken.access_token);
        let regAdminRoleExist = false;
        let testAdminRoleExist = false;
        let dataAdminRoleExist = false;
        let fileAdminRoleExist = false;
        let applicationRoleExist = false;
        if (roles.data.roles) {
            roles.data.roles.forEach((role) => {
                if(role.name === `${prefix}-${constants.APP_ID_ROLES.REGISTRATION_ADMIN}`) {
                    regAdminRoleExist = true;
                } else if(role.name === `${prefix}-${constants.APP_ID_ROLES.TEST_ADMIN}`) {
                    testAdminRoleExist = true;
                } else if(role.name === `${prefix}-${constants.APP_ID_ROLES.DATA_ADMIN}`) {
                    dataAdminRoleExist = true;
                } else if(role.name === `${prefix}-${constants.APP_ID_ROLES.FILE_ADMIN}`) {
                    fileAdminRoleExist = true;
                } else if(role.name === `${prefix}-${constants.APP_ID_ROLES.APPLICATION}`) {
                    applicationRoleExist = true;
                } 
            });
        }

        if (!(regAdminRoleExist && testAdminRoleExist && dataAdminRoleExist && fileAdminRoleExist 
                && applicationRoleExist)) {
            // add org-specific scopes
            logger.info("Setup scopes and roles", txID);
            
            const regAdminScope = `${prefix}.${constants.APP_ID_ROLES.REGISTRATION_ADMIN}`;
            const testAdminScope = `${prefix}.${constants.APP_ID_ROLES.TEST_ADMIN}`;
            const dataAdminScope = `${prefix}.${constants.APP_ID_ROLES.DATA_ADMIN}`;
            const fileAdminScope = `${prefix}.${constants.APP_ID_ROLES.FILE_ADMIN}`;
            const applicationScope = `${prefix}.${constants.APP_ID_ROLES.APPLICATION}`;

            await appIdHelper.addScopes(txID, cloudIamToken.access_token, 
                [regAdminScope, testAdminScope, dataAdminScope, fileAdminScope, applicationScope]);

            // add org-specific roles
            logger.info("Attempting to create AppID roles", txID);
            if (!regAdminRoleExist) {
                await appIdHelper.addRole(
                    txID,
                    cloudIamToken.access_token,
                    `${prefix}-${constants.APP_ID_ROLES.REGISTRATION_ADMIN}`,
                    'submits user registration files',
                    [regAdminScope]
                );
            }
            
            if (!testAdminRoleExist) {
                await appIdHelper.addRole(
                    txID,
                    cloudIamToken.access_token,
                    `${prefix}-${constants.APP_ID_ROLES.TEST_ADMIN}`,
                    'submits test result files',
                    [testAdminScope]
                );
            }
            
            if (!dataAdminRoleExist) {
                await appIdHelper.addRole(
                    txID,
                    cloudIamToken.access_token,
                    `${prefix}-${constants.APP_ID_ROLES.DATA_ADMIN}`,
                    'submits data result',
                    [dataAdminScope]
                );
            }

            if (!fileAdminRoleExist) {
                await appIdHelper.addRole(
                    txID,
                    cloudIamToken.access_token,
                    `${prefix}-${constants.APP_ID_ROLES.FILE_ADMIN}`,
                    'submits result files',
                    [fileAdminScope]
                );
            }

            if (!applicationRoleExist) {
                await appIdHelper.addRole(
                    txID,
                    cloudIamToken.access_token,
                    `${prefix}-${constants.APP_ID_ROLES.APPLICATION}`,
                    'application level access',
                    [applicationScope]
                );
            }
        }
    } catch (error) {
        const errMsg = `Failed to setup scopes and roles: ${error.message}`;
        logger.error(errMsg, txID);
        throw new Error(`${errMsg} :: ${error}`);
    }
};

// setupCloudant verifies ORG DB.
exports.setupCloudant = async (txID) => {
    const cloudantHelper = CloudantHelper.getInstance(txID);

    try {
        await cloudantHelper.setupCloudantDB(txID);
    } catch (error) {
        const errMsg = `Failed to initialize Cloudant database: ${error.message}`;
        logger.error(errMsg, txID);
        throw new Error(`${errMsg} :: ${error}`);
    }
};

// setup COS instance
exports.setupCOS = async (txID) => {
    const cosHelper = CosHelper.getInstance(txID);

    try {
        await cosHelper.setup(txID);
    } catch (error) {
        const errMsg = `Failed to initialize COS: ${error.message}`;
        logger.warn(errMsg, txID);
        throw new Error(`${errMsg} :: ${error}`);
    }
};

const getMapperId = (credential, credentialType) => {
    switch(credentialType) {
        case CRED_TYPE.SHC:
            return 'shcmapper';
        case CRED_TYPE.DCC:
            return 'dccmapper';
        default:
            return credential.credentialSchema.id;
    }
}

exports.getMapperName = (credential, credentialType, entityData) => {
    // use schemaid to get the mapper name, if cannot find return null or empty
    let mapperName = null;
    if (entityData.mappers) {
        const mapperID = getMapperId(credential, credentialType);
        if (entityData.mappers.upload) {
            mapperName = entityData.mappers.upload[mapperID];
        } else {
            mapperName = entityData.mappers[mapperID];
        }
    }
    return mapperName;
};
// transform a credential into a fhir-like object
exports.jsltTransform = async (txID, credential, mapperName) => {
    // default: pull out credential payload without w3c wrapper
    const cloudantHelper = CloudantHelper.getInstance(txID);
    const dbName = constants.DB_NAMES.MAPPER;
    let slt = null;
    const schemaId = credential.credentialSchema.id;
    try {
        const query = {
            selector: {
                _id: {
                    $gt: null
                },
                mapperName: {
                    $eq: mapperName
                }
            }
        };
        const readDoc = await cloudantHelper.queryDocuments(txID, query, dbName);
        if (readDoc.docs.length === 0) {
            return {};
        } if (readDoc.docs.length === 1) {
            slt = readDoc.docs[0].mapper;
        } else {
            const errMsg = `Find multiple mappers for schemaId : ${schemaId}`;
            logger.warn(errMsg, txID);
            throw new Error(`${errMsg}`);
        }
        return jslt.transform(credential, slt);
    } catch (error) {
        const errMsg = `Failed to do jsltTransform: ${error.message}`;
        logger.warn(errMsg, txID);
        throw new Error(`${errMsg} :: ${error}`);
    }
};

// Decrypt data with specified symmetric key, iv and algorithm
exports.decrypt = (encryptedData, symmetricKey, ivValue, algorithm, txID) => {
    try {
        const decipher = crypto.createDecipheriv(algorithm, symmetricKey, ivValue);
        let decryptedData = decipher.update(encryptedData);
        decryptedData = Buffer.concat([decryptedData, decipher.final()]);
        return decryptedData.toString();
    } catch (err) {
        logger.error(`Exception decrypting data: ${err}`, txID);
        const error = { response: { status: 500, data: 'Error decrypting data' } };
        throw error;
    }
};

exports.encrypt = (data, symmetricKey, ivValue, algorithm, txID) => {
    try {
        const cipher = crypto.createCipheriv(algorithm, symmetricKey, ivValue);
        let encryptedData = cipher.update(data);
        encryptedData = Buffer.concat([encryptedData, cipher.final()]);
        return encryptedData.toString('base64');
    } catch (err) {
        logger.error(`Exception encrypting data: ${err}`, txID);
        const error = { response: { status: 500, data: 'Error encrypting data' } };
        throw error;
    }
};

// eslint-disable-next-line complexity
exports.getErrorInfo = (txID, error) => {
    let errorStatus;
    let errorMsg = '';

    if (error.code && error.code === constants.ERROR_CODES.TIMEOUT) {
        errorStatus = 500;
        errorMsg = `Connection timed out: ${error.message}`;
    } else if (error.response) {
        // server received request and responded with error (4xx, 5xx)
        errorStatus = error.response.status;
        const errorResponse = error.response.data;

        // some components wrap their errors differently
        if (typeof errorResponse === 'object') {
            if (errorResponse.error && errorResponse.error.message) {
                errorMsg = errorResponse.error.message;
            } else {
                errorMsg = errorResponse.message || errorResponse.detail || `${error}`;
            }
        } else if (typeof errorResponse === 'string') {
            errorMsg = errorResponse;
        }
    } else if (error.request && error.request.res) {
        // server never received request
        errorStatus = error.request.res.statusCode;
        errorMsg = error.request.res.statusMessage;
    } else if (error.statusCode && error.message) {
        errorStatus = error.statusCode;
        errorMsg = error.message;
    } else {
        logger.error(error, txID);
        errorStatus = 500;
        errorMsg = `${error}` || 'Server processing error';
    }

    return { errorStatus, errorMsg };
};

exports.logAndSendErrorResponse = (txID, res, error, functionText) => {
    const { errorStatus, errorMsg } = this.getErrorInfo(txID, error);
    const message = `Failed to ${functionText} :: ${errorMsg}`;

    logger.response(errorStatus, message, txID);
    return res.status(errorStatus).json({
        error: {
            message,
        },
    });
};

exports.validateReqBody = (txID, reqBody, requiredFields) => {
    let errMsg = '';
    for (let i = 0; i < requiredFields.length; i += 1) {
        const field = requiredFields[i];
        const fieldValue = reqBody[field];

        if (!fieldValue) {
            errMsg = `Missing required variable in request body: ${field}`;
            logger.error(`Invalid request body: ${errMsg}`, txID);
            break;
        } else if (typeof fieldValue === 'string' && !fieldValue.trim()) {
            errMsg = `Request body field cannot be empty: ${field}`;
            logger.error(`Invalid request body: ${errMsg}`, txID);
            break;
        }
    }
    return errMsg;
};

exports.getVerificationCodeExpiration = () => {
    const { validMinutes } = config.verificationCode;

    let minutesToExpiry = Number(validMinutes);
    if (Number.isNaN(minutesToExpiry) || minutesToExpiry < 0) {
        minutesToExpiry = 10;
    }

    const momentCurrent = moment();
    const momentExpiration = momentCurrent.add(minutesToExpiry, 'minutes');

    const verificationCodeExpirationTimestamp = momentExpiration.unix();
    return verificationCodeExpirationTimestamp;
};

exports.getRegCodeExpiration = (query) => {
    if (query.expiresAt && query.expiresIn) {
        return { status: 400, message: 'Cannot specify both "expiresAt" and "expiresIn" in query' };
    }

    const currentDate = new Date();
    const currentTimestamp = Math.round(currentDate.getTime() / 1000);

    let expiration;
    if (query.expiresAt) {
        const expiresAt = Number(query.expiresAt);

        // TODO: this is a really bad way to validate numbers
        if (Number.isNaN(expiresAt)) {
            return { status: 400, message: 'Non-numeric "expiresAt" value' };
        }

        if (expiresAt < currentTimestamp) {
            return { status: 400, message: 'Cannot specify a past value for "expiresAt"' };
        }

        expiration = expiresAt;
    } else if (query.expiresIn) {
        const expiresIn = Number(query.expiresIn);

        // TODO: same here
        if (Number.isNaN(expiresIn)) {
            return { status: 400, message: 'Non-numeric expiresIn value' };
        }

        expiration = expiresIn + currentTimestamp;
    } else {
        // TODO: fix this - is this converting an int to a string then back to an int...
        const validDays = `${config.registrationCode.validDays}`;

        // TODO: should be using moment to handle dates
        const expirationDate = new Date();
        expirationDate.setDate(currentDate.getDate() + Number(validDays));
        expiration = Math.round(expirationDate.getTime() / 1000);
    }

    return { status: 200, expiration };
};

exports.generateRegCodes = (howmany) => {
    const regCodes = [];
    for (let i = 0; i < howmany; i += 1) {
        regCodes.push(uuid.v4());
    }

    return regCodes;
};

// generate a unique uid by hashing together an array of strings
exports.hashStrings = (strArray) => {
    const str = strArray.join('-');
    return crypto
        .createHash('md5')
        .update(str)
        .digest('hex');
};

// assume it's a supported entity if we have supporting files for that entity
exports.isSupportedEntity = (entity) => {
    const entityFolders = fs.readdirSync(path.join(__dirname, 'entities'));
    return entityFolders.includes(entity);
};

exports.calculateCredentialExpirationDate = (secondsUntilExpiration) => {
    const now = moment();
    return now
        .add(secondsUntilExpiration, 'seconds')
        .utc()
        .format('YYYY-MM-DD[T]HH:mm:ss[Z]');
};

// return unique credential ID without issuer DID prefix
exports.getCredentialIDFromDID = (did) => {
    return did.split('#')[1] || '';
};

// eslint-disable-next-line complexity
exports.validateRow = (row, headers) => {
    let errMsg = '';
    const maxFieldValueLength = 100;

    const keys = Object.keys(row);

    // check if empty row
    const isEmpty = keys.every((key) => !row[key] || row[key].length === 0);
    if (isEmpty) return 'empty';

    if (keys.length < headers.length) {
        const missing = headers[keys.length];
        return `Missing '${missing}' value`;
    }

    for (let i = 0; i < keys.length; i += 1) {
        const key = keys[i];
        if (row[key].length > maxFieldValueLength) {
            errMsg = `Length of '${key}' value exceeds max of ${maxFieldValueLength}`;
            break;
        }
        if (key === constants.NOTIFICATION_TYPE.PHONE && row[key]) {
            // validate mobile phone number
            const e164Format = phone(row[key]);
            if (e164Format.length === 0) {
                errMsg = `Invalid '${key}' value`;
                break;
            }
        }
        if (key === constants.NOTIFICATION_TYPE.EMAIL
                && !emailRegex.test(row[key])) {
            errMsg = `Invalid '${key}' value`;
            break;
        }
    }
    return errMsg;
};

exports.validateRows = (txID, rows, headers, maxErrThreshold) => {
    const validatedRows = [];
    const invalidRows = [];
    let errCount = 0;

    for (let i = 0; i < rows.length; i += 1) {
        const currentRow = rows[i];

        const errMsg = this.validateRow(currentRow, headers);
        currentRow.rowID = i;
        if (errMsg) {
            currentRow.invalidMessage = errMsg;

            // empty row is not invalid, skip
            if (errMsg !== 'empty') {
                errCount += 1;
                invalidRows.push(currentRow);
            }
        } else {
            validatedRows.push(currentRow);
        }

        if (errCount >= maxErrThreshold) {
            const abortMsg = `Batch validation abandoned after ${errCount} invalid rows`;
            logger.error(`${txID} : ${abortMsg}`, txID);
            return {
                status: 400,
                message: abortMsg,
                data: {
                    invalidRows,
                },
            };
        }
    }

    if (errCount > 0) {
        const errMsg = `Found ${errCount} invalid rows`;
        logger.error(`${txID} : ${errMsg}`, txID);
        return {
            status: 400,
            message: errMsg,
            data: {
                invalidRows,
            },
        };
    }
    return {
        status: 200,
        data: {
            validatedRows,
            invalidRows,
        },
    };
};

exports.getSendSmsHeaderFlag = (req) => {
    let smsFlag;
    const smsHeader = req.headers[constants.REQUEST_HEADERS.SEND_SMS_OVERRIDE];
    if (smsHeader && smsHeader.toUpperCase() === 'TRUE') {
        smsFlag = 'true';
    }
    else if (smsHeader) {
        smsFlag = 'false';
    }
    return smsFlag;
};

exports.getSendMailHeaderFlag = (req) => {
    let mailFlag;
    const mailHeader = req.headers[constants.REQUEST_HEADERS.SEND_EMAIL_OVERRIDE];
    if (mailHeader && mailHeader.toUpperCase() === 'TRUE') {
        mailFlag = 'true';
    } else if (mailHeader) {
        mailFlag = 'false';
    }
    return mailFlag;
};

exports.getFailedRows = (txID, docs) => {
    const failedRows = [];

    docs.filter((item) => item.errorMessage).forEach((doc) => {
        const item = doc;
        item.failureReasons = [item.errorMessage];

        delete item._id;
        delete item._rev;
        delete item.batchID;
        delete item.errorMessage;
        delete item.type;
        delete item.rowID;

        failedRows.push(item);
    });

    logger.debug(`failedRows ${failedRows.length}`, txID);
    return failedRows;
};

exports.getFailedPreRegRows = (txID, rows, docs) => {
    const failedRows = [];

    docs.filter((item) => item.errorMessage).forEach((doc, i) => {
        const item = rows[i];
        item.failureReasons = [doc.errorMessage];

        delete item._id;
        delete item._rev;
        delete item.batchID;
        delete item.type;
        delete item.rowID;

        delete item.status;
        delete item.createdTimestamp;
        delete item.updatedTimestamp;
        delete item.expirationTimestamp;
        delete item.invalidMessage;
        delete item.uid;
        failedRows.push(item);
    });

    logger.debug(`failedRows ${failedRows.length}`, txID);
    return failedRows;
};
