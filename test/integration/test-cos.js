/* eslint-disable max-lines-per-function */
/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 */

const sinon = require('sinon');
const { expect } = require('chai');
const httpMocks = require('node-mocks-http');
const { getGdprLogger } = require('dhp-logging-lib/gdpr');

const {getCOSFileNames, getCOSFile, getCOSFilesByHolderId, deleteCOSFile} = require('../../controllers/cos');
const dataHelper = require('../../helpers/data-helper');
const profileHelper = require('../../helpers/profile-helper');
const entityHelper = require('../../entities');
const constants = require('../../helpers/constants');
const CosHelper = require('../../helpers/cos-helper');
const Logger = require('../../config/logger');

const gdprLogger = getGdprLogger();
const sandbox = sinon.createSandbox();

describe('getCOSFileNames()', () => {
    let req;
    let res;

    beforeEach(() => {
        req = httpMocks.createRequest();
        res = httpMocks.createResponse();
        res.json = sinon.spy();
        req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID] = 'test-hpass-id';
        sandbox.stub(Logger.prototype, 'info');
        
    });

    afterEach(()=>{
        sandbox.restore();
    });

    it('should return 400 status code if not specify entity in request params', async () => {

        await getCOSFileNames(req, res);

        expect(res.statusCode).to.be.equal(400);
        expect(res.json.calledOnce).to.be.true;
        expect(res.json.firstCall.args[0]).to.have.property('error');
        expect(res.json.firstCall.args[0].error).to.have.property('message');
    });

    it('should return 400 status code if invalid organization found', async () => {

        req.params={entity:'folder-upload'};
        sandbox.stub(entityHelper, 'getRegEntity').returns(false);

        await getCOSFileNames(req, res);

        expect(res.statusCode).to.be.equal(400);
        expect(res.json.calledOnce).to.be.true;
        expect(res.json.firstCall.args[0]).to.have.property('error');
        expect(res.json.firstCall.args[0].error).to.have.property('message');
    });

    it('should return 200 status code if retrieved COS file names for organization', async () => {
        req.params={entity:'folder-upload'};
        sandbox.stub(entityHelper, 'getRegEntity').returns(true);
        sandbox.stub(CosHelper, 'getInstance').returns(new CosHelper());
        sandbox.stub(CosHelper.prototype, 'getAllFiles').resolves([]);
        sandbox.stub(Logger.prototype, 'response');

        await getCOSFileNames(req, res);

        expect(res.statusCode).to.be.equal(200);
        expect(res.json.calledOnce).to.be.true;
        expect(res.json.firstCall.args[0]).to.have.property('message');
        expect(res.json.firstCall.args[0]).to.have.property('payload');
    });

    it('should return 500 status code if failed to retrieved COS file names for organization', async () => {
        req.params={entity:'folder-upload'};
        sandbox.stub(entityHelper, 'getRegEntity').returns(true);
        sandbox.stub(CosHelper, 'getInstance').returns(new CosHelper());
        sandbox.stub(CosHelper.prototype, 'getAllFiles').rejects(false);
        sandbox.stub(Logger.prototype, 'error');

        await getCOSFileNames(req, res);

        expect(res.statusCode).to.be.equal(500);
        expect(res.json.calledOnce).to.be.true;
        expect(res.json.firstCall.args[0]).to.have.property('error');
        expect(res.json.firstCall.args[0].error).to.have.property('message');
    });

});

