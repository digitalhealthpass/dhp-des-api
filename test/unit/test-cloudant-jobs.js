/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 */

/* eslint-disable max-lines-per-function */

const { expect } = require('chai');
const sinon = require("sinon");

const cloudantJobs = require("../../service/jobs/cloudant-jobs")

describe('test-cloudant-jobs', () => {
    const sandbox = sinon.createSandbox();

    const mockCloudant = {
        createDocument: () => { },
        updateDocument: () => { },
        readDocumentSafe: () => { },
        getDBList: () => { },
        queryDocuments: () => { },
        deleteDocument: () => { },
    }

    const createDocumentStub = sandbox.stub(mockCloudant, 'createDocument');
    const updateDocumentStub = sandbox.stub(mockCloudant, 'updateDocument');
    const readDocumentSafeStub = sandbox.stub(mockCloudant, 'readDocumentSafe');
    const getDBListStub = sandbox.stub(mockCloudant, 'getDBList');
    const queryDocumentsStub = sandbox.stub(mockCloudant, 'queryDocuments');
    const deleteDocumentStub = sandbox.stub(mockCloudant, 'deleteDocument');
    
    afterEach(() => {
        sandbox.reset();
    });
    after(() => {
        sandbox.restore();
    });

    describe('createRunningFile', () => {
        it('successful createRunningFile', () => {
            createDocumentStub.returnsArg(2);

            const doc = cloudantJobs.createRunningFile(
                mockCloudant, 'mockDB'
            );
            expect(doc).to.exist;
            expect(doc.startTime).to.exist;
        });
        it('createRunningFile with cloudant exception', () => {
            createDocumentStub.throws(new Error('unexpected'));

            const doc = cloudantJobs.createRunningFile(
                mockCloudant, 'mockDB'
            );
            expect(doc).to.not.exist;
        });
    });

    describe('isTimeToRunJob()', () => {
        it('without doneTime', () => {
            const doc = {
                startTime: new Date().getTime()
            }
            const isTime = cloudantJobs.isTimeToRunJob(doc);
            expect(isTime).to.be.false;
        });
        it('last job done 5 hours ago', () => {
            const now = new Date();
            now.setHours(now.getHours() - 5);

            const doc = {
                startTime: new Date().getTime(),
                doneTime: now.getTime()
            }
            const isTime = cloudantJobs.isTimeToRunJob(doc);
            expect(isTime).to.be.false;
        });
        it('last job done 13 hours ago', () => {
            const now = new Date();
            now.setHours(now.getHours() - 13);

            const doc = {
                startTime: new Date().getTime(),
                doneTime: now.getTime()
            }
            const isTime = cloudantJobs.isTimeToRunJob(doc);
            expect(isTime).to.be.true;
        });
    });

    describe('isRunningFileStale', () => {
        it('with stale time', () => {
            const now = new Date();
            now.setMinutes(now.getMinutes() - 31);

            const doc = {
                startTime: now.getTime(),
            }

            const isStale = cloudantJobs.isRunningFileStale(doc);
            expect(isStale).to.be.true;

        });
        it('with fresh time', () => {
            const now = new Date();
            now.setMinutes(now.getMinutes() - 29);

            const doc = {
                startTime: now.getTime(),
            }

            const isStale = cloudantJobs.isRunningFileStale(doc);
            expect(isStale).to.be.false;
        });
    });

    describe('updateJobStart', () => {
        it('successful updateJobStart', async () => {
            const cloudantResponse = {
                rev: '2'
            }

            updateDocumentStub.returns(cloudantResponse);

            const doc = {
                _id: '1',
                _rev: '1',
                startTime: new Date().getTime(),
            }

            const updatedDoc = await cloudantJobs.updateJobStart(mockCloudant, doc);

            expect(updatedDoc).to.exist;
            expect(updatedDoc._rev).to.equal('2');
        });
        it('updateJobStart with cloudant exception', async () => {
            updateDocumentStub.throws(new Error('unexpected'));

            const doc = {
                _id: '1',
                _rev: '1',
                startTime: new Date().getTime(),
            }

            const updatedDoc = await cloudantJobs.updateJobStart(mockCloudant, doc);
            expect(updatedDoc).to.not.exist;
        });
    });

    describe('updateJobEnd', () => {
        it('successful updateJobEnd', async () => {
            const doc = {
                startTime: new Date().getTime(),
            }

            await cloudantJobs.updateJobEnd(mockCloudant, doc);

            const updatedDoc = updateDocumentStub.getCall(0).args[3];
            expect(updatedDoc).to.exist;
            expect(updatedDoc.doneTime).to.exist;
        });
    });

    describe('canStart', () => {
        it('canStart without existing running file', async () => {
            createDocumentStub.returnsArg(2);
            readDocumentSafeStub.returns({ status: 404 });

            const canStart = await cloudantJobs.canStart(mockCloudant);

            expect(canStart).to.exist;
            expect(canStart.startTime).to.exist;
        });
        it('canStart is time to run job', async () => {
            const now = new Date();
            now.setHours(now.getHours() - 13);

            const doc = {
                status: 200,
                data: {
                    startTime: new Date().getTime(),
                    doneTime: now.getTime()
                }
            }
            readDocumentSafeStub.returns(doc);

            const cloudantResponse = {
                rev: '2'
            }
            updateDocumentStub.returns(cloudantResponse);

            const canStart = await cloudantJobs.canStart(mockCloudant);
            expect(canStart).to.exist;
        });
        it('canStart with stale running file', async () => {
            const now = new Date();
            now.setMinutes(now.getMinutes() - 61);

            const doc = {
                status: 200,
                data: {
                    startTime: now.getTime(),
                }
            }
            readDocumentSafeStub.returns(doc);

            const cloudantResponse = {
                rev: '2'
            }
            updateDocumentStub.returns(cloudantResponse);

            const canStart = await cloudantJobs.canStart(mockCloudant);
            expect(canStart).to.exist;
        });
        it('canStart not time to run and running file not stale', async () => {
            const doc = {
                status: 200,
                data: {
                    startTime: new Date().getTime(),
                    doneTime: new Date().getTime()
                }
            }
            readDocumentSafeStub.returns(doc);

            const cloudantResponse = {
                rev: '2'
            }
            updateDocumentStub.returns(cloudantResponse);

            const canStart = await cloudantJobs.canStart(mockCloudant);
            expect(canStart).to.not.exist;
        });
        it('canStart with cloudant error status', async () => {
            createDocumentStub.returnsArg(2);
            readDocumentSafeStub.returns({ status: 500 });

            const canStart = await cloudantJobs.canStart(mockCloudant);

            expect(canStart).to.not.exist;
        });
    });

    describe('getDbList', () => {
        it('successful getDbList', async () => {
            const rawDbList = [
                "bts-batch",
                "bts-batch-queue",
                "bts-cos-info",
                "bts-profile",
                "bts-register",
                "bts-stats"
            ];

            getDBListStub.returns(rawDbList)

            const dbList = await cloudantJobs.getDbList(mockCloudant);

            expect(dbList.length).to.equal(1);
            expect(dbList[0]).to.equal('bts-cos-info');
        });
        it('getDbList with cloudant exception', async () => {
            getDBListStub.throws(new Error('unexpected'))
    
            const dbList = await cloudantJobs.getDbList(mockCloudant);
    
            expect(dbList.length).to.equal(0);
    
        });
    });

    describe('getQuery', () => {
        it('successful getQuery', async () => {
            const query = cloudantJobs.getQuery();

            expect(query.selector).to.exist;
            expect(query.selector.createdTimestamp).to.exist;
        });
    });

    describe('removeDocumentByExpirationDays', () => {
        it('removeDocumentByExpirationDays not time to start job', async () => {
            const doc = {
                status: 200,
                data: {
                    startTime: new Date().getTime(),
                    doneTime: new Date().getTime()
                }
            }
            readDocumentSafeStub.returns(doc);
            await cloudantJobs.expireDocuments(mockCloudant);
            sinon.assert.notCalled(getDBListStub);
        });
        it('removeDocumentByExpirationDays no dbs returned', async () => {
            const dbList = [];

            getDBListStub.returns(dbList)

            createDocumentStub.returnsArg(2);
            readDocumentSafeStub.returns({ status: 404 });

            await cloudantJobs.expireDocuments(mockCloudant);
            sinon.assert.called(getDBListStub);
            sinon.assert.notCalled(queryDocumentsStub);
            sinon.assert.called(updateDocumentStub);
        });
        it('removeDocumentByExpirationDays no documents returned', async () => {
            const dbList = [
                "bts-cos-info",
            ];

            const documents = {
                docs: []
            };

            getDBListStub.returns(dbList)
            queryDocumentsStub.returns(documents);

            createDocumentStub.returnsArg(2);
            readDocumentSafeStub.returns({ status: 404 });

            await cloudantJobs.expireDocuments(mockCloudant);
            sinon.assert.called(getDBListStub);
            sinon.assert.called(queryDocumentsStub);
            sinon.assert.called(updateDocumentStub);
            sinon.assert.notCalled(deleteDocumentStub);
        });
        it('removeDocumentByExpirationDays deletes expired document', async () => {
            const dbList = [
                "bts-cos-info",
            ];

            const documents = {
                docs: [
                    {
                        _id: 'mock.json'
                    }
                ]
            };

            getDBListStub.returns(dbList)
            queryDocumentsStub.returns(documents);

            createDocumentStub.returnsArg(2);
            readDocumentSafeStub.returns({ status: 404 });

            await cloudantJobs.expireDocuments(mockCloudant);
            sinon.assert.called(getDBListStub);
            sinon.assert.called(queryDocumentsStub);
            sinon.assert.called(updateDocumentStub);
            sinon.assert.called(deleteDocumentStub);
        });
    });
});
