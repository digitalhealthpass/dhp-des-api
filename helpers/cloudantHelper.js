/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 */

const Cloudant = require('@cloudant/cloudant');

const constants = require('./constants');
const Logger = require('../config/logger');

const logger = new Logger('cloudantHelper');

const cloudantIamKey = process.env.CLOUDANT_IAM_KEY;
const cloudantUrl = process.env.CLOUDANT_URL;

let instance;

const validateCloudantConfig = () => {
    const missingVars = [];
    if (!cloudantIamKey) {
        missingVars.push('CLOUDANT_IAM_KEY');
    }
    if (!cloudantUrl) {
        missingVars.push('CLOUDANT_URL');
    }
    return missingVars;
}

const getCloudantNotInitMsg = () => {
    const notInitMsg = 'Cloudant was not initialized during startup, please check configuration';

    const missingVars = validateCloudantConfig();
    const missingConfig = missingVars.length > 0;
    const missingConfigMsg = `Cloudant credentials are missing: ${missingVars}`;

    return missingConfig ? `${notInitMsg}: ${missingConfigMsg}` : notInitMsg;
}

// getInitOptions constructs Cloudant configuration object, which includes credentials and retry config.
function getInitOptions(txID) {
    logger.debug('Retrieving Cloudant credentials and configuration', txID);
    const missingVars = validateCloudantConfig();
    if (missingVars.length > 0) {
        const errMsg = `Cloudant credentials are missing: ${missingVars}`;
        logger.error(errMsg, txID);
        throw new Error(errMsg);
    }
    return {
        url: cloudantUrl,
        maxAttempt: 0, // don't retry failed Cloudant requests
        plugins: [
            {
                iamauth: { iamApiKey: cloudantIamKey },
            },
        ],
    };
}

function initCloudant(txID) {
    let initOptions = {};
    try {
        initOptions = getInitOptions(txID);
    } catch (err) {
        const errMsg = `Failed to getInitOptions for Cloudant: ${err.message}`;
        logger.error(errMsg, txID);
        throw err;
    }

    logger.debug('Initializing Cloudant with provided credentials and configuration', txID);
    return new Promise((resolve, reject) => {
        Cloudant(initOptions, (err, cloudant) => {
            // reject if authentication fails
            if (err) {
                const errMsg = `Failed to initialize Cloudant with provided credentials: ${err.message}`;
                logger.error(errMsg, txID);
                logger.error(err.stack, txID);
                reject(errMsg);
            }
            resolve(cloudant);
        });
    });
}

class CloudantHelper {
    static getInstance(txID) {
        if (!instance) {
            instance = new CloudantHelper();
        } else if (!instance.cloudant || !instance.cloudantDB) {
            const errMsg = getCloudantNotInitMsg();
            logger.error(errMsg, txID);
            const err = { statusCode: 500, message: errMsg };
            throw err;
        }
        return instance;
    }

    async getOrCreateDB(txID, dbName) {
        try {
            await this.cloudant.db.get(dbName);
            const debugMsg = `Successfully got Cloudant database ${dbName}, skipping database creation`;
            logger.debug(debugMsg, txID);
        } catch (err) {
            const debugMsg = `Failed to get Cloudant database ${dbName}: ${err.message}`;
            logger.debug(debugMsg, txID);

            try {
                await this.cloudant.db.create(dbName);
                const infoMsg = `Created Cloudant database ${dbName}`;
                logger.info(infoMsg, txID);
            } catch (err) {
                const errMsg = `Failed to create Cloudant database ${dbName}: ${err.message}`;
                logger.error(errMsg, txID);
                logger.error(err.stack, txID);
                throw err;
            }
        }
    }

    async initDB(txID) {
        // prepare database
        const dbName = constants.DB_NAMES.ORG;
        const mapperDbName = constants.DB_NAMES.MAPPER;

        // Create Mapper DB if not exists
        try {
            logger.debug(`Checking if Cloudant database ${mapperDbName} exists`, txID);
            await this.getOrCreateDB(txID, mapperDbName);
        } catch (err) {
            const errMsg = `Failed to check whether Cloudant database exists: ${mapperDbName}: ${err.message}`;
            logger.error(errMsg, txID);
            logger.error(err.stack, txID);
            throw err;
        }

        // Create Org DB if not exists
        try {
            // check for database and create if it does not already exist
            logger.debug(`Checking if Cloudant database ${dbName} exists`, txID);
            await this.getOrCreateDB(txID, dbName);

            // create organization index
            logger.debug(`Attempting to create organization index in ${dbName} database in Cloudant`, txID);
            await this.createIndex(
                txID,
                {
                    index: { fields: ['organization'] },
                    name: 'organization-index',
                    type: 'json',
                },
                dbName,
            );
        } catch (err) {
            const errMsg = `Failed to check whether Cloudant database exists: ${dbName}: ${err.message}`;
            logger.error(errMsg, txID);
            logger.error(err.stack, txID);
            throw err;
        }

        try {
            // set existing database
            logger.debug(`Preparing Cloudant database ${dbName} for requests`, txID);
            return this.cloudant.use(dbName);
        } catch (err) {
            const errMsg = `Failed to connect to Cloudant database: ${dbName}: ${err.message}`;
            logger.error(errMsg, txID);
            logger.error(err.stack, txID);
            throw err;
        }
    }

