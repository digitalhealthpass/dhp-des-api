/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 */

const chai = require('chai');
const chaiHTTP = require('chai-http');

const {
    app: server,
} = require('../../app');
const config = require('../../config');

const { expect } = chai;
chai.use(chaiHTTP);

const contextRoot = config.context_root;

// eslint-disable-next-line max-lines-per-function
describe('Data Controller', function dataTests() {
    this.timeout(20000);

    const seqNum = Math.floor(Math.random() * 100000);
    const testOrgId = `testorg${seqNum}`;
    let hpassAdminToken;
    let regAdminToken;
    let testAdminToken;
    let regAdminGUID;
    let testAdminGUID;
    let dataAdminGUID;
    const appIdPassword = `Testing123*${seqNum}`;

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
                mappers: []
            })
            .end((err, res) => {
                expect(err).to.be.null;
                expect(res).to.have.status(201);
                done();
            });
    });

    // register appid users
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
            .post(`${contextRoot}/users/login`)
            .send({
                email: `${testOrgId}testadmin@poc.com`,
                password: appIdPassword,
            })
            .end((err, res) => {
                expect(err).to.be.null;
                expect(res).to.have.status(200);
                testAdminToken = res.body.access_token;
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

    // eslint-disable-next-line max-lines-per-function
    describe('POST /data/upload/file', () => {
        it('attempts to upload file, organization missing', (done) => {
            chai.request(server)
                .post(`${contextRoot}/data/upload/file`)
                .set('Authorization', `Bearer ${testAdminToken}`)
                .attach('file', 'test/testdata/testresult-upload/test-results.csv')
                .end((err, res) => {
                    expect(res).to.have.status(401);
                    done();
                });
        });

        it('attempts to upload file, invalid organization', (done) => {
            chai.request(server)
                .post(`${contextRoot}/data/upload/file`)
                .set('Authorization', `Bearer ${testAdminToken}`)
                .field('organization', 'invalid_org')
                .attach('file', 'test/testdata/testresult-upload/test-results.csv')
                .end((err, res) => {
                    expect(res).to.have.status(401);
                    done();
                });
        });

        it('attempts to upload file, file missing', (done) => {
            chai.request(server)
                .post(`${contextRoot}/data/upload/file`)
                .set('Authorization', `Bearer ${testAdminToken}`)
                .field('organization', testOrgId)
                .end((err, res) => {
                    expect(res).to.have.status(400);
                    expect(res.body).to.have.property('error');
                    expect(res.body.error).to.have.property('message');
                    expect(res.body.error.message).to.include('Missing CSV file');
                    done();
                });
        });

        it('attempts to upload file without testadmin scope', (done) => {
            chai.request(server)
                .post(`${contextRoot}/data/upload/file`)
                .set('Authorization', `Bearer ${regAdminToken}`)
                .field('organization', testOrgId)
                .attach('file', 'test/testdata/testresult-upload/test-results.csv')
                .end((err, res) => {
                    expect(res).to.have.status(401);
                    done();
                });
        });

        it('attempts to upload file with invalid extension', (done) => {
            chai.request(server)
                .post(`${contextRoot}/data/upload/file`)
                .set('Authorization', `Bearer ${testAdminToken}`)
                .field('organization', testOrgId)
                .attach('file', 'test/testdata/testresult-upload/test-results-invalid-extension.txt')
                .end((err, res) => {
                    expect(res).to.have.status(400);
                    expect(res.body).to.have.property('error');
                    expect(res.body.error).to.have.property('message');
                    expect(res.body.error.message).to.include('Required extension is .csv');
                    done();
                });
        });

        it('attempts to upload file with too many rows', (done) => {
            chai.request(server)
                .post(`${contextRoot}/data/upload/file`)
                .set('Authorization', `Bearer ${testAdminToken}`)
                .field('organization', testOrgId)
                .attach('file', 'test/testdata/testresult-upload/test-results-max-rows-exceeded.csv')
                .end((err, res) => {
                    expect(res).to.have.status(400);
                    expect(res.body).to.have.property('error');
                    expect(res.body.error).to.have.property('message');
                    expect(res.body.error.message).to.include(`Row count 4001 exceeds the limit of 4000`);
                    done();
                });
        });

        it('attempts to upload file with invalid headers', (done) => {
            chai.request(server)
                .post(`${contextRoot}/data/upload/file`)
                .set('Authorization', `Bearer ${testAdminToken}`)
                .field('organization', testOrgId)
                .attach('file', 'test/testdata/testresult-upload/test-results-invalid-no-client-name.csv')
                .end((err, res) => {
                    expect(res).to.have.status(400);
                    expect(res.body).to.have.property('error');
                    expect(res.body.error).to.have.property('message');
                    expect(res.body.error.message).to.include('Invalid headers in CSV file');
                    done();
                });
        });

        it('attempts to upload file with invalid row', (done) => {
            chai.request(server)
                .post(`${contextRoot}/data/upload/file`)
                .set('Authorization', `Bearer ${testAdminToken}`)
                .field('organization', testOrgId)
                .attach('file', 'test/testdata/testresult-upload/test-results-invalid-row.csv')
                .end((err, res) => {
                    expect(res).to.have.status(400);
                    expect(res.body).to.have.property('error');
                    expect(res.body.error).to.have.property('message');
                    expect(res.body.error.message).to.include('Found 1 invalid rows');
                    done();
                });
        });

        it('attempts to upload file with emial format', (done) => {
            chai.request(server)
                .post(`${contextRoot}/data/upload/file`)
                .set('Authorization', `Bearer ${testAdminToken}`)
                .field('organization', testOrgId)
                .attach('file', 'test/testdata/testresult-upload/test-results-invalid-bad-email-format.csv')
                .end((err, res) => {
                    expect(res).to.have.status(400);
                    expect(res.body).to.have.property('error');
                    expect(res.body.error).to.have.property('message');
                    expect(res.body.error.message).to.include('Found 1 invalid rows');
                    done();
                });
        });
    });

    describe('GET /data/:entity/batches/report', () => {
        it('attempts to get batch reports without role', (done) => {
            chai.request(server)
                .get(`${contextRoot}/data/${testOrgId}/batches/report`)
                .set('Authorization', `Bearer ${hpassAdminToken}`)
                .end((err, res) => {
                    expect(res).to.have.status(400);
                    expect(res.body.error.message).to.include('Role must be one of testadmin, regadmin')
                    done();
                });
        });

        it('attempts to get batch reports as hpassadmin', (done) => {
            chai.request(server)
                .get(`${contextRoot}/data/${testOrgId}/batches/report?role=regadmin`)
                .set('Authorization', `Bearer ${hpassAdminToken}`)
                .end((err, res) => {
                    expect(res).to.have.status(200);
                    done();
                });
        });

        it('attempts to get batch reports with wrong role', (done) => {
            chai.request(server)
                .get(`${contextRoot}/data/${testOrgId}/batches/report?role=testadmin`)
                .set('Authorization', `Bearer ${regAdminToken}`)
                .end((err, res) => {
                    expect(res).to.have.status(401);
                    done();
                });
        });

        it('gets batch reports', (done) => {
            chai.request(server)
                .get(`${contextRoot}/data/${testOrgId}/batches/report?role=regadmin`)
                .set('Authorization', `Bearer ${regAdminToken}`)
                .end((err, res) => {
                    expect(res).to.have.status(200);
                    done();
                });
        });
    });

    describe('GET /data/:entity/batches/:batchID/report', () => {
        const batchID = 'batch1';
        it('attempts to get single batch report without a role', (done) => {
            chai.request(server)
                .get(`${contextRoot}/data/${testOrgId}/batches/${batchID}/report`)
                .set('Authorization', `Bearer ${hpassAdminToken}`)
                .end((err, res) => {
                    expect(res).to.have.status(400);
                    done();
                });
        });

        it('attempts to get single batch report as hpassadmin', (done) => {
            chai.request(server)
                .get(`${contextRoot}/data/${testOrgId}/batches/${batchID}/report?role=regadmin`)
                .set('Authorization', `Bearer ${hpassAdminToken}`)
                .end((err, res) => {
                    expect(res).to.have.status(200);
                    done();
                });
        });

        it('attempts to get single batch report with wrong role', (done) => {
            chai.request(server)
                .get(`${contextRoot}/data/${testOrgId}/batches/${batchID}/report?role=testadmin`)
                .set('Authorization', `Bearer ${regAdminToken}`)
                .end((err, res) => {
                    expect(res).to.have.status(401);
                    done();
                });
        });

        it('gets single batch report', (done) => {
            chai.request(server)
                .get(`${contextRoot}/data/${testOrgId}/batches/${batchID}/report?role=regadmin`)
                .set('Authorization', `Bearer ${regAdminToken}`)
                .end((err, res) => {
                    expect(res).to.have.status(200);
                    done();
                });
        });
    });
});