/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 */

const { expect } = require('chai');

const config = require('../../config');
const utils = require('../../utils');

// eslint-disable-next-line max-lines-per-function
describe('test-utils', () => {
    describe('getVerificationCodeExpiration()', () => {
        it('get verification code expiration timestamp', () => {
            const currentDate = new Date();
            const currentTimestamp = Math.round(currentDate.getTime() / 1000);
            
            const { validMinutes } = config.verificationCode;
            const approxExpectedExpirationTimestamp = currentTimestamp + (60 * validMinutes);

            const expirationTimestamp = utils.getVerificationCodeExpiration();

            expect(expirationTimestamp).to.be.greaterThan(currentTimestamp);
            expect(expirationTimestamp).to.be.at.most(approxExpectedExpirationTimestamp);
            expect(expirationTimestamp).to.be.at.least(approxExpectedExpirationTimestamp - 1);
        });
    });

    describe('validateRow()', () => {
        it('validate valid row', () => {
            const validRow = {
                id: 'valid'
            };
            const errMsg = utils.validateRow(validRow);
            expect(errMsg).to.equal("");
        });

        it('validate empty row', () => {
            const validRow = {
                id: ''
            };
            const errMsg = utils.validateRow(validRow);
            expect(errMsg).to.equal('empty');
        });
        
        it('validate invalid row - empty field', () => {
            const validRow = {
                id: '',
                clientName: 'client1'
            };
            const errMsg = utils.validateRow(validRow);
            expect(errMsg).to.equal(`Missing 'id' value`);
        });

        it('validate invalid row - invalid mobile', () => {
            const validRow = {
                id: 'valid',
                mobile: 'invalid'
            };
            const errMsg = utils.validateRow(validRow);
            expect(errMsg).to.equal(`Invalid 'mobile' value`);
        });

        it('validate invalid row - value too long', () => {
            const validRow = {
                id: Array(102).join('x')
            };
            const errMsg = utils.validateRow(validRow);
            expect(errMsg).to.equal(`Length of 'id' value exceeds max of 100`);
        });
    });

    describe('validateRows()', () => {
        it('validate valid rows', () => {
            const originalRows = [ { id: 'valid' } ];
            
            const rowsToValidate = originalRows.map((row) => JSON.parse(JSON.stringify(row)));
            const validateRes = utils.validateRows('tx1', rowsToValidate, 5);
            const { validatedRows, invalidRows } = validateRes.data;
            expect(validateRes.status).to.equal(200);
            
            expect(validatedRows).to.have.lengthOf(1);
            const expectedValidRow1 = { 
                ...originalRows[0],
                rowID: 0
            };
            expect(validatedRows[0]).to.deep.equal(expectedValidRow1);

            expect(invalidRows).to.have.lengthOf(0);
        });

        it('validate partially valid rows', () => {
            const originalRows = [
                { id: 'valid' },
                { id: 'valid', clientName: '' },
                { id: '', mobile: '' },
                { id: 'valid', mobile: 'invalid' },
                { id: Array(102).join('x') }
            ];

            const rowsToValidate = originalRows.map((row) => JSON.parse(JSON.stringify(row)));
            const validateRes = utils.validateRows('tx1', rowsToValidate, 10);
            const { invalidRows } = validateRes.data;
            expect(validateRes.status).to.equal(400);

            // check invalid rows
            expect(invalidRows).to.have.lengthOf(3);
            
            const expectedInvalidRow0 = { 
                ...originalRows[1],
                invalidMessage: "Missing 'clientName' value",
                rowID: 1
            };
            expect(invalidRows[0]).to.deep.equal(expectedInvalidRow0);
            
            const expectedInvalidRow1 = { 
                ...originalRows[3],
                invalidMessage: "Invalid 'mobile' value",
                rowID: 3
            };
            expect(invalidRows[1]).to.deep.equal(expectedInvalidRow1);

            const expectedInvalidRow2 = { 
                ...originalRows[4],
                invalidMessage: "Length of 'id' value exceeds max of 100",
                rowID: 4
            };
            expect(invalidRows[2]).to.deep.equal(expectedInvalidRow2);
        });

        it('validate empty rows', () => {
            const originalRows = [ { id: '' } ];

            const rowsToValidate = originalRows.map((row) => JSON.parse(JSON.stringify(row)));
            const validateRes = utils.validateRows('tx1', rowsToValidate, 5);
            const { validatedRows, invalidRows } = validateRes.data;
            expect(validateRes.status).to.equal(200);

            expect(validatedRows).to.have.lengthOf(0);
            expect(invalidRows).to.have.lengthOf(0);

        });

        it('validate invalid rows', () => {
            const originalRows = [
                { mobile: 'invalid' }
            ];

            const rowsToValidate = originalRows.map((row) => JSON.parse(JSON.stringify(row)));
            const validateRes = utils.validateRows('tx1', rowsToValidate, 10);
            const { invalidRows } = validateRes.data;
            expect(validateRes.status).to.equal(400);

            // check invalid rows
            expect(invalidRows).to.have.lengthOf(1);
            
            const expectedInvalidRow0 = { 
                ...originalRows[0],
                invalidMessage: "Invalid 'mobile' value",
                rowID: 0
            };
            expect(invalidRows[0]).to.deep.equal(expectedInvalidRow0);
        });
    });
});
