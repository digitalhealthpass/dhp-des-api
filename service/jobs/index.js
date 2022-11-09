/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 */

const { removeDocumentByExpirationDays } = require("./cloudant-jobs")

module.exports = [
    removeDocumentByExpirationDays,
]