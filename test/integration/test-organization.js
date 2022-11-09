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

const entityHelper = require('../../entities');
const constants = require('../../helpers/constants');
const config = require('../../config');
const {
    app: server,
} = require('../../app');

const { expect } = chai;
chai.use(chaiHTTP);

const seqNum = Math.floor(Math.random() * 100000);
const testOrgId = `testorg${seqNum}`;
const testClientName = `testclient${seqNum}`;
const testHolderId = `testholder${seqNum}`;

const contextRoot = config.context_root;

describe('Organization Controller - POST / PUT', function orgTests() {
    this.timeout(100000);
    let token;

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
                token = res.body.access_token;
                done();
            });
    });

    // create test organization
    before((done) => {
        chai.request(server)
            .post(`${contextRoot}/organization/register`)
            .set('Authorization', `Bearer ${token}`)
            .send({
                entity: testOrgId,
                profileSchema: 'testProfileSchema',
                userSchema: 'testUserSchema',
                issuerId: 'testIssuer',
                userData: []
            })
            .end((err, res) => {
                expect(err).to.be.null;
                expect(res).to.have.status(201);
                done();
            });
    });

    // create test client
    before((done) => {
        chai.request(server)
            .post(`${contextRoot}/organization/client/register`)
            .set('Authorization', `Bearer ${token}`)
            .send({
                organization: testOrgId,
                clientName: testClientName,
                [constants.NOTIFICATION_MSG.DATA_INGEST_TEXT_ANDROID]: 'Your test result is ready to be downloaded',
                [constants.NOTIFICATION_MSG.DATA_INGEST_TEXT_IOS]: 'Your test result is ready to be downloaded'
            })
            .end((err, res) => {
                expect(err).to.be.null;
                expect(res).to.have.status(201);
                done();
            });
    });

    describe('POST /organization', () => {
        it('attempts to onboard organization with invalid entity id - too long', (done) => {
            const invalidEntityID = 'invalidentityidistoolongnow';
            chai.request(server)
                .post(`${contextRoot}/organization/register`)
                .set('Authorization', `Bearer ${token}`)
                .send({
                    entity: invalidEntityID,
                    entityType: 'holder-upload',
                    issuerId: 'testIssuer',
                    mappers: []
                })
                .end((err, res) => {
                    expect(res).to.have.status(400);
                    expect(res.body).to.have.property('error');
                    // eslint-disable-next-line max-len
                    const expectedErrMsg = `Invalid entity value ${invalidEntityID}: Maximum length is 24 characters`
                    expect(res.body.error.message).to.include(expectedErrMsg);
                    done();
                });
        });

        it('attempts to onboard organization with invalid entity id - forbidden character', (done) => {
            const invalidEntityID = 'abc$';
            chai.request(server)
                .post(`${contextRoot}/organization/register`)
                .set('Authorization', `Bearer ${token}`)
                .send({
                    entity: invalidEntityID,
                    entityType: 'holder-upload',
                    issuerId: 'testIssuer',
                    mappers: []
                })
                .end((err, res) => {
                    expect(res).to.have.status(400);
                    expect(res.body).to.have.property('error');
                    // eslint-disable-next-line max-len
                    const expectedErrMsg = `First character must be a lowercase letter and remaining characters must be lowercase letters (a-z), digits (0-9), or hyphens (-)`
                    expect(res.body.error.message).to.include(expectedErrMsg);
                    done();
                });
        });
    });

    describe('PUT /organization', () => {
        it('attempts to update organization without entity', (done) => {
            chai.request(server)
                .put(`${contextRoot}/organization`)
                .set('Authorization', `Bearer ${token}`)
                .send({
                    entityType: 'holder-upload',
                    profileSchema: 'testProfileSchema;version=0.2',
                    userSchema: 'testUserSchema',
                    issuerId: 'testIssuer',
                    userData: []
                })
                .end((err, res) => {
                    expect(res).to.have.status(400);
                    expect(res.body).to.have.property('error');
                    // eslint-disable-next-line max-len
                    expect(res.body.error.message).to.include('Must specify entity in request body');
                    done();
                });
        });

        it('attempts to update organization without entityType', (done) => {
            chai.request(server)
                .put(`${contextRoot}/organization`)
                .set('Authorization', `Bearer ${token}`)
                .send({
                    entity: testOrgId,
                    profileSchema: 'testProfileSchema;version=0.2',
                    userSchema: 'testUserSchema',
                    userData: [],
                    issuerId: 'testIssuer',
                    mappers: []
                })
                .end((err, res) => {
                    expect(res).to.have.status(400);
                    expect(res.body).to.have.property('error');
                    // eslint-disable-next-line max-len
                    expect(res.body.error.message).to.include('Must specify entityType in request body');
                    done();
                });
        });

        it('attempts to update organization without issuerId', (done) => {
            chai.request(server)
                .put(`${contextRoot}/organization`)
                .set('Authorization', `Bearer ${token}`)
                .send({
                    entity: testOrgId,
                    entityType: 'holder-upload',
                    profileSchema: 'testProfileSchema;version=0.2',
                    userSchema: 'testUserSchema',
                    userData: [],
                    mappers: []
                })
                .end((err, res) => {
                    expect(res).to.have.status(400);
                    expect(res.body).to.have.property('error');
                    // eslint-disable-next-line max-len
                    expect(res.body.error.message).to.include('Missing required variable in request body: issuerId');
                    done();
                });
        });

        it('attempts to update organization without mappers', (done) => {
            chai.request(server)
                .put(`${contextRoot}/organization`)
                .set('Authorization', `Bearer ${token}`)
                .send({
                    entity: testOrgId,
                    entityType: 'holder-upload',
                    issuerId: 'testIssuer',
                })
                .end((err, res) => {
                    expect(res).to.have.status(400);
                    expect(res.body).to.have.property('error');
                    // eslint-disable-next-line max-len
                    expect(res.body.error.message).to.include('Missing required variable in request body: mappers');
                    done();
                });
        });

        it('attempts to update organization with invalid entity', (done) => {
            chai.request(server)
                .put(`${contextRoot}/organization`)
                .set('Authorization', `Bearer ${token}`)
                .send({
                    entity: 'invalid-entity',
                    entityType: 'holder-upload',
                    profileSchema: 'testProfileSchema;version=0.2',
                    userSchema: 'testUserSchema',
                    issuerId: 'testIssuer',
                    userData: [],
                    mappers: []
                })
                .end((err, res) => {
                    expect(res).to.have.status(400);
                    expect(res.body).to.have.property('error');
                    // eslint-disable-next-line max-len
                    expect(res.body.error.message).to.include('Invalid entity: invalid-entity');
                    done();
                });
        });

        it('updates organization successfully', (done) => {
            chai.request(server)
                .put(`${contextRoot}/organization`)
                .set('Authorization', `Bearer ${token}`)
                .send({
                    entity: testOrgId,
                    entityType: 'holder-upload',
                    issuerId: 'testIssuer',
                    mappers: []
                })
                .end((err, res) => {
                    expect(err).to.be.null;
                    expect(res).to.have.status(200);
                    done();
                });
        });
    });
});

