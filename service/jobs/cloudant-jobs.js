/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 */

const CloudantHelper = require("../../helpers/cloudantHelper");
const constants = require('../../helpers/constants');
const config = require("../../config/app/config.json")
const Logger = require('../../config/logger');

const logger = new Logger('cloudant-cron-job');

const RUNNING_FILE = 'cos-info-cleanup.json'
const DB_ORG = constants.DB_NAMES.ORG;

const createRunningFile = (
    cloudant, dbName
) => {
    try {
        logger.info(`starting cos-info cleanup job`);
        const doc = {
            startTime: new Date().getTime(),
            status: "RUNNING",
        };
        return cloudant.createDocument(null, RUNNING_FILE, doc, dbName);
    } catch(e) {
        logger.error(`createRunningFile: unable to start cos-info cleanup: ${e.message}`);
    }
    return undefined;
}

const isTimeToRunJob = (
    doc
) => {
    if (!doc.doneTime) {
        return false;
    }
    const now = new Date().getTime();
    const diff = now - doc.doneTime;

    const isTime = diff > config.cos.runCronMinutes * 60 * 1000;
    if (!isTime) {
        logger.info(`not time to run cos-info cleanup job`);
    }

    return isTime;    
}

// if true, assumes something unexpected happend to
// the last running job and it did not complete
const isRunningFileStale = (doc) => {
    if (doc.status !== "RUNNING") {
        return false;
    }
    const now = new Date().getTime();
    const diff = now - doc.startTime;
    const staleTime = config.cos.staleRunMinutes * 60 * 1000;
    if (diff > staleTime) {
        logger.warn(`found stale cos-info clean file`);
        return true;
    }
    return false;
}

const updateJobStart = async (
    cloudant, doc
) => {
    try {
        logger.info(`starting cos-info cleanup job`);
        const newDoc = doc;
        newDoc.startTime = new Date().getTime()
        newDoc.status = "RUNNING";
        const returnDoc = newDoc;
        const updated = await cloudant.updateDocument(null, newDoc._id, newDoc._rev, newDoc, DB_ORG);
        returnDoc._rev = updated.rev
        return returnDoc;
    } catch(e) {
        if (e.error === 'conflict') {
            logger.info('Skipping cos-info cleanup job because of document conflict')
        } else {
            logger.error(
                `unable to update running file for cos-info cleanup during startup: ${e.message}`
            );
        }
    }
    return undefined;
}

const updateJobEnd = async (
    cloudant, doc
) => {
    try {
        logger.info(`cos-info cleanup job completed`);
        const newDoc = doc;
        newDoc.doneTime = new Date().getTime()
        newDoc.status = "DONE";
        await cloudant.updateDocument(null, newDoc._id, newDoc._rev, newDoc, DB_ORG);
    } catch(e) {
        if (e.error === 'conflict') {
            logger.info('Skipping cos-info cleanup job because of document conflict')
        } else {
            logger.error(
                `unable to update running file for cos-info cleanup during job end: ${e.message}`
            );
        }
    }
}

const canStart = async (
    cloudant
) => {
    const payload = await cloudant.readDocumentSafe(null, RUNNING_FILE, DB_ORG);
    if (payload.status === 404) {
        return createRunningFile(cloudant, DB_ORG);
    }

    if (payload.status === 200) {
        const doc = payload.data;
        if (isTimeToRunJob(doc) || isRunningFileStale(doc)) {
            return updateJobStart(cloudant, doc)
        }
        return undefined;
    }
    logger.error(`canStart: unable to start cos-info cleanup: ${payload.message}`)
    return undefined;
}

const getCloudantInstance = () => {
    try {
        return CloudantHelper.getInstance(null);
    } catch (e) {
        logger.error(`unable to get cloudant instance for cos-info cleanup: ${e.message}`);
    }
    return undefined;
}

const getDbList = async (
    cloudant
) => {
    try {
        const dbList = await cloudant.getDBList(null);
        return dbList.filter(name => {
            return name.match(/\w+-cos-info/g);
        })
    } catch (e) {
        logger.error(`unable to get databases for cos-info cleanup: ${e.message}`)
        return [];
    }
}

const getQuery = () => {
    const date = new Date().getTime();
    const timeRange = config.cos.bucketExpirationDays * 24 * 60 * 60 * 1000
    const searchDate = Math.round((date - timeRange)/1000);
    return {
        selector: {
            createdTimestamp: { $lte: searchDate }
        }
    };
}

const getDocuments = async(cloudant, dbName) => {
    try {
        return await cloudant.queryDocuments(null, getQuery(), dbName);
    } catch (e) {
        logger.error(`unable to get documents for db ${dbName} cos-info cleanup: ${e.message}`);
    }
    return undefined;
}

const deleteDocument = async (
    cloudant, doc, dbName
) => {
    try {
        await cloudant.deleteDocument(null, doc._id, doc._rev, dbName);
    } catch (e) {
        logger.error(`unable to delete document ${doc._id} for db ${dbName} cos-info cleanup: ${e.message}`);
    }
}

const expireDocuments = async (cloudant) => {
    const runningFile = await canStart(cloudant);
    if (!runningFile) {
        return;
    }

    const dbList = await getDbList(cloudant);

    // eslint-disable-next-line no-restricted-syntax
    for (const dbName of dbList) {
        // eslint-disable-next-line no-await-in-loop
        const docs = await getDocuments(cloudant, dbName);
        if (docs && docs.docs && docs.docs.length) {
            // eslint-disable-next-line no-restricted-syntax
            for (const doc of docs.docs) {
                logger.debug(`DELETE doc ${doc._id} in DB ${dbName}`, null)
                // eslint-disable-next-line no-await-in-loop
                await deleteDocument(cloudant, doc, dbName);
            }
        }
        // add timeout to avoid reaching request limit per second
        // eslint-disable-next-line no-await-in-loop
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    await updateJobEnd(cloudant, runningFile);
}

const removeDocumentByExpirationDays = async () => {
    const cloudant = getCloudantInstance()
    if (!cloudant) {
        return;
    }

    await expireDocuments(cloudant)
}

module.exports  = {
    removeDocumentByExpirationDays: {
        name: 'Remove expired cos-info entries',
        action: removeDocumentByExpirationDays,
        schedule: config.cos.cronSchedule,
        option: { scheduled: config.cos.expirationJobEnabled }
    },
    createRunningFile,
    isTimeToRunJob,
    isRunningFileStale,
    updateJobStart,
    updateJobEnd,
    canStart,
    getDbList,
    getQuery,
    expireDocuments
}
