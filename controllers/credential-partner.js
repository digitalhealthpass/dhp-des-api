/* eslint-disable max-lines-per-function */
/* eslint-disable max-len */
/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 */

const { validate } = require('jsonschema');
const constants = require('../helpers/constants');
const entityHelper = require('../entities');

const organizationHelper = require('../helpers/organization-helper');
const kpHelper = require('../helpers/key-protect-helper');
const orgFormat = require('../helpers/org-config-format');
const { logAndSendErrorResponse, validateReqBody } = require('../utils/index');
const Logger = require('../config/logger');

const logger = new Logger('credential-partner-controller');

const getAllPartnerKeys = async (txID, res, partnerKeys) => {
    logger.info('Get all partner keys', txID);
    const keys = {};
    for (let j = 0; j < partnerKeys.length; j += 1) {
        const partnerKey = partnerKeys[j];
        // eslint-disable-next-line no-await-in-loop
        keys[partnerKey.name] = await kpHelper.getKeyByID(txID, partnerKey.vaultKeyRef);
    }
    return keys;
}

const getPartnerKeyByName = async (txID, res, partnerKeys, partnerKeyName) => {
    logger.info('Get partner key by Name', txID);
    const keys = {}
    for (let j = 0; j < partnerKeys.length; j += 1) {
        const partnerKey = partnerKeys[j]
        if (partnerKeyName === partnerKey.name) {
            // eslint-disable-next-line no-await-in-loop
            keys[partnerKey.name] = await kpHelper.getKeyByID(txID, partnerKey.vaultKeyRef);
            return keys
        }
    }
    return keys;
}

const prepareCredentialPartners = async (txID, credentialPartners, name, keyId, partnerId, operation) => {
    logger.info('Prepare Credential Partners', txID);
    for (let i = 0; i < credentialPartners.length; i += 1) {
        if (partnerId === credentialPartners[i].id) {
            const partnerKeys = credentialPartners[i].partnerKeys || [];
            for (let j = 0; j < partnerKeys.length; j += 1) {
                if (name === partnerKeys[j].name) {
                    if(operation === 'delete'){
                        // eslint-disable-next-line no-param-reassign
                        partnerKeys.splice(j,1)
                        // delete partnerKeys[j]
                        return true
                    }
                    partnerKeys[j].vaultKeyRef = keyId;
                    return true
                }
            }
            if(operation !== 'delete'){
                const partnerKey = {}
                partnerKey.name = name;
                partnerKey.vaultKeyRef = keyId;
                partnerKeys.push(partnerKey)
                // eslint-disable-next-line no-param-reassign
                credentialPartners[i].partnerKeys = partnerKeys;
                return true
            }
        }
    }
    return false
}

