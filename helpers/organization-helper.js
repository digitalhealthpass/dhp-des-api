/* eslint-disable no-underscore-dangle */
/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 */

const jsonpatch = require('fast-json-patch');
const constants = require('./constants');
const cloudIamHelper = require('./cloud-iam-helper');
const CloudantHelper = require('./cloudantHelper');
const cosHelper = require('./cos-helper');
const entityHelper = require('../entities');
const postboxHelper = require('./postbox-helper');
const Logger = require('../config/logger');
const appIdHelper = require('./app-id-helper');

const logger = new Logger('organization-helper');

// Validates entity exists, returns true if it does, false otherwise
const prepareDbName = (organization, dbName) => {
    return `${organization}-${dbName}`;
};

// Create submission timestamp index in DB
const createSubmissionIndex = async (txID, organization) => {
    const cloudantHelper = CloudantHelper.getInstance(txID);
    const dbName = prepareDbName(organization, constants.DB_NAMES.STATS);
    logger.debug(`Attempting to create submittionTimestamp-submissionID index in ${dbName} database in Cloudant`, txID);
    await cloudantHelper.createIndex(
        txID,
        {
            index: { fields: ['submissionTimestamp', 'submissionID'] },
            name: 'submission-timestamp-index',
            type: 'json',
        },
        dbName,
    );
};

const createBatchDBIndex = async (txID, organization) => {
    const cloudantHelper = CloudantHelper.getInstance(txID);
    const dbName = prepareDbName(organization, constants.DB_NAMES.BATCH);
    logger.debug(`Creating batch-id index in ${dbName} database`, txID);
    await cloudantHelper.createIndex(
        txID,
        {
            index: { fields: ['batchID', 'type'] },
            name: 'batchid-type-index',
            type: 'json',
        },
        dbName,
    );
    logger.debug(`Creating doctype-date-index index in ${dbName} database`, txID);
    await cloudantHelper.createIndex(
        txID,
        {
            index: { fields: ['type', 'submittedTimestamp'] },
            name: 'doctype-date-index',
            type: 'json',
        },
        dbName,
    );
};

const createBatchQueueDBIndex = async (txID, organization) => {
    const cloudantHelper = CloudantHelper.getInstance(txID);
    const dbName = prepareDbName(organization, constants.DB_NAMES.BATCH_QUEUE);
    logger.debug(`Creating batchid-type-row-index index in ${dbName} database`, txID);
    await cloudantHelper.createIndex(
        txID,
        {
            index: { fields: ['batchID', 'type', 'rowID'] },
            name: 'batchid-type-row-index',
            type: 'json',
        },
        dbName,
    );
};

const createCosInfoDBIndex = async (txID, organization) => {
    const cloudantHelper = CloudantHelper.getInstance(txID);
    const dbName = prepareDbName(organization, constants.DB_NAMES.COS_INFO);
    logger.debug(`Attempting to create docholder-date index in ${dbName} database in Cloudant`, txID);
    await cloudantHelper.createIndex(
        txID,
        {
            index: { fields: ['holder_id', 'createdTimestamp'] },
            name: 'docholder-date-index',
            type: 'json',
        },
        dbName,
    );
};

const createCosTimestampIndex = async (txID, organization) => {
    const cloudantHelper = CloudantHelper.getInstance(txID);
    const dbName = prepareDbName(organization, constants.DB_NAMES.COS_INFO);
    logger.debug(`Attempting to create create-time-date index in ${dbName} database in Cloudant`, txID);
    await cloudantHelper.createIndex(
        txID,
        {
            index: { fields: ['createdTimestamp'] },
            name: 'create-time-date',
            type: 'json',
        },
        dbName,
    );
};

const getOrgIDMaxLength = () => {

    const cosBucketSuffixLength = process.env.COS_BUCKET_SUFFIX.length;
    const cosBucketMaxLength = constants.COS_BUCKET_MAX_LENGTH;
    const orgMaxLengthByCosBucket = cosBucketMaxLength - cosBucketSuffixLength;

    return Math.min(
        constants.ORGID_DEFAULT_MAX_LENGTH,
        orgMaxLengthByCosBucket
    );
}

