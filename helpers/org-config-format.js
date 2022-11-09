/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 */
exports.ORG_CREDENTIAL_PARTNER_CONFIG = {
    "description": "Organization config format",
    "type": "object",
    "properties": {
        "userRegistrationConfig": {
            "type": "object",
            "properties": {
                "credentialPartners": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "id": {
                                "type": "string"
                            },
                            "url": {
                                "type": "string"
                            },
                            "mapper": {
                                "type": "object"
                            },
                            "partnerKeys": {
                                "type": "array",
                                "items": {
                                    "type": "object"
                                }
                            }
                        },
                        "required": [
                            "id"
                        ]
                    }
                }
            },
            "required": [
                "credentialPartners"
            ]
        },
    },
    "required": [
        "userRegistrationConfig"
    ]
}