describe('getCOSFile()', () => {
    let req;
    let res;

    beforeEach(() => {
        req = httpMocks.createRequest();
        res = httpMocks.createResponse();
        res.json = sinon.spy();
        req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID] = 'test-hpass-id';
        sandbox.stub(Logger.prototype, 'info'); 
    });

    afterEach(()=>{
        sandbox.restore();
    });

    it('should return 400 status code if missing organization', async () => {

        await getCOSFile(req, res);

        expect(res.statusCode).to.be.equal(400);
        expect(res.json.calledOnce).to.be.true;
        expect(res.json.firstCall.args[0]).to.have.property('error');
        expect(res.json.firstCall.args[0].error).to.have.property('message');
    });

    it('should return 400 status code if missing filename', async () => {
        req.params={
            entity : 'file-upload'
        }
        await getCOSFile(req, res);

        expect(res.statusCode).to.be.equal(400);
        expect(res.json.calledOnce).to.be.true;
        expect(res.json.firstCall.args[0]).to.have.property('error');
        expect(res.json.firstCall.args[0].error).to.have.property('message');
    });

    it('should return 400 status code if invalid organization', async () => {
        req.params={
            entity : 'file-upload',
            filename : 'xyz-file'
        };

        sandbox.stub(entityHelper, 'getRegEntity').returns(false);

        await getCOSFile(req, res);

        expect(res.statusCode).to.be.equal(400);
        expect(res.json.calledOnce).to.be.true;
        expect(res.json.firstCall.args[0]).to.have.property('error');
        expect(res.json.firstCall.args[0].error).to.have.property('message');
    });

    it('should return 200 status code if successfully retrieve the COS file', async () => {
        req.params={
            entity : 'file-upload',
            filename : 'xyz-file'
        };
        const resolveObj = {
            statusCode : 200
        };

        sandbox.stub(entityHelper, 'getRegEntity').returns(true);
        sandbox.stub(CosHelper, 'getInstance').returns(new CosHelper());
        sandbox.stub(CosHelper.prototype, 'getFile').resolves(resolveObj);
        sandbox.stub(gdprLogger, 'logCOS').returns(true);
        sandbox.stub(Logger.prototype, 'response');
       
        await getCOSFile(req, res);
        
        expect(res.statusCode).to.be.equal(200);
    });

    it('should return 400 status code if failed retrieve the COS file', async () => {
        req.params={
            entity : 'file-upload',
            filename : 'xyz-file'
        };
        const resolveObj = {
            statusCode : 400
        };

        sandbox.stub(entityHelper, 'getRegEntity').returns(true);
        sandbox.stub(CosHelper, 'getInstance').returns(new CosHelper());
        sandbox.stub(CosHelper.prototype, 'getFile').rejects(resolveObj);
        sandbox.stub(gdprLogger, 'logCOS').returns(true);
        sandbox.stub(Logger.prototype, 'error');
       
        await getCOSFile(req, res);
        
        expect(res.statusCode).to.be.equal(400);
        expect(res.json.calledOnce).to.be.true;
        expect(res.json.firstCall.args[0]).to.have.property('error');
        expect(res.json.firstCall.args[0].error).to.have.property('message');

    });

});