// eslint-disable-next-line complexity
const getPartnerKeys = async (res, txID, entity, partnerId, partnerKeyName) => {

    try {
        const entityData = await entityHelper.getRegEntity(txID, entity);
        if (!entityData) {
            const errMsg = `Invalid entity: ${entity}`;
            logger.response(400, `Failed to get : ${errMsg}`, txID);
            return res.status(400).json({
                error: {
                    message: errMsg,
                },
            });
        }

        if (!('userRegistrationConfig' in entityData)) {
            const errMsg = `Organization '${entity}' does not have userRegistrationConfig attribute`;
            logger.response(400, `Failed to get userRegistrationConfig: ${errMsg}`, txID);
            return res.status(400).json({
                error: {
                    message: errMsg,
                },
            });
        }
        const { userRegistrationConfig } = entityData;
        if (!('credentialPartners' in userRegistrationConfig)) {
            const errMsg = `Organization '${entity}' does not have credentialPartners attribute`;
            logger.response(400, `Failed to get credentialPartners: ${errMsg}`, txID);
            return res.status(400).json({
                error: {
                    message: errMsg,
                },
            });
        }
        const { credentialPartners } = userRegistrationConfig;
        const partners = {}
        let keyRes;
        let successMsg = `No partner keys defined for organization ${entity}`;

        // find reference Key ID
        for (let i = 0; i < credentialPartners.length; i += 1) {
            // Get partner specific keys
            if (partnerId === credentialPartners[i].id) {
                const { partnerKeys } = credentialPartners[i];
                if (partnerKeys) {
                    if (partnerKeyName) {
                        // eslint-disable-next-line no-await-in-loop
                        keyRes = await getPartnerKeyByName(txID, res, partnerKeys, partnerKeyName)
                        successMsg = `Successfully retrieved ${partnerKeyName} key for organization ${entity}`;
                    } else {
                        // eslint-disable-next-line no-await-in-loop
                        keyRes = await getAllPartnerKeys(txID, res, partnerKeys)
                        successMsg = `Successfully retrieved keys for partnerId `;
                    }
                }
            }
        }
        if (!keyRes) {
            return res.status(404).json({
                message: `${partnerId} keys not found for organization ${entity}`,
            });
        // eslint-disable-next-line no-else-return
        } else {
            partners[partnerId] = keyRes;
            logger.response(200, successMsg, txID);
            return res.status(200).json({
                message: "successMsg",
                payload: partners,
            });
        }
    } catch (err) {
        return logAndSendErrorResponse(txID, res, err, 'getPartnerKeys');
    }
};

const prepareKeyName = (entity, partnerId, name) =>{
    return `PARTNER_${entity.toUpperCase()}_${partnerId.toUpperCase()}_${name.toUpperCase()}`
}

const checkPartnerID = (credentialPartners, partnerId) =>{
    for (let i = 0; i < credentialPartners.length; i += 1) {
        if (partnerId === credentialPartners[i].id) {
            return true
        }
    }
    return false
}

// eslint-disable-next-line complexity
const crudCredentialPartners = async (txID, req, res, entity, partnerId, operation) => {

    try {
        const entityData = await entityHelper.getRegEntity(txID, entity);

        if (!entityData) {
            const errMsg = `Invalid entity: ${entity}`;
            logger.response(400, `Failed to get : ${errMsg}`, txID);
            return res.status(400).json({
                error: {
                    message: errMsg,
                },
            });
        }

        const validatorResult = validate(entityData, orgFormat.ORG_CREDENTIAL_PARTNER_CONFIG, {required: true});
        if (validatorResult.errors.length) {
            logger.warn(`Failed to validate credential partner with ${validatorResult.errors[0].message}`, txID);
            return res.status(400).json({
                error: {
                    message: 'Failed to validate credential partner definition'
                },
            });
        }

        const { credentialPartners } = entityData.userRegistrationConfig;
        const isValidPartnerId = checkPartnerID(credentialPartners, partnerId)
         

        if (isValidPartnerId === false) {
            const errMsg = `Organization '${entity}' does not have defined credentialPartners with partner ${partnerId}`;
            logger.response(400, `Failed to get credentialPartners: ${errMsg}`, txID);
            return res.status(400).json({
                error: {
                    message: errMsg,
                },
            });
        }

        let keyId;
        let { name } = req.body;
        const { apiKey } = req.body;
        
        if(operation === 'delete'){
            name = req.params.partnerKeyName;
            const keyName = prepareKeyName(entity, partnerId, name)
            const keyRes = await kpHelper.deleteKeyByName(txID, keyName);
            if (keyRes.status !== 200) {
                logger.response(keyRes.status, `Failed to delete key: ${keyRes.message}`, txID);
                return res.status(keyRes.status).json({
                    error: {
                        message: keyRes.message
                    }
                });
            }
        } else if(operation === 'create'){
            const keyName = prepareKeyName(entity, partnerId, name)
            const keyRes = await kpHelper.createKey(txID, keyName, apiKey);
            if (keyRes.status !== 201) {
                logger.response(keyRes.status, `Failed to create key: ${keyRes.message}`, txID);
                return res.status(keyRes.status).json({
                    error: {
                        message: keyRes.message
                    }
                });
            }
            keyId = keyRes.data
        }else{
            const keyName = prepareKeyName(entity, partnerId, name)
            const keyRes = await kpHelper.createKey(txID, keyName, apiKey, true);
            if (keyRes.status !== 201) {
                logger.response(keyRes.status, `Failed to update key: ${keyRes.message}`, txID);
                return res.status(keyRes.status).json({
                    error: {
                        message: keyRes.message
                    }
                });
            }
            keyId = keyRes.data
        }

        // update Organization with credential partners

        const prepRes = prepareCredentialPartners(txID, credentialPartners, name, keyId, partnerId, operation)
        if(prepRes === false){
            return res.status(404).json({
                message: `Credentials partners are not defined for the organization ${entity}`
            });
        }

        entityData.userRegistrationConfig.credentialPartners = credentialPartners
        
        logger.debug(`Attempting to update organization ${entity}`, txID);
        const resBody = await organizationHelper.updateOrganization(txID, entityData, entityData)
        if (resBody.status !== 200) {
            logger.response(resBody.status, `Failed to update partner keys: ${resBody.message}`, txID);
            // TODO: roll back the operation
        } else {
            logger.response(200, `Successfully updated partner keys for organization ${entity}`, txID);
        }
        return res.status(resBody.status).json({
            message: `${resBody.message} with credential partner keys`
        });
        
    } catch (err) {
        return logAndSendErrorResponse(txID, res, err, 'updateCredentialPartners');
    }
};

