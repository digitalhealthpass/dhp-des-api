/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 */

const express = require('express');
const fileUpload = require('express-fileupload');

const onboardingController = require('../controllers/onboarding');
const mfaOBController = require('../controllers/mfa-onboarding');
const genericController = require('../controllers/generic-onboarding');
const constants = require('../helpers/constants');
const authStrategy = require('../middleware/auth-strategy');
const requestLogger = require('../middleware/request-logger');

const router = express.Router();
const checkAuthUser = authStrategy.getAuthStrategy();
const checkAuthAdmin = authStrategy.getAuthStrategy(constants.APP_ID_ROLES.HEALTHPASS_ADMIN);
const checkAuthRegAdmin = authStrategy.getAuthStrategy(constants.APP_ID_ROLES.REGISTRATION_ADMIN);

router.post('/', checkAuthUser, requestLogger, onboardingController.onboard);
router.get('/validatecode/:code', checkAuthUser, requestLogger, onboardingController.validateCode);
router.get('/validatekey', checkAuthUser, requestLogger, onboardingController.validateKey);
router.delete('/', checkAuthUser, requestLogger, onboardingController.deleteRegistration);

router.get('/holders', checkAuthAdmin, requestLogger, onboardingController.getHoldersOnboard);
router.post('/holders/status', checkAuthAdmin, requestLogger, onboardingController.validateHoldersOnboardStatus);
router.post('/holders/credentials', checkAuthUser, requestLogger, onboardingController.createUserCredential);

router.post('/mfa/registration-code/:code', checkAuthUser, requestLogger, mfaOBController.validateRegistrationCode);
router.post('/mfa/verification-code/:code', checkAuthUser, requestLogger, mfaOBController.validateVerificationCode);
router.post('/mfa/submit-registration', checkAuthUser, requestLogger, mfaOBController.submitRegistration);

router.post('/mfa/users', checkAuthRegAdmin, requestLogger, mfaOBController.processUserList);
router.post(
    '/mfa/users/file',
    fileUpload({
        limits: {
            fileSize: constants.FILE_MAX_SIZE
        }, 
        abortOnLimit: true,
    }),
    checkAuthRegAdmin,
    requestLogger,
    mfaOBController.processUserListFromFile
);

router.post('/generic', checkAuthAdmin, requestLogger, genericController.onboardHolder);
router.put('/generic', checkAuthAdmin, requestLogger, genericController.updateHolder);
router.delete('/generic', checkAuthAdmin, requestLogger, genericController.deleteHolder);

/**
 * All routes below are deprecated in favor of the equivalent routes above
 * which have `entity` in the request body instead of the path
 * @deprecated
 */
router.post('/:entity', checkAuthUser, requestLogger, onboardingController.onboard);
router.get('/:entity/validatecode/:code', checkAuthUser, requestLogger, onboardingController.validateCode);
router.get('/:entity/validatekey', checkAuthUser, requestLogger, onboardingController.validateKey);
router.delete('/:entity', checkAuthUser, requestLogger, onboardingController.deleteRegistration);


module.exports = router;
