/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 */

// TODO: refactor exported functions so we don't need to disable this rule
/* eslint-disable consistent-return */

const constants = require('../helpers/constants');
const entityHelper = require('../entities');
const onboardingHelper = require('../helpers/onboarding-helper');
const profileHelper = require('../helpers/profile-helper');
const dataHelper = require('../helpers/data-helper');
const CosHelper = require('../helpers/cos-helper');
const registerCodeHelper = require('../helpers/register-code-helper');
const { deleteDocument } = require('../helpers/postbox-helper');
const CloudantHelper = require('../helpers/cloudantHelper');
const { logAndSendErrorResponse, validateReqBody } = require('../utils/index');

const Logger = require('../config/logger');

const logger = new Logger('onboarding-controller');

// eslint-disable-next-line
const onboardHolder = async (txID, req, res) => {
    logger.debug('onboardHolder()', txID);

    try {
        // TODO: req.params.entity is deprecated and needs to be removed eventually
        const entity = req.body.organization || req.params.entity;
        if (!entity) {
            return {
                status: 400,
                message: 'Must specify organization in request body'
            }
        }

        // entity specifies which registration fields are required of its holders
        const regEntity = entity.toLowerCase();
        const regEntityData = await entityHelper.getRegEntity(txID, regEntity);
        if (!regEntityData) {
            return {
                status: 400,
                message: `Invalid organization ${regEntity}, no configuration found`
            }
        }

        const entityHelperName = regEntityData.entityType || regEntity;

        // Make sure entity has id helper ('{entity}-id-helper')
        const existEntityHelpers = await entityHelper.existRegEntityHelpers(txID, entityHelperName);
        if (!existEntityHelpers) {
            return {
                status: 400,
                message: `Invalid organization ${regEntity}, no entity helpers found`
            }
        }

        // validate registrationCode first
        if (req.body.registrationCode) {
            // get holder registration data from "register" database
            const readRes = await registerCodeHelper.readCodeDoc(txID, entity, req.body.registrationCode);
            if (readRes.status !== 200) {
                const errMsg = `Registration code not found: ${readRes.message}`;
                logger.response(readRes.status, `Failed to submit : ${errMsg}`, txID);
                return res.status(readRes.status).json({
                    error: {
                        message: errMsg
                    }
                });
            }

            const regData = readRes.data;
            let verificationData = null;
            if (regEntityData.userRegistrationConfig.flow.mfaAuth) {
                if (!regData.verificationCode) {
                    const errMsg = `Verification code is not validated`;
                    logger.response(400, `Failed to submit : ${errMsg}`, txID);
                    return res.status(400).json({
                        error: {
                            message: errMsg,
                        },
                    });
                }

                const verificationRes = await registerCodeHelper.readCodeDoc(txID,
                    entity, String(regData.verificationCode));
                if (verificationRes.status !== 200) {
                    const errMsg = `Verification code not found: ${verificationRes.message}`;
                    logger.response(verificationRes.status, `Failed to submit : ${errMsg}`, txID);
                    return res.status(verificationRes.status).json({
                        error: {
                            message: errMsg
                        }
                    });
                }

                verificationData = verificationRes.data
                if (verificationData.verificationStatus !== registerCodeHelper.CODE_STATUS.USED) {
                    const errMsg = `Verification code is not validated`;
                    logger.response(400, `Failed to submit : ${errMsg}`, txID);
                    return res.status(400).json({
                        error: {
                            message: errMsg,
                        },
                    });
                }
            }
            req.body = {
                ...req.body,
                ...regData,
            }
        } else {
            // if no public key, raise error
            const errMsg = "No registrationCode in request";
            logger.response(400, `Failed to submit: ${errMsg}`, txID);
            return res.status(400).json({
                error: {
                    message: errMsg
                },
            });
        }

        // eslint-disable-next-line global-require, import/no-dynamic-require
        const entityIdHelper = require(`../entities/${entityHelperName}/id-helper`);
        const { holderIDField } = entityIdHelper;

        const holderID = entityIdHelper.getHolderID(req.body);
        if (!holderID) {
            // if no public key, raise error
            const errMsg = "No ID(public key) in request";
            logger.response(400, `Failed to submit: ${errMsg}`, txID);
            return res.status(400).json({
                error: {
                    message: errMsg
                },
            });
        }

        const registrationFields = constants.USER_REGISTRATION_FIELDS.REQUIRED;

        // get required fields from data validator
        // eslint-disable-next-line global-require, import/no-dynamic-require
        const dataValidator = require(`../entities/${entityHelperName}/data-validator`);
        const reqFields = registrationFields.concat(dataValidator.getRequiredFields(regEntityData));
        reqFields.push(holderIDField);
        if (!req.body.id) {
            req.body.id = holderID;
        }

        const errMsg = validateReqBody(txID, req.body, reqFields);
        if (errMsg) {
            return {
                status: 400,
                message: errMsg
            }
        };

        logger.debug(`Attempting to register holder ${holderID} in ${regEntity} organization`, txID);
        const resBody = await onboardingHelper.registerHolder(
            txID,
            req,
            regEntity,
            regEntityData,
            holderIDField,
            holderID
        );
        return resBody;
    } catch (err) {
        return logAndSendErrorResponse(txID, res, err, 'onboardHolder');
    }
};