exports.getPartnerKeyByName = async (req, res) => {
    const txID = req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID];
    const entity = req.params.entity.toLowerCase();
    const { partnerId, partnerKeyName } = req.params;
    logger.info('Entering GET /:entity/partners/:partnerId/keys/:partnerKeyName controller', txID);

    await getPartnerKeys(res, txID, entity, partnerId, partnerKeyName);
};

exports.getAllPartnerKeys = async (req, res) => {
    const txID = req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID];
    const entity = req.params.entity.toLowerCase();
    const { partnerId } = req.params;
    logger.info('Entering GET /:entity/partners/:partnerId/keys controller', txID);

    await getPartnerKeys(res, txID, entity, partnerId);
};

// eslint-disable-next-line consistent-return
exports.createPartnerKeys = async (req, res) => {
    const txID = req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID];
    const entity = req.params.entity.toLowerCase();
    const { partnerId } = req.params;

    logger.info('Entering POST /:entity/partners controller', txID);

    const errMsg = validateReqBody(txID, req.body, ["name", "apiKey"]);
    if (errMsg) {
        logger.response(400, `Failed to create keys: ${errMsg}`, txID);
        return res.status(400).json({
            error: {
                message: errMsg,
            },
        });
    };

    await crudCredentialPartners(txID, req, res, entity, partnerId, 'create');
};


// eslint-disable-next-line consistent-return
exports.updatePartnerKeys = async (req, res) => {
    const txID = req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID];
    const entity = req.params.entity.toLowerCase();
    const { partnerId } = req.params;

    logger.info('Entering PUT /:entity/partners controller', txID);

    const errMsg = validateReqBody(txID, req.body, ["name", "apiKey"]);
    if (errMsg) {
        logger.response(400, `Failed to create keys: ${errMsg}`, txID);
        return res.status(400).json({
            error: {
                message: errMsg,
            },
        });
    };
    await crudCredentialPartners(txID, req, res, entity, partnerId, 'update');
};

exports.deletePartnerKeys = async (req, res) => {
    const txID = req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID];
    const entity = req.params.entity.toLowerCase();
    const { partnerId } = req.params;

    logger.info('Entering DELETE /:entity/partners/:key/partnerKeyName controller', txID);
   
    await crudCredentialPartners(txID, req, res, entity, partnerId, 'delete');
};
