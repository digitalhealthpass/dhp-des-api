/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 */

const axios = require('axios');
const rax = require('retry-axios');
const moment = require('moment');

const cloudIamHelper = require('./cloud-iam-helper');
const config = require('../config');
const Logger = require('../config/logger');

const logger = new Logger('key-protect-helper');
const cacheHelper = require('./cache-helper');

const keyProtectURL = process.env.KEY_PROTECT_URL;
const keyProtectGUID = process.env.KEY_PROTECT_GUID;
const keyProtectApiKey = process.env.KEY_PROTECT_IAM_KEY;

// validate that KeyProtect env variables are set
const validateKeyProtectConfig = () => {
    const missingVars = [];
    if (!keyProtectURL) {
        missingVars.push('KEY_PROTECT_URL');
    }
    if (!keyProtectGUID) {
        missingVars.push('KEY_PROTECT_GUID');
    }
    if (!keyProtectApiKey) {
        missingVars.push('KEY_PROTECT_IAM_KEY');
    }
    if (!missingVars) {
        const errMsg = `Invalid KeyProtect config: missing variable '${missingVars}'`;
        const err = { statusCode: 500, message: errMsg };
        throw err;
    }
}

const getAccessToken = async (txID) => {
    let token = await cacheHelper.get("KP_ACCESS_TOKEN");
    if (token) {
        const currentTS = (new Date()).getTime()/1000;
        const {expiration} = token;
        // the token expiration should be more than 2 mins.
        if (expiration - 120 > currentTS) {
            return token;
        }
    }
    token = await cloudIamHelper.getCloudIAMToken(txID, keyProtectApiKey);
    await cacheHelper.set("KP_ACCESS_TOKEN", token);
    return token;
}

const keyProtectClient = (txID, token) => {
    validateKeyProtectConfig();
    const client = axios.create({
        baseURL: keyProtectURL,
        timeout: config.keyProtect.timeout,
        headers: {
            Accept: 'application/vnd.ibm.kms.key+json',
            Authorization: `Bearer ${token}`,
            'bluemix-instance': keyProtectGUID,
        },
    });

    const retries = config.keyProtect.retries || 1;
    const retryDelay = config.keyProtect.retryDelay || 3000;

    // setup retry-axios config
    client.defaults.raxConfig = {
        instance: client,
        retry: retries,
        noResponseRetries: retries, // retry when no response received (such as on ETIMEOUT)
        statusCodesToRetry: [[500, 599]], // retry only on 5xx responses
        retryDelay,
        onRetryAttempt: (err) => {
            const cfg = rax.getConfig(err);
            logger.warn('No response received from KeyProtect, retrying request:', txID);
            logger.warn(`Retry attempt #${cfg.currentRetryAttempt}`, txID);
        },
    };

    rax.attach(client);
    return client;
};

const parseKeyPayload = (txID, response) => {
    try {
        const payloadExists = response.data
            && response.data.resources
            && response.data.resources.length
            && response.data.resources[0].payload;

        if (payloadExists) {
            const { payload } = response.data.resources[0];
            const decodedPayload = Buffer.from(payload, 'base64').toString();
            logger.debug('Successfully parsed key from KeyProtect', txID);
            return decodedPayload;
        }
        logger.warn('Payload not found for key from KeyProtect', txID);
    } catch (error) {
        logger.warn(`Failed to parse key from KeyProtect: ${error}`, txID);
    }
    return '';
};

const parseKeyID = (txID, response) => {
    try {
        const idExists = response.data
            && response.data.resources
            && response.data.resources.length
            && response.data.resources[0].id;

        if (idExists) {
            return response.data.resources[0].id;
        }
        logger.warn('ID not found for key from KeyProtect', txID);
    } catch (error) {
        logger.warn(`Failed to parse ID for key from KeyProtect: ${error}`, txID);
    }
    return '';
};


const getKeyByID = async (txID, keyID) => {
    // TODO: Cache CLOUD TOKEN
    // const token = await cloudIamHelper.getCloudIAMToken(txID, keyProtectApiKey);
    const token = await getAccessToken(txID);
    const client = keyProtectClient(txID, token.access_token);
    try {
        const getKeyResponse = await client.get(keyID);

        logger.info(`Successfully retrieved key ${keyID} from KeyProtect`, txID);
        return parseKeyPayload(txID, getKeyResponse);
    } catch (error) {
        let failureReasons = '';
        if (error.response && error.response.data && error.response.data.resources) {
            failureReasons = JSON.stringify(error.response.data.resources);
        } else if (error.message) {
            failureReasons = error.message;
        }
        const errMsg = `Failed to retrieve key ${keyID} from KeyProtect: ${failureReasons}`;
        logger.warn(errMsg, txID);
        throw error
    }
};

const getKeysByName = async (txID, client, keyName) => {
    try {
        const response = await client.get();

        const filteredKeys = response.data.resources
            .filter((key) => key.name === keyName);
        logger.info(`Successfully retrieved ${filteredKeys.length} key id(s) for name = 
        ${keyName} from KeyProtect`, txID);
        return filteredKeys;
    } catch (error) {
        let failureReasons = '';
        if (error.response && error.response.data && error.response.data.resources) {
            failureReasons = JSON.stringify(error.response.data.resources);
        } else if (error.message) {
            failureReasons = error.message;
        }

        const errMsg = `Failed to retrieve key ids for ${keyName} from KeyProtect: ${failureReasons}`;
        logger.warn(errMsg, txID);
        return [];
    }
};