const validateOrgID = (organization) => {
    // From Cloudant docs:
    // The database name must start with a lowercase letter, and contain only the following characters:
    // Lowercase characters (a-z)
    // Digits (0-9)
    // Hyphen character (-)

    // From Amazon S3 docs:
    // Bucket names must begin and end with a letter or number
    if (!organization.match(/^[a-z]{1}[a-z0-9-]*$/)) {
        // eslint-disable-next-line max-len
        return 'First character must be a lowercase letter and remaining characters must be lowercase letters (a-z), digits (0-9), or hyphens (-)';
    }

    const orgIDMaxLength = getOrgIDMaxLength();
    if (organization.length > orgIDMaxLength) {
        return `Maximum length is ${orgIDMaxLength} characters`;
    }
    return '';
}

const deleteAppIDRole = async (organization, txID, cloudIamToken, entityData) => {
    // delete AppID roles
    logger.info(`Attempting to delete AppID roles for ${organization}`, txID);
    if (entityData && entityData.regAdminRoleID) {
        await appIdHelper.deleteRole(txID, cloudIamToken, entityData.regAdminRoleID);
    }
    if (entityData && entityData.testAdminRoleID) {
        await appIdHelper.deleteRole(txID, cloudIamToken, entityData.testAdminRoleID);
    }
    if (entityData && entityData.dataAdminRoleID) {
        await appIdHelper.deleteRole(txID, cloudIamToken, entityData.dataAdminRoleID);
    }
}

const offboardOrgAppID = async (txID, req, organization, entityData) => {
    const disableAppIDHeader = constants.REQUEST_HEADERS.DISABLE_APPID_DELETE_OVERRIDE;
    const disableAppID = req.headers[disableAppIDHeader];
    if (disableAppID && disableAppID.toUpperCase() === 'TRUE') {
        logger.debug(`Not deleting AppID scopes and roles, header ${disableAppIDHeader}=${disableAppID}`, txID);
        return;
    }

    const cloudIamToken = await cloudIamHelper.getCloudIAMToken(txID);

    // delete AppID scopes
    logger.info(`Attempting to delete AppID scopes for ${organization}`, txID);
    const regAdminScope = `${organization}.${constants.APP_ID_ROLES.REGISTRATION_ADMIN}`;
    const testAdminScope = `${organization}.${constants.APP_ID_ROLES.TEST_ADMIN}`;
    const dataAdminScope = `${organization}.${constants.APP_ID_ROLES.DATA_ADMIN}`;
    const getScopesRes = await appIdHelper.getScopes(txID, cloudIamToken.access_token);
    const needDeletedScopes = getScopesRes.scopes.filter(scope => { 
        return ([regAdminScope, testAdminScope, dataAdminScope].indexOf(scope) !== -1);
    });
    if (needDeletedScopes && needDeletedScopes.length > 0) {
        await appIdHelper.deleteScopes(txID, cloudIamToken.access_token, needDeletedScopes);
        await deleteAppIDRole(organization, txID, cloudIamToken.access_token, entityData);
    }
}

const createOrganization = async (txID, req) => {
    const cloudantHelper = CloudantHelper.getInstance(txID);
    const cos = cosHelper.getInstance(txID);

    const dbORG = constants.DB_NAMES.ORG;
    const orgDocs = req.body;

    try {
        const organization = orgDocs.entity;
        // making entity name as primary key
        orgDocs._id = orgDocs.entity;

        const validateErrMsg = validateOrgID(organization);
        if (validateErrMsg) {
            const errMsg = `Invalid entity value ${organization}: ${validateErrMsg}`;
            logger.error(errMsg, txID);
            return {
                status: 400,
                message: errMsg,
            };
        }


        logger.info(`Attempting to create row for ${organization} in ${dbORG} database`, txID);
        const cloudantRes = await cloudantHelper.createDocument(txID, null, orgDocs, dbORG);
        if (cloudantRes.ok) {
            const dbNames = [
                constants.DB_NAMES.REGISTER,
                constants.DB_NAMES.PROFILE,
                constants.DB_NAMES.STATS,
                constants.DB_NAMES.BATCH,
                constants.DB_NAMES.BATCH_QUEUE,
                constants.DB_NAMES.COS_INFO
            ];

            // create dbs which are required for data submission operations
            logger.info(`Attempting to create organization databases for ${organization}`, txID);
            const createDBOperations = [];
            for (let i = 0; i < dbNames.length; i += 1) {
                const dbName = prepareDbName(organization, dbNames[i]);
                createDBOperations.push(cloudantHelper.getOrCreateDB(txID, dbName));
            }
            await Promise.all(createDBOperations);

            // add indices to support queries
            logger.info(`Attempting to create query indices in databases for ${organization}`, txID);
            await createSubmissionIndex(txID, organization);
            await createBatchDBIndex(txID, organization);
            // 5 index creations exceeds the 5 global searches/sec for cloudant.
            // putting a sleep during index creation resolves the issue.
            await new Promise(resolve => setTimeout(resolve, 1000));
            await createBatchQueueDBIndex(txID, organization);
            await createCosInfoDBIndex(txID, organization);
            await createCosTimestampIndex(txID, organization)

            // create COS bucket if organization is NIH
            logger.info(`Attempting to create COS bucket for ${organization}`, txID);
            await cos.createBucket(txID, organization);

            return { status: 201, message: `Created organization ${organization} successfully` };
        }
        const errMsg = `Failed to create row for ${organization} in ${dbORG} database`;
        logger.error(errMsg, txID);
        return { status: 400, message: errMsg };
    } catch (error) {
        const message = `Error occurred creating organization: ${error.message}`;
        logger.error(message, txID);
        return { status: error.statusCode, message };
    }
};

