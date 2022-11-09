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

const constants = require('../../helpers/constants');
const config = require('../../config');
const CloudantHelper = require('../../helpers/cloudantHelper');
const entityHelper = require('../../entities');

const {
    app: server,
    emitter
} = require('../../app');

const { expect } = chai;
chai.use(chaiHTTP);

const seqNum = Math.floor(Math.random() * 100);
const testOrgId = `testorg${seqNum}`;
const testClientName = `testclient${seqNum}`;

const contextRoot = config.context_root;

describe('Client Controller', function schemaTests() {
    this.timeout(20000);
    let token;
    
    // Ensures tests will not start until the app is started
    // Note: this should only appear in the first test file
    // in alphabetical order
    before(async () => {
        return new Promise((resolve) => {
            emitter.on(
                "appStarted",
                () => {
                    resolve();
                }
            )
        })
    });

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

    // delete test client document
    after(async () => {
        const cloudantHelper = CloudantHelper.getInstance('testTx1');
        const clientDoc = await entityHelper.getClient('testTx1', testOrgId, testClientName);

        // eslint-disable-next-line no-underscore-dangle
        await cloudantHelper.deleteDocument('testTx1', clientDoc._id, clientDoc._rev, constants.DB_NAMES.ORG);
    });

    // delete test organization
    after((done) => {
        chai.request(server)
            .delete(`${contextRoot}/organization/${testOrgId}`)
            .set('Authorization', `Bearer ${token}`)
            .end((err, res) => {
                expect(err).to.be.null;
                expect(res).to.have.status(200);
                done();
            });
    });

    describe('POST /client', () => {
        it('attempts to register client without organization', (done) => {
            chai.request(server)
                .post(`${contextRoot}/organization/client/register`)
                .set('Authorization', `Bearer ${token}`)
                .send({
                    clientName: 'missing-organization',
                    [constants.NOTIFICATION_MSG.DATA_INGEST_TEXT_ANDROID]: 'Your test result is ready to be downloaded',
                    [constants.NOTIFICATION_MSG.DATA_INGEST_TEXT_IOS]: 'Your test result is ready to be downloaded'
                })
                .end((err, res) => {
                    expect(res).to.have.status(400);
                    expect(res.body).to.have.property('error');
                    // eslint-disable-next-line max-len
                    expect(res.body.error.message).to.include('Missing required variable in request body: organization');
                    done();
                });
        });

        it('attempts to register client without clientName', (done) => {
            chai.request(server)
                .post(`${contextRoot}/organization/client/register`)
                .set('Authorization', `Bearer ${token}`)
                .send({
                    organization: 'missing-clientName',
                    [constants.NOTIFICATION_MSG.DATA_INGEST_TEXT_ANDROID]: 'Your test result is ready to be downloaded',
                    [constants.NOTIFICATION_MSG.DATA_INGEST_TEXT_IOS]: 'Your test result is ready to be downloaded'
                })
                .end((err, res) => {
                    expect(res).to.have.status(400);
                    expect(res.body).to.have.property('error');
                    expect(res.body.error.message).to.include('Missing required variable in request body: clientName');
                    done();
                });
        });

        it('attempts to register client with invalid organization', (done) => {
            chai.request(server)
                .post(`${contextRoot}/organization/client/register`)
                .set('Authorization', `Bearer ${token}`)
                .send({
                    organization: 'invalid-org',
                    clientName: testClientName,
                    [constants.NOTIFICATION_MSG.DATA_INGEST_TEXT_ANDROID]: 'Your test result is ready to be downloaded',
                    [constants.NOTIFICATION_MSG.DATA_INGEST_TEXT_IOS]: 'Your test result is ready to be downloaded'
                })
                .end((err, res) => {
                    expect(res).to.have.status(400);
                    expect(res.body).to.have.property('error');
                    expect(res.body.error.message).to.include('Invalid organization invalid-org');
                    done();
                });
        });

        it('attempts to register client with empty body', (done) => {
            chai.request(server)
                .post(`${contextRoot}/organization/client/register`)
                .set('Authorization', `Bearer ${token}`)
                .send()
                .end((err, res) => {
                    expect(res).to.have.status(400);
                    expect(res.body).to.have.property('error');
                    // eslint-disable-next-line max-len
                    expect(res.body.error.message).to.include('Missing required variable in request body: organization');
                    done();
                });
        });

        it('registers client successfully', (done) => {
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
    });

    describe('PUT /organization/client', () => {
        
        it('attempts to update client without organization', (done) => {
            chai.request(server)
                .put(`${contextRoot}/organization/client`)
                .set('Authorization', `Bearer ${token}`)
                .send({
                    clientName: 'missing-organization',
                    [constants.NOTIFICATION_MSG.DATA_INGEST_TEXT_ANDROID]: 'Updated text message',
                    [constants.NOTIFICATION_MSG.DATA_INGEST_TEXT_IOS]: 'Your test result is ready to be downloaded'
                })
                .end((err, res) => {
                    expect(res).to.have.status(400);
                    expect(res.body).to.have.property('error');
                    // eslint-disable-next-line max-len
                    expect(res.body.error.message).to.include('Missing required variable in request body: organization');
                    done();
                });
        });

        it('attempts to update client without clientName', (done) => {
            chai.request(server)
                .put(`${contextRoot}/organization/client`)
                .set('Authorization', `Bearer ${token}`)
                .send({
                    organization: 'missing-clientName',
                    [constants.NOTIFICATION_MSG.DATA_INGEST_TEXT_ANDROID]: 'Updated text message',
                    [constants.NOTIFICATION_MSG.DATA_INGEST_TEXT_IOS]: 'Your test result is ready to be downloaded'
                })
                .end((err, res) => {
                    expect(res).to.have.status(400);
                    expect(res.body).to.have.property('error');
                    expect(res.body.error.message).to.include('Missing required variable in request body: clientName');
                    done();
                });
        });

        it('attempts to attempt client with invalid organization', (done) => {
            chai.request(server)
                .put(`${contextRoot}/organization/client`)
                .set('Authorization', `Bearer ${token}`)
                .send({
                    organization: 'invalid-org',
                    clientName: testClientName,
                    [constants.NOTIFICATION_MSG.DATA_INGEST_TEXT_ANDROID]: 'Updated text message',
                    [constants.NOTIFICATION_MSG.DATA_INGEST_TEXT_IOS]: 'Your test result is ready to be downloaded'
                })
                .end((err, res) => {
                    expect(res).to.have.status(400);
                    expect(res.body).to.have.property('error');
                    // eslint-disable-next-line max-len
                    expect(res.body.error.message).to.include(`Failed to get client ${testClientName} for organization invalid-org`);
                    done();
                });
        });

        it('updates client successfully', (done) => {
            chai.request(server)
                .put(`${contextRoot}/organization/client`)
                .set('Authorization', `Bearer ${token}`)
                .send({
                    organization: testOrgId,
                    clientName: testClientName,
                    [constants.NOTIFICATION_MSG.DATA_INGEST_TEXT_ANDROID]: 'Updated text message',
                    [constants.NOTIFICATION_MSG.DATA_INGEST_TEXT_IOS]: 'Your test result is ready to be downloaded'
                })
                .end((err, res) => {
                    expect(err).to.be.null;
                    expect(res).to.have.status(200);
                    done();
                });
        });
    });
});