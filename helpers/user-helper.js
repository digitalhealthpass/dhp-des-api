/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
* 
*/

const Logger = require('../config/logger');
const entityHelper = require('../entities');

const logger = new Logger('user-helper');

// Prepare user data for credential
const prepareUserCredentialData = async (txID, reqBody, entityData, entity) => {
    const regEntity = entity.toLowerCase();

    const entityHelperName = entityData.entityType || regEntity;
    const existEntityHelpers = await entityHelper.existRegEntityHelpers(txID, entityHelperName);
    if (!existEntityHelpers) {
        logger.error(`Failed to prepare user data, no entity helper exist for entity ${entity}`, txID);
        return null;
    }

    // eslint-disable-next-line global-require, import/no-dynamic-require
    const entityUserHelper = require(`../entities/${entityHelperName}/user-helper`);
    return entityUserHelper.prepareUserCredentialData(txID, reqBody, entityData);
};

module.exports = {
    prepareUserCredentialData
};