const updateOrganization = async (txID, entityData, reqBody) => {
    const cloudantHelper = CloudantHelper.getInstance(txID);
    const dbOrg = constants.DB_NAMES.ORG;

    const orgDocs = reqBody;
    orgDocs._id = orgDocs.entity;
    orgDocs._rev = entityData._rev;
    const organization = orgDocs.entity;

    try {
        logger.info(`Attempting to update ${organization} in ${dbOrg} database`, txID);
        const cloudantRes = await cloudantHelper.updateDocument(txID, entityData._id, entityData._rev, orgDocs, dbOrg);
        if (cloudantRes.ok) {
            return { status: 200, message: 'Updated organization successfully' };
        }
        const errMsg = `Failed to update row for ${organization} in ${dbOrg} database`;
        logger.error(errMsg, txID);
        return { status: 400, message: errMsg };
    } catch (error) {
        const message = `Error occurred updating organization: ${error.message}`;
        logger.error(message, txID);
        return { status: error.statusCode, message };
    }
};

const patchOrganization = async (txID, entityData, reqBody) => {
    const cloudantHelper = CloudantHelper.getInstance(txID);
    const dbOrg = constants.DB_NAMES.ORG;

    const orgDocs = jsonpatch.applyPatch(entityData, reqBody.ops).newDocument;
    orgDocs._id = orgDocs.entity;
    orgDocs._rev = entityData._rev;
    const organization = orgDocs.entity;

    try {
        logger.info(`Attempting to patch ${organization} in ${dbOrg} database`, txID);
        const cloudantRes = await cloudantHelper.updateDocument(txID, entityData._id, entityData._rev, orgDocs, dbOrg);
        if (cloudantRes.ok) {
            return { status: 200, message: 'Patched organization successfully' };
        }
        const errMsg = `Failed to patch row for ${organization} in ${dbOrg} database`;
        logger.error(errMsg, txID);
        return { status: 400, message: errMsg };
    } catch (error) {
        const message = `Error occurred updating organization: ${error.message}`;
        logger.error(message, txID);
        return { status: error.statusCode, message };
    }
};

const deleteClients = async (txID, entity) => {
    logger.debug(`Attempting to delete clients for entity ${entity}`, txID);
    const cloudantHelper = CloudantHelper.getInstance(txID);
    const dbORG = constants.DB_NAMES.ORG;

    const clientDocs = await entityHelper.getAllEntityClients(txID, entity);
    for (let i = 0; i < clientDocs.length; i += 1) {
        try {
            logger.info(`Attempting to delete row for client ${clientDocs[i]._id} in ${dbORG} database`, txID);
            // eslint-disable-next-line no-await-in-loop
            const cloudantRes = await cloudantHelper.deleteDocument(
                txID,
                clientDocs[i]._id,
                clientDocs[i]._rev,
                dbORG
            );
            if (!cloudantRes || !cloudantRes.ok) {
                const errMsg = `Failed to delete row for client ${clientDocs[i]._id} in ${dbORG} database`;
                logger.error(`${errMsg}: ${cloudantRes}`, txID);
                return {
                    status: 500,
                    message: errMsg
                };
            }
        } catch (err) {
            const errMsg = `Error occurred deleting row for client ${clientDocs[i]._id} in ${dbORG} database`;
            logger.error(`${errMsg}: ${err}`, txID);
            return {
                status: err.statusCode,
                message: `${errMsg}: ${err.reason}`,
            };
        } 
    }
    
    return {
        status: 200
    };
}

