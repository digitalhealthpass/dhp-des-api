/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 */

/* eslint-disable no-underscore-dangle */

const rewire = require("rewire");
const { expect } = require('chai');

// using rewire to unit test private functions
const hdDataHelper = rewire('../../../entities/holder-download/data-helper');
const hdIDHelper = require('../../../entities/holder-download/id-helper');

describe('test-holder-download-data-helper', () => {
    describe('prepareTestResultData()', () => {
        describe('with valid test result data', () => {
            it('should pass with all expected values', () => {
                const entityData = {};
                const reqBody = {
                    id: 'id-test',
                    clientName: 'client1',
                    givenName: 'given-name-test',
                    familyName: 'family-name-test',
                    testId: 'test-id-test',
                    testType: 'test-type-test',
                    testResult: 'test-result-test',
                    date: 'date-test'
                };
                const prepareTestResultData = hdDataHelper.__get__('prepareTestResultData');
                const testResultData = prepareTestResultData('', reqBody, entityData);
                const expectedID = hdIDHelper.getHolderID(reqBody);

                expect(testResultData).to.not.be.empty;
                expect(testResultData).to.have.property('id');
                expect(testResultData.id).to.equal(expectedID);
                expect(testResultData).to.have.property('name');
                expect(testResultData.name).to.have.property('givenName');
                expect(testResultData.name.givenName).to.equal(reqBody.givenName);
                expect(testResultData.name).to.have.property('familyName');
                expect(testResultData.name.familyName).to.equal(reqBody.familyName);
                expect(testResultData).to.have.property('testId');
                expect(testResultData.testId).to.equal(reqBody.testId);
                expect(testResultData).to.have.property('testType');
                expect(testResultData.testType).to.equal(reqBody.testType);
                expect(testResultData).to.have.property('result');
                expect(testResultData.result).to.equal(reqBody.testResult);
                expect(testResultData).to.have.property('date');
                expect(testResultData.date).to.equal(reqBody.date);
            });

            it('should pass with some expected values', () => {
                const entityData = {};
                const reqBody = {
                    id: 'id-test',
                    clientName: 'client1',
                    givenName: 'given-name-test',
                    testId: 'test-id-test',
                    testType: 'test-type-test',
                    testResult: 'test-result-test',
                };
                const prepareTestResultData = hdDataHelper.__get__('prepareTestResultData');
                const testResultData = prepareTestResultData('', reqBody, entityData);
                const expectedID = hdIDHelper.getHolderID(reqBody);

                expect(testResultData).to.not.be.empty;
                expect(testResultData).to.have.property('id');
                expect(testResultData.id).to.equal(expectedID);
                expect(testResultData).to.have.property('name');
                expect(testResultData.name).to.have.property('givenName');
                expect(testResultData.name.givenName).to.equal(reqBody.givenName);
                expect(testResultData.name).to.have.property('familyName');
                expect(testResultData.name.familyName).to.be.undefined;
                expect(testResultData).to.have.property('testId');
                expect(testResultData.testId).to.equal(reqBody.testId);
                expect(testResultData).to.have.property('testType');
                expect(testResultData.testType).to.equal(reqBody.testType);
                expect(testResultData).to.have.property('result');
                expect(testResultData.result).to.equal(reqBody.testResult);
                expect(testResultData).to.have.property('date');
                expect(testResultData.date).to.be.undefined;
            });

            it('should pass with extra values', () => {
                const entityData = {};
                const reqBody = {
                    id: 'id-test',
                    clientName: 'client1',
                    givenName: 'given-name-test',
                    familyName: 'family-name-test',
                    testId: 'test-id-test',
                    testType: 'test-type-test',
                    testResult: 'test-result-test',
                    date: 'date-test',
                    extra: 'extra-test'
                };
                const prepareTestResultData = hdDataHelper.__get__('prepareTestResultData');
                const testResultData = prepareTestResultData('', reqBody, entityData);
                const expectedID = hdIDHelper.getHolderID(reqBody);

                expect(testResultData).to.not.be.empty;
                expect(testResultData).to.have.property('id');
                expect(testResultData.id).to.equal(expectedID);
                expect(testResultData).to.have.property('name');
                expect(testResultData.name).to.have.property('givenName');
                expect(testResultData.name.givenName).to.equal(reqBody.givenName);
                expect(testResultData.name).to.have.property('familyName');
                expect(testResultData.name.familyName).to.equal(reqBody.familyName);
                expect(testResultData).to.have.property('testId');
                expect(testResultData.testId).to.equal(reqBody.testId);
                expect(testResultData).to.have.property('testType');
                expect(testResultData.testType).to.equal(reqBody.testType);
                expect(testResultData).to.have.property('result');
                expect(testResultData.result).to.equal(reqBody.testResult);
                expect(testResultData).to.have.property('date');
                expect(testResultData.date).to.equal(reqBody.date);
                expect(testResultData.date).to.not.have.property('extra');
            });
        });
    });
});