// Note: extra export needed to onboard holder during mfa flow
exports.onboardHolder = onboardHolder;

// Entry point for POST /onboarding/{entity}
exports.onboard = async (req, res) => {
    const txID = req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID];
    const resBody = await onboardHolder(txID, req, res);

    if (resBody.status === 200) {
        const successMsg = 'Successfully onboarded user';
        logger.response(200, successMsg, txID);
        return res.status(200).json({
            message: successMsg,
            payload: resBody.payload,
        });
    }

    logger.response(resBody.status, `Failed to onboard user: ${resBody.message}`, txID);
    return res.status(resBody.status).json({
        error: {
            message: resBody.message
        }
    })
};

// A valid registration code is one that exists in database, has not yet expired, and has not yet been used
const validateRegistrationCode = async (txID, req, res, regEntity, regCode) => {
    logger.info('Entering GET /onboarding/validatecode controller', txID);

    try {
        const regEntityData = await entityHelper.getRegEntity(txID, regEntity);
        if (!regEntityData) {
            const errMsg = `Invalid entity: ${regEntity}`;
            logger.response(400, `Failed to validate registration code: ${errMsg}`, txID);
            return res.status(400).json({
                error: {
                    message: errMsg,
                },
            });
        }

        logger.debug(`Attempting to validate registration code ${regCode}`, txID);
        const validation = await registerCodeHelper.validateCodeDoc(txID, req, regEntity, regCode);
        if (validation.status === 200) {
            const successMsg = `Registration code is valid for use`;
            logger.response(200, successMsg, txID);
            return res.status(200).json({
                message: successMsg,
            });
        }

        logger.response(400, `Failed to validate registration code: ${validation.message}`, txID);
        return res.status(400).json({
            error: {
                message: validation.message,
            },
        });
    } catch (err) {
        return logAndSendErrorResponse(txID, res, err, 'validateRegistrationCode');
    }
};

// Entry point for GET /onboarding/{entity}/validatecode/{code}
exports.validateCode = async (req, res) => {
    const txID = req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID];
    // TODO: req.params.entity is deprecated and needs to be removed eventually
    const entity = req.body.organization || req.params.entity;
    if (!entity) {
        const errMsg = `Must specify organization in request body`;
        logger.response(400, `Failed to validate code: ${errMsg}`, txID);
        return res.status(400).json({ error: { message: errMsg } });
    }

    const regEntity = entity.toLowerCase();
    const regCode = req.params.code;

    await validateRegistrationCode(txID, req, res, regEntity, regCode);
};

// A valid holder ID is one that does NOT exist in database
const validateHolderID = async (txID, req, res, regEntity, holderID) => {
    logger.info('Entering GET /onboarding/validatekey controller', txID);

    try {
        const regEntityData = await entityHelper.getRegEntity(txID, regEntity);
        if (!regEntityData) {
            const errMsg = `Invalid entity: ${regEntity}`;
            logger.response(400, `Failed to validate holder ID: ${errMsg}`, txID);
            return res.status(400).json({
                error: {
                    message: errMsg,
                },
            });
        }

        if (holderID == null || holderID.length === 0) {
            const errMsg = `Missing or invalid header: ${constants.REQUEST_HEADERS.DATASUBMISSION_KEY}`;
            logger.response(400, `Failed to validate holder ID: ${errMsg}`, txID);
            return res.status(400).json({
                error: {
                    message: errMsg,
                },
            });
        }

        logger.debug(`Attempting to check if a profile for holder ${holderID} already exists`, txID);
        const exists = await profileHelper.existProfile(txID, req, regEntity, holderID);
        if (!exists) {
            const successMsg = `Holder ID ${holderID} is valid for use`;
            logger.response(200, successMsg, txID);
            return res.status(200).json({
                message: successMsg,
            });
        }

        const errMsg = `Holder ID ${holderID} has already been onboarded`;
        logger.response(400, `Failed to validate holder ID: ${errMsg}`, txID);
        return res.status(400).json({
            error: {
                message: errMsg,
            },
        });
    } catch (err) {
        return logAndSendErrorResponse(txID, res, err, 'validateHolderID');
    }
};