const createConsentReceipt = async (
    txID, entityData, id, entityHelperName
) => {
    const existEntityHelpers = await entityHelper.existRegEntityHelpers(txID, entityHelperName);
    if (!existEntityHelpers) {
        const errMsg = `Invalid organization ${entityHelperName}, no entity helpers found`;
        logger.response(400, `Failed to retrieve consent receipt: ${errMsg}`, txID);
        return { status: 400, message: errMsg };
    }

    // eslint-disable-next-line global-require, import/no-dynamic-require
    const consentHelper = require(`../entities/${entityHelperName}/consent-helper`);
    const payload = await consentHelper.generateConsentReceipt(
        entityData, id, txID
    );
    return {
        status: 200,
        message: 'Sucessfully retrieved consent receipt',
        payload
    }
}

const createConsentRevoke = async (
    txID, entityData, id, entityHelperName
) => {
    const existEntityHelpers = await entityHelper.existRegEntityHelpers(txID, entityHelperName);
    if (!existEntityHelpers) {
        const errMsg = `Invalid organization ${entityHelperName}, no entity helpers found`;
        logger.response(400, `Failed to retrieve consent revoke: ${errMsg}`, txID);
        return { status: 400, message: errMsg };
    }

    // eslint-disable-next-line global-require, import/no-dynamic-require
    const consentHelper = require(`../entities/${entityHelperName}/consent-helper`);
    const payload = await consentHelper.generateConsentRevoke(
        entityData, id, txID
    );
    return {
        status: 200,
        message: 'Sucessfully retrieved consent revoke',
        payload
    }
}

