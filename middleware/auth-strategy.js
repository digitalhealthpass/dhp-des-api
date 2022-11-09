/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 */

const jwtAuth = require('./jwt-auth');
const appIDAuth = require('./app-id-auth');
const constants = require('../helpers/constants');

// eslint-disable-next-line complexity
const getAuthStrategy = (role) => {
    if (process.env.AUTH_STRATEGY === 'DEVELOPMENT') {
        return jwtAuth;
    }
    // TODO : refactor below code
    let authStrategy;
    if (role === constants.APP_ID_ROLES.NIH_REPORTER) {
        authStrategy = appIDAuth.authenticateNihReporter;
    } else if (role === constants.APP_ID_ROLES.HEALTHPASS_ADMIN) {
        authStrategy = appIDAuth.authenticateHealthpassAdmin;
    } else if (role === constants.APP_ID_ROLES.REGISTRATION_ADMIN) {
        authStrategy = appIDAuth.authenticateRegAdmin;
    } else if (role === constants.APP_ID_ROLES.TEST_ADMIN) {
        authStrategy = appIDAuth.authenticateTestAdmin;
    } else if (role === constants.APP_ID_ROLES.TEST_ROUTE) {
        authStrategy = appIDAuth.authenticateTestRoute;
    } else if (role === constants.APP_ID_ROLES.FILE_ADMIN) {
        authStrategy = appIDAuth.authenticateFileAdmin;
    } else if (role === constants.APP_ID_ROLES.DATA_ADMIN) {
        authStrategy = appIDAuth.authenticateDataAdmin;
    }else if (role === constants.APP_ID_ROLES.APPLICATION) {
        authStrategy = appIDAuth.authenticateApplication;
    }else {
        authStrategy = appIDAuth.authenticateStandardUser;
    } 

    return authStrategy;
};

module.exports = {
    getAuthStrategy,
};
