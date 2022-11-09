/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 */

/* eslint-disable max-lines-per-function */
const chai = require('chai');
const chaiHTTP = require('chai-http');

const {
    app: server,
} = require('../../app');
const config = require('../../config');

const { expect } = chai;
chai.use(chaiHTTP);

const seqNum = Math.floor(Math.random() * 10000);
const testOrgId = `testorg${seqNum}`;
const testClientId = `testclient${seqNum}`;
const testUserId1 = `testuser1${seqNum}`;
const testUserId2 = `testuser2${seqNum}`;
const testUserId3 = `testuser2${seqNum}`;
let testRegCode1 = '';
let testRegCode2 = '';
let testRegCode3 = '';
let testVerCode1 = '';
const appIdPassword = `Testing123*${seqNum}`;

const contextRoot = config.context_root;

describe('MFA Onboarding Controller', function onboardingTests() {
    this.timeout(20000);
    let hpassAdminToken;
    let regAdminToken;
    let regAdminGUID;
    let testAdminGUID;
    let dataAdminGUID;

    // login
    before((done) => {
        chai.request(server)
            .post(`${contextRoot}/users/login`)
            .send({
                email: 'hpassadmin@poc.com',
                password: 'testing123',
            })
            .end((err, res) => {
                expect(err).to.be.null;
                expect(res).to.have.status(200);
                hpassAdminToken = res.body.access_token;
                done();
            });
    });

    // create test organization
    before((done) => {
        chai.request(server)
            .post(`${contextRoot}/organization/register`)
            .set('Authorization', `Bearer ${hpassAdminToken}`)
            .send({
                entity: testOrgId,
                entityType: 'holder-download',
                profileSchema: 'testProfileSchema',
                userSchema: 'testUserSchema',
                issuerId: 'testIssuer',
                userData: [],
                notifyTextRegistrationCodeAndroid: '',
                notifyTextRegistrationCodeiOS: '',
                notifyTextVerificationCode: '',
                userRegistrationConfig: {
                    type: 'userRegistration',
                    org: testOrgId,
                    flow: {
                        registrationCodeAuth: true,
                        mfaAuth: true,
                        showUserAgreement: true,
                        showRegistrationForm: false
                    },
                    userAgreement: 'I agree',
                    registrationForm: {}
                },
                mappers: {}

            })
            .end((err, res) => {
                expect(err).to.be.null;
                expect(res).to.have.status(201);
                done();
            });
    });

    before((done) => {
        chai.request(server)
            .post(`${contextRoot}/test/appid/users`)
            .set('Authorization', `Bearer ${hpassAdminToken}`)
            .send({
                organization: testOrgId,
                regAdminPassword: appIdPassword,
                testAdminPassword: appIdPassword,
                dataAdminPassword: appIdPassword,
            })
            .end((err, res) => {
                expect(err).to.be.null;
                expect(res).to.have.status(201);
                expect(res.body).to.have.property('regAdminGUID');
                regAdminGUID = res.body.regAdminGUID;
                expect(res.body).to.have.property('testAdminGUID');
                testAdminGUID = res.body.testAdminGUID;
                expect(res.body).to.have.property('dataAdminGUID')
                dataAdminGUID = res.body.dataAdminGUID;
                done();
            });
    });

    before((done) => {
        chai.request(server)
            .post(`${contextRoot}/users/login`)
            .send({
                email: `${testOrgId}regadmin@poc.com`,
                password: appIdPassword,
            })
            .end((err, res) => {
                expect(err).to.be.null;
                expect(res).to.have.status(200);
                regAdminToken = res.body.access_token;
                done();
            });
    });

    before((done) => {
        chai.request(server)
            .post(`${contextRoot}/onboarding/mfa/users`)
            .set('Authorization', `Bearer ${regAdminToken}`)
            .send({
                organization: testOrgId,
                users: [
                    {
                        id: testUserId1,
                        clientName: testClientId,
                        mobile: '5555555555',
                        givenName: 'given1',
                        familyName: 'family1',
                        location: 'US-NY'
                    },
                    {
                        id: testUserId2,
                        clientName: testClientId,
                        mobile: '5555555555',
                        givenName: 'given1',
                        familyName: 'family1',
                        location: 'US-NY'
                    },
                    {
                        id: testUserId3,
                        clientName: testClientId,
                        mobile: '5555555555',
                        givenName: 'given1',
                        familyName: 'family1',
                        location: 'US-NY'
                    }
                ]
            })
            .end((err, res) => {
                expect(err).to.be.null;
                expect(res).to.have.status(200);
                expect(res.body).to.have.property('docs');
                expect(res.body.docs).to.have.length.greaterThan(2);
                testRegCode1 = res.body.docs[0].registerCode;
                testRegCode2 = res.body.docs[1].registerCode;
                testRegCode3 = res.body.docs[2].registerCode;
                done();
            });
    });

    // delete test organization
    after((done) => {
        chai.request(server)
            .delete(`${contextRoot}/organization/${testOrgId}`)
            .set('Authorization', `Bearer ${hpassAdminToken}`)
            .end((err, res) => {
                expect(err).to.be.null;
                expect(res).to.have.status(200);
                done();
            });
    });

    // delete appid users
    after((done) => {
        chai.request(server)
            .delete(`${contextRoot}/test/appid/users`)
            .set('Authorization', `Bearer ${hpassAdminToken}`)
            .send({
                regAdminGUID,
                testAdminGUID,
                dataAdminGUID
            })
            .end((err, res) => {
                expect(err).to.be.null;
                expect(res).to.have.status(200);
                done();
            });
    });

    describe('POST /onboarding/mfa/registration-code', () => {
        it('attempt to validate registration code for invalid organization', (done) => {
            chai.request(server)
                .post(`${contextRoot}/onboarding/mfa/registration-code/${testRegCode1}`)
                .set('Authorization', `Bearer ${hpassAdminToken}`)
                .send({
                    organization: 'invalid_org'
                })
                .end((err, res) => {
                    expect(res).to.have.status(400);
                    expect(res.body).to.have.property('error');
                    expect(res.body.error).to.have.property('message');
                    expect(res.body.error.message).to.include('Invalid entity: invalid_org');
                    done();
                });
        });
        
        it('attempt to validate invalid registration code', (done) => {
            chai.request(server)
                .post(`${contextRoot}/onboarding/mfa/registration-code/invalid_code`)
                .set('Authorization', `Bearer ${hpassAdminToken}`)
                .send({
                    organization: testOrgId
                })
                .end((err, res) => {
                    expect(res).to.have.status(404);
                    expect(res.body).to.have.property('error');
                    expect(res.body.error).to.have.property('message');
                    expect(res.body.error.message).to.include('Registration code doc not found for code invalid_code');
                    done();
                });
        });
        
        it('validate registration code', (done) => {
            chai.request(server)
                .post(`${contextRoot}/onboarding/mfa/registration-code/${testRegCode1}`)
                .set('Authorization', `Bearer ${hpassAdminToken}`)
                .send({
                    organization: testOrgId
                })
                .end((err, res) => {
                    expect(res).to.have.status(200);
                    expect(res.body).to.have.property('message');
                    expect(res.body.message).to.include('Successfully validated registration code');
                    done();
                });
        });
    });

    describe('POST /onboarding/mfa/verification-code', () => {
        // validate registration code (test route)
        before((done) => {
            chai.request(server)
                .post(`${contextRoot}/test/onboarding/mfa/registration-code/${testRegCode2}`)
                .set('Authorization', `Bearer ${hpassAdminToken}`)
                .send({
                    organization: testOrgId
                })
                .end((err, res) => {
                    expect(res).to.have.status(200);
                    expect(res.body).to.have.property('message');
                    expect(res.body.message).to.include('Successfully validated registration code');
                    expect(res.body).to.have.property('verificationCode');
                    testVerCode1 = res.body.verificationCode;
                    done();
                });
        });
        
        it('attempt to validate verification code for invalid organization', (done) => {
            chai.request(server)
                .post(`${contextRoot}/onboarding/mfa/verification-code/${testVerCode1}`)
                .set('Authorization', `Bearer ${hpassAdminToken}`)
                .send({
                    organization: 'invalid_org'
                })
                .end((err, res) => {
                    expect(res).to.have.status(400);
                    expect(res.body).to.have.property('error');
                    expect(res.body.error).to.have.property('message');
                    expect(res.body.error.message).to.include('Invalid entity: invalid_org');
                    done();
                });
        });
        
        it('attempt to validate invalid verification code', (done) => {
            chai.request(server)
                .post(`${contextRoot}/onboarding/mfa/verification-code/invalid_code`)
                .set('Authorization', `Bearer ${hpassAdminToken}`)
                .send({
                    organization: testOrgId
                })
                .end((err, res) => {
                    expect(res).to.have.status(404);
                    expect(res.body).to.have.property('error');
                    expect(res.body.error).to.have.property('message');
                    expect(res.body.error.message).to.include('Verification code doc not found');
                    done();
                });
        });
        
        it('validate verification code', (done) => {
            chai.request(server)
                .post(`${contextRoot}/onboarding/mfa/verification-code/${testVerCode1}`)
                .set('Authorization', `Bearer ${hpassAdminToken}`)
                .send({
                    organization: testOrgId
                })
                .end((err, res) => {
                    expect(res).to.have.status(200);
                    expect(res.body).to.have.property('message');
                    expect(res.body.message).to.include('Successfully validated verification code');
                    done();
                });
        });

        it('attempt to validate verification code more than once', (done) => {
            chai.request(server)
                .post(`${contextRoot}/onboarding/mfa/verification-code/${testVerCode1}`)
                .set('Authorization', `Bearer ${hpassAdminToken}`)
                .send({
                    organization: testOrgId
                })
                .end((err, res) => {
                    expect(res).to.have.status(400);
                    expect(res.body).to.have.property('error');
                    expect(res.body.error).to.have.property('message');
                    expect(res.body.error.message).to.include(
                        // eslint-disable-next-line max-len
                        "Verification code is invalid: Verification code status is 'used', but a code can only be used once - status must be new"
                    );
                    done();
                });
        });
    });

    describe('POST /onboarding/mfa/submit-registration', () => {
        // validate registration code
        before((done) => {
            chai.request(server)
                .post(`${contextRoot}/onboarding/mfa/registration-code/${testRegCode3}`)
                .set('Authorization', `Bearer ${hpassAdminToken}`)
                .send({
                    organization: testOrgId
                })
                .end((err, res) => {
                    expect(res).to.have.status(200);
                    expect(res.body).to.have.property('message');
                    expect(res.body.message).to.include('Successfully validated registration code');
                    done();
                });
        });
        
        it('attempt to submit registration for invalid organization', (done) => {
            chai.request(server)
                .post(`${contextRoot}/onboarding/mfa/submit-registration`)
                .set('Authorization', `Bearer ${hpassAdminToken}`)
                .send({
                    organization: 'invalid_org',
                    registrationCode: testRegCode3
                })
                .end((err, res) => {
                    expect(res).to.have.status(400);
                    expect(res.body).to.have.property('error');
                    expect(res.body.error).to.have.property('message');
                    expect(res.body.error.message).to.include('Invalid organization invalid_org');
                    done();
                });
        });

        it('attempt to submit registration with invalid registration code', (done) => {
            chai.request(server)
                .post(`${contextRoot}/onboarding/mfa/submit-registration`)
                .set('Authorization', `Bearer ${hpassAdminToken}`)
                .send({
                    organization: testOrgId,
                    registrationCode: 'invalid_code'
                })
                .end((err, res) => {
                    expect(res).to.have.status(404);
                    expect(res.body).to.have.property('error');
                    expect(res.body.error).to.have.property('message');
                    expect(res.body.error.message).to.include('Registration code doc for code invalid_code not found');
                    done();
                });
        });
        
        it('attempt to submit registration without validated verification code', (done) => {
            chai.request(server)
                .post(`${contextRoot}/onboarding/mfa/submit-registration`)
                .set('Authorization', `Bearer ${hpassAdminToken}`)
                .send({
                    organization: testOrgId,
                    registrationCode: testRegCode3
                })
                .end((err, res) => {
                    expect(res).to.have.status(400);
                    expect(res.body).to.have.property('error');
                    expect(res.body.error).to.have.property('message');
                    expect(res.body.error.message).to.include('Verification code is not validated');
                    done();
                });
        });
    });
});