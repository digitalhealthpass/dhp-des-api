/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 */

/* eslint-disable max-lines-per-function */

const { expect } = require('chai');
const moment = require('moment');

const dataHelper = require('../../helpers/data-helper');

describe('test-data-helper', () => {
    describe('validateReportDates()', () => {
        describe('with valid dates', () => {
            it('should pass with standard start and end dates', () => {
                const today = moment();
                const start = today.format('YYYY-MM-DD');
                const end = today.add(1, 'd').format('YYYY-MM-DD');

                const errorMessage = dataHelper.validateReportDates(start, end, 0);
                expect(errorMessage).to.be.empty;
            });

            it('should pass if start and end are the same', () => {
                const start = moment().format('YYYY-MM-DD');
                const end = start;

                const errorMessage = dataHelper.validateReportDates(start, end, 0);
                expect(errorMessage).to.be.empty;
            });
        });

        describe('with invalid dates', () => {
            it('should fail with a bad start date', () => {
                const today = moment();
                const start = 'fake-date';
                const end = today.format('YYYY-MM-DD');

                const errorMessage = dataHelper.validateReportDates(start, end, 0);
                expect(errorMessage).to.not.be.empty;
            });

            it('should fail with a bad end date', () => {
                const today = moment();
                const start = today.format('YYYY-MM-DD');
                const end = 'fake-date';

                const errorMessage = dataHelper.validateReportDates(start, end, 0);
                expect(errorMessage).to.not.be.empty;
            });

            it('should fail if start is after end', () => {
                const today = moment();
                const start = today.format('YYYY-MM-DD');
                const end = today.subtract(1, 'd').format('YYYY-MM-DD');

                const errorMessage = dataHelper.validateReportDates(start, end, 0);
                expect(errorMessage).to.not.be.empty;
            });
        });
    });

    describe('buildReportCloudantQuery()', () => {
        it('should return a Cloudant query object', () => {
            const today = moment();
            const start = today.format('YYYY-MM-DD');
            const end = today.add(1, 'd').format('YYYY-MM-DD');

            const startDate = new Date(start).toISOString();
            const endDate = moment
                .utc(end)
                .endOf('day')
                .toISOString();

            const query = dataHelper.buildReportCloudantQuery(start, end);

            expect(query).to.have.property('fields');
            expect(query).to.have.property('sort');
            expect(query).to.have.property('selector');
            expect(query.selector).to.deep.equal({
                submissionTimestamp: {
                    $gte: startDate,
                    $lte: endDate,
                },
            });
        });
    });

    describe('buildReport()', () => {
        const docs = [
            {
                publicKey: 'publicKey_0',
                credID: 'credID_0',
                credType: 'temp',
                schemaID: 'schemaID_temp',
                submissionID: 'submissionID-11',
                submissionTimestamp: '2020-10-24T00:00:00.000Z',
            },
            {
                publicKey: 'publicKey_1',
                credID: 'credID_1',
                credType: 'survey',
                schemaID: 'schemaID_survey',
                submissionID: 'submissionID-12',
                submissionTimestamp: '2020-10-24T00:00:00.000Z',
            },
            {
                publicKey: 'publicKey_2',
                credID: 'credID_2',
                credType: 'test',
                schemaID: 'schemaID_test',
                submissionID: 'submissionID-13',
                submissionTimestamp: '2020-10-24T00:00:00.000Z',
            },
            {
                publicKey: 'publicKey_3',
                credID: 'credID_3',
                credType: 'healthpass',
                schemaID: 'schemaID_healthpass',
                submissionID: 'submissionID-14',
                submissionTimestamp: '2020-10-24T00:00:00.000Z',
            },
        ];

        it('builds a report', () => {
            const expectedReport = {
                types: [
                    'totalSubmissions',
                    'totalCredentials',
                    'tempCredentials',
                    'surveyCredentials',
                    'testCredentials',
                    'healthpassCredentials',
                ],
                data: {
                    '2020-10-24': {
                        tempCredentials: 1,
                        surveyCredentials: 1,
                        testCredentials: 1,
                        healthpassCredentials: 1,
                        totalCredentials: 4,
                        totalSubmissions: 4,
                    },
                },
                averages: {
                    tempCredentials: 1,
                    surveyCredentials: 1,
                    testCredentials: 1,
                    healthpassCredentials: 1,
                    totalCredentials: 4,
                    totalSubmissions: 4,
                },
            };

            const report = dataHelper.buildReport(docs);
            expect(report).to.deep.equal(expectedReport);
        });
    });
});
