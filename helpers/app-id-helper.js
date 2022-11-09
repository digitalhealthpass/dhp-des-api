/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 */

const axios = require('axios');
const rax = require('retry-axios');
const querystring = require('querystring');

const config = require('../config');
const Logger = require('../config/logger');
const utils = require('../utils/index');

const logger = new Logger('app-id-helper');

const url = process.env.APP_ID_URL;
const serverHost = process.env.APP_ID_AUTH_SERVER_HOST;
const clientID = process.env.APP_ID_CLIENT_ID;
const tenantID = process.env.APP_ID_TENANT_ID;
const secret = process.env.APP_ID_SECRET;

// writer's responsibility to call validateConfig() before making requests to AppID
// eslint-disable-next-line complexity
const validateConfig = () => {
    let missingVar;
    if (!url) {
        missingVar = 'APP_ID_URL';
    } else if (!clientID) {
        missingVar = 'APP_ID_CLIENT_ID';
    } else if (!tenantID) {
        missingVar = 'APP_ID_TENANT_ID';
    } else if (!secret) {
        missingVar = 'APP_ID_SECRET';
    }

    if (missingVar) {
        throw new Error(`Invalid AppID config: missing variable '${missingVar}'`);
    }
};

const appIdLoginClient = (txID) => {
    const loginClient = axios.create({
        baseURL: `${url}/token`,
        timeout: config.appID.timeout,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            accept: 'application/json',
        },
        auth: {
            username: clientID,
            password: secret,
        },
    });

    const retries = config.appID.retries || 1;
    const retryDelay = config.appID.retryDelay || 3000;

    // setup retry-axios config
    loginClient.defaults.raxConfig = {
        instance: loginClient,
        retry: retries,
        noResponseRetries: retries, // retry when no response received (such as on ETIMEOUT)
        statusCodesToRetry: [[500, 599]], // retry only on 5xx responses (no retry on 4xx responses)
        httpMethodsToRetry: ['POST', 'GET', 'HEAD', 'PUT'],
        backoffType: 'static', // options are 'exponential' (default), 'static' or 'linear'
        retryDelay,
        onRetryAttempt: (err) => {
            const cfg = rax.getConfig(err);
            logger.warn('No response received from AppID, retrying login request:', txID);
            logger.warn(`Retry attempt #${cfg.currentRetryAttempt}`, txID);
        },
    };

    rax.attach(loginClient);
    return loginClient;
};

const appIdUserInfoClient = (token) =>
    axios.create({
        baseURL: `${url}/userinfo`,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
            Authorization: token,
        },
    });

const appIdManagementClient = (token) => {
    const client = axios.create({
        baseURL: `${serverHost}/management/v4/${tenantID}`,
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            Authorization: token,
        },
    });
    return client;
};

const loginAppID = async (txID, username, password) => {
    try {
        validateConfig();
        const loginClient = appIdLoginClient(txID);

        const requestBody = {
            username,
            password,
            grant_type: 'password',
        };

        logger.debug('Calling AppID to retrieve auth token', txID);

        const response = await loginClient.post('/', querystring.stringify(requestBody));

        logger.info('Login request to AppID was successful', txID);

        return response.data;
    } catch (error) {
        logger.error(`Login request to AppID failed with error ${error}`, txID);

        const errorObj = new Error();
        if (error.response) {
            const errorResponse = error.response;
            errorObj.status = errorResponse.status;
            errorObj.statusText = errorResponse.statusText;

            if ('data' in errorResponse) {
                errorObj.message = errorResponse.data.error_description;
            }
        } else {
            errorObj.status = 500;
            errorObj.statusText = error.code;
            errorObj.message = error.message;
        }

        throw errorObj;
    }
};

const getUserInfoJwt = () => ({
    sub: '1d44cdc1-4b78-4ef7-a5a2-08aabc13619f',
    name: 'Tester POC',
    email: 'tester@poc.com',
    given_name: 'Tester',
    family_name: 'POC',
});

const getUserInfoAppId = async (txID, token) => {
    try {
        validateConfig();
        const appIdInfo = appIdUserInfoClient(token);
        const userInfo = await appIdInfo.post('/');
        return userInfo.data;
    } catch (error) {
        logger.error(`Userinfo request to AppID failed with error ${error}`, txID);

        const errorObj = new Error();
        if (error.response) {
            errorObj.status = error.response.status;
            errorObj.statusText = error.response.statusText;
            errorObj.message = error.data.error_description;
        } else {
            errorObj.status = 500;
            errorObj.statusText = error.code;
            errorObj.message = error.message;
        }

        throw errorObj;
    }
};

const getUserInfo = (txID, token) => {
    return process.env.AUTH_STRATEGY === 'DEVELOPMENT' ? getUserInfoJwt() : getUserInfoAppId(txID, token);
};