describe('Organization Controller - DELETE', function orgTests() {
    this.timeout(100000);
    let token;

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
                token = res.body.access_token;
                done();
            });
    });

    // check that client exists
    before(async () => {
        const clientDoc = await entityHelper.getClient('testTx1', testOrgId, testClientName);
        expect(clientDoc).to.not.be.null;
    });

    // check that client was deleted
    after(async () => {
        const clientDoc = await entityHelper.getClient('testTx1', testOrgId, testClientName);
        expect(clientDoc).to.be.null;
    });

    describe('DELETE /organization', () => {
        it('attempts to offboard non-existant organization', (done) => {
            chai.request(server)
                .delete(`${contextRoot}/organization/invalid`)
                .set('Authorization', `Bearer ${token}`)
                .end((err, res) => {
                    expect(res).to.have.status(400);
                    expect(res.body).to.have.property('errors');
                    expect(res.body.errors.length).to.be.greaterThan(0);
                    expect(res.body.errors[0]).to.have.property('status');
                    expect(res.body.errors[0].status).equal(404);
                    expect(res.body.errors[0].message).to.include('Database does not exist.');
                    done();
                });
        });

        it('offboards existing organization', (done) => {
            chai.request(server)
                .delete(`${contextRoot}/organization/${testOrgId}`)
                .set('Authorization', `Bearer ${token}`)
                .end((err, res) => {
                    expect(err).to.be.null;
                    expect(res).to.have.status(200);
                    done();
                });
        });
    });
});

