/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 */

const constants = require('../helpers/constants');
const entityHelper = require('../entities');

const organizationHelper = require('../helpers/organization-helper');
const { logAndSendErrorResponse, validateReqBody } = require('../utils/index');
const Logger = require('../config/logger');

const logger = new Logger('organization-controller');


const getReqFieldsByEntityType = (txID, req) => {
    const entity = req.body.entityType;
    if (!entity) {
        return {
            status: 400,
            message: 'Must specify entityType in request body'
        }
    }
    const regEntity = entity.toLowerCase();
   
    // get required fields from data validator
    try {
        // eslint-disable-next-line global-require, import/no-dynamic-require
        const dataValidator = require(`../entities/${regEntity}/data-validator`);
        return dataValidator.getOrgFields();
    } catch (error) {
        return constants.ORGS_FIELDS.REQUIRED;
    }
}

// TODO: keep consistent with use of `entity` instead of `org`/`organization`
const registerOrganization = async (req, res, txID) => {
    logger.info('Entering POST /organization/register controller', txID);
    
    // validate request schema *TODO* need to work on schema.
    const reqFields = getReqFieldsByEntityType(txID, req);
    const errMsg = validateReqBody(txID, req.body, reqFields);
    if (errMsg) {
        logger.response(400, `Failed to onboard organization: ${errMsg}`, txID);
        return res.status(400).json({
            error: {
                message: errMsg,
            },
        });
    };
    
    logger.debug(`Attempting to onboard organization`, txID);
    try {
        const resBody = await organizationHelper.createOrganization(txID, req);
        if (resBody.status !== 201) {
            logger.response(resBody.status, `Failed to onboard organization: ${resBody.message}`, txID);
            return res.status(resBody.status).json({
                error: {
                    message: resBody.message
                }
            });
        }
        logger.response(201, 'Sucessfully onboarded organization', txID);
        return res.status(resBody.status).json({
            message: resBody.message,
        });
        
    } catch (err) {
        return logAndSendErrorResponse(txID, res, err, 'registerOrganization');
    }
};

exports.register = async (req, res) => {
    const txID = req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID];
    await registerOrganization(req, res, txID);
};

const preserveExistingAppIDRoles = (req, regEntityData) => {
    // preserve any existing AppID role IDs
    const existingRegAdminRoleID = regEntityData.regAdminRoleID;
    const existingTestAdminRoleID = regEntityData.testAdminRoleID;
    const existingDataAdminRoleID = regEntityData.dataAdminRoleID;
    if (existingRegAdminRoleID) {
        req.body.regAdminRoleID = existingRegAdminRoleID;
    }
    if (existingTestAdminRoleID) {
        req.body.testAdminRoleID = existingTestAdminRoleID;
    }
    if (existingDataAdminRoleID) {
        req.body.dataAdminRoleID = existingDataAdminRoleID;
    }

    return req.body;
}

const updateOrganization = async (req, res, regEntity, txID) => {
    logger.info('Entering PUT /organization controller', txID);

    if (!regEntity) {
        const errMsg = `Must specify entity in request body`;
        logger.response(400, `Failed to update organization: ${errMsg}`, txID);
        return res.status(400).json({ 
            error: { 
                message: errMsg
            } 
        });
    }

    const {entityType} = req.body;
    if (!entityType) {
        const errMsg = 'Must specify entityType in request body'
        logger.response(400, `Failed to update organization: ${errMsg}`, txID);
        return res.status(400).json({ 
            error: { 
                message: errMsg
            } 
        });
    }
    
    const reqFields = getReqFieldsByEntityType(txID, req);
    const errMsg = validateReqBody(txID, req.body, reqFields);
    if (errMsg) {
        logger.response(400, `Failed to update organization ${regEntity}: ${errMsg}`, txID);
        return res.status(400).json({
            error: {
                message: errMsg,
            },
        });
    };
    
    try {
        logger.debug(`Checking if entity ${regEntity} is onboarded`, txID);
        const regEntityData = await entityHelper.getRegEntity(txID, regEntity);
        if (!regEntityData) {
            const errMsg = `Invalid entity: ${regEntity}`;
            logger.response(400, `Failed to update organization ${regEntity}: ${errMsg}`, txID);
            return res.status(400).json({
                error: {
                    message: errMsg,
                }
            });
        }
        
        const orgDocs = preserveExistingAppIDRoles(req, regEntityData);
        
        logger.debug(`Attempting to update organization ${regEntity}`, txID);
        const resBody = await organizationHelper.updateOrganization(txID, regEntityData, orgDocs);
        if (resBody.status !== 200) {
            logger.response(resBody.status, `Failed to update organization: ${resBody.message}`, txID);
        } else {
            logger.response(200, `Successfully updated organization ${regEntity}`, txID);
        }
        return res.status(resBody.status).json({
            message: resBody.message
        });
    } catch (err) {
        return logAndSendErrorResponse(txID, res, err, 'updateOrganization');
    }
};

