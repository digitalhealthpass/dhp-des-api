/* eslint-disable complexity */
/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 */

const constants = require('../helpers/constants');
const entityHelper = require('../entities');
const onboardingHelper = require('../helpers/onboarding-helper');
const profileHelper = require('../helpers/profile-helper');
const { logAndSendErrorResponse } = require('../utils/index');

const Logger = require('../config/logger');

const logger = new Logger('generic-onboarding-controller');

const genericHolderOnboard = async (txID, req, res) => {
    logger.debug('genericHolderOnboard()', txID);

    try {
        const entity = req.body.organization;
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

        logger.debug(`Attempting to register generic holder ${holderID} in ${regEntity} organization`, txID);
        const resBody = await onboardingHelper.registerHolder(
            txID,
            req,
            regEntity,
            regEntityData,
            holderIDField,
            holderID,
            true // is generic holder onboard
        );
        return resBody;
    } catch (err) {
        return logAndSendErrorResponse(txID, res, err, 'genericHolderOnboard');
    }
};

exports.updateHolder = async (req, res) => {

    const txID = req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID];
    logger.info('Entering PUT /generic/holder controller', txID);

    // Make sure entity is defined in input
    if (!req.body || !req.body.organization || req.body.organization.length === 0) {
        return res.status(400).json({
            error: {
                message: 'Missing organization',
            },
        });
    }
    const entity = req.body.organization.toLowerCase();

    const regEntityData = await entityHelper.getRegEntity(txID, entity);
    if (!regEntityData) {
        return res.status(400).json({
            error: {
                message: `Invalid organization ${entity}, no configuration found`,
            },
        });
    }

    try {
        const publicKey = process.env.GENERIC_HOLDER_ID;
        const symmetricKeyAlgorithm = process.env.SYMMETRIC_KEY_ALGORITHM;
        const symmetricKeyIV = process.env.SYMMETRIC_KEY_IV;
        const symmetricKeyValue = process.env.SYMMETRIC_KEY_VALUE;
        const uploadLinkId = process.env.GENERIC_HOLDER_UPLOAD_LINKID;
        const uploadToken = process.env.GENERIC_HOLDER_UPLOAD_PASSCODE;

        // Note: keep error message for bad login generic for security - currently same as AppID message
        if (!publicKey || !uploadLinkId || !uploadToken || !symmetricKeyValue || !symmetricKeyIV) {
            const errMsg = 'Missing required arguments.';
            logger.response(400, `Failed to update: ${errMsg}`, txID);
            return res.status(400).json({
                error: {
                    message: errMsg,
                },
            });
        }
        const profileData = {};
        const symmetricKey = {}
        symmetricKey.value = symmetricKeyValue;
        symmetricKey.iv = symmetricKeyIV;
        symmetricKey.algorithm = symmetricKeyAlgorithm;
        profileData.uploadLinkId = uploadLinkId;
        profileData.uploadToken = uploadToken;
        profileData.symmetricKey = symmetricKey;


        const profRes = await profileHelper.updateGenericHolderProfile(txID, req, publicKey, entity, profileData)
        return res.status(200).json({
            message: profRes.message
        });
    } catch (err) {
        return logAndSendErrorResponse(txID, res, err, 'genericHolderUpdate');
    }
};

exports.onboardHolder = async (req, res) => {

    const txID = req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID];
    logger.info('Entering POST /generic/holder controller', txID);

    // Get Generic holderId from configs
    req.body.id = process.env.GENERIC_HOLDER_ID;
    const resBody = await genericHolderOnboard(txID, req, res);

    if (resBody.status === 200) {
        const successMsg = 'Generic holder onboard successful';
        logger.response(200, successMsg, txID);
        return res.status(200).json({
            message: successMsg,
            payload: resBody.payload,
        });
    }

    logger.response(resBody.status, `Failed to onboard generic holder: ${resBody.message}`, txID);
    return res.status(resBody.status).json({
        error: {
            message: resBody.message
        }
    })
};


exports.deleteHolder = async (req, res) => {
    const txID = req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID];
    logger.info('Entering DELETE /generic/holder controller', txID);

    const entity = req.body.organization;
    if (!entity) {
        const errMsg = `Must specify organization in request body`;
        logger.response(400, `Failed to offboard generic holder: ${errMsg}`, txID);
        return res.status(400).json({ error: { message: errMsg } });
    }
    const regEntity = entity.toLowerCase();
    const holderID = process.env.GENERIC_HOLDER_ID;

    // Get user profile data
    const query = await profileHelper.getProfileDoc(txID, req, regEntity, holderID);
    if (query.status !== 200) {
        const errMsg = `Invalid holder ID ${holderID}: ${query.message}`;
        logger.response(query.status, `Failed to offboard generic holder: ${errMsg}`, txID);
        return res.status(query.status).json({
            error: {
                message: errMsg,
            },
        });
    }
    // Delete profile from profile DB
    try {
        logger.debug(`Attempting to delete profile doc for holder ${holderID}`, txID);
        const success = await profileHelper.deleteProfileDoc(txID, req, regEntity, holderID);
        if (success) {
            const successMsg = `Successfully deleted generic holder for ${holderID}`;
            logger.info(successMsg, txID);
            return res.status(200).json({
                message: successMsg,
            });
        }
        const errMsg = `Failed to delete generic profile doc for ${holderID}`;
        logger.error(errMsg, txID);
        return res.status(500).json({
            error: {
                message: errMsg,
            },
        });
    } catch (err) {
        logger.error(`Error occurred when deleting generic profile: ${err.message}`, txID);
        return logAndSendErrorResponse(txID, res, err, 'deleteGenericHolder');
    }
};