// Entry point for GET /onboarding/{entity}/validatekey
exports.validateKey = async (req, res) => {
    const txID = req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID];
    // TODO: req.params.entity is deprecated and needs to be removed eventually
    const entity = req.body.organization || req.params.entity;
    if (!entity) {
        const errMsg = `Must specify organization in request body`;
        logger.response(400, `Failed to validate key: ${errMsg}`, txID);
        return res.status(400).json({ error: { message: errMsg } });
    }

    const regEntity = entity.toLowerCase();
    const holderID = req.headers[constants.REQUEST_HEADERS.DATASUBMISSION_KEY];

    await validateHolderID(txID, req, res, regEntity, holderID);
};

// Delete Postbox link associated with user and user's profile in Cloudant
const deleteUserRegistration = async (txID, req, res, token, regEntity, holderID, profileData) => {
    logger.info('Entering DELETE /onboarding controller', txID);

    try {
        // Get entity data
        const regEntityData = await entityHelper.getRegEntity(txID, regEntity);
        if (!regEntityData) {
            const errMsg = `Invalid entity: ${regEntity}`;
            logger.response(400, `Failed to offboard holder: ${errMsg}`, txID);
            return res.status(400).json({
                error: {
                    message: errMsg,
                },
            });
        }

        // Make sure key passed in header
        if (holderID == null || holderID.length === 0) {
            const errMsg = `Missing or invalid header: ${constants.REQUEST_HEADERS.DATASUBMISSION_KEY}`;
            logger.response(400, `Failed to offboard holder: ${errMsg}`, txID);
            return res.status(400).json({
                error: {
                    message: errMsg,
                },
            });
        }

        logger.debug(`Attempting to offboard holder ${holderID} from ${regEntity} organization`, txID);
        const resBody = await onboardingHelper.deleteRegistration(
            txID, req, token, regEntityData, profileData, holderID
        );
        if (resBody.status !== 200) {
            logger.response(resBody.status, `Failed to offboard holder ${holderID}: ${resBody.message}`, txID);
        } else {
            logger.response(resBody.status, `Successfully offboarded holder ${holderID}`, txID);
        }
        return res.status(resBody.status).json({
            message: resBody.message,
        });
    } catch (err) {
        return logAndSendErrorResponse(txID, res, err, 'deleteUserRegistration');
    }
};

// Entry point for DELETE /onboarding/{entity}
// eslint-disable-next-line complexity
exports.deleteRegistration = async (req, res) => {
    const txID = req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID];
    const token = req.headers.authorization;
    const cosHelper = CosHelper.getInstance(txID)
    // TODO: req.params.entity is deprecated and needs to be removed eventually
    const entity = req.body.organization || req.params.entity;
    if (!entity) {

        const errMsg = `Must specify organization in request body`;
        logger.response(400, `Failed to offboard holder: ${errMsg}`, txID);
        return res.status(400).json({ error: { message: errMsg } });
    }
    const regEntity = entity.toLowerCase();
    const validationParams = {
        documentId: req.headers[constants.REQUEST_HEADERS.DOCUMENT_ID],
        linkId: req.headers[constants.REQUEST_HEADERS.LINK_ID],
        organization: regEntity,
        publicKeyType: req.headers[constants.REQUEST_HEADERS.PUBLIC_KEY_TYPE],
        publicKey: req.headers[constants.REQUEST_HEADERS.DATASUBMISSION_KEY]
    }
    const holderID = req.headers[constants.REQUEST_HEADERS.DATASUBMISSION_KEY];
    // Get user profile data
    const query = await profileHelper.getProfileDoc(txID, req, regEntity, holderID);
    if (query.status !== 200) {
        const errMsg = `Invalid holder ID ${holderID}: ${query.message}`;
        logger.response(query.status, `Failed to offboard holder: ${errMsg}`, txID);
        return res.status(query.status).json({
            error: {
                message: errMsg,
            },
        });
    }
    const profileData = query.data;
    if (validationParams.documentId) {
        try {
            const regEntity = entity.toLowerCase();
            const regEntityData = await entityHelper.getRegEntity(txID, regEntity);
            if (!regEntityData) {
                const errMsg = `Invalid entity: ${regEntity}`;
                logger.response(400, `Failed to offboard holder: ${errMsg}`, txID);
                return res.status(400).json({ error: { message: errMsg } });
            }

            const result = await dataHelper.validateDocSignature(
                validationParams, txID, token, profileData, regEntityData
            );
            if (result && result.success === false) {
                logger.warn(result.message);
                return res.status(400).json(
                    { message: `Failed to offboard holder. No valid consent receipt found: ${result.message} ` }
                );
            }
            await cosHelper.createFile(txID, regEntity, `${txID}.json`, JSON.parse(result.data));
        } catch (e) {
            return logAndSendErrorResponse(txID, res, e, 'deleteRegistration');
        }
        try {
            const response = await deleteDocument(txID, token, validationParams.documentId, profileData.uploadToken);
            if (!response || response.status !== 200) {
                logger.error(`Unable to delete document: ${validationParams.documentId}`, response.data);
            }
        } catch (e) {
            logger.error(`Unable to delete document: ${validationParams.documentId}`, e);
        }
        try {
            const dbName = `${regEntity}-${constants.DB_NAMES.COS_INFO}`;
            const cloudantHelper = CloudantHelper.getInstance(txID)
            const cosInfoQuery = {
                selector: { holder_id: holderID },
                fields: ['_id', '_rev'],
            };

            logger.debug(`deleteRegistration: attempt to get user documents from db ${dbName}`, txID)
            const response = await cloudantHelper.queryDocuments(txID, cosInfoQuery, dbName)
            if (response.docs && response.docs.length) {
                logger.debug(`deleteRegistration: attempt to delete documents`, txID)
                await Promise.all(response.docs.map((doc) => cosHelper.deleteFile(txID, regEntity, doc._id)))
            }
        } catch (e) {
            logger.error(`Unable to Delete Files and Documents ${e}`)
        }
    }
    return deleteUserRegistration(txID, req, res, token, regEntity, holderID, profileData);
};

