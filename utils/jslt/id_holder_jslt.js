/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 */

module.exports = {
    resourceType: 'Patient',
    identifier: [
        {
            type: {
                coding: [
                    {
                        system: 'http://ibm.com/coding',
                        code: 'PK',
                    },
                ],
            },
            system: 'self-generated',
            value: '{{credentialSubject.id}}',
        },
    ],
    gender: {
        url: 'http://hl7.org/fhir/StructureDefinition/us-core-birth-sex',
        extension: {
            coding: [
                {
                    system: 'http://hl7.org/fhir/v3/AdministrativeGender',
                    code: '{{credentialSubject.gender}}',
                },
            ],
        },
    },
    ageRange: {
        low: {
            value: '{{credentialSubject.ageRange}}',
        },
        high: {
            value: '{{credentialSubject.ageRange}}',
        },
    },
    race: [
        {
            url: 'http://www.hl7.org/fhir/us/core/StructureDefinition-us-core-race.html',
            extension: [
                {
                    url: 'ombCategory',
                    coding: {
                        system: 'http://hl7.org/fhir/v3/Race',
                        code: '{{credentialSubject.race}}',
                    },
                },
            ],
        },
    ],
    address: [
        {
            state: '{{credentialSubject.location}}',
            country: 'United States',
        },
    ],
};
