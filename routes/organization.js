/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 *
 */
const express = require('express');

const clientController = require('../controllers/client');
const organizationController = require('../controllers/organization');
const credPartnerController = require('../controllers/credential-partner');
const constants = require('../helpers/constants');
const authStrategy = require('../middleware/auth-strategy');
const requestLogger = require('../middleware/request-logger');

const router = express.Router();
const checkAuth = authStrategy.getAuthStrategy();
const checkAuthAdmin = authStrategy.getAuthStrategy(constants.APP_ID_ROLES.HEALTHPASS_ADMIN);
const checkAuthApplication = authStrategy.getAuthStrategy(constants.APP_ID_ROLES.APPLICATION);

router.post('/register', checkAuthAdmin, requestLogger, organizationController.register);
router.put('/', checkAuthAdmin, requestLogger, organizationController.update);
router.get('/', checkAuthAdmin, requestLogger, organizationController.get);
router.patch('/', checkAuthAdmin, requestLogger, organizationController.patch);
router.get('/:entity', checkAuth, requestLogger, organizationController.getConfig);
router.get('/:entity/regconfig', checkAuth, requestLogger, organizationController.getRegConfig);
router.get('/:entity/displayschemaid', checkAuth, requestLogger, organizationController.getDisplaySchemaID);
router.get('/:entity/:attribute', checkAuth, requestLogger, organizationController.getConfigAttr);
router.get('/:entity/consentReceipt/:id', checkAuth, requestLogger, organizationController.getConsentReceipt);
router.get('/:entity/consentRevoke/:id', checkAuth, requestLogger, organizationController.getConsentRevoke);
router.delete('/:entity', checkAuthAdmin, requestLogger, organizationController.delete);

router.post('/client/register', checkAuthAdmin, requestLogger, clientController.register);
router.put('/client', checkAuthAdmin, requestLogger, clientController.update);

// Credential partner keys
router.get('/:entity/partners/:partnerId/keys', checkAuthApplication, requestLogger, 
    credPartnerController.getAllPartnerKeys);
router.get('/:entity/partners/:partnerId/keys/:partnerKeyName', checkAuthApplication, requestLogger,
    credPartnerController.getPartnerKeyByName);
router.post('/:entity/partners/:partnerId/keys', checkAuthAdmin, requestLogger,
    credPartnerController.createPartnerKeys);
router.put('/:entity/partners/:partnerId/keys', checkAuthAdmin, requestLogger,
    credPartnerController.updatePartnerKeys);
router.delete('/:entity/partners/:partnerId/keys/:partnerKeyName', checkAuthAdmin, requestLogger,
    credPartnerController.deletePartnerKeys);

module.exports = router;
