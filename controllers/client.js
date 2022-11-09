/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 */

const constants = require('../helpers/constants');
const entityHelper = require('../entities');

const clientHelper = require('../helpers/client-helper');
const { logAndSendErrorResponse, validateReqBody } = require('../utils/index');
const Logger = require('../config/logger');

const logger = new Logger('client-controller');

exports.register = async (req, res) => {
    const txID = req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID];
    logger.info('Entering POST /organization/client/register controller', txID);

    const regEntity = req.body.organization;
    const { clientName } = req.body;
    const clientLogMsg = `client ${clientName} for organization ${regEntity}`;

    const reqFields = constants.CLIENT_FIELDS.REQUIRED
    const errMsg = validateReqBody(txID, req.body, reqFields);
    if (errMsg) {
        logger.response(400, `Failed to onboard ${clientLogMsg}: ${errMsg}`, txID);
        return res.status(400).json({
            error: {
                message: errMsg,
            },
        });
    };

    try {
        const regEntity = req.body.organization;
        logger.debug(`Attempting to get organization ${regEntity}`, txID);
        const regEntityData = await entityHelper.getRegEntity(txID, regEntity);
        if (!regEntityData) {
            const errMsg = `Invalid organization ${regEntity}`;
            logger.response(400, `Failed to onboard ${clientLogMsg}: ${errMsg}`, txID);
            return res.status(400).json({
                error: {
                    message: errMsg,
                }
            });
        }
        
        logger.debug(`Attempting to onboard ${clientLogMsg}`, txID);
        const resBody = await clientHelper.createClient(txID, req.body);
        if (resBody.status !== 201) {
            logger.response(resBody.status, `Failed to onboard ${clientLogMsg}: ${resBody.message}`, txID);
        } else {
            logger.response(201, `Successfully onboarded ${clientLogMsg}`, txID);
        }
        return res.status(resBody.status).json({
            message: resBody.message
        });
    } catch (err) {
        return logAndSendErrorResponse(txID, res, err, 'register client');
    }
};

exports.update = async (req, res) => {
    const txID = req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID];
    logger.info('Entering PUT /organization/client controller', txID);

    const regEntity = req.body.organization;
    const { clientName } = req.body;
    const clientLogMsg = `client ${clientName} for organization ${regEntity}`;

    const reqFields = constants.CLIENT_FIELDS.REQUIRED
    const errMsg = validateReqBody(txID, req.body, reqFields);
    if (errMsg) {
        logger.response(400, `Failed to update ${clientLogMsg}: ${errMsg}`, txID);
        return res.status(400).json({
            error: {
                message: errMsg,
            },
        });
    };

    try {
        logger.debug(`Attempting to get ${clientLogMsg}`, txID);
        const clientData = await entityHelper.getClient(txID, regEntity, clientName);
        if (!clientData) {
            const errMsg = `Failed to get ${clientLogMsg}`;
            logger.response(400, `Failed to update ${clientLogMsg}: ${errMsg}`, txID);
            return res.status(400).json({
                error: {
                    message: errMsg,
                }
            });
        }
        
        logger.debug(`Attempting to update ${clientLogMsg}`, txID);
        const resBody = await clientHelper.updateClient(txID, clientData, req.body);
        if (resBody.status !== 200) {
            logger.response(resBody.status, `Failed to update ${clientLogMsg}: ${resBody.message}`, txID);
        } else {
            logger.response(200, `Successfully updated ${clientLogMsg}`, txID);
        }
        return res.status(resBody.status).json({
            message: resBody.message
        });
    } catch (err) {
        return logAndSendErrorResponse(txID, res, err, 'update client');
    }
}