exports.update = async (req, res) => {
    const txID = req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID];
    const regEntity = req.body.entity || req.params.entity;

    await updateOrganization(req, res, regEntity, txID);
};

const patchOrganization = async (req, res, regEntity, ops, txID) => {
    logger.info('Entering PATCH /organization controller', txID);

    if (!regEntity) {
        const errMsg = `Must specify entity in request body`;
        logger.response(400, `Failed to patch organization: ${errMsg}`, txID);
        return res.status(400).json({ 
            error: { 
                message: errMsg
            } 
        });
    }

    if (!ops) {
        const errMsg = `Must specify ops in request body`;
        logger.response(400, `Failed to patch organization: ${errMsg}`, txID);
        return res.status(400).json({ 
            error: { 
                message: errMsg
            } 
        });
    }

    try {
        logger.debug(`Checking if entity ${regEntity} is onboarded`, txID);
        const regEntityData = await entityHelper.getRegEntity(txID, regEntity);
        if (!regEntityData) {
            const errMsg = `Invalid entity: ${regEntity}`;
            logger.response(400, `Failed to patch organization ${regEntity}: ${errMsg}`, txID);
            return res.status(400).json({
                error: {
                    message: errMsg,
                }
            });
        }

        const orgDocs = preserveExistingAppIDRoles(req, regEntityData);

        logger.debug(`Attempting to patch organization ${regEntity}`, txID);
        const resBody = await organizationHelper.patchOrganization(txID, regEntityData, orgDocs);
        if (resBody.status !== 200) {
            logger.response(resBody.status, `Failed to patch organization: ${resBody.message}`, txID);
        } else {
            logger.response(200, `Successfully patched organization ${regEntity}`, txID);
        }
        return res.status(resBody.status).json({
            message: resBody.message
        });
    } catch (err) {
        return logAndSendErrorResponse(txID, res, err, 'patchOrganization');
    }
};

exports.patch = async (req, res) => {
    const txID = req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID];
    const regEntity = req.body.entity || req.params.entity;
    const ops = req.body.ops || req.params.ops;

    await patchOrganization(req, res, regEntity, ops, txID);
};


const getAllOrganizations = async (req, res, txID) => {
    logger.info('Entering GET /organization controller', txID);
    try {
        const orgs = await entityHelper.getAllRegEntities(txID);
        logger.response(200, `Successfully retrieved organizations`, txID);
        return res.status(200).json({
            payload: { registeredOrgs: orgs }
        });
    } catch (err) {
        return logAndSendErrorResponse(txID, res, err, 'getAllOrganizations');
    }
}

exports.get = async (req, res) => {
    const txID = req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID];
    await getAllOrganizations(req, res, txID);
}

const getWholeConfig = async (txID, req, res, entity) => {
    logger.debug(`Checking if entity ${entity} is onboarded`, txID);
    
    try {
        let entityData = await entityHelper.getRegEntity(txID, entity);
        if (!entityData) {
            const errMsg = `Invalid entity: ${entity}`;
            logger.response(400, `Failed to get user whole config: ${errMsg}`, txID);
            return res.status(400).json({
                error: {
                    message: errMsg,
                },
            });
        }

        const successMsg = `Successfully retrieved user whole config for organization ${entity}`;
        logger.response(200, successMsg, txID);
        
        // remove entityData property which starts with '_'
        entityData = Object.keys(entityData)
            .filter(key => key[0] !== '_')
            .reduce((res, key) => Object.assign(res, { [key]: entityData[key] }), {} );

        return res.status(200).json({
            message: successMsg,
            payload: entityData,
        });
    } catch (err) {
        return logAndSendErrorResponse(txID, res, err, 'getWholeConfig');
    }
};

const getConfigAttribute = async (txID, req, res, entity, attribute) => {
    logger.debug(`Checking if entity ${entity} is onboarded`, txID);
    
    try {
        const entityData = await entityHelper.getRegEntity(txID, entity);
        if (!entityData) {
            const errMsg = `Invalid entity: ${entity}`;
            logger.response(400, `Failed to get ${attribute}: ${errMsg}`, txID);
            return res.status(400).json({
                error: {
                    message: errMsg,
                },
            });
        }

        if (!(attribute in entityData)) {
            const errMsg = `Organization '${entity}' does not have '${attribute}' attribute`;
            logger.response(400, `Failed to get ${attribute}: ${errMsg}`, txID);
            return res.status(400).json({
                error: {
                    message: errMsg,
                },
            });
        }

        const successMsg = `Successfully retrieved ${attribute} for organization ${entity}`;
        logger.response(200, successMsg, txID);
        return res.status(200).json({
            message: successMsg,
            payload: entityData[attribute],
        });
    } catch (err) {
        return logAndSendErrorResponse(txID, res, err, 'getConfigAttribute');
    }
};


exports.getConfig = async (req, res) => {
    const txID = req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID];
    const { entity } = req.params;
    await getWholeConfig(txID, req, res, entity);
};