const deleteKey = async (txID, client, keyID) => {
    try {
        await client.delete(keyID);
        logger.info(`Successfully deleted key ${keyID} in KeyProtect`, txID);
    } catch (error) {
        let failureReasons = '';
        if (error.response && error.response.data && error.response.data.resources) {
            failureReasons = JSON.stringify(error.response.data.resources);
        } else if (error.message) {
            failureReasons = error.message;
        }

        const errMsg = `Failed to delete key ${keyID} in KeyProtect: ${failureReasons}`;
        logger.error(errMsg, txID);
        throw new Error(errMsg);
    }
};

const getLatestKeyIDByName = async (txID, client, searchName) => {
    const keyList = await getKeysByName(txID, client, searchName);

    let newestKeyID = '';
    let newestCreationDate = moment(0);

    for (let i = 0; i < keyList.length; i += 1) {
        if (keyList[i].name === searchName) {
            const currentCreationDate = moment(keyList[i].creationDate);
            // check creation date against newest key with same name
            if (newestCreationDate.isBefore(currentCreationDate)) {
                newestCreationDate = currentCreationDate;

                // delete older key with same name
                if (newestKeyID) {
                    logger.warn(`Attempting to delete older key ${newestKeyID} with name ${searchName} 
                    in KeyProtect`, txID);
                    // eslint-disable-next-line no-await-in-loop
                    await deleteKey(txID, client, newestKeyID);
                }

                newestKeyID = keyList[i].id;
            }
        }
    }
    return newestKeyID;
};

const deleteKeyByName = async (txID, keyName) => {
    try {
        if (!keyName) throw new Error('keyName is empty');

        // const token = await cloudIamHelper.getCloudIAMToken(txID, keyProtectApiKey);
        const token = await getAccessToken(txID);
        const client = keyProtectClient(txID, token.access_token);

        // check if it exists already on KP with name
        const existingKeyID = await getLatestKeyIDByName(txID, client, keyName);
        if (existingKeyID) {
            logger.debug('key already exist with same key name', txID);
            await deleteKey(txID, client, existingKeyID);
            return { status: 200, message: "Deleted key successfully" };
        }
        return { status: 404, message: "Key not found" };
    } catch (error) {
        let failureReasons = '';
        if (error.response && error.response.data && error.response.data.resources) {
            failureReasons = JSON.stringify(error.response.data.resources);
        } else if (error.message) {
            failureReasons = error.message;
        }

        const errMsg = `Failed to create key in KeyProtect: ${failureReasons}`;
        logger.error(errMsg, txID);
        return { status: 500, message: errMsg };
    }

};

// eslint-disable-next-line complexity
const createKey = async (txID, keyName, keyPayload, isUpdate = false) => {
    try {
        if (!keyName) throw new Error('keyName is empty');
        if (!keyPayload) throw new Error('keyPayload is empty');

        logger.debug('Attempting to check for existing key (before creating new key)', txID);
        // const token = await cloudIamHelper.getCloudIAMToken(txID, keyProtectApiKey);
        const token = await getAccessToken(txID);
        const client = keyProtectClient(txID, token.access_token);

        // check if it exists already on KP with name
        const existingKeyID = await getLatestKeyIDByName(txID, client, keyName);

        if (existingKeyID) {
            logger.debug('key already exist with same key name', txID);
            if (isUpdate === false) {
                return { status: 409, message: "key already exists" };
            }
            await deleteKey(txID, client, existingKeyID);
        } else if (isUpdate === true) {
            return { status: 404, message: "key not found to update" };
        }

        const encodedPayload = Buffer.from(keyPayload).toString('base64');

        const requestBody = {
            metadata: {
                collectionType: 'application/vnd.ibm.kms.key+json',
                collectionTotal: 1,
            },
            resources: [
                {
                    type: 'application/vnd.ibm.kms.key+json',
                    name: keyName,
                    description: 'Credential partnerId',
                    extractable: true,
                    payload: encodedPayload,
                },
            ],
        };

        const createResponse = await client.post('', JSON.stringify(requestBody));

        const keyID = parseKeyID(txID, createResponse);
        logger.info(`Successfully created key ${keyID} in KeyProtect`, txID);
        return { status: 201, data: keyID, message: "Successfully created key" };
    } catch (error) {
        let failureReasons = '';
        if (error.response && error.response.data && error.response.data.resources) {
            failureReasons = JSON.stringify(error.response.data.resources);
        } else if (error.message) {
            failureReasons = error.message;
        }
        const errMsg = `Failed to create key in KeyProtect: ${failureReasons}`;
        logger.error(errMsg, txID);
        return { status: error.statusCode, message: "Failed to create key in KeyProtect" };
    }
};

module.exports = {
    getKeyByID,
    createKey,
    deleteKeyByName
};