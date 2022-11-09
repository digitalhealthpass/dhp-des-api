/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
* 
*/

const axios = require('axios');

const querystring = require('querystring');
const https = require('https');

const Logger = require('../config/logger');

const logger = new Logger('cloud-iam-helper');

async function getCloudIAMToken(txID, serviceApiKey) {
    try {
        logger.info('getCloudIAMToken()');
        const iamUrl = 'https://iam.cloud.ibm.com/identity/token';
        const apikey = serviceApiKey || process.env.APP_ID_IAM_KEY;
    
        const agent = new https.Agent({
            rejectUnauthorized: false,
        });

        const reqBody = querystring.stringify({
            grant_type: 'urn:ibm:params:oauth:grant-type:apikey',
            apikey,
        });
        
        const response = await axios.post(
            iamUrl,
            reqBody,
            {
                httpsAgent: agent,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    accept: 'application/json',
                }
            }
        );

        return response.data;
    } catch (error) {
        const errMsg = `Failed to get Cloud IAM token: ${error.message}`;
        logger.error(errMsg, txID);
        const errorObj = new Error();
        errorObj.statusCode = error.response ? error.response.status : 500;
        errorObj.message = errMsg;
        throw errorObj;
    }
}

module.exports = {
    getCloudIAMToken
};