// eslint-disable-next-line complexity, max-lines-per-function
const deleteOrganization = async (txID, req, token, entity, entityData) => {
    const cloudantHelper = CloudantHelper.getInstance(txID);
    const cos = cosHelper.getInstance(txID);
    const dbORG = constants.DB_NAMES.ORG;
    const dbProfile = prepareDbName(entity, constants.DB_NAMES.PROFILE);

    const offboardErrors = [];

    try {
        // Query all profiles in entity and delete corresponding Postbox links
        const queryParams = {
            selector: {},
        };
        let queriedDocs = {};
        try {
            queriedDocs = await cloudantHelper.queryDocuments(txID, queryParams, dbProfile);
            logger.debug(`Queried all profile docs for organization ${entity}`, txID);
        } catch (err) {
            const errMsg = `Error occurred querying profile docs for organization ${entity}`;
            logger.error(`${errMsg}: ${err}`, txID);
            offboardErrors.push({
                status: err.statusCode,
                message: `${errMsg}: ${err.reason}`,
            });
        }

        try {
            if (queriedDocs && queriedDocs.docs && queriedDocs.docs.length) {
                // Delete all links in postbox (one per profile)
                logger.info(
                    `Attempting to delete postbox links in ${queriedDocs.docs.length} profiles for ${entity}`,
                    txID
                );
                for (let i = 0; i < queriedDocs.docs.length; i += 1) {
                    const profile = queriedDocs.docs[i];
                    // Call dhp-postbox-api to delete links and all associated documents
                    // TODO delegate to profile-helper for cleanup
                    // eslint-disable-next-line no-await-in-loop
                    let postboxRes = await postboxHelper
                        .deleteLink(txID, token, profile.downloadLinkId, profile.downloadToken);
                    if (!postboxRes || postboxRes.status !== 200) {
                        const errMsg = `Failed to delete download Postbox link ${profile.downloadLinkId};`
                        logger.error(errMsg, txID);
                        offboardErrors.push({
                            status: postboxRes.status,
                            message: errMsg,
                        });
                    }

                    // Ignore generic holder linkID
                    if(profile.uploadLinkId === process.env.GENERIC_HOLDER_UPLOAD_LINKID){
                        logger.warn(`Ignoring generic holder linkID`, txID);
                        // eslint-disable-next-line no-continue
                        continue;
                    }

                    // eslint-disable-next-line no-await-in-loop
                    postboxRes = await postboxHelper
                        .deleteLink(txID, token, profile.uploadLinkId, profile.uploadToken);
                    if (!postboxRes || postboxRes.status !== 200) {
                        const errMsg = `Failed to delete upload Postbox link ${profile.uploadLinkId};`
                        logger.error(errMsg, txID);
                        offboardErrors.push({
                            status: postboxRes.status,
                            message: errMsg,
                        });
                    }
                }
            }
        } catch (err) {
            const errMsg = `Error occurred deleting Postbox links for entity ${entity}`;
            logger.error(`${errMsg}: ${err}`, txID);
            offboardErrors.push({
                status: err.statusCode,
                message: `${errMsg}: ${err.reason}`,
            });
        }

        // Delete all Cloudant DBs associated with entity
        const dbNames = [
            prepareDbName(entity, constants.DB_NAMES.STATS),
            prepareDbName(entity, constants.DB_NAMES.REGISTER),
            prepareDbName(entity, constants.DB_NAMES.BATCH),
            prepareDbName(entity, constants.DB_NAMES.BATCH_QUEUE),
            prepareDbName(entity, constants.DB_NAMES.COS_INFO),
            dbProfile,
        ];

        for (let i = 0; i < dbNames.length; i += 1) {
            try {
                logger.info(`Attempting to delete database for ${entity}: ${dbNames[i]}`, txID);
                // eslint-disable-next-line no-await-in-loop
                const result = await cloudantHelper.deleteDB(txID, dbNames[i]);
                if (!result || !result.ok) {
                    const errMsg = `Failed to delete database ${dbNames[i]}`;
                    logger.error(`${errMsg}: ${result}`, txID);
                    offboardErrors.push({
                        status: 500,
                        message: errMsg,
                    });
                }
            } catch (err) {
                const errMsg = `Error occurred deleting Cloudant database ${dbNames[i]}`;
                logger.error(`${errMsg}: ${err}`, txID);
                offboardErrors.push({
                    status: err.statusCode,
                    message: `${errMsg}: ${err.reason}`,
                });
            }
        }

        // Delete entity from Cloudant organization DB
        if (entityData && entityData._id && entityData._rev) {
            try {
                logger.info(`Attempting to delete row for ${entity} in ${dbORG} database`, txID);
                const cloudantRes = await cloudantHelper.deleteDocument(txID, entityData._id, entityData._rev, dbORG);
                if (!cloudantRes || !cloudantRes.ok) {
                    const errMsg = `Failed to delete row for ${entity} in ${dbORG} database`;
                    logger.error(`${errMsg}: ${cloudantRes}`, txID);
                    offboardErrors.push({
                        status: 500,
                        message: errMsg,
                    });
                }
            } catch (err) {
                const errMsg = `Error occurred deleting row for ${entity} in ${dbORG} database`;
                logger.error(`${errMsg}: ${err}`, txID);
                offboardErrors.push({
                    status: err.statusCode,
                    message: `${errMsg}: ${err.reason}`,
                });
            }
        }

        // Delete all clients for entity
        const deleteClientsRes = await deleteClients(txID, entity);
        if (deleteClientsRes.status !== 200) {
            offboardErrors.push({
                status: deleteClientsRes.status,
                message: deleteClientsRes.message,
            });
        }

        // Delete COS bucket associated with NIH
        try {
            // No reason for try-catch block for each operation because if you can't delete all files,
            // you can't delete bucket
            logger.info(`Attempting to delete all bucket entries for ${entity}`, txID);
            await cos.deleteAllFiles(txID, entity);
            logger.info(`Attempting to delete bucket for ${entity}`, txID);
            await cos.deleteBucket(txID, entity);
        } catch (err) {
            const errMsg = `Error occurred deleting COS bucket or contents for ${entity}: ${err.message}`;
            logger.error(errMsg, txID);
            offboardErrors.push({
                status: err.statusCode,
                message: errMsg,
            });
        }

        // remove organization AppID scopes and roles
        try {
            await offboardOrgAppID(txID, req, entity, entityData);
        } catch (err) {
            const errMsg = `Error occurred removing AppID scopes and roles for ${entity}: ${err.message}`;
            logger.error(errMsg, txID);
            offboardErrors.push({
                status: err.statusCode,
                message: errMsg,
            });
        }

        if (offboardErrors.length) {
            const errMsg = `Failed to completely offboard organization ${entity} successfully`;
            logger.error(errMsg, txID);
            return {
                status: 400,
                message: errMsg,
                payload: offboardErrors,
            };
        }

        return { status: 200, message: `Deleted organization ${entity} successfully` };
    } catch (error) {
        const errMsg = `Error occurred deleting organization ${entity}: ${error.message}`;
        logger.error(errMsg, txID);
        return { status: error.statusCode, message: errMsg };
    }
};

module.exports = {
    createOrganization,
    updateOrganization,
    createConsentReceipt,
    createConsentRevoke,
    deleteOrganization,
    patchOrganization,
};
