/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 */

const cron = require('node-cron')
const jobs  = require("../jobs")
const Logger = require('../../config/logger');

const logger = new Logger('cron-job');

const cronService = () => {
    try {
        // eslint-disable-next-line no-restricted-syntax
        for (const job of jobs) {
            logger.info(`Schedule job: ${job.name}; schedule = ${job.schedule}; option = ${JSON.stringify(job.option)}`)
            cron.schedule(job.schedule, async () => job.action(), job.option)
        }
    } catch (e) {
        logger.error(`cron-service Error: ${e.message}`)
        throw e
    }
}

module.exports = {
    cronService
}