async function getScopes(txID, iamToken) {
    try {
        logger.debug(`Attempting to retrieve AppID scopes`, txID);
        const appIdClient = appIdManagementClient(`Bearer ${iamToken}`);
        const getScopesRes = await appIdClient.get(`/applications/${clientID}/scopes`);

        logger.debug(`Retrieved AppID scopes: ${JSON.stringify(getScopesRes.data)}`, txID);
        return getScopesRes.data;
    } catch (error) {
        const errMsg = `Failed to get AppID scopes: ${error.message}`;
        logger.error(errMsg, txID);
        const errorObj = new Error();
        errorObj.statusCode = error.response ? error.response.status : 500;
        errorObj.message = errMsg;
        throw errorObj;
    }
}

async function addScopes(txID, iamToken, scopes) {
    try {
        const getScopesRes = await getScopes(txID, iamToken);
        for (let i = 0; i < scopes.length; i += 1) {
            const newScope = scopes[i];
            const scopeExists = getScopesRes.scopes.includes(newScope);
            if (!scopeExists) {
                getScopesRes.scopes.push(newScope);
            }
        }

        logger.debug(`Attempting to add AppID scopes ${scopes}`, txID);
        logger.debug(JSON.stringify(getScopesRes));
        const appIdClient = appIdManagementClient(`Bearer ${iamToken}`);
        const addScopesRes = await appIdClient.put(`/applications/${clientID}/scopes`, getScopesRes);
        logger.info(`Added AppID scopes ${scopes}`, txID);
        return addScopesRes;
    } catch (error) {
        const errMsg = `Failed to add AppID scopes ${scopes}: ${error.message}`;
        logger.error(errMsg, txID);
        const errorObj = new Error();
        errorObj.statusCode = error.response ? error.response.status : 500;
        errorObj.message = errMsg;
        throw errorObj;
    }
}

async function deleteScopes(txID, iamToken, scopes) {
    try {
        const getScopesRes = await getScopes(txID, iamToken);

        for (let i = 0; i < scopes.length; i += 1) {
            const scopeToDelete = scopes[i];
            const scopeIndex = getScopesRes.scopes.indexOf(scopeToDelete);
            if (scopeIndex > -1) {
                getScopesRes.scopes.splice(scopeIndex, 1);
            }
        }

        logger.debug(`Attempting to delete AppID scopes ${scopes}`, txID);
        const appIdClient = appIdManagementClient(`Bearer ${iamToken}`);
        const deleteScopesRes = await appIdClient.put(`/applications/${clientID}/scopes`, getScopesRes);
        logger.info(`Deleted AppID scopes ${scopes}`, txID);
        return deleteScopesRes;
    } catch (error) {
        const errMsg = `Failed to delete AppID scopes ${scopes}: ${error.message}`;
        logger.error(errMsg, txID);
        const errorObj = new Error();
        errorObj.statusCode = error.response ? error.response.status : 500;
        errorObj.message = errMsg;
        throw errorObj;
    }
}

async function addRole(txID, iamToken, roleName, roleDescription, roleScopes) {
    try {
        const roleReqBody = {
            name: roleName,
            description: roleDescription,
            access: [
                {
                    application_id: clientID,
                    scopes: roleScopes
                }
            ]
        };
        logger.debug(`Attempting to add AppID role ${roleName}`, txID);
        const appIdClient = appIdManagementClient(`Bearer ${iamToken}`);
        const addRoleRes = await appIdClient.post(`/roles`, roleReqBody);
        logger.info(`Added AppID role ${roleName}`, txID);
        return addRoleRes;
    } catch (error) {
        const errMsg = `Failed to add AppID role ${roleName}: ${error.message}`;
        logger.error(errMsg, txID);
        const errorObj = new Error();
        errorObj.statusCode = error.response ? error.response.status : 500;
        errorObj.message = errMsg;
        throw errorObj;
    }
}

async function deleteRole(txID, iamToken, roleID) {
    try {
        logger.debug(`Attempting to delete AppID role ID ${roleID}`, txID);
        const appIdClient = appIdManagementClient(`Bearer ${iamToken}`);
        const deleteRoleRes = await appIdClient.delete(`/roles/${roleID}`);
        logger.info(`Deleted AppID role ID ${roleID}`, txID);
        return deleteRoleRes;
    } catch (error) {
        const errMsg = `Failed to delete AppID role ID ${roleID}: ${error.message}`;
        logger.error(errMsg, txID);
        const errorObj = new Error();
        errorObj.statusCode = error.response ? error.response.status : 500;
        errorObj.message = errMsg;
        throw errorObj;
    }
}

