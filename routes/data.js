/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 */

const express = require('express');
const fileUpload = require('express-fileupload');

const dataController = require('../controllers/data');
const constants = require('../helpers/constants');
const authStrategy = require('../middleware/auth-strategy');
const requestLogger = require('../middleware/request-logger');

const router = express.Router();
const checkAuthUser = authStrategy.getAuthStrategy();
const checkAuthReport = authStrategy.getAuthStrategy(constants.APP_ID_ROLES.NIH_REPORTER);
const checkAuthTestAdmin = authStrategy.getAuthStrategy(constants.APP_ID_ROLES.TEST_ADMIN);
const checkAuthFileAdmin = authStrategy.getAuthStrategy(constants.APP_ID_ROLES.FILE_ADMIN);
const checkAuthRegAdmin = authStrategy.getAuthStrategy(constants.APP_ID_ROLES.REGISTRATION_ADMIN);

// Deprecated API, use the /submit API instead
router.post('/', checkAuthUser, requestLogger, dataController.submitDataDeprecated);

router.post('/submit', checkAuthUser, requestLogger, dataController.submitData);
router.post('/upload', checkAuthTestAdmin, requestLogger, dataController.uploadData);

router.post('/upload/file',
    fileUpload({ 
        limits: {
            fileSize: constants.FILE_MAX_SIZE,
        },
        abortOnLimit: true,
    }),
    checkAuthTestAdmin,
    requestLogger,
    dataController.uploadDataFile
);

router.post('/upload/file/:credentialType',
    fileUpload({ 
        limits: {
            fileSize: constants.FILE_MAX_SIZE,
        },
        abortOnLimit: true,
    }),
    checkAuthTestAdmin,
    requestLogger,
    dataController.uploadDataFile
);
router.post('/upload/:credentialType', checkAuthTestAdmin, requestLogger, dataController.uploadData);
router.get('/:entity/batches/report', checkAuthFileAdmin, requestLogger, dataController.getAllBatchReport);
router.get('/:entity/batches/:batchID/report', checkAuthFileAdmin, requestLogger, dataController.getBatchReport);
router.get('/:entity/preregusers', checkAuthRegAdmin, requestLogger, dataController.getPreregUsers);

router.get('/:entity/report', checkAuthReport, requestLogger, dataController.getReport);

module.exports = router;
