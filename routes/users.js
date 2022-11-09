/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 */

const express = require('express');

const userController = require('../controllers/user');
const authStrategy = require('../middleware/auth-strategy');

const router = express.Router();

const checkAuthUser = authStrategy.getAuthStrategy();

router.post('/login', userController.login);
router.get('/attributes', checkAuthUser, userController.getAttributes);

module.exports = router;