const inValidHolderId = async (entityIdHelper, holdersGroup) => {
    const inValidStatus = holdersGroup.some((holderBody) => {
        const validStatus = entityIdHelper.validateHolderID(holderBody);
        if (!validStatus) {
            return true;
        }
        return false;
    })
    return inValidStatus
};

const validateHolderStatus = async (txID, req, res, regEntity, holderID) => {
    logger.info('Entering GET /onboarding/holderstatus controller', txID);
    logger.debug(`Attempting to check if a profile for holder ${holderID} already exists`, txID);
    const exists = await profileHelper.existProfile(txID, req, regEntity, holderID);
    return {
        id: holderID,
        onboarded: exists
    }
};

// eslint-disable-next-line complexity
exports.validateHoldersOnboardStatus = async (req, res) => {
    const entity = req.body.organization;
    const holdersGroup = req.body.holders;
    const txID = req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID];

    if (!entity) {
        const errMsg = `Must specify organization in request body`;
        logger.response(400, `Failed to validate holders status: ${errMsg}`, txID);
        return res.status(400).json({ error: { message: errMsg } });
    }

    if (!holdersGroup || !(holdersGroup instanceof Array) || holdersGroup.length === 0) {
        const errMsg = `Must specify holders in request body`;
        logger.response(400, `Failed to validate holders status: ${errMsg}`, txID);
        return res.status(400).json({ error: { message: errMsg } });
    }

    const regEntity = entity.toLowerCase();
    const regEntityData = await entityHelper.getRegEntity(txID, regEntity);
    if (!regEntityData) {
        const errMsg = `Invalid entity: ${regEntity}`;
        logger.response(400, `Failed to validate holder status: ${errMsg}`, txID);
        return res.status(400).json({ error: { message: errMsg } });
    }

    const entityHelperName = regEntityData.entityType || regEntity;

    // Make sure entity has id helper ('{entity}-id-helper')
    const existEntityHelpers = await entityHelper.existRegEntityHelpers(txID, entityHelperName);
    if (!existEntityHelpers) {
        const errMsg = `Invalid organization ${regEntity}, no entity helpers found`;
        logger.response(400, `Failed to validate holder status: ${errMsg}`, txID);
        return res.status(400).json({ error: { message: errMsg } });
    }
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const entityIdHelper = require(`../entities/${entityHelperName}/id-helper`);

    const inValidHolderID = await inValidHolderId(entityIdHelper, holdersGroup);
    if (inValidHolderID) {
        const errMsg = `Invalid holderId in holders: ${JSON.stringify(holdersGroup)}`;
        logger.response(400, `Failed to validate holder status: ${errMsg}`, txID);
        return res.status(400).json({ error: { message: errMsg } });
    }

    try {
        const validateGroup = await Promise.all(holdersGroup.map(async (ele) => {
            const holderID = entityIdHelper.getHolderID(ele);
            const holderStatus = await validateHolderStatus(txID, req, res, regEntity, holderID);
            return holderStatus;
        })).catch((err) => {
            return res.status(400).json({
                error: {
                    message: err,
                },
            });
        });
        return res.status(200).json(validateGroup);
    } catch (error) {
        return logAndSendErrorResponse(txID, res, error, 'validateHolderID');
    }
}