async function getRoles(txID, iamToken) {
    try {
        const appIdClient = appIdManagementClient(`Bearer ${iamToken}`);
        const roles = await appIdClient.get("/roles");
        return roles;
    } catch (error) {
        const errMsg = `Get AppID roles: ${error.message}`;
        logger.error(errMsg, txID);
        const errorObj = new Error();
        errorObj.statusCode = error.response ? error.response.status : 500;
        errorObj.message = errMsg;
        throw errorObj;
    }
}

async function registerUser(txID, iamToken, email, password, displayName) {
    const userReqBody = {
        displayName,
        password,
        emails: [
            {
                value: email,
                primary: true
            }
        ]
    };

    try {
        logger.debug('Attempting to register AppID user', txID);
        const appIdClient = appIdManagementClient(`Bearer ${iamToken}`);
        const registerUserRes = await appIdClient.post('/cloud_directory/Users', userReqBody);

        const userGUID = registerUserRes.data.id;
        logger.debug(`Registered AppID user id=${userGUID}}`, txID);
        return userGUID;
    } catch (error) {
        const { errorStatus, errorMsg } = utils.getErrorInfo(txID, error);
        const errMsg = `Failed to register AppID user: ${errorMsg}`;
        logger.error(errMsg, txID);
        const errorObj = new Error();
        errorObj.statusCode = errorStatus;
        errorObj.message = errMsg;
        throw errorObj;
    }
};

async function getUserSubID(txID, iamToken, userGUID) {
    try {
        logger.debug('Attempting to get AppID user subID', txID);
        const appIdClient = appIdManagementClient(`Bearer ${iamToken}`);
        const getUserRes = await appIdClient.get(`/cloud_directory/${userGUID}/userinfo`);

        logger.debug(`Retrieved AppID user sub: ${getUserRes.data.sub}`, txID);
        return getUserRes.data.sub
    } catch (error) {
        const errMsg = `Failed to retrieve AppID user sub: ${error.message}`;
        logger.error(errMsg, txID);
        const errorObj = new Error();
        errorObj.statusCode = error.response ? error.response.status : 500;
        errorObj.message = errMsg;
        throw errorObj;
    }
};

async function assignRoleToUser(txID, iamToken, userSubID, roleName) {
    const assignRoleReqBody = {
        roles: {
            names: [roleName]
        }
    };
    try {
        logger.debug(`Attempting to assign role ${roleName} to AppID user sub=${userSubID}`, txID);
        const appIdClient = appIdManagementClient(`Bearer ${iamToken}`);
        const assignRoleRes = await appIdClient.put(`/users/${userSubID}/roles`, assignRoleReqBody);

        logger.debug(`Assigned role ${roleName} to AppID user sub=${userSubID}`, txID);
        return assignRoleRes;
    } catch (error) {
        const errMsg = `Failed to assign role ${roleName} to AppID user sub=${userSubID}: ${error.message}`;
        logger.error(errMsg, txID);
        const errorObj = new Error();
        errorObj.statusCode = error.response ? error.response.status : 500;
        errorObj.message = errMsg;
        throw errorObj;
    }
};

async function addAttributes(txID, iamToken, userSubID, attributes) {
    const customAttributes = {
        attributes
    };
    try {
        logger.debug(`Attempting to set custom attributes to AppID user sub=${userSubID}`, txID);
        const appIdClient = appIdManagementClient(`Bearer ${iamToken}`);
        const assignAttributes = await appIdClient.put(`/users/${userSubID}/profile`, customAttributes);
        logger.debug(`set attributes to AppID user sub=${userSubID}`, txID);
        return assignAttributes;
    } catch (error) {
        const errMsg = `Failed to set attributes to AppID user sub=${userSubID}: ${error.message}`;
        logger.error(errMsg, txID);
        const errorObj = new Error();
        errorObj.statusCode = error.response ? error.response.status : 500;
        errorObj.message = errMsg;
        throw errorObj;
    }
};

async function deleteUser(txID, iamToken, userGUID) {
    try {
        logger.debug(`Attempting to delete AppID user id=${userGUID}`, txID);
        const appIdClient = appIdManagementClient(`Bearer ${iamToken}`);
        const assignRoleRes = await appIdClient.delete(`/cloud_directory/Users/${userGUID}`);

        logger.debug(`Deleted AppID user id=${userGUID}`, txID);
        return assignRoleRes;
    } catch (error) {
        const errMsg = `Failed to delete AppID user id=${userGUID}: ${error.message}`;
        logger.error(errMsg, txID);
        const errorObj = new Error();
        errorObj.statusCode = error.response ? error.response.status : 500;
        errorObj.message = errMsg;
        throw errorObj;
    }
};

module.exports = {
    loginAppID,
    getUserInfo,
    addScopes,
    getScopes,
    deleteScopes,
    addRole,
    deleteRole,
    registerUser,
    getUserSubID,
    assignRoleToUser,
    deleteUser,
    addAttributes,
    getRoles
};