    async setupCloudantDB(txID) {
        if (!this.cloudant) {
            try {
                this.cloudant = await initCloudant(txID);
            } catch (err) {
                const errMsg = `Failed to initCloudant: ${err}`;
                logger.error(errMsg, txID);
                throw err;
            }
        }

        if (!this.cloudantDB) {
            try {
                this.cloudantDB = await this.initDB(txID);
            } catch (err) {
                const errMsg = `Failed to initDB: ${err}`;
                logger.error(errMsg, txID);
                throw err;
            }
        }

        logger.info('Successfully initialized Cloudant', txID);
    }

    // readDocument retrieves document from Cloudant DB(dbName).
    async readDocument(txID, docID, dbName) {
        logger.debug(`Reading Cloudant document with _id ${docID} in database ${dbName}`, txID);
        return this.cloudant.use(dbName).get(docID);
    }

    // createDocument saves document to Cloudant DB(dbName).
    async createDocument(txID, docID, doc, dbName) {
        logger.debug(`Creating Cloudant document with _id ${docID} in database ${dbName}`, txID);
        const newDoc = doc;
        if (docID) newDoc._id = docID;

        return this.cloudant.use(dbName).insert(newDoc);
    }

    // createDocument saves document to Cloudant DB(dbName).
    async createDocumentBulk(txID, docID, docs, dbName) {
        logger.debug(`Creating Cloudant documents in bulk in database ${dbName}`, txID);

        return this.cloudant.use(dbName).bulk(docs);
    }

    // updateDocument updates document in Cloudant DB. docID and docRev must be specified.
    async updateDocument(txID, docID, docRev, doc, dbName) {
        logger.debug(`Updating Cloudant document with _id ${docID} and _rev ${docRev} in database ${dbName}`, txID);
        return this.cloudant.use(dbName).insert(doc);
    }

    // deleteDocument deletes document in Cloudant DB. docID and docRev must be specified.
    async deleteDocument(txID, docID, docRev, dbName) {
        logger.debug(`Deleting Cloudant document with _id ${docID} and _rev ${docRev} in database ${dbName}`, txID);
        return this.cloudant.use(dbName).destroy(docID, docRev);
    }

    // createIndex creates query-able index in CloudantDB(dbName).
    async createIndex(txID, indexDef, dbName) {
        logger.debug(`Creating Cloudant index in database ${dbName}: ${JSON.stringify(indexDef)}`, txID);
        return this.cloudant.use(dbName).index(indexDef);
    }

    // queryDocuments retrieves documents from Cloudant DB(dbName) that match the given query parameters.
    async queryDocuments(txID, queryParams, dbName) {
        logger.debug(`Querying Cloudant documents in database ${dbName}: ${JSON.stringify(queryParams)}`, txID);
        return this.cloudant.use(dbName).find(queryParams);
    }

    // readDocumentSafe retrieves document from Cloudant DB(dbName), catching does-not-exist exception.
    async readDocumentSafe(txID, docID, dbName) {
        logger.debug(`Reading Cloudant document safely with _id ${docID} in database ${dbName}`, txID);
        try {
            const data = await this.cloudant.use(dbName).get(docID);
            return { status: 200, data };
        } catch (err) {
            return { status: err.statusCode, message: err.error };
        }
    }

    async updateDocumentSafe(txID, docID, docRev, doc, dbName) {
        logger.debug(`Updating Cloudant document with _id ${docID} and _rev ${docRev} in database ${dbName}`, txID);
        try {
            const data = await this.cloudant.use(dbName).insert(doc);
            return { status: 200, data };
        } catch (err) {
            return { status: err.statusCode, message: err.error };
        }
    }

    async deleteDocumentSafe(txID, docID, docRev, dbName) {
        // eslint-disable-next-line max-len
        logger.debug(`Deleting Cloudant document safely with _id ${docID} and _rev ${docRev} in database ${dbName}`, txID);
        try {
            const data = await this.cloudant.use(dbName).destroy(docID, docRev);
            return { status: 200, data };
        } catch (err) {
            return { status: err.statusCode, message: err.error };
        }
    }

    async deleteDB(txID, dbName) {
        try {
            await this.cloudant.db.get(dbName);
            logger.debug(`Deleting Cloudant database ${dbName}`, txID);
            return this.cloudant.db.destroy(dbName);
        } catch (err) {
            const errMsg = `Failed to delete Cloudant database ${dbName}: ${err.message}`;
            logger.error(errMsg, txID);
            throw err;

        }
    }

    async getDBList(txID) {
        try {
            logger.debug(`GET Cloudant database list`, txID);
            return this.cloudant.db.list()
        } catch (err) {
            const errMsg = `Failed to get Cloudant database list: ${err.message}`;
            logger.error(errMsg, txID);
            throw err;

        }
    }
}

module.exports = CloudantHelper;
