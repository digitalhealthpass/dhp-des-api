/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
* 
*/

const express = require('express');

const cosController = require('../controllers/cos');

const constants = require('../helpers/constants');
const authStrategy = require('../middleware/auth-strategy');
const requestLogger = require('../middleware/request-logger');

const router = express.Router();
const checkAuthDataAdmin = authStrategy.getAuthStrategy(constants.APP_ID_ROLES.DATA_ADMIN);
const checkAuthUser = authStrategy.getAuthStrategy();

// Fetch file list from COS Bucket specific to entity
router.get('/:entity', checkAuthDataAdmin, requestLogger, cosController.getCOSFileNames);
// Download file by name from COS Bucket specific to entity
router.get('/:entity/:filename', checkAuthDataAdmin, requestLogger, cosController.getCOSFile);
// Get all items from cos for a holder
router.get('/:entity/owner/:holderId', checkAuthUser, requestLogger, cosController.getCOSFilesByHolderId);
// Download and delete file by name from COS Bucket specific to entity
router.delete('/:entity/:filename', checkAuthDataAdmin, requestLogger , cosController.deleteCOSFile);

module.exports = router;