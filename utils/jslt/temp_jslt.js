/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 */

module.exports = {
    resourceType: 'Observation',
    id: 'temperature',
    code: {
        coding: [
            {
                system: 'http://loinc.org',
                code: '39106-0',
                display: 'Temperature of Skin',
            },
        ],
    },
    subject: {
        identifier: {
            system: 'Self-generated',
            value: '{{credentialSubject.id}}',
        },
    },
    effectiveDateTime: '{{credentialSubject.date}}',
    valueQuantity: {
        value: '{{credentialSubject.temperature}}',
        unit: '{{credentialSubject.units}}',
        system: 'http://unitsofmeasure.org',
        code: { $fetch: '{{credentialSubject.units}}', $function: (unit) => (unit === 'F' ? '[degF]' : 'Cel') },
    },
};
