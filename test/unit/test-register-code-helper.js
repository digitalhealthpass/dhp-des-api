/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 */

const { expect } = require('chai');

const regCodeHelper = require('../../helpers/register-code-helper');

const entity = 'entity';
const code = '123-45';
const id = 'hit-id-0';
const mobile = '555-555-5555';
const expiration = '987654321';

describe('test-register-code-helper', () => {
    describe('prepareDbName()', () => {
        it('builds a database name', () => {
            const db = 'database';
            const expected = `${entity}-${db}`;

            const dbName = regCodeHelper.prepareDbName(entity, db);
            expect(dbName).to.equal(expected);
        });
    });

    describe('buildRegCodeDoc()', () => {
        it('builds a registration code document', () => {
            const doc = regCodeHelper.buildRegCodeDoc(code, expiration);

            const expectedProperties = [
                '_id',
                'registerCode',
                'status',
                'createdTimestamp',
                'updatedTimestamp',
                'expirationTimestamp',
            ];
            expectedProperties.forEach((prop) => {
                expect(doc).to.have.property(prop);
            });

            expect(doc._id).to.equal(code);
            expect(doc.registerCode).to.equal(code);
            expect(doc.status).to.equal(regCodeHelper.CODE_STATUS.NEW);
            expect(doc.expirationTimestamp).to.equal(expiration);
        });
    });

    describe('prepareRegCodeDocs()', () => {
        it('builds registration code docs for an entity', () => {
            const codes = [code];

            const expectedCodeDoc = regCodeHelper.buildRegCodeDoc(code, expiration);
            const { regCodeDocs, uploadErrs } = regCodeHelper.prepareRegCodeDocs('', codes, expiration);

            expect(uploadErrs).to.be.empty;
            expect(regCodeDocs).to.have.length(1);
            expect(regCodeDocs[0]).to.deep.equal(expectedCodeDoc);
        });

        // HIT has org-specific fields for which we need to test
        it('builds registration code docs for HIT', () => {
            const codes = [{ registerCode: code, id, mobile }];

            const expectedCodeDoc = regCodeHelper.buildRegCodeDoc(codes[0], expiration);
            const { regCodeDocs, uploadErrs } = regCodeHelper.prepareRegCodeDocs('', codes, expiration);

            expect(uploadErrs).to.be.empty;
            expect(regCodeDocs).to.have.length(1);
            expect(regCodeDocs[0]).to.deep.equal(expectedCodeDoc);
        });

        it('identifies invalid registration codes (too short)', () => {
            const shortCode = 'x';
            const codes = [shortCode];

            const { regCodeDocs, uploadErrs } = regCodeHelper.prepareRegCodeDocs('', codes, expiration);

            const expectedError = {
                error: 'invalid',
                reason: 'Code must be between 5 and 64 characters',
                registerCode: shortCode,
            };

            expect(regCodeDocs).to.be.empty;
            expect(uploadErrs).to.have.length(1);
            expect(uploadErrs[0]).to.deep.equal(expectedError);
        });

        it('identifies invalid registration codes (too long)', () => {
            const longCode = 'xxxxxxxx-xxxxxxxx-xxxxxxxx-xxxxxxxx-xxxxxxxx-xxxxxxxx-xxxxxxxx-xxxxxxxx-xxxxxxxx';
            const codes = [longCode];

            const { regCodeDocs, uploadErrs } = regCodeHelper.prepareRegCodeDocs('', codes, expiration);

            const expectedError = {
                error: 'invalid',
                reason: 'Code must be between 5 and 64 characters',
                registerCode: longCode,
            };

            expect(regCodeDocs).to.be.empty;
            expect(uploadErrs).to.have.length(1);
            expect(uploadErrs[0]).to.deep.equal(expectedError);
        });
    });
});
