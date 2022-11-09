/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 */

const { expect } = require('chai');

const userHelper = require('../../helpers/user-helper');
const hdIDHelper = require('../../entities/holder-download/id-helper');
const nihIDHelper = require('../../entities/nih/id-helper');

// eslint-disable-next-line max-lines-per-function
describe('test-user-helper', () => {
    // eslint-disable-next-line max-lines-per-function
    describe('prepareUserCredentialData() - holder-download', () => {
        const entity = 'testorg1';

        describe('with valid user data', () => {
            it('should pass with all expected values', async () => {
                const reqBody = {
                    id: 'id-test',
                    clientName: 'client1',
                    name: 'name-test',
                    organization: 'hit',
                    location: 'US-NY'
                };
                const entityData = {
                    entityType: 'holder-download',
                    userData: [
                        'name',
                        'organization',
                        'location'
                    ]
                };
                const testUserData = await userHelper.prepareUserCredentialData('tx1', reqBody, entityData, entity);
                const expectedID = hdIDHelper.getHolderID(reqBody);
                expect(testUserData).to.not.be.empty;
                expect(testUserData).to.have.property('id');
                expect(testUserData.id).to.equal(expectedID);
                expect(testUserData).to.have.property('type');
                expect(testUserData.type).to.equal('id');
                expect(testUserData).to.have.property('name');
                expect(testUserData.name).to.equal(reqBody.name);
                expect(testUserData).to.have.property('organization');
                expect(testUserData.organization).to.equal(reqBody.organization);
                expect(testUserData).to.have.property('location');
                expect(testUserData.location).to.equal(reqBody.location);
            });

            it('should pass with some expected values', async () => {
                const reqBody = {
                    id: 'id-test',
                    clientName: 'client1',
                    name: 'name-test',
                    organization: 'hit',
                };
                const entityData = {
                    entityType: 'holder-download',
                    userData: [
                        'name',
                        'organization',
                        'location'
                    ]
                };
                const testUserData = await userHelper.prepareUserCredentialData('tx1', reqBody, entityData, entity);
                const expectedID = hdIDHelper.getHolderID(reqBody);
                expect(testUserData).to.not.be.empty;
                expect(testUserData).to.have.property('id');
                expect(testUserData.id).to.equal(expectedID);
                expect(testUserData).to.have.property('type');
                expect(testUserData.type).to.equal('id');
                expect(testUserData).to.have.property('name');
                expect(testUserData.name).to.equal(reqBody.name);
                expect(testUserData).to.have.property('organization');
                expect(testUserData.organization).to.equal(reqBody.organization);
                expect(testUserData).to.have.property('location');
                expect(testUserData.location).to.be.undefined;
            });

            it('should pass with extra values', async () => {
                const reqBody = {
                    id: 'id-test',
                    clientName: 'client1',
                    name: 'name-test',
                    organization: 'hit',
                    location: 'US-NY',
                    extra: 'extra'
                };
                const entityData = {
                    entityType: 'holder-download',
                    userData: [
                        'name',
                        'organization',
                        'location'
                    ]
                };
                const testUserData = await userHelper.prepareUserCredentialData('tx1', reqBody, entityData, entity);
                const expectedID = hdIDHelper.getHolderID(reqBody);
                expect(testUserData).to.not.be.empty;
                expect(testUserData).to.have.property('id');
                expect(testUserData.id).to.equal(expectedID);
                expect(testUserData).to.have.property('type');
                expect(testUserData.type).to.equal('id');
                expect(testUserData).to.have.property('name');
                expect(testUserData.name).to.equal(reqBody.name);
                expect(testUserData).to.have.property('organization');
                expect(testUserData.organization).to.equal(reqBody.organization);
                expect(testUserData).to.have.property('location');
                expect(testUserData.location).to.equal(reqBody.location);
                expect(testUserData).to.not.have.property('extra');
            });

            it('should pass with empty userData list', async () => {
                const reqBody = {
                    id: 'id-test',
                    clientName: 'client1',
                    name: 'name-test',
                    organization: 'hit',
                    location: 'US-NY',
                };
                const entityData = {
                    entityType: 'holder-download',
                    userData: []
                };
                const testUserData = await userHelper.prepareUserCredentialData('tx1', reqBody, entityData, entity);
                const expectedID = hdIDHelper.getHolderID(reqBody);
                expect(testUserData).to.not.be.empty;
                expect(testUserData).to.have.property('id');
                expect(testUserData.id).to.equal(expectedID);
                expect(testUserData).to.have.property('type');
                expect(testUserData.type).to.equal('id');
                expect(testUserData).to.not.have.property('name');
                expect(testUserData).to.not.have.property('organization');
                expect(testUserData).to.not.have.property('location');
            });
        });

        describe('with invalid entity data', () => {
            it('should fail with empty entity data', async () => {
                const reqBody = {
                    id: 'id-test',
                    clientName: 'client1',
                    name: 'name-test',
                    organization: 'hit',
                    location: 'US-NY'
                };
                const entityData = {};
                const testUserData = await userHelper.prepareUserCredentialData('tx1', reqBody, entityData, entity);
                expect(testUserData).to.be.null;
            });
        });
    });

    // eslint-disable-next-line max-lines-per-function
    describe('prepareUserCredentialData() - nih', () => {
        const entity = 'testorg1';

        // eslint-disable-next-line max-lines-per-function
        describe('with valid user data', () => {
            it('should pass with all expected values', async () => {
                const reqBody = {
                    publicKey: 'id-test',
                    gender: 'female',
                    ageRange: '45-54',
                    race: '["White/Caucasian"]',
                    location: 'US-NY'
                };
                const entityData = {
                    entityType: 'nih',
                    consentInfo: {
                        piiControllers: [ { piiController: 'piiController1' } ]
                    },
                    userData: [
                        'gender',
                        'ageRange',
                        'race',
                        'location'
                    ]
                };
                const testUserData = await userHelper.prepareUserCredentialData('tx1', reqBody, entityData, entity);
                const expectedID = nihIDHelper.getHolderID(reqBody);
                expect(testUserData).to.not.be.empty;
                expect(testUserData).to.have.property('type');
                expect(testUserData.type).to.equal('id');
                expect(testUserData).to.have.property('id');
                expect(testUserData.id).to.equal(expectedID);
                expect(testUserData).to.have.property('key');
                expect(testUserData.key).to.equal(expectedID);
                expect(testUserData).to.have.property('gender');
                expect(testUserData.gender).to.equal(reqBody.gender);
                expect(testUserData).to.have.property('ageRange');
                expect(testUserData.ageRange).to.equal(reqBody.ageRange);
                expect(testUserData).to.have.property('race');
                expect(testUserData.race).to.equal(reqBody.race);
                expect(testUserData).to.have.property('location');
                expect(testUserData.location).to.equal(reqBody.location);
                expect(testUserData).to.have.property('issuer');
                expect(testUserData.issuer).to.have.property('name');
                expect(testUserData.issuer.name).to.equal(entityData.consentInfo.piiControllers[0].piiController);
            });

            it('should pass with some expected values', async () => {
                const reqBody = {
                    publicKey: 'id-test',
                    gender: 'female',
                    ageRange: '45-54',
                    race: '["White/Caucasian"]',
                };
                const entityData = {
                    entityType: 'nih',
                    consentInfo: {
                        piiControllers: [ { piiController: 'piiController1' } ]
                    },
                    userData: [
                        'gender',
                        'ageRange',
                        'race',
                        'location'
                    ]
                };
                const testUserData = await userHelper.prepareUserCredentialData('tx1', reqBody, entityData, entity);
                const expectedID = nihIDHelper.getHolderID(reqBody);
                expect(testUserData).to.not.be.empty;
                expect(testUserData).to.have.property('type');
                expect(testUserData.type).to.equal('id');
                expect(testUserData).to.have.property('id');
                expect(testUserData.id).to.equal(expectedID);
                expect(testUserData).to.have.property('key');
                expect(testUserData.key).to.equal(expectedID);
                expect(testUserData).to.have.property('gender');
                expect(testUserData.gender).to.equal(reqBody.gender);
                expect(testUserData).to.have.property('ageRange');
                expect(testUserData.ageRange).to.equal(reqBody.ageRange);
                expect(testUserData).to.have.property('race');
                expect(testUserData.race).to.equal(reqBody.race);
                expect(testUserData).to.have.property('location');
                expect(testUserData.location).to.be.undefined;
                expect(testUserData).to.have.property('issuer');
                expect(testUserData.issuer).to.have.property('name');
                expect(testUserData.issuer.name).to.equal(entityData.consentInfo.piiControllers[0].piiController);
            });

            it('should pass with extra values', async () => {
                const reqBody = {
                    publicKey: 'id-test',
                    gender: 'female',
                    ageRange: '45-54',
                    race: '["White/Caucasian"]',
                    location: 'US-NY',
                    extra: 'extra'
                };
                const entityData = {
                    entityType: 'nih',
                    consentInfo: {
                        piiControllers: [ { piiController: 'piiController1' } ]
                    },
                    userData: [
                        'gender',
                        'ageRange',
                        'race',
                        'location'
                    ]
                };
                const testUserData = await userHelper.prepareUserCredentialData('tx1', reqBody, entityData, entity);
                const expectedID = nihIDHelper.getHolderID(reqBody);
                expect(testUserData).to.not.be.empty;
                expect(testUserData).to.have.property('type');
                expect(testUserData.type).to.equal('id');
                expect(testUserData).to.have.property('id');
                expect(testUserData.id).to.equal(expectedID);
                expect(testUserData).to.have.property('key');
                expect(testUserData.key).to.equal(expectedID);
                expect(testUserData).to.have.property('gender');
                expect(testUserData.gender).to.equal(reqBody.gender);
                expect(testUserData).to.have.property('ageRange');
                expect(testUserData.ageRange).to.equal(reqBody.ageRange);
                expect(testUserData).to.have.property('race');
                expect(testUserData.race).to.equal(reqBody.race);
                expect(testUserData).to.have.property('location');
                expect(testUserData.location).to.equal(reqBody.location);
                expect(testUserData).to.have.property('issuer');
                expect(testUserData.issuer).to.have.property('name');
                expect(testUserData.issuer.name).to.equal(entityData.consentInfo.piiControllers[0].piiController);
                expect(testUserData).to.not.have.property('extra');
            });

            it('should pass with empty userData list', async () => {
                const reqBody = {
                    publicKey: 'id-test',
                    gender: 'female',
                    ageRange: '45-54',
                    race: '["White/Caucasian"]',
                    location: 'US-NY',
                };
                const entityData = {
                    entityType: 'nih',
                    consentInfo: {
                        piiControllers: [ { piiController: 'piiController1' } ]
                    },
                    userData: []
                };
                const testUserData = await userHelper.prepareUserCredentialData('tx1', reqBody, entityData, entity);
                const expectedID = nihIDHelper.getHolderID(reqBody);
                expect(testUserData).to.not.be.empty;
                expect(testUserData).to.have.property('type');
                expect(testUserData.type).to.equal('id');
                expect(testUserData).to.have.property('id');
                expect(testUserData.id).to.equal(expectedID);
                expect(testUserData).to.have.property('key');
                expect(testUserData.key).to.equal(expectedID);
                expect(testUserData).to.not.have.property('gender');
                expect(testUserData).to.not.have.property('ageRange');
                expect(testUserData).to.not.have.property('race');
                expect(testUserData).to.not.have.property('location');
                expect(testUserData).to.have.property('issuer');
                expect(testUserData.issuer).to.have.property('name');
                expect(testUserData.issuer.name).to.equal(entityData.consentInfo.piiControllers[0].piiController);
            });
        });

        describe('with invalid entity data', () => {
            it('should fail with empty entity data', async () => {
                const reqBody = {
                    publicKey: 'id-test',
                    gender: 'female',
                    ageRange: '45-54',
                    race: '["White/Caucasian"]',
                    location: 'US-NY'
                };
                const entityData = {};
                const testUserData = await userHelper.prepareUserCredentialData('tx1', reqBody, entityData, entity);
                expect(testUserData).to.be.null;
            });
        });
    });
});