// eslint-disable-next-line max-lines-per-function
describe('getCOSFilesByHolderId()', () => {
    let req;
    let res;

    beforeEach(() => {
        req = httpMocks.createRequest();
        res = httpMocks.createResponse();
        res.json = sinon.spy();
        req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID] = 'test-hpass-id';
        sandbox.stub(Logger.prototype, 'info'); 
    });

    afterEach(()=>{
        sandbox.restore();
    });

    it('should return 400 status code if missing entity in params', async () => {

        await getCOSFilesByHolderId(req, res);

        expect(res.statusCode).to.be.equal(400);
        expect(res.json.calledOnce).to.be.true;
        expect(res.json.firstCall.args[0]).to.have.property('error');
    });

    it('should return 400 status code if missing holderId in params', async () => {

        req.params = {
            entity : 'file-upload'
        }
        await getCOSFilesByHolderId(req, res);

        expect(res.statusCode).to.be.equal(400);
        expect(res.json.calledOnce).to.be.true;
        expect(res.json.firstCall.args[0]).to.have.property('error');
    });

    it('should return 400 status code if missing signatureValue in query param', async () => {

        req.params = {
            entity : 'file-upload',
            holderId : 'holder-id'
        }
        await getCOSFilesByHolderId(req, res);

        expect(res.statusCode).to.be.equal(400);
        expect(res.json.calledOnce).to.be.true;
        expect(res.json.firstCall.args[0]).to.have.property('error');
    });

    it('should return 400 status code if missing publicKeyType in query param', async () => {

        req.params = {
            entity : 'file-upload',
            holderId : 'holder-id'
        };
        req.query= {
            signatureValue : 'sign-key'
        };

        await getCOSFilesByHolderId(req, res);

        expect(res.statusCode).to.be.equal(400);
        expect(res.json.calledOnce).to.be.true;
        expect(res.json.firstCall.args[0]).to.have.property('error');
    });

    it('should return 400 status code if missing format in query param', async () => {
        req.params = {
            entity : 'file-upload',
            holderId : 'holder-id'
        };
        req.query = {
            signatureValue : 'sign-key',
            publicKeyType : 'pkcs1',
            format:'some-format'
        };

        await getCOSFilesByHolderId(req, res);

        expect(res.statusCode).to.be.equal(400);
        expect(res.json.calledOnce).to.be.true;
        expect(res.json.firstCall.args[0]).to.have.property('error');
    });

    it('should return 400 status code if failed to get profile docs', async () => {
        req.params = {
            entity : 'file-upload',
            holderId : 'holder-id'
        };
        req.query = {
            signatureValue : 'sign-key',
            publicKeyType : 'pkcs1'
        };
        const profileDocsObj = {
            status : 400
        };
        sandbox.stub(profileHelper, 'getProfileDoc').returns(profileDocsObj);
        sandbox.stub(Logger.prototype, 'response');

        await getCOSFilesByHolderId(req, res);

        expect(res.statusCode).to.be.equal(400);
        expect(res.json.calledOnce).to.be.true;
        expect(res.json.firstCall.args[0]).to.have.property('error');
    });

    it('should return 400 status code if failed to get entity', async () => {
        req.params = {
            entity : 'file-upload',
            holderId : 'holder-id'
        };
        req.query = {
            signatureValue : 'sign-key',
            publicKeyType : 'pkcs1'
        };
        const profileDocsObj = {
            status : 200,
            data : {
                _id:'some id'
            }
        };

        sandbox.stub(profileHelper, 'getProfileDoc').resolves(profileDocsObj);
        sandbox.stub(entityHelper, 'getRegEntity').returns(false);
        sandbox.stub(Logger.prototype, 'response');
        sandbox.stub(Logger.prototype, 'error');

        await getCOSFilesByHolderId(req, res);

        expect(res.statusCode).to.be.equal(400);
        expect(res.json.calledOnce).to.be.true;
        expect(res.json.firstCall.args[0]).to.have.property('error');
    });

    // eslint-disable-next-line max-lines-per-function
    it('should return 500 status code if failed to verify result', async () => {
        req.params = {
            entity : 'file-upload',
            holderId : 'holder-id'
        };
        req.query = {
            signatureValue : 'sign-key',
            publicKeyType : 'pkcs1'
        };
        const profileDocsObj = {
            status : 200,
            data : {
                _id:'some id'
            }
        };

        sandbox.stub(profileHelper, 'getProfileDoc').resolves(profileDocsObj);
        sandbox.stub(entityHelper, 'getRegEntity').returns(true);
        sandbox.stub(dataHelper, 'verifySelfAttestedCredential')
            .returns({error : true});
        sandbox.stub(Logger.prototype, 'error');

        await getCOSFilesByHolderId(req, res);

        expect(res.statusCode).to.be.equal(500);
        expect(res.json.calledOnce).to.be.true;
        expect(res.json.firstCall.args[0]).to.have.property('error');
    });
    // eslint-disable-next-line max-lines-per-function
    it('should return 401 status code if invalid signature', async () => {
        req.params = {
            entity : 'file-upload',
            holderId : 'holder-id'
        };
        req.query = {
            signatureValue : 'sign-key',
            publicKeyType : 'pkcs1'
        };
        const profileDocsObj = {
            status : 200,
            data : {
                _id:'some id'
            }
        };

        sandbox.stub(profileHelper, 'getProfileDoc').resolves(profileDocsObj);
        sandbox.stub(entityHelper, 'getRegEntity').returns(true);
        sandbox.stub(dataHelper, 'verifySelfAttestedCredential')
            .returns({success : false});
        sandbox.stub(Logger.prototype, 'response');
        
        await getCOSFilesByHolderId(req, res);
        

        expect(res.statusCode).to.be.equal(401);
        expect(res.json.calledOnce).to.be.true;
        expect(res.json.firstCall.args[0]).to.have.property('error');
    });
    // eslint-disable-next-line max-lines-per-function
    it('should return 400 status code if failed to get all file holder', async () => {
        req.params = {
            entity : 'file-upload',
            holderId : 'holder-id'
        };
        req.query = {
            signatureValue : 'sign-key',
            publicKeyType : 'pkcs1'
        };
        const profileDocsObj = {
            status : 200,
            data : {
                _id:'some id'
            }
        };

        sandbox.stub(profileHelper, 'getProfileDoc').resolves(profileDocsObj);
        sandbox.stub(entityHelper, 'getRegEntity').returns(true);
        sandbox.stub(dataHelper, 'verifySelfAttestedCredential')
            .returns({success : true});
        sandbox.stub(CosHelper, 'getInstance').returns(new CosHelper());
        sandbox.stub(CosHelper.prototype, 'getAllFilesForHolder')
            .returns({status : 400});
        sandbox.stub(Logger.prototype, 'response');
        
        await getCOSFilesByHolderId(req, res);
        

        expect(res.statusCode).to.be.equal(400);
        expect(res.json.calledOnce).to.be.true;
        expect(res.json.firstCall.args[0]).to.have.property('error');
    });

    it('should return 200 status code if format is json', async () => {
        req.params = {
            entity : 'file-upload',
            holderId : 'holder-id'
        };
        req.query = {
            signatureValue : 'sign-key',
            publicKeyType : 'pkcs1',
            format : 'json'
        };
        const profileDocsObj = {
            status : 200,
            data : {
                _id:'some id'
            }
        };

        sandbox.stub(profileHelper, 'getProfileDoc').resolves(profileDocsObj);
        sandbox.stub(entityHelper, 'getRegEntity').returns(true);
        sandbox.stub(dataHelper, 'verifySelfAttestedCredential')
            .returns({success : true});
        sandbox.stub(CosHelper, 'getInstance').returns(new CosHelper());
        sandbox.stub(CosHelper.prototype, 'getAllFilesForHolder')
            .returns({status : 200});
        sandbox.stub(Logger.prototype, 'response');
        
        await getCOSFilesByHolderId(req, res);
        
        expect(res.statusCode).to.be.equal(200);
        expect(res.json.calledOnce).to.be.true;
        expect(res.json.firstCall.args[0]).to.have.property('message');
    });

});

