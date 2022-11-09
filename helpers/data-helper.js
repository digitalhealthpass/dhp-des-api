/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 */


const moment = require('moment');

const { CredentialVerifierBuilder, VerificationResult } = require('dhp-verify-nodejs-lib');
const constants = require('./constants');
const CloudantHelper = require('./cloudantHelper');
const IbmSelfAttestedCredentialVerifier = require('../verifier-plugins/ibm-self-attested-verifier');
const IbmIdVerifier = require('../verifier-plugins/ibm-id-verifier');
const Logger = require('../config/logger');
const utils = require('../utils/index');
const postboxHelper = require('./postbox-helper')

const logger = new Logger('data-helper');

const builders = new Map();

const getCredentialType = (cred, defaultType = 'unknown') => {
    return cred.credentialSubject && cred.credentialSubject.type ? cred.credentialSubject.type : defaultType;
};

const verifyConsentReceipt = (consent, txID) => {
    // TODO: What exactly is needed to verify consent receipt?
    // Right now, it's 8-weeks-ago < consentTimestamp < right-now
    // Future: Make sure private key is valid using public key
    const momentConsent = moment.unix(consent.consentTimestamp);
    // 5 seconds buffer for validating consent
    const momentCurrent = moment().add(5, 'seconds')
    let momentExpiration = moment(momentConsent);
    momentExpiration = momentExpiration.add(8, 'weeks');

    if (moment(momentCurrent).isBefore(momentConsent)) {
        logger.warn('Found futuristic consent receipt, ignoring', txID);
    } else if (moment(momentExpiration).isBefore(momentCurrent)) {
        logger.warn('Found ancient consent receipt, ignoring', txID);
    } else {
        return true;
    }
    return false;
};

const validateReportDates = (start, end, shift) => {
    const isStartValid = moment(start, 'YYYY-MM-DD', true).isValid();
    const isEndValid = moment(end, 'YYYY-MM-DD', true).isValid();

    if (!(isStartValid && isEndValid)) {
        return 'Dates in query must be valid and in the form of YYYY-MM-DD';
    }

    if (moment(start).isAfter(end)) {
        return 'Start date cannot be later than end date';
    }

    const shiftNumber = Number(shift);
    if (Number.isNaN(shiftNumber)) {
        return 'Offset must be a number';
    }

    return '';
};

const buildReportCloudantQuery = (start, end, shift) => {
    // shift is getTimezoneOffset() in minutes (300 for New York, -300 for Pakistan), NOT
    // GMC offset, so need to add it to query to get correct DB entries for local time
    const startDate = moment
        .utc(start)
        .add(shift, 'minutes')
        .toISOString();
    const endDate = moment
        .utc(end)
        .endOf('day')
        .add(shift, 'minutes')
        .toISOString();

    return {
        selector: {
            submissionTimestamp: {
                $gte: startDate,
                $lte: endDate,
            },
        },
        fields: ['credType', 'submissionID', 'submissionTimestamp'],
        sort: [{ submissionTimestamp: 'asc' }, { submissionID: 'asc' }],
    };
};

/*
 * sample stats report
 * {
 *     "types": [
 *         "surveyCredentials",
 *         "tempCredentials",
 *         "testCredentials",
 *         "healthpassCredentials",
 *         "totalSubmissions",
 *         "totalCredentials",
 *     ],
 *     "data": {
 *         "2020-10-24": {
 *             "tempCredentials": 1,
 *             "surveyCredentials": 1,
 *             "testCredentials": 1,
 *             "healthpassCredentials": 1,
 *             "totalCredentials": 4,
 *             "totalSubmissions": 4,
 *         }
 *     },
 *     "averages": {
 *         "tempCredentials": 1,
 *         "surveyCredentials": 1,
 *         "testCredentials": 1,
 *         "healthpassCredentials": 1,
 *         "totalCredentials": 4,
 *         "totalSubmissions": 4,
 *     }
 * }
 */
const buildReport = (docs, shift) => {
    const data = {};
    const submissionIDs = [];
    const types = ['totalSubmissions', 'totalCredentials'];

    // Cloudant docs returned by the query should be sorted on [submissionTimestamp, submissionID]
    docs.forEach((doc) => {
        // shift is getTimezoneOffset() in minutes (300 for New York, -300 for Pakistan), NOT
        // GMC offset, so need to subtract it from DB timestamp to get local time
        const shiftedTimestamp = moment
            .utc(doc.submissionTimestamp)
            .subtract(shift, 'minutes')
            .toISOString();

        // currently, dates are the keys of the data body
        // first 10 chars of timestamp -> yyyy-mm-dd
        const d = shiftedTimestamp.substring(0, 10);
        if (!(d in data)) {
            data[d] = {
                totalSubmissions: 0,
                totalCredentials: 0,
            };
        }

        // count credentialTypes
        const type = `${doc.credType.toLowerCase()}Credentials`;
        if (type in data[d]) {
            data[d][type] += 1;
        } else {
            if (!types.includes(type)) {
                types.push(type);
            }

            data[d][type] = 1;
        }

        if (!submissionIDs.includes(doc.submissionID)) {
            submissionIDs.push(doc.submissionID);
            data[d].totalSubmissions += 1;
        }

        data[d].totalCredentials += 1;
    });

    const averages = {};
    const len = Object.keys(data).length;
    types.forEach((type) => {
        let total = 0;
        Object.values(data).forEach((stats) => {
            if (!(type in stats)) {
                // eslint-disable-next-line no-param-reassign
                stats[type] = 0;
            }

            total += stats[type];
        });

        averages[type] = total / len;
    });

    return {
        types,
        data,
        averages,
    };
};

const getAllOrgs = async (txID) => {
    const cloudantHelper = CloudantHelper.getInstance(txID);
    const dbName = constants.DB_NAMES.ORG;

    logger.debug(`Attempting to retrieve mappers from ${dbName} database`, txID);

    const query = {
        selector: {
            _id: {
                $gt: null
            }
        }
    };

    const response = await cloudantHelper.queryDocuments(txID, query, dbName);
    return response.docs;
};

const initVerifierBuilderHandler = async (entityData) => {
    const verifierBuilder = new CredentialVerifierBuilder()
        .setAdditionalPlugins([IbmSelfAttestedCredentialVerifier, IbmIdVerifier])
        .setDisabledPlugins([
            'divoc-verifier',
        ]).setVerifierCredential({
            id: 'DES',
            entityId: entityData.entity,
            credentialSubject: {
                useAppId: true,
                configId: entityData.verifierConfigId || process.env.VERIFIER_CONFIG_ID,
                organizationId: entityData.verifierOrgId || entityData.entity,
                customerId: entityData.verifierCustId,
            }
        });
    const initResponse = await verifierBuilder.init();
    if (!initResponse.success) {
        return initResponse;
    }
    return new VerificationResult(true, verifierBuilder);
}

const getBuilder = async (entityData) => {
    if (builders.has(entityData.entity)) {
        return new VerificationResult(true, builders.get(entityData.entity));
    }

    const initResponse = await initVerifierBuilderHandler(entityData);
    if (!initResponse.success) {
        return initResponse;
    }

    const builder = initResponse.message;
    const cred = builder.getParams().getVerifierCredential();
    const id = cred.entityId;

    builders.set(id, builder);

    return initResponse;
}


const validateDocSignature = async (validationParams, txID, token, profileData, entityData) => {
    const builderResp = await getBuilder(entityData);
    if (!builderResp.success) {
        return builderResp;
    }
    const verifierBuilder = builderResp.message;

    const { documentId, linkId, publicKeyType, publicKey } = validationParams
    const downloadResp = await postboxHelper.downloadDocumentSafe(
        txID, token, documentId, linkId, profileData.uploadToken);
    if (!downloadResp || downloadResp.status !== 200) {
        const message = `document ${documentId} not found`;
        logger.error(message, txID)
        return { success: false, message }
    }
    const postboxData = downloadResp.data.payload.content;
    logger.debug(`Attempting to decrypt payload content of document ${documentId}`, txID);
    const decryptedPostboxData = utils.decrypt(
        Buffer.from(postboxData, 'base64'),
        Buffer.from(profileData.symmetricKey.value, 'base64'),
        Buffer.from(profileData.symmetricKey.iv, 'base64'),
        profileData.symmetricKey.algorithm,
        txID
    );
    if (!decryptedPostboxData || decryptedPostboxData === "") {
        const message = "PostboxData data is missing"
        logger.error(message, txID)
        throw new Error(message)
    }
    const docForVerification = JSON.parse(decryptedPostboxData);

    const result = await verifierBuilder
        .setCredential(docForVerification)
        .setExtras({
            publicKey,
            publicKeyType
        })
        .build()
        .verify();

    result.data = decryptedPostboxData;
    return result
}

const verifyCredential = async (credential, entityData) => {
    const builderResp = await getBuilder(entityData);
    if (!builderResp.success) {
        return builderResp;
    }
    const verifierBuilder = builderResp.message;

    return verifierBuilder
        .setCredential(credential)
        .setReturnCredential(true)
        .setReturnMetadata(true)
        .build()
        .verify();
};

const verifySelfAttestedCredential = async (publicKey, publicKeyType, credential, entityData) => {
    const builderResp = await getBuilder(entityData);
    if (!builderResp.success) {
        return builderResp;
    }
    const verifierBuilder = builderResp.message;

    return verifierBuilder
        .setCredential(credential)
        .setReturnCredential(false)
        .setReturnMetadata(true)
        .setExtras({
            publicKey,
            publicKeyType
        })
        .build()
        .verify();
};

const initVerifierBuilder = async () => {
    const orgs = await getAllOrgs();

    // eslint-disable-next-line no-restricted-syntax
    for (const org of orgs) {
        if (org.verifierConfigId && org.verifierOrgId) {
            logger.info(`Loading verifier config id ${org.verifierConfigId} for org ${org.entity}`);
            // eslint-disable-next-line no-await-in-loop
            const resp = await initVerifierBuilderHandler(org);
            if (!resp.success) {
                return resp;
            }
            const builder = resp.message;

            const cred = builder.getParams().getVerifierCredential();
            const id = cred.entityId;

            builders.set(id, builder);
        }
    }

    return new VerificationResult(true, 'OK');
}

module.exports = {
    verifyCredential,
    verifySelfAttestedCredential,
    getCredentialType,
    verifyConsentReceipt,
    validateReportDates,
    buildReportCloudantQuery,
    buildReport,
    validateDocSignature,
    initVerifierBuilder
};
