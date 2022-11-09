/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 */

const jwt = require('jsonwebtoken');

const constants = require('../helpers/constants');
const helper = require('../helpers/app-id-helper');
const Logger = require('../config/logger');

const logger = new Logger('user-controller');

// eslint-disable-next-line max-len
const emailRegex = /[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?/;

const getJwtToken = (txID, email) => {
    logger.debug('Get local jwt token for login', txID);

    const token = jwt.sign(
        {
            email,
            subject: '1d44cdc1-4b78-4ef7-a5a2-08aabc13619f',
            given_name: 'Tester',
            family_name: 'POC',
            tenant: '14dbfeaa-d6bf-4c10-974c-2c45df4666df',
            name: 'Tester POC',
            organization: 'HealthPassOrg',
        },
        'secretkey$5',
        {
            expiresIn: '8h',
        }
    );

    return {
        access_token: token,
        id_token: token,
        token_type: 'Bearer',
        expires_in: 28800,
        scope: 'test',
    };
};

// eslint-disable-next-line complexity, no-unused-vars
exports.login = async (req, res, next) => {
    const txID = req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID];
    logger.info('Entering POST /users/login controller', txID);

    const { email, password } = req.body;
    logger.debug(`Attempting login for ${email}`, txID);

    // Note: keep error message for bad login generic for security - currently same as AppID message
    if (!email || !password || !emailRegex.test(email)) {
        const errMsg = 'The email or password that you entered is incorrect.';
        logger.response(400, `Failed to login user: ${errMsg}`, txID);
        return res.status(400).json({
            error: {
                message: errMsg,
            },
        });
    }

    let authObject = {};
    try {
        authObject =
            process.env.AUTH_STRATEGY === 'DEVELOPMENT' ?
                getJwtToken(txID, email) : await helper.loginAppID(txID, email, password);
    } catch (error) {
        // only loginAppID() can throw an error
        logger.error(`Failed to login user with AppID: ${error.message}`, txID);

        const errStatus = error.status || 500;
        const errMsg = error.message || 'Login failed';
        logger.response(errStatus, errMsg, txID);
        return res.status(errStatus).json({
            error: {
                message: errMsg,
            },
        });
    }

    return res.status(200).json(authObject);
};

const getAllAttributes = async (accessToken, txID) => {
    try {
        if (accessToken) {
            const decoded = jwt.decode(accessToken);
            return {
                orgs: decoded.orgs,
                org: decoded.org
            }
        }
    } catch (error) {
        const errMsg = `Failed to user custom attribures from token: ${error.message}`;
        logger.error(errMsg, txID);
    }
    return null
};

exports.getAttributes = async (req, res) => {

    const txID = req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID];
    const accessToken = req.headers.authorization
        ? req.headers.authorization.split(' ')[1]
        : null

    const attributes = await getAllAttributes(accessToken, txID);
    if (!attributes) {
        res.status(401).json({
            error: "No custom attibutes available"
        });
    }
    return res.status(200).json({
        ...attributes
    });

};
