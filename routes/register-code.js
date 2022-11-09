/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
* 
*/
const express = require('express');

const registerCodeController = require('../controllers/register-code');
const constants = require('../helpers/constants');
const authStrategy = require('../middleware/auth-strategy');
const requestLogger = require('../middleware/request-logger');

const router = express.Router();
const checkAuthRegAdmin = authStrategy.getAuthStrategy(constants.APP_ID_ROLES.REGISTRATION_ADMIN);

// eslint-disable-next-line max-len
router.post('/:entity/generate/:howmany?', checkAuthRegAdmin, requestLogger, registerCodeController.generate);
router.post('/:entity/upload', checkAuthRegAdmin, requestLogger, registerCodeController.upload);
router.get('/:entity/codes/:howmany?', checkAuthRegAdmin, requestLogger, registerCodeController.query);

module.exports = router;
