/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
* 
*/

const express = require('express');

const testController = require('../controllers/test');

const constants = require('../helpers/constants');
const authStrategy = require('../middleware/auth-strategy');
const requestLogger = require('../middleware/request-logger');

const router = express.Router();
const checkAuthAdmin = authStrategy.getAuthStrategy(constants.APP_ID_ROLES.HEALTHPASS_ADMIN);
const checkAuthTestRoute = authStrategy.getAuthStrategy(constants.APP_ID_ROLES.TEST_ROUTE);
const checkAuthUser = authStrategy.getAuthStrategy();

router.post('/data/submit', checkAuthTestRoute, requestLogger, testController.testSubmitData);

router.post('/appid/users', checkAuthAdmin, requestLogger, testController.testRegisterAppIDUsers);
router.post('/appid/user', checkAuthUser, requestLogger, testController.testRegisterAppIDUser);
router.delete('/appid/users', checkAuthAdmin, requestLogger, testController.testDeleteAppIDUsers);

router.post(
    '/onboarding/mfa/registration-code/:code',
    checkAuthAdmin,
    requestLogger,
    testController.testValidateRegistrationCode
);

router.post(
    '/credentials/sign',
    checkAuthUser,
    requestLogger,
    testController.testSignSelfAttestedCredential
);

router.post('/key/generate', checkAuthAdmin, requestLogger, testController.generateKeyPair);

module.exports = router;
