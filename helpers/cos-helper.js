/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 */

const COS = require('ibm-cos-sdk');
const constants = require('./constants');
const CloudantHelper = require('./cloudantHelper');

const Logger = require('../config/logger');

const logger = new Logger('cos-helper');
const config = require("../config/app/config.json");

let helperInstance;

const cosApiKey = process.env.COS_API_KEY;
const cosBucketSuffix = process.env.COS_BUCKET_SUFFIX;
const cosServiceInstance = process.env.COS_SERVICE_INSTANCE_ID;

function prepareBucketName(orgName) {
    return `${orgName}-${cosBucketSuffix}`;
}

const validateCOSConfig = () => {
    const missingVars = [];
    if (!cosServiceInstance) {
        missingVars.push('COS_SERVICE_INSTANCE_ID');
    }
    if (!cosApiKey) {
        missingVars.push('COS_API_KEY');
    }
    if (!cosBucketSuffix) {
        missingVars.push('COS_BUCKET_SUFFIX');
    }
    return missingVars;
};

const getCOSNotInitMsg = () => {
    const notInitMsg = 'COS was not initialized during startup, please check configuration';

    const missingVars = validateCOSConfig();
    const missingConfig = missingVars.length > 0;
    const missingConfigMsg = `COS credentials are missing: ${missingVars}`;

    return missingConfig ? `${notInitMsg}: ${missingConfigMsg}` : notInitMsg;
};

const initCos = async (txID) => {
    const missingVars = validateCOSConfig();
    if (missingVars.length > 0) {
        const errMsg = `COS credentials are missing: ${missingVars}`;
        logger.error(errMsg, txID);
        throw new Error(errMsg);
    }

    const cosConfig = {
        ibmAuthEndpoint: config.cos.authEndpoint,
        endpoint: config.cos.endpoint,
        apiKeyId: process.env.COS_API_KEY,
        serviceInstanceId: process.env.COS_SERVICE_INSTANCE_ID,
        httpOptions: {
            connectTimeout: config.cos.connectTimeout,
            timeout: config.cos.timeout
        },
        maxRetries: config.cos.maxRetries
    };
    return new COS.S3(cosConfig);
};

const getDateRangeOrDefault = (dateRange) => {
    const DEFAULT_DATE_RANGE_DAYS = 30;
    
    let startDate;
    let endDate;

    if (dateRange.startDate && dateRange.endDate) {
        startDate = new Date(dateRange.startDate);
        endDate = new Date(dateRange.endDate);
    } else if (dateRange.startDate && !dateRange.endDate) {
        startDate = new Date(dateRange.startDate);
        endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + DEFAULT_DATE_RANGE_DAYS);
    } else if (!dateRange.startDate && dateRange.endDate) {
        endDate = new Date(dateRange.endDate);
        startDate = new Date(endDate);
        startDate.setDate(endDate.getDate() - DEFAULT_DATE_RANGE_DAYS);
    } else { // neither datas supplied
        startDate = new Date();
        endDate = new Date();
        startDate.setDate(startDate.getDate() - DEFAULT_DATE_RANGE_DAYS);
    }

    startDate.setUTCHours(0,0,0,0);
    endDate.setUTCHours(23,59,59,999);

    return {
        startDate: Math.round(startDate.getTime() / 1000),
        endDate: Math.round(endDate.getTime() / 1000),
    };
}

const getAllFileNamesForHolder = async (txID, entity, holderId, dateRange) => {
    const dbName = `${entity}-${constants.DB_NAMES.COS_INFO}`;
    const cloudantHelper = CloudantHelper.getInstance(txID);

    const query = {
        selector: {
            "$and": [
                {
                    holder_id: { "$eq": holderId },
                },
                {
                    createdTimestamp: { 
                        "$gte": dateRange.startDate,
                        "$lte": dateRange.endDate,
                    }
                }
            ],
            _id: {
                $gt: null
            }
        },
    };

    try {
        logger.debug(`Attempting to get cos info`, txID);
        const { docs } = await cloudantHelper.queryDocuments(txID, query, dbName);
        if (!docs.length) {
            logger.debug(`Cos info for holder ${holderId} not found in Database ${dbName}`, txID);
            return {
                status: 404,
                message: `No documents found`,
            }
        }
        return {
            status: 200,
            fileNames: docs.map((doc) => doc._id),
        };
    } catch (error) {
        const message = `Error occurred getting cos info by holder: ${error}`;
        logger.error(message, txID);
        return { status: 500, message: 'Internal Server Error' }
    }
}