describe('Organization Controller - GET', function orgTests() {
    const nihOrg1 = `nihorg1${seqNum}`;
    const nihOrg2 = `nihorg2${seqNum}`;

    this.timeout(100000);
    let token;

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
                token = res.body.access_token;
                done();
            });
    });

    // create nih test organization with consentInfo
    before((done) => {
        chai.request(server)
            .post(`${contextRoot}/organization/register`)
            .set('Authorization', `Bearer ${token}`)
            .send({
                entity: nihOrg1,
                entityType: 'nih',
                profileSchema: 'testProfileSchema',
                consentInfo: 'testConsentInfo',
                userSchema: 'testUserSchema',
                issuerId: 'testIssuer',
                userData: []
            })
            .end((err, res) => {
                expect(err).to.be.null;
                expect(res).to.have.status(201);
                done();
            });
    });

    // create nih test organization without consentInfo
    before((done) => {
        chai.request(server)
            .post(`${contextRoot}/organization/register`)
            .set('Authorization', `Bearer ${token}`)
            .send({
                entity: nihOrg2,
                entityType: 'nih',
                profileSchema: 'testProfileSchema',
                userSchema: 'testUserSchema',
                issuerId: 'testIssuer',
                userData: []
            })
            .end((err, res) => {
                expect(err).to.be.null;
                expect(res).to.have.status(201);
                done();
            });
    });

    after((done) => {
        chai.request(server)
            .delete(`${contextRoot}/organization/${nihOrg1}`)
            .set('Authorization', `Bearer ${token}`)
            .end((err, res) => {
                expect(err).to.be.null;
                expect(res).to.have.status(200);
                done();
            });
    });

    after((done) => {
        chai.request(server)
            .delete(`${contextRoot}/organization/${nihOrg2}`)
            .set('Authorization', `Bearer ${token}`)
            .end((err, res) => {
                expect(err).to.be.null;
                expect(res).to.have.status(200);
                done();
            });
    });

    describe('GET /consentReceipt for NIH', () => {
        it('attempts to get consent receipt from org without consentInfo', (done) => {
            chai.request(server)
                .get(`${contextRoot}/organization/${nihOrg2}/consentReceipt/${testHolderId}`)
                .set('Authorization', `Bearer ${token}`)
                .end((err, res) => {
                    expect(res).to.have.status(400);
                    expect(res.body).to.have.property('error');
                    // eslint-disable-next-line max-len
                    expect(res.body.error.message).to.include(
                        `Organization '${nihOrg2}' does not have 'consentInfo' configured`
                    );
                    done();
                });
        });

        it('successfully gets consent receipt from org with consentInfo', (done) => {
            chai.request(server)
                .get(`${contextRoot}/organization/${nihOrg1}/consentReceipt/${testHolderId}`)
                .set('Authorization', `Bearer ${token}`)
                .end((err, res) => {
                    expect(err).to.be.null;
                    expect(res).to.have.status(200);
                    done();
                });
        });
    });

    describe('GET /consentRevoke for NIH', () => {
        it('attempts to get consent revoke from org without consentInfo', (done) => {
            chai.request(server)
                .get(`${contextRoot}/organization/${nihOrg2}/consentRevoke/${testHolderId}`)
                .set('Authorization', `Bearer ${token}`)
                .end((err, res) => {
                    expect(res).to.have.status(400);
                    expect(res.body).to.have.property('error');
                    // eslint-disable-next-line max-len
                    expect(res.body.error.message).to.include(
                        `Organization '${nihOrg2}' does not have 'consentInfo' configured`
                    );
                    done();
                });
        });

        it('successfully gets consent revoke from org with consentInfo', (done) => {
            chai.request(server)
                .get(`${contextRoot}/organization/${nihOrg1}/consentRevoke/${testHolderId}`)
                .set('Authorization', `Bearer ${token}`)
                .end((err, res) => {
                    expect(err).to.be.null;
                    expect(res).to.have.status(200);
                    done();
                });
        });
    });
});
