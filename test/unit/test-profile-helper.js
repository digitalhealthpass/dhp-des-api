/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 */

const { expect } = require('chai');

const config = require('../../config');
const profileHelper = require('../../helpers/profile-helper');

// eslint-disable-next-line max-lines-per-function
describe('test-profile-helper', () => {
    describe('buildPostboxUploadUrl()', () => {
        it('builds a postbox url from headers', () => {
            const host = 'host.test.com';
            const protocol = 'https';
            const headers = {
                host,
                'x-forwarded-proto': protocol,
            };

            const url = profileHelper.buildPostboxUploadUrl(headers);
            const expectedUrl = `${protocol}://${host}/api/v1/postbox/api/v1/documents`;

            expect(url).to.equal(expectedUrl);
        });

        it('builds a postbox url from config', () => {
            const headers = {};

            const url = profileHelper.buildPostboxUploadUrl(headers);
            const expectedUrl = `${config.postboxAPI.hostname}/api/v1/documents`;

            expect(url).to.equal(expectedUrl);
        });
    });

    describe('buildPostboxDownloadUrl()', () => {
        it('builds a postbox url from headers', () => {
            const host = 'host.test.com';
            const protocol = 'https';
            const headers = {
                host,
                'x-forwarded-proto': protocol,
            };

            const linkId = 'link1';
            const url = profileHelper.buildPostboxDownloadUrl(headers, linkId);
            const expectedUrl = `${protocol}://${host}/api/v1/postbox/api/v1/links/${linkId}/attachments`;

            expect(url).to.equal(expectedUrl);
        });

        it('builds a postbox url from config', () => {
            const headers = {};

            const linkId = 'link2';
            const url = profileHelper.buildPostboxDownloadUrl(headers, linkId);
            const expectedUrl = `${config.postboxAPI.hostname}/api/v1/links/${linkId}/attachments`;

            expect(url).to.equal(expectedUrl);
        });
    });

    // TODO: write a unit test for HIT - mock Cloudant response
    describe('assembleProfileDoc()', () => {
        const publicKey = 'test-key';

        const postboxUploadUrl = 'http://test-postbox/documents';
        const postboxDownloadUrl = 'http://test-postbox/links/link1/attachments';
        const uploadLinkID = 'test-link1';
        const uploadToken = 'test-password1';
        const downloadLinkID = 'test-link2';
        const downloadToken = 'test-password2';

        it('builds a Cloudant profile doc', async () => {

            const doc = profileHelper.assembleProfileDoc(
                postboxUploadUrl,
                postboxDownloadUrl,
                uploadLinkID,
                uploadToken,
                downloadLinkID,
                downloadToken,
                'publicKey',
                publicKey
            );
            const expectedProperties = [
                'publicKey',
                'symmetricKey',
                'url',
                'uploadUrl',
                'downloadUrl',
                'uploadLinkId',
                'uploadToken',
                'downloadLinkId',
                'downloadToken',
            ];
            expectedProperties.forEach((prop) => {
                expect(doc).to.have.property(prop);
            });

            expect(doc.publicKey).to.equal(publicKey);
            expect(doc.url).to.equal(postboxUploadUrl);
            expect(doc.uploadUrl).to.equal(postboxUploadUrl);
            expect(doc.downloadUrl).to.equal(postboxDownloadUrl);
            expect(doc.uploadLinkId).to.equal(uploadLinkID);
            expect(doc.uploadToken).to.equal(uploadToken);
            expect(doc.downloadLinkId).to.equal(downloadLinkID);
            expect(doc.downloadToken).to.equal(downloadToken);
        });
    });

    // eslint-disable-next-line max-lines-per-function
    describe('prepareProfileCredentialData() - holder-download', () => {
        const entity = 'testorg1';

        // eslint-disable-next-line max-lines-per-function
        describe('with valid profile data', () => {
            it('should pass with all expected values', async () => {
                const holderID = 'holder1';
                const entityData = {
                    entityType: 'holder-download',
                    website: 'website1',
                    contact: 'contact1',
                    services: [],
                    privacyPolicy: 'privacyPolicy1',
                    name: 'name1',
                    userAgreement: 'userAgreement1'
                };
                const profileData = {
                    symmetricKey: 'symmetricKey1',
                    downloadUrl: 'downloadUrl1',
                    downloadLinkId: 'downloadLink1',
                    downloadToken: 'downloadToken1'
                };

                const testProfileData = await profileHelper.prepareProfileCredentialData(
                    'tx1',
                    profileData,
                    holderID,
                    entity,
                    entityData
                );
                expect(testProfileData).to.not.be.empty;
                expect(testProfileData).to.have.property('type');
                expect(testProfileData.type).to.equal('profile');

                expect(testProfileData).to.have.property('technical');
                expect(testProfileData.technical).to.have.property('symmetricKey');
                expect(testProfileData.technical.symmetricKey).to.equal(profileData.symmetricKey);
                expect(testProfileData.technical).to.have.property('download');
                expect(testProfileData.technical.download).to.have.property('id');
                expect(testProfileData.technical.download.id).to.equal(holderID);
                expect(testProfileData.technical.download).to.have.property('url');
                expect(testProfileData.technical.download.url).to.equal(profileData.downloadUrl);
                expect(testProfileData.technical.download).to.have.property('linkId');
                expect(testProfileData.technical.download.linkId).to.equal(profileData.downloadLinkId);
                expect(testProfileData.technical.download).to.have.property('passcode');
                expect(testProfileData.technical.download.passcode).to.equal(profileData.downloadToken);

                expect(testProfileData).to.have.property('website');
                expect(testProfileData.website).to.equal(entityData.website);
                expect(testProfileData).to.have.property('contact');
                expect(testProfileData.contact).to.equal(entityData.contact);
                expect(testProfileData).to.have.property('services');
                expect(testProfileData.services).to.equal(entityData.services);
                expect(testProfileData).to.have.property('privacyPolicy');
                expect(testProfileData.privacyPolicy).to.equal(entityData.privacyPolicy);
                expect(testProfileData).to.have.property('name');
                expect(testProfileData.name).to.equal(entityData.name);
                expect(testProfileData).to.have.property('userAgreement');
                expect(testProfileData.userAgreement).to.equal(entityData.userAgreement);
            });

            it('should pass with some expected values', async () => {
                const holderID = 'holder1';
                const entityData = {
                    entityType: 'holder-download',
                    website: 'website1',
                    services: [],
                    privacyPolicy: 'privacyPolicy1',
                    name: 'name1',
                    userAgreement: 'userAgreement1'
                };
                const profileData = {
                    symmetricKey: 'symmetricKey1',
                    downloadUrl: 'downloadUrl1',
                    downloadLinkId: 'downloadLink1',
                    downloadToken: 'downloadToken1'
                };

                const testProfileData = await profileHelper.prepareProfileCredentialData(
                    'tx1',
                    profileData,
                    holderID,
                    entity,
                    entityData
                );
                expect(testProfileData).to.not.be.empty;
                expect(testProfileData).to.have.property('type');
                expect(testProfileData.type).to.equal('profile');

                expect(testProfileData).to.have.property('technical');
                expect(testProfileData.technical).to.have.property('symmetricKey');
                expect(testProfileData.technical.symmetricKey).to.equal(profileData.symmetricKey);
                expect(testProfileData.technical).to.have.property('download');
                expect(testProfileData.technical.download).to.have.property('id');
                expect(testProfileData.technical.download.id).to.equal(holderID);
                expect(testProfileData.technical.download).to.have.property('url');
                expect(testProfileData.technical.download.url).to.equal(profileData.downloadUrl);
                expect(testProfileData.technical.download).to.have.property('linkId');
                expect(testProfileData.technical.download.linkId).to.equal(profileData.downloadLinkId);
                expect(testProfileData.technical.download).to.have.property('passcode');
                expect(testProfileData.technical.download.passcode).to.equal(profileData.downloadToken);

                expect(testProfileData).to.have.property('website');
                expect(testProfileData.website).to.equal(entityData.website);
                expect(testProfileData).to.have.property('contact');
                expect(testProfileData.contact).to.be.undefined;
                expect(testProfileData).to.have.property('services');
                expect(testProfileData.services).to.equal(entityData.services);
                expect(testProfileData).to.have.property('privacyPolicy');
                expect(testProfileData.privacyPolicy).to.equal(entityData.privacyPolicy);
                expect(testProfileData).to.have.property('name');
                expect(testProfileData.name).to.equal(entityData.name);
                expect(testProfileData).to.have.property('userAgreement');
                expect(testProfileData.userAgreement).to.equal(entityData.userAgreement);
            });
        });

        describe('with invalid entity data', () => {
            it('should fail with empty entity data', async () => {
                const holderID = 'holder1';
                const entityData = {};
                const profileData = {
                    symmetricKey: 'symmetricKey1',
                    downloadUrl: 'downloadUrl1',
                    downloadLinkId: 'downloadLink1',
                    downloadToken: 'downloadToken1'
                };

                const testProfileData = await profileHelper.prepareProfileCredentialData(
                    'tx1',
                    profileData,
                    holderID,
                    entity,
                    entityData
                );
                expect(testProfileData).to.be.null;
            });
        });
    });

    // eslint-disable-next-line max-lines-per-function
    describe('prepareProfileCredentialData() - nih', () => {
        const entity = 'testorg1';

        // eslint-disable-next-line max-lines-per-function
        describe('with valid profile data', () => {
            it('should pass with all expected values', async () => {
                const holderID = 'holder1';
                const entityData = {
                    entityType: 'nih',
                    consentInfo: {
                        test: 'test1'
                    },
                    termination: 'termination1'
                };
                const profileData = {
                    symmetricKey: 'symmetricKey1',
                    url: 'downloadUrl1',
                    uploadLinkId: 'downloadLink1',
                    uploadToken: 'downloadToken1'
                };

                const testProfileData = await profileHelper.prepareProfileCredentialData(
                    'tx1',
                    profileData,
                    holderID,
                    entity,
                    entityData
                );
                expect(testProfileData).to.not.be.empty;
                expect(testProfileData).to.have.property('type');
                expect(testProfileData.type).to.equal('profile');

                expect(testProfileData).to.have.property('technical');
                expect(testProfileData.technical).to.have.property('poBox');
                expect(testProfileData.technical.poBox).to.have.property('symmetricKey');
                expect(testProfileData.technical.poBox.symmetricKey).to.equal(profileData.symmetricKey);
                expect(testProfileData.technical.poBox).to.have.property('id');
                expect(testProfileData.technical.poBox.id).to.equal(holderID);
                expect(testProfileData.technical.poBox).to.have.property('url');
                expect(testProfileData.technical.poBox.url).to.equal(profileData.url);
                expect(testProfileData.technical.poBox).to.have.property('linkId');
                expect(testProfileData.technical.poBox.linkId).to.equal(profileData.uploadLinkId);
                expect(testProfileData.technical.poBox).to.have.property('passcode');
                expect(testProfileData.technical.poBox.passcode).to.equal(profileData.uploadToken);

                expect(testProfileData).to.have.property('termination');
                expect(testProfileData.termination).to.equal(entityData.termination);
                expect(testProfileData).to.have.property('consentInfo');
                expect(testProfileData.consentInfo).to.deep.equal({
                    test: entityData.consentInfo.test,
                    piiPrincipalId: holderID
                });
            });

            it('should pass with some expected values', async () => {
                const holderID = 'holder1';
                const entityData = {
                    entityType: 'nih',
                    consentInfo: {
                        test: 'test1'
                    }
                };
                const profileData = {
                    symmetricKey: 'symmetricKey1',
                    url: 'downloadUrl1',
                    uploadLinkId: 'downloadLink1',
                    uploadToken: 'downloadToken1'
                };

                const testProfileData = await profileHelper.prepareProfileCredentialData(
                    'tx1',
                    profileData,
                    holderID,
                    entity,
                    entityData
                );
                expect(testProfileData).to.not.be.empty;
                expect(testProfileData).to.have.property('type');
                expect(testProfileData.type).to.equal('profile');

                expect(testProfileData).to.have.property('technical');
                expect(testProfileData.technical).to.have.property('poBox');
                expect(testProfileData.technical.poBox).to.have.property('symmetricKey');
                expect(testProfileData.technical.poBox.symmetricKey).to.equal(profileData.symmetricKey);
                expect(testProfileData.technical.poBox).to.have.property('id');
                expect(testProfileData.technical.poBox.id).to.equal(holderID);
                expect(testProfileData.technical.poBox).to.have.property('url');
                expect(testProfileData.technical.poBox.url).to.equal(profileData.url);
                expect(testProfileData.technical.poBox).to.have.property('linkId');
                expect(testProfileData.technical.poBox.linkId).to.equal(profileData.uploadLinkId);
                expect(testProfileData.technical.poBox).to.have.property('passcode');
                expect(testProfileData.technical.poBox.passcode).to.equal(profileData.uploadToken);

                expect(testProfileData).to.have.property('termination');
                expect(testProfileData.termination).to.be.undefined;
                expect(testProfileData).to.have.property('consentInfo');
                expect(testProfileData.consentInfo).to.deep.equal({
                    test: entityData.consentInfo.test,
                    piiPrincipalId: holderID
                });
            });
        });
    });
});
