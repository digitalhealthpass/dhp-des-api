/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 *
 */
const express = require('express');

const constants = require('../helpers/constants');
const authStrategy = require('../middleware/auth-strategy');
const requestLogger = require('../middleware/request-logger');
const mapperController = require('../controllers/mapper');

const router = express.Router();
const checkAuthAdmin = authStrategy.getAuthStrategy(constants.APP_ID_ROLES.HEALTHPASS_ADMIN);

router.post('/', checkAuthAdmin, requestLogger, mapperController.addMapper);
router.put('/:mapperName', checkAuthAdmin, requestLogger, mapperController.update);
router.get('/', checkAuthAdmin, requestLogger, mapperController.get);
router.delete('/:mapperName', checkAuthAdmin, requestLogger, mapperController.delete);
router.get('/:mapperName', checkAuthAdmin, requestLogger, mapperController.getMapper);

router.post('/transform/', checkAuthAdmin, mapperController.jsltTransform);
module.exports = router;
