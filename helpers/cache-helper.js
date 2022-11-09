/* eslint-disable no-underscore-dangle */
/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 */
const sharedMemoryController = require('cluster-shared-memory');
const config = require('../config');

const setLRUOptions = async () => {
    if (config.cache.cacheEnabled) {
        // eslint-disable-next-line prefer-const
        let { maxAge, ttlResolution, ...restOption } = config.cache.options;
        // Coverting maxAge and ttlResolution from seconds to milliseconds.
        maxAge *= 1000;
        ttlResolution *= 1000;
        sharedMemoryController.setLRUOptions({ maxAge, ttlResolution, ...restOption });
        return true;
    }
    return false
}


const set = async (key, value) => {
    if (config.cache.cacheEnabled) {
        const result = await sharedMemoryController.mutex(key, async () => {
            const output = await sharedMemoryController.setLRU(key, value);
            return output;
        });
        return result;
    }
    return null;
}

const get = async (key) => {
    if (config.cache.cacheEnabled) {
        const value = await sharedMemoryController.getLRU(key);
        return value;
    }
    return null;
}

const remove = async (key) => {
    if (config.cache.cacheEnabled) {
        const result = await sharedMemoryController.mutex(key, async () => {
            const output = await sharedMemoryController.removeLRU(key);
            return output;
        });
        return result;
    }

    return null;
}

module.exports = {
    setLRUOptions,
    set,
    get,
    remove
};