/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 */

module.exports = {
    resourceType: 'Observation',
    status: 'final',
    category: [
        {
            coding: [
                {
                    system: 'http://hl7.org/fhir/observation-category',
                    code: 'laboratory',
                    display: 'Laboratory',
                },
            ],
        },
    ],
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
    occurrenceDateTime: '{{credentialSubject.occurenceDate}}',
    interpretation: {
        coding: [
            {
                system: 'http://hl7.org/fhir/ValueSet/observation-interpretation',
                code: {
                    $fetch: '{{credentialSubject.result}}',
                    $function: (result) => {
                        if (result === 'Positive') return 'P';
                        if (result === 'Negative') return 'N';
                        return 'U';
                    },
                },
                display: '{{credentialSubject.result}}',
            },
        ],
    },
};
