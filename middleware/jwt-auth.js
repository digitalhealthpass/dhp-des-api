/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 */

const jwt = require('jsonwebtoken');

const checkAuth = (req, res, next) => {
    try {
        const token = req.headers.authorization.split(' ')[1];
        const decoded = jwt.verify(token, 'secretkey$5');

        if (!req.user) {
            req.user = {
                email: decoded.email,
                sub: decoded.sub,
                given_name: decoded.given_name,
                family_name: decoded.family_name,
                tenant: decoded.tenant,
                name: decoded.name,
                organization: decoded.organization,
            };
        }
    } catch {
        return res.status(401).json({
            error: {
                message: 'Authorization failed',
            },
        });
    }

    return next();
};

module.exports = checkAuth;
