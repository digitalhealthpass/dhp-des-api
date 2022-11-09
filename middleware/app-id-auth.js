/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 */

const passport = require('passport');
const jwt = require('jsonwebtoken');
const appID = require('ibmcloud-appid');
const constants = require('../helpers/constants');
const Logger = require('../config/logger');

const logger = new Logger('app-id-auth');

const { APIStrategy } = appID;
const appIDUrl = process.env.APP_ID_URL;

passport.use(
    new APIStrategy({
        oauthServerUrl: appIDUrl,
    })
);

const authenticateStandardUser = passport.authenticate(APIStrategy.STRATEGY_NAME, {
    session: false,
});

const authenticateNihReporter = passport.authenticate(APIStrategy.STRATEGY_NAME, {
    session: false,
    scope: constants.APP_ID_ROLES.NIH_REPORTER,
});

const authenticateHealthpassAdmin = passport.authenticate(APIStrategy.STRATEGY_NAME, {
    session: false,
    scope: constants.APP_ID_ROLES.HEALTHPASS_ADMIN,
});

// eslint-disable-next-line complexity
const authorizeAdminFromSameOrgOnly = (token, isHealthAdminAllowed, userOrg, role) => {
    const decoded = jwt.decode(token);
    if (!decoded || !decoded.scope) {
        logger.debug(`Bad token`);
        throw new Error('Bad Token Format');
    }

    // Original scope check 
    const deprecatedScope = `${userOrg}.${role}`;
    if (isHealthAdminAllowed && decoded.scope.includes(constants.APP_ID_ROLES.HEALTHPASS_ADMIN)
        || decoded.scope.includes(deprecatedScope)
    ) {
        return; // Allowed
    }

    const newScope = `${constants.APP_ID_ROLES.DES_PREFIX}.${role}`;
    if (decoded.scope.includes(newScope)
        && ((decoded.org === userOrg) || (decoded.orgs && (decoded.orgs.includes(userOrg)
        || decoded.orgs.includes("desapp"))))) {
        logger.debug(`User authorized for org ${userOrg}`);
        return;
    }

    logger.info(`Unauthorized admin user. Required user attribute not found.`);
    throw new Error('Unauthorized. Required user attribute not found.');
}

// TODO will change callback to async
const authenticateAdmins = (req, res, next, org, role, isHealthAdminAllowed) => {
    passport.authenticate(APIStrategy.STRATEGY_NAME,
        {
            session: false
        },
        (para0, para1, para2, status) => {
            const errMsg = `User is not authorized for this operation`;
            if (status) {
                // error
                res.status(401).json({
                    error: {
                        message: `${errMsg}`
                    },
                });
                return;
            }

            const accessToken = req.headers.authorization.split(' ')[1];
            if (accessToken) {
                try {
                    // Impl using attributes in the oauth2 token 
                    // Authorization: role des-* match && token attributes (org/orgs) should match
                    authorizeAdminFromSameOrgOnly(accessToken, isHealthAdminAllowed, org, role);
                    next();
                    return;
                } catch (error) {
                    logger.info(`userToken NotAuthorized: ${error}`);
                    res.status(401).json({
                        error: {
                            message: 'Authorization failed',
                        },
                    });
                    return;
                }
            }

            res.status(401).json({
                error: {
                    message: `Not Authorized`
                },
            });
        })(req, res, next);
}

const authenticateRegAdmin = (req, res, next) => {
    const org = req.body.organization || req.params.entity.toLowerCase();
    authenticateAdmins(req, res, next, org, constants.APP_ID_ROLES.REGISTRATION_ADMIN, true);
};

const authenticateTestAdmin = (req, res, next) => {
    const org = req.body.organization;
    authenticateAdmins(req, res, next, org, constants.APP_ID_ROLES.TEST_ADMIN, true);
};

const authenticateTestRoute = (req, res, next) => {
    const org = req.body.organization;
    authenticateAdmins(req, res, next, org, constants.APP_ID_ROLES.TEST_ROUTE, true);
};

const authenticateFileAdmin = (req, res, next) => {
    const { role } = req.query;
    const { entity } = req.params;
    authenticateAdmins(req, res, next, entity, role, true);
};

const authenticateDataAdmin = (req, res, next) => {
    const org = req.body.organization || req.params.entity.toLowerCase();
    authenticateAdmins(req, res, next, org, constants.APP_ID_ROLES.DATA_ADMIN, true);
};

const authenticateApplication = (req, res, next) => {
    const org = req.body.organization || req.params.entity.toLowerCase();
    authenticateAdmins(req, res, next, org, constants.APP_ID_ROLES.APPLICATION, true);
};

module.exports = {
    authenticateStandardUser,
    authenticateNihReporter,
    authenticateHealthpassAdmin,
    authenticateRegAdmin,
    authenticateTestAdmin,
    authenticateTestRoute,
    authenticateFileAdmin,
    authenticateDataAdmin,
    authenticateApplication
};