class CosHelper {
    static getInstance(txID) {
        if (!helperInstance) {
            helperInstance = new CosHelper();
        } else if (!helperInstance.cos) {
            const errMsg = getCOSNotInitMsg();
            logger.error(errMsg, txID);
            const err = { statusCode: 500, message: errMsg };
            throw err;
        }

        return helperInstance;
    }

    async setup(txID) {
        if (!this.cos) {
            try {
                this.cos = await initCos(txID);
                logger.info('Successfully initialized COS', txID);
            } catch (err) {
                const errMsg = `Failed to initialize COS: ${err}`;
                logger.warn(errMsg, txID);
                throw err;
            }
        }
    }

    async createBucket(txID, orgName) {
        logger.debug(`Attempting to create COS bucket for org ${orgName}`, txID);

        const bucketName = prepareBucketName(orgName);

        const params = {
            Bucket: `${bucketName}` /* required */,
            LifecycleConfiguration: {
                Rules: [
                    /* required */
                    {
                        Status: 'Enabled' /* required */,
                        ID: 'delete-after-30-days',
                        Filter: {} /* required */,
                        Expiration: {
                            Days: config.cos.bucketExpirationDays,
                        },
                    },
                ],
            },
        };

        try {
            await this.cos
                .createBucket({
                    Bucket: bucketName,
                    CreateBucketConfiguration: {
                        LocationConstraint: config.cos.locationConstraint
                    },
                })
                .promise();
            logger.info(`Successfully created COS bucket ${bucketName}`, txID);
            await this.cos.putBucketLifecycleConfiguration(params).promise();
        } catch (error) {
            // Continue if exception is for bucket already existing
            if (error.code && error.code.includes('BucketAlreadyExists')) {
                logger.warn('COS bucket already exists, ignoring exception', txID);
                return;
            }
            const errMsg = `Error creating COS bucket ${bucketName}: ${error.code} - ${error.message}`;
            logger.error(errMsg, txID);
            const err = { statusCode: error.statusCode, message: errMsg };
            throw err;
        }
    }

    async deleteBucket(txID, orgName) {
        logger.debug(`Attempting to delete COS bucket for org ${orgName}`, txID);

        const bucketName = prepareBucketName(orgName);
        try {
            await this.cos
                .deleteBucket({
                    Bucket: bucketName,
                })
                .promise();
            logger.info(`Successfully deleted COS bucket ${bucketName}`, txID);
        } catch (error) {
            const errMsg = `Error deleting COS bucket ${bucketName}: ${error.code} - ${error.message}`;
            logger.error(errMsg, txID);
            const err = { statusCode: error.statusCode, message: errMsg };
            throw err;
        }
    }

    async getAllBuckets(txID) {
        logger.debug('Attempting to get all COS buckets', txID);

        try {
            const data = await this.cos.listBuckets().promise();
            const buckets = data.Buckets.map((object) => object.Name);
            logger.info(`Successfully retrieved COS buckets: ${buckets}`, txID);
            return buckets;
        } catch (error) {
            const errMsg = `Error retrieving COS buckets: ${error.code} - ${error.message}`;
            logger.error(errMsg, txID);
            const err = { statusCode: error.statusCode, message: errMsg };
            throw err;
        }
    }

    async getAllFiles(txID, orgName, maxKeys) {
        logger.debug(`Attemping to get files from COS bucket for org ${orgName}`, txID);

        const bucketName = prepareBucketName(orgName);
        try {
            const data = await this.cos.listObjects({ Bucket: bucketName, MaxKeys: maxKeys }).promise();
            const files = data.Contents.map((object) => object.Key);
            logger.info(`Successfully retrieved files from COS bucket ${bucketName}`, txID);
            return files;
        } catch (error) {
            // eslint-disable-next-line max-len
            const errMsg = `Error occurred retrieving files from COS bucket ${bucketName}: ${error.code} - ${error.message}`;
            logger.error(errMsg, txID);
            const err = { statusCode: error.statusCode, message: errMsg };
            throw err;
        }
    }

    async getFile(txID, orgName, fileName) {
        logger.debug(`Attempting to get file ${fileName} from COS bucket for org ${orgName}`, txID);

        const bucketName = prepareBucketName(orgName);
        try {
            const data = await this.cos.getObject({ Bucket: bucketName, Key: fileName }).promise();
            const fileContents = Buffer.from(data.Body).toString();
            logger.info(`Successfully retrieved file ${fileName} from COS bucket ${bucketName}`, txID);
            return fileContents;
        } catch (error) {
            // eslint-disable-next-line max-len
            const errMsg = `Error occurred retrieving file ${fileName} from COS bucket ${bucketName}: ${error.code} - ${error.message}`;
            logger.error(errMsg, txID);
            const err = { statusCode: error.statusCode, message: errMsg };
            throw err;
        }
    }