// eslint-disable-next-line complexity
exports.createUserCredential = async (req, res) => {
    const txID = req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID];
    const token = req.headers.authorization;

    try {
        const entity = req.body.organization;
        if (!entity) {
            return res.status(400).json({
                error: {
                    message: 'Must specify organization in request body',
                },
            });
        }

        // entity specifies which registration fields are required of its holders
        const regEntity = entity.toLowerCase();

        const regEntityData = await entityHelper.getRegEntity(txID, regEntity);
        if (!regEntityData) {
            return res.status(400).json({
                error: {
                    message: `Invalid organization ${regEntity}, no configuration found`,
                },
            });
        }

        const entityHelperName = regEntityData.entityType || regEntity;

        // Make sure entity has id helper ('{entity}-id-helper')
        const existEntityHelpers = await entityHelper.existRegEntityHelpers(txID, entityHelperName);
        if (!existEntityHelpers) {
            return res.status(400).json({
                error: {
                    message: `Invalid organization ${regEntity}, no entity helpers found`,
                },
            });
        }

        // eslint-disable-next-line global-require, import/no-dynamic-require
        const entityIdHelper = require(`../entities/${entityHelperName}/id-helper`);
        const { holderIDField } = entityIdHelper;

        const holderID = entityIdHelper.getHolderID(req.body);
        if (!holderID) {
            // if no public key, raise error
            const errMsg = "No ID(public key) in request";
            logger.response(400, `Failed to create holder credential: ${errMsg}`, txID);
            return res.status(400).json({
                error: {
                    message: errMsg
                },
            });
        }

        const registrationFields = constants.USER_REGISTRATION_FIELDS.REQUIRED;

        // get required fields from data validator
        // eslint-disable-next-line global-require, import/no-dynamic-require
        const dataValidator = require(`../entities/${entityHelperName}/data-validator`);
        const reqFields = registrationFields.concat(dataValidator.getRequiredFields(regEntityData));
        reqFields.push(holderIDField);
        if (!req.body.id) {
            req.body.id = holderID;
        }

        const errMsg = validateReqBody(txID, req.body, reqFields);
        if (errMsg) {
            return res.status(400).json({
                error: {
                    message: errMsg,
                },
            });
        };

        const userCredential = await onboardingHelper.createUserCredential(
            txID, token, req.body, entity, regEntityData
        );

        // Remove Registration CodeDoc to reflect code is used
        const update = await registerCodeHelper.deleteRegCodeRelatedDocs(txID, entity, req.body.registrationCode);
        if (update.status !== 200) {
            logger.error(`Failed to update registration code ${req.body.registrationCode} status to used`, txID);
            logger.info(`Attempting to roll back and delete profile doc for ${holderID}`, txID);
            const error = { response: { status: update.status, data: update.message } };
            throw error;
        }

        return res.status(200).json({
            message: 'Successfully created holder credential',
            payload: userCredential.data.payload,
        });

    } catch (err) {
        return logAndSendErrorResponse(txID, res, err, 'createUserCredential');
    }
}

// eslint-disable-next-line complexity
exports.getHoldersOnboard = async (req, res) => {
    const txID = req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID];
    try {
        const entity = req.body.organization;
        if (!entity) {
            return res.status(400).json({
                error: {
                    message: 'Must specify organization in request body',
                },
            });
        }

        // entity specifies which registration fields are required of its holders
        const regEntity = entity.toLowerCase();

        const regEntityData = await entityHelper.getRegEntity(txID, regEntity);
        if (!regEntityData) {
            return res.status(400).json({
                error: {
                    message: `Invalid organization ${regEntity}, no configuration found`,
                },
            });
        }

        // Get user profile data
        const query = await profileHelper.getAllProfileDocs(txID, req, regEntity);
        if (query.status !== 200) {
            const errMsg = `Unable to fetch all holders: ${query.message}`;
            logger.response(query.status, `Failed to fetch all holders: ${errMsg}`, txID);
            return res.status(query.status).json({
                error: {
                    message: errMsg,
                },
            });
        }
        return res.status(200).json({
            payload: query.data,
        });

    } catch (err) {
        return logAndSendErrorResponse(txID, res, err, 'getHoldersOnboard');
    }
}