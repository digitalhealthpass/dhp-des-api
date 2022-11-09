/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 */

// TBD this is used demo purpose - need proper jslt for extraction
module.exports = {
    resourceType: 'Immunization',
    patient: {
        resourceType: 'Patient',
        identifier: {
            system: '{{credentialSubject.subject.identity[0].system}}',
            type: '{{credentialSubject.subject.identity[0].type}}',
            value: '{{credentialSubject.subject.identity[0].value}}',
        },
        name: [
            {
                family: '{{credentialSubject.subject.name.family}}',
                given: '{{credentialSubject.subject.name.given}}',
            },
        ],
        gender: '{{credentialSubject.subject.gender}}',
        birthDate: '{{credentialSubject.subject.birthDate}}',
        address: [{ text: '{{credentialSubject.subject.address}}' }],
        telecom: [
            {
                system: 'phone',
                value: '{{credentialSubject.subject.phone}}',
            },
            {
                system: 'email',
                value: '{{credentialSubject.subject.email}}',
            },
        ],
    },
    lotNumber: '{{credentialSubject.lotNumber}}',
    manufacturer: '{{credentialSubject.manufacturer}}',
    occurrenceDateTime: '{{credentialSubject.occurrenceDateTime}}',
    status: '{{credentialSubject.status}}',
    vaccineCode: '{{credentialSubject.vaccineCode}}',
};