    async getAllFilesForHolder(txID, entity, holderId, dateRange) {
        const results = await getAllFileNamesForHolder(
            txID, entity, holderId, getDateRangeOrDefault(dateRange)
        );

        if (results.status !== 200) {
            return {
                status: results.status,
                message: results.message,
            }
        }
        const {fileNames} = results;
        logger.debug(`Attempting to get files ${fileNames} from COS bucket for org ${entity}`, txID);

        const bucketName = prepareBucketName(entity);
        const filesContents = [];

        // eslint-disable-next-line no-restricted-syntax
        for (const fileName of fileNames) {
            try {
                // eslint-disable-next-line no-await-in-loop
                const item = await this.cos.getObject({ Bucket: bucketName, Key: fileName }).promise();
                filesContents.push(JSON.parse(Buffer.from(item.Body).toString()));
            } catch (error) {
                if (!error.code === 'NoSuchKey') {
                    // eslint-disable-next-line max-len
                    const errMsg = `Error occurred retrieving files ${fileNames} from COS bucket ${bucketName}: ${error.code} - ${error.message}`;
                    logger.error(errMsg, txID);
                    const err = { statusCode: error.statusCode, message: errMsg };
                    throw err;
                }
            }
        };
        if (!filesContents.length) {
            logger.info(`Items from cos info not found for ${entity}`, txID);
            return {
                status: 404,
                message: `No documents found`,
            };
        }
        logger.debug(`Successfully retrieved files ${fileNames} from COS bucket ${bucketName}`, txID);
        return {
            status: 200,
            filesContents,
        };
    }

    // From online docs:
    // Object keys can be up to 1024 characters in length, and it's best to avoid any characters
    // that might be problematic in a web address. For example, ?, =, <, and other special characters
    // might cause unwanted behavior if not URL-encoded.
    async createFile(txID, orgName, fileName, jsonBody) {
        logger.debug(`Attempting to create file ${fileName} in COS bucket for org ${orgName}`, txID);

        const bucketName = prepareBucketName(orgName);
        const bodyAsString = JSON.stringify(jsonBody);
        try {
            await this.cos.putObject({ Bucket: bucketName, Key: fileName, Body: bodyAsString }).promise();
            logger.info(`Successfully created file ${fileName} in COS bucket ${bucketName}`, txID);
        } catch (error) {
            // eslint-disable-next-line max-len
            const errMsg = `Error occurred creating file ${fileName} in COS bucket ${bucketName}: ${error.code} - ${error.message}`;
            logger.error(errMsg, txID);
            const err = { statusCode: error.statusCode, message: errMsg };
            throw err;
        }
    }

    async deleteAllFiles(txID, orgName) {
        logger.debug(`Attempting to delete all files from COS bucket for org ${orgName}`, txID);

        const bucketName = prepareBucketName(orgName);
        try {
            const files = await this.getAllFiles(txID, orgName);
            const fileDeletes = [];
            files.forEach((file) => {
                fileDeletes.push(this.deleteFile(txID, orgName, file));
            });
            await Promise.all(fileDeletes);
            logger.info(`Successfully deleted files from COS bucket ${bucketName}`, txID);
        } catch (error) {
            // eslint-disable-next-line max-len
            const errMsg = `Error occurred deleting files from COS bucket ${bucketName}: ${error.code} - ${error.message}`;
            logger.error(errMsg, txID);
            const err = { statusCode: error.statusCode, message: errMsg };
            throw err;
        }
    }

    async deleteFile(txID, orgName, fileName) {
        logger.debug(`Attempting to delete file ${fileName} from COS bucket for org ${orgName}`, txID);
        const bucketName = prepareBucketName(orgName);
        try {
            await this.cos.deleteObject({ Bucket: bucketName, Key: fileName }).promise();
            logger.info(`Successfully deleted file ${fileName} from COS bucket ${bucketName}`, txID);
        } catch (error) {
            // eslint-disable-next-line max-len
            const errMsg = `Error occurred deleting file ${fileName} from COS bucket ${bucketName}: ${error.statusCode} - ${error.message}`;
            logger.error(errMsg, txID);
            const err = { statusCode: error.statusCode, message: error.message };
            throw err;
        }
    }
}

module.exports = CosHelper;