exports.getConfigAttr = async (req, res) => {
    const txID = req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID];
    const { entity, attribute } = req.params;
    await getConfigAttribute(txID, req, res, entity, attribute);
};

exports.getRegConfig = async (req, res) => {
    const txID = req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID];
    const { entity } = req.params;
    await getConfigAttribute(txID, req, res, entity, 'userRegistrationConfig');
};

exports.getDisplaySchemaID = async (req, res) => {
    const txID = req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID];
    const { entity } = req.params;
    await getConfigAttribute(txID, req, res, entity, 'displaySchema');
}

exports.getConsentReceipt = async (req, res) => {
    const txID = req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID];
    const { entity, id } = req.params;
    logger.info('Entering GET /organization/consentReceipt controller', txID);

    try {
        const entityData = await entityHelper.getRegEntity(txID, entity);
        if (!entityData) {
            const errMsg = `Invalid entity: ${entity}`;
            logger.response(400, `Failed to retrieve consent receipt: ${errMsg}`, txID);
            return res.status(400).json({
                error: {
                    message: errMsg,
                },
            });
        }

        if (!('consentInfo' in entityData)) {
            const errMsg = `Organization '${entity}' does not have 'consentInfo' configured`;
            logger.response(400, `Failed to retrieve consent receipt: ${errMsg}`, txID);
            return res.status(400).json({
                error: {
                    message: errMsg,
                },
            });
        }
        
        const entityHelperName = entityData.entityType || entity;

        const resBody = await organizationHelper.createConsentReceipt(
            txID, entityData, id, entityHelperName
        );
        if (resBody.status !== 200) {
            logger.response(resBody.status, `Failed to retrieved consent receipt: ${resBody.message}`, txID);
            return res.status(resBody.status).json({
                error: {
                    message: resBody.message
                }
            });
        }

        logger.response(200, resBody.message, txID);
        return res.status(resBody.status).json({
            message: resBody.message,
            payload: resBody.payload,
        });
    } catch (err) {
        return logAndSendErrorResponse(txID, res, err, 'getConsentReceipt');
    }
}

exports.getConsentRevoke = async (req, res) => {
    const txID = req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID];
    const { entity, id } = req.params;
    logger.info('Entering GET /organization/consentRevoke controller', txID);

    try {
        const entityData = await entityHelper.getRegEntity(txID, entity);
        if (!entityData) {
            const errMsg = `Invalid entity: ${entity}`;
            logger.response(400, `Failed to retrieve consent revoke: ${errMsg}`, txID);
            return res.status(400).json({
                error: {
                    message: errMsg,
                },
            });
        }

        if (!('consentInfo' in entityData)) {
            const errMsg = `Organization '${entity}' does not have 'consentInfo' configured`;
            logger.response(400, `Failed to retrieve consent revoke: ${errMsg}`, txID);
            return res.status(400).json({
                error: {
                    message: errMsg,
                },
            });
        }
        
        const entityHelperName = entityData.entityType || entity;

        const resBody = await organizationHelper.createConsentRevoke(
            txID, entityData, id, entityHelperName
        );
        if (resBody.status !== 200) {
            logger.response(resBody.status, `Failed to retrieve consent revoke: ${resBody.message}`, txID);
            return res.status(resBody.status).json({
                error: {
                    message: resBody.message
                }
            });
        }

        logger.response(200, resBody.message, txID);
        return res.status(resBody.status).json({
            message: resBody.message,
            payload: resBody.payload,
        });
    } catch (err) {
        return logAndSendErrorResponse(txID, res, err, 'getConsentRevoke');
    }
}

const deleteOrganization = async (req, res, regEntity, token, txID) => {
    logger.info('Entering DELETE /organization controller', txID);
    
    try {
        // Get entity data
        logger.debug(`Checking if organization ${regEntity} is onboarded`, txID);
        const regEntityData = await entityHelper.getRegEntity(txID, regEntity);
        if (!regEntityData) {
            logger.warn(`Organization ${regEntity} does not exist in database but proceeding with offboarding`, txID);
        }

        logger.debug(`Attempting to offboard organization ${regEntity}`, txID);
        const resBody = await organizationHelper.deleteOrganization(txID, req, token, regEntity, regEntityData);
        const payload = {
            message: resBody.message,
        };
        if (resBody.status !== 200) {
            payload.errors = resBody.payload;
            logger.response(resBody.status, `Failed to offboard organization ${regEntity}: ${resBody.message}`, txID);
        } else {
            logger.response(200, `Successfully offboarded organization ${regEntity}`, txID);
        }
        return res.status(resBody.status).json(payload);
    } catch (err) {
        return logAndSendErrorResponse(txID, res, err, 'deleteOrganization');
    }
};

exports.delete = async (req, res) => {
    const token = req.headers.authorization; // needed to call APIs to offboard users
    const txID = req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID];
    const regEntity = req.params.entity.toLowerCase();

    await deleteOrganization(req, res, regEntity, token, txID);
};