// eslint-disable-next-line max-lines-per-function
describe('deleteCOSFile()', () => {
    let req;
    let res;

    beforeEach(() => {
        req = httpMocks.createRequest();
        res = httpMocks.createResponse();
        res.json = sinon.spy();
        req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID] = 'test-hpass-id';
        sandbox.stub(Logger.prototype, 'info'); 
    });

    afterEach(()=>{
        sandbox.restore();
    });

    it('should return 400 status code if missing entity in params', async () => {

        await deleteCOSFile(req, res);

        expect(res.statusCode).to.be.equal(400);
        expect(res.json.calledOnce).to.be.true;
        expect(res.json.firstCall.args[0]).to.have.property('error');
    });

    it('should return 400 status code if missing filename in params', async () => {

        req.params = {
            entity : 'file-upload'
        }
        await deleteCOSFile(req, res);

        expect(res.statusCode).to.be.equal(400);
        expect(res.json.calledOnce).to.be.true;
        expect(res.json.firstCall.args[0]).to.have.property('error');
    });

    it('should return 400 status code if invalid ornagization', async () => {

        req.params = {
            entity : 'file-upload',
            filename : 'file1'
        }

        const  getRegEntityStub = sinon.stub(entityHelper, 'getRegEntity').returns(false);

        await deleteCOSFile(req, res);

        getRegEntityStub.restore();

        expect(res.statusCode).to.be.equal(400);
        expect(res.json.calledOnce).to.be.true;
        expect(res.json.firstCall.args[0]).to.have.property('error');
    });

    it('should return 200 status code if able to delete COS file', async () => {

        req.params = {
            entity : 'file-upload',
            filename : 'file1'
        }
        
        sandbox.stub(CosHelper, 'getInstance').returns(new CosHelper());
        sandbox.stub(CosHelper.prototype, 'deleteFile').returns(true);
        sandbox.stub(entityHelper, 'getRegEntity').returns(true);
        sandbox.stub(gdprLogger, 'logCOS').returns(true);

        await deleteCOSFile(req, res);

        expect(res.statusCode).to.be.equal(200);
    });

    it('should return 500 status code if failed to delete COS file', async () => {

        req.params = {
            entity : 'file-upload',
            filename : 'file1'
        }
        
        sandbox.stub(CosHelper, 'getInstance').returns(new CosHelper());
        sandbox.stub(CosHelper.prototype, 'deleteFile').rejects({statusCode : 500});
        sandbox.stub(entityHelper, 'getRegEntity').returns(true);
        sandbox.stub(gdprLogger, 'logCOS').returns(true);
        sandbox.stub(Logger.prototype, 'error');

        await deleteCOSFile(req, res);

        expect(res.statusCode).to.be.equal(500);
    });

    it('should return 400 status code if failed to reg entity', async () => {

        req.params = {
            entity : 'file-upload',
            filename : 'file1'
        }
        
        sandbox.stub(CosHelper, 'getInstance').returns(new CosHelper());
        sandbox.stub(CosHelper.prototype, 'deleteFile').rejects({statusCode : 500});
        sandbox.stub(entityHelper, 'getRegEntity').rejects({error : 'some message'});
        sandbox.stub(gdprLogger, 'logCOS').returns(true);
        sandbox.stub(Logger.prototype, 'error');

        await deleteCOSFile(req, res);

        expect(res.statusCode).to.be.equal(400);
        expect(res.json.calledOnce).to.be.true;
        expect(res.json.firstCall.args[0]).to.have.property('error');

    });

});