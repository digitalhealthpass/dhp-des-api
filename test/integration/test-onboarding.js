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

const { onboardHolder, validateCode, validateKey, deleteRegistration, validateHoldersOnboardStatus }
    = require('../../controllers/onboarding');
const registerCodeHelper = require('../../helpers/register-code-helper');
const onboardingHelper = require('../../helpers/onboarding-helper');
const profileHelper = require('../../helpers/profile-helper');
const dataHelper = require('../../helpers/data-helper');
const postboxHelper = require('../../helpers/postbox-helper');
const entityHelper = require('../../entities');
const constants = require('../../helpers/constants');
const CosHelper = require('../../helpers/cos-helper');
const Logger = require('../../config/logger');

const sandbox = sinon.createSandbox();

describe('onboardHolder()', function onboarding() {
    this.timeout(20000);
    let req;
    let res;

    beforeEach(() => {
        req = httpMocks.createRequest();
        res = httpMocks.createResponse();
        res.json = sandbox.spy();
        sandbox.stub(Logger.prototype, 'debug');
        sandbox.stub(Logger.prototype, 'warn');
        sandbox.stub(Logger.prototype, 'info');
    });

    afterEach(() => {
        sandbox.restore();
    });

    it('should return 400 status code if not specify organization/entity in request body', async () => {
        const txID = 'test-txID';

        const response = await onboardHolder(txID, req, res);

        expect(response).to.have.property('message');
        expect(response).to.have.property('status');
        expect(response.status).to.be.equal(400);
    });

    it('should return 400 status code if no configuration found for entity', async () => {
        const txID = 'test-txID';
        req.body = {
            organization: 'holder-upload',
            entity: 'test-entiry'
        };

        sandbox.stub(entityHelper, 'getRegEntity').resolves(false);

        const response = await onboardHolder(txID, req, res);

        expect(response).to.have.property('message');
        expect(response).to.have.property('status');
        expect(response.status).to.be.equal(400);
    });

    it('should return 400 status code if no entity helpers found', async () => {
        const txID = 'test-txID';
        req.body = {
            organization: 'holder-upload',
            entity: 'test-entiry'
        };

        sandbox.stub(entityHelper, 'getRegEntity').resolves(true);
        sandbox.stub(entityHelper, 'existRegEntityHelpers').resolves(false);

        const response = await onboardHolder(txID, req, res);

        expect(response).to.have.property('message');
        expect(response).to.have.property('status');
        expect(response.status).to.be.equal(400);
    });

    it('should return 400 status code if no public key found', async () => {
        const txID = 'test-txID';
        req.body = {
            organization: 'holder-upload',
            entity: 'test-entiry'
        };

        sandbox.stub(entityHelper, 'getRegEntity').resolves(true);
        sandbox.stub(entityHelper, 'existRegEntityHelpers').resolves('holder-upload');

        sandbox.stub(Logger.prototype, 'response');

        await onboardHolder(txID, req, res);

        expect(res.statusCode).to.be.equal(400);
        expect(res.json.calledOnce).to.be.true;
        expect(res.json.firstCall.args[0]).to.have.property('error');
        expect(res.json.firstCall.args[0].error).to.have.property('message');

    });

    it('should return 400 status code if failed to validate request body', async () => {
        const txID = 'test-txID';
        req.body = {
            organization: 'holder-upload',
            entity: 'test-entiry',
            id: true
        };

        sandbox.stub(entityHelper, 'getRegEntity').resolves(true);
        sandbox.stub(entityHelper, 'existRegEntityHelpers').returns(false);
        sandbox.stub(Logger.prototype, 'error');

        const response = await onboardHolder(txID, req, res);

        expect(response).to.have.property('message');
        expect(response).to.have.property('status');
        expect(response.status).to.be.equal(400);
    });

    it('should return 404 status code if registration code not found', async () => {
        const txID = 'test-txID';
        req.body = {
            organization: 'holder-upload',
            entity: 'test-entiry',
            id: true,
            registrationCode: 'test-code'
        };
        const readCodeDocObj = {
            status: 404,
            message: 'Registration code doc for code not found'
        };

        sandbox.stub(entityHelper, 'getRegEntity').resolves(true);
        sandbox.stub(entityHelper, 'existRegEntityHelpers').resolves('holder-upload');
        sandbox.stub(Logger.prototype, 'error');
        sandbox.stub(Logger.prototype, 'response');
        sandbox.stub(registerCodeHelper, 'readCodeDoc').resolves(readCodeDocObj);


        await onboardHolder(txID, req, res);

        expect(res.statusCode).to.be.equal(404);
        expect(res.json.calledOnce).to.be.true;
        expect(res.json.firstCall.args[0]).to.have.property('error');
        expect(res.json.firstCall.args[0].error).to.have.property('message');
    });


    it('should return 400 status code if verification code is not validated', async () => {
        const txID = 'test-txID';
        req.body = {
            organization: 'holder-upload',
            entity: 'test-entiry',
            id: true,
            registrationCode: 'test-code'
        };
        const readCodeDocObj = {
            status: 200,
            data: { verificationCode: false }
        };
        const regEntityData = {
            userRegistrationConfig: { flow: { mfaAuth: true } }
        };


        sandbox.stub(entityHelper, 'getRegEntity').resolves(regEntityData);
        sandbox.stub(entityHelper, 'existRegEntityHelpers').resolves('holder-upload');
        sandbox.stub(Logger.prototype, 'error');
        sandbox.stub(Logger.prototype, 'response');
        sandbox.stub(registerCodeHelper, 'readCodeDoc').resolves(readCodeDocObj);


        await onboardHolder(txID, req, res);

        expect(res.statusCode).to.be.equal(400);
        expect(res.json.calledOnce).to.be.true;
        expect(res.json.firstCall.args[0]).to.have.property('error');
        expect(res.json.firstCall.args[0].error).to.have.property('message');

    });


    it('should return 400 status code if verification code not found', async () => {
        const txID = 'test-txID';
        req.body = {
            organization: 'holder-upload',
            entity: 'test-entiry',
            id: true,
            registrationCode: 'test-code'
        };
        const readCodeDocObj = {
            status: 200,
            data: { verificationCode: true }
        };
        const regEntityData = {
            userRegistrationConfig: { flow: { mfaAuth: true } }
        };



        sandbox.stub(entityHelper, 'getRegEntity').resolves(regEntityData);
        sandbox.stub(entityHelper, 'existRegEntityHelpers').resolves('holder-upload');
        sandbox.stub(Logger.prototype, 'error');
        sandbox.stub(Logger.prototype, 'response');
        sandbox.stub(registerCodeHelper, 'readCodeDoc').resolves(readCodeDocObj);


        await onboardHolder(txID, req, res);

        expect(res.statusCode).to.be.equal(400);
        expect(res.json.calledOnce).to.be.true;
        expect(res.json.firstCall.args[0]).to.have.property('error');
        expect(res.json.firstCall.args[0].error).to.have.property('message');

    });

    it('should return 400 status code if verification code is not validated', async () => {
        const txID = 'test-txID';
        req.body = {
            organization: 'holder-upload',
            entity: 'test-entiry',
            id: true,
            registrationCode: 'test-code'
        };
        const readCodeDocObj = {
            status: 200,
            data: { verificationCode: true, verificationStatus: 'new' }
        };
        const regEntityData = {
            userRegistrationConfig: { flow: { mfaAuth: true } }
        };


        sandbox.stub(entityHelper, 'getRegEntity').resolves(regEntityData);
        sandbox.stub(entityHelper, 'existRegEntityHelpers').resolves('holder-upload');
        sandbox.stub(Logger.prototype, 'error');
        sandbox.stub(Logger.prototype, 'response');
        sandbox.stub(registerCodeHelper, 'readCodeDoc').resolves(readCodeDocObj);


        await onboardHolder(txID, req, res);

        expect(res.statusCode).to.be.equal(400);
        expect(res.json.calledOnce).to.be.true;
        expect(res.json.firstCall.args[0]).to.have.property('error');
        expect(res.json.firstCall.args[0].error).to.have.property('message');

    });

    it('should return success if entity helper is not holder-upload', async () => {
        const txID = 'test-txID';
        req.body = {
            organization: 'holder-download',
            entity: 'holder-download',
            id: true,
            props: true,
            registrationCode: 'test-code'
        };
        const readCodeDocObj = {
            status: 200,
            data: { verificationCode: true }
        };
        const regEntityData = {
            entityType: 'holder-download',
            userData: 'props',
            userRegistrationConfig: {
                flow: {}
            }
        };
        const resObj = {
            message: "Successfully onboarded user",
            payload: []
        }

        sandbox.stub(entityHelper, 'getRegEntity').resolves(regEntityData);
        sandbox.stub(entityHelper, 'existRegEntityHelpers').resolves(true);
        sandbox.stub(onboardingHelper, 'registerHolder').returns(resObj);
        sandbox.stub(registerCodeHelper, 'readCodeDoc').resolves(readCodeDocObj);

        const response = await onboardHolder(txID, req, res);

        expect(response).to.have.property('message');
        expect(response).to.have.property('payload');

    });

    it('should return 500 status code if failed to register', async () => {
        const txID = 'test-txID';
        req.body = {
            organization: 'holder-download',
            entity: 'holder-download',
            id: true,
            props: true,
            registrationCode: 'test-code'
        };
        const regEntityData = {
            entityType: 'holder-download',
            userData: 'props',
            userRegistrationConfig: {
                flow: {}
            }
        };
        const rejectObj = {
            errorStatus: 500, errorMsg: 'Failed to'
        }
        const readCodeDocObj = {
            status: 200,
            data: { verificationCode: true }
        };

        sandbox.stub(registerCodeHelper, 'readCodeDoc').resolves(readCodeDocObj);
        sandbox.stub(entityHelper, 'getRegEntity').resolves(regEntityData);
        sandbox.stub(entityHelper, 'existRegEntityHelpers').resolves(true);
        sandbox.stub(onboardingHelper, 'registerHolder').rejects(rejectObj);
        sandbox.stub(Logger.prototype, 'error');
        sandbox.stub(Logger.prototype, 'response');


        await onboardHolder(txID, req, res);

        expect(res.statusCode).to.be.equal(500);
        expect(res.json.calledOnce).to.be.true;
        expect(res.json.firstCall.args[0]).to.have.property('error');
        expect(res.json.firstCall.args[0].error).to.have.property('message');
    });

});

describe('onboard', () => {
    let req;
    let res;

    beforeEach(() => {
        req = httpMocks.createRequest();
        res = httpMocks.createResponse();
        res.json = sandbox.spy();
        req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID] = 'test-hpass-id';
    });

    afterEach(() => {
        sandbox.restore();
    });

    it('should return 200 status code if onboarded user success', async function test() {

        req.body = {
            organization: 'holder-download',
            entity: 'holder-download',
            id: true,
            props: true,
            registrationCode: 'test-code'
        };

        const regEntityData = {
            entityType: 'holder-download',
            userData: 'props',
            userRegistrationConfig: {
                flow: {}
            }
        };
        const resObj = {
            status: 200,
            message: "Successfully onboarded user",
            payload: []
        };

        sandbox.stub(registerCodeHelper, 'readCodeDoc').resolves({ status: 200 });
        sandbox.stub(entityHelper, 'getRegEntity').resolves(regEntityData);
        sandbox.stub(entityHelper, 'existRegEntityHelpers').resolves(true);
        sandbox.stub(onboardingHelper, 'registerHolder').resolves(resObj);

        const response = await onboardHolder('txID', req, res);

        expect(response.status).to.be.equal(200);
        expect(response).to.have.property('payload');
        expect(response).to.have.property('message');
    });

    it('should return 500 status code if failed to onboarded user', async () => {

        req.body = {
            organization: 'holder-download',
            entity: 'holder-download',
            id: true,
            props: true,
            registrationCode: 'test-code'
        };
        const regEntityData = {
            entityType: 'holder-download',
            userData: 'props',
            userRegistrationConfig: {
                flow: {}
            }
        };
        const resObj = {
            status: 500,
            message: "Failed to onboard user",
        };

        sandbox.stub(registerCodeHelper, 'readCodeDoc').resolves({ status: 200 });
        sandbox.stub(entityHelper, 'getRegEntity').resolves(regEntityData);
        sandbox.stub(entityHelper, 'existRegEntityHelpers').resolves(true);
        sandbox.stub(onboardingHelper, 'registerHolder').resolves(resObj);

        const response = await onboardHolder('txID', req, res);

        expect(response.status).to.be.equal(500);
        expect(response).to.have.property('message');
    });

});

describe('validateCode()', () => {
    let req;
    let res;

    beforeEach(() => {
        req = httpMocks.createRequest();
        res = httpMocks.createResponse();
        res.json = sandbox.spy();
        req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID] = 'test-hpass-id';
        sandbox.stub(Logger.prototype, 'response');
        sandbox.stub(Logger.prototype, 'debug');
    });

    afterEach(() => {
        sandbox.restore();
    });

    it('should return 400 status code if not specify organization/entity in request body', async () => {
        await validateCode(req, res);

        expect(res.statusCode).to.be.equal(400);
        expect(res.json.calledOnce).to.be.true;
        expect(res.json.firstCall.args[0]).to.have.property('error');
        expect(res.json.firstCall.args[0].error).to.have.property('message');
    });

    it('should return 400 status code if Failed to validate entity', async () => {
        sandbox.stub(entityHelper, 'getRegEntity').resolves(false);
        await validateCode(req, res);

        expect(res.statusCode).to.be.equal(400);
        expect(res.json.calledOnce).to.be.true;
        expect(res.json.firstCall.args[0]).to.have.property('error');
        expect(res.json.firstCall.args[0].error).to.have.property('message');
    });

    it('should return 200 status code if registration code is valid for use', async () => {

        req.body = {
            organization: 'holder-download',
            entity: 'holder-download',
            id: true,
            props: true,
            registrationCode: 'test-code'
        };
        const resObj = {
            status: 200,
            message: "Registration code is valid for use",
        };

        sandbox.stub(entityHelper, 'getRegEntity').resolves(true);
        sandbox.stub(registerCodeHelper, 'validateCodeDoc').resolves(resObj);
        sandbox.stub(Logger.prototype, 'info');

        await validateCode(req, res);

        expect(res.statusCode).to.be.equal(200);
        expect(res.json.calledOnce).to.be.true;
        expect(res.json.firstCall.args[0]).to.have.property('message');
    });

    it('should return 400 status code if failed to validate registration doc code', async () => {

        req.body = {
            organization: 'holder-download',
            entity: 'holder-download',
            id: true,
            props: true,
            registrationCode: 'test-code'
        };
        const resObj = {
            status: 400,
            message: "Failed to validate registration code",
        };

        sandbox.stub(entityHelper, 'getRegEntity').resolves(true);
        sandbox.stub(registerCodeHelper, 'validateCodeDoc').resolves(resObj);
        sandbox.stub(Logger.prototype, 'info');

        await validateCode(req, res);

        expect(res.statusCode).to.be.equal(400);
        expect(res.json.calledOnce).to.be.true;
        expect(res.json.firstCall.args[0]).to.have.property('error');
    });

    it('should return 500 status code if error occured during validate registration doc code', async () => {

        req.body = {
            organization: 'holder-download',
            entity: 'holder-download',
            id: true,
            props: true,
            registrationCode: 'test-code'
        };
        const resObj = {
            status: 500,
            message: "Failed to validate registration code",
        };

        sandbox.stub(entityHelper, 'getRegEntity').resolves(true);
        sandbox.stub(registerCodeHelper, 'validateCodeDoc').rejects(resObj);
        sandbox.stub(Logger.prototype, 'info');
        sandbox.stub(Logger.prototype, 'error');

        await validateCode(req, res);

        expect(res.statusCode).to.be.equal(500);
        expect(res.json.calledOnce).to.be.true;
        expect(res.json.firstCall.args[0]).to.have.property('error');
    });

});

describe('validateKey()', () => {
    let req;
    let res;

    beforeEach(() => {
        req = httpMocks.createRequest();
        res = httpMocks.createResponse();
        res.json = sandbox.spy();
        req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID] = 'test-hpass-id';
        sandbox.stub(Logger.prototype, 'response');
        sandbox.stub(Logger.prototype, 'debug');
    });

    afterEach(() => {
        sandbox.restore();
    });

    it('should return 400 status code if not specify organization/entity in request body', async () => {

        await validateKey(req, res);

        expect(res.statusCode).to.be.equal(400);
        expect(res.json.calledOnce).to.be.true;
        expect(res.json.firstCall.args[0]).to.have.property('error');
        expect(res.json.firstCall.args[0].error).to.have.property('message');
    });

    it('should return 400 status code if Failed to holder ID', async () => {
        req.body = {
            organization: 'holder-download',
            entity: 'holder-download'
        };

        sandbox.stub(entityHelper, 'getRegEntity').resolves(false);
        sandbox.stub(Logger.prototype, 'info');
        await validateKey(req, res);

        expect(res.statusCode).to.be.equal(400);
        expect(res.json.calledOnce).to.be.true;
        expect(res.json.firstCall.args[0]).to.have.property('error');
        expect(res.json.firstCall.args[0].error).to.have.property('message');
    });

    it('should return 400 status code if holder ID is null or empty', async () => {
        req.body = {
            organization: 'holder-download',
            entity: 'holder-download'
        };
        req.headers[constants.REQUEST_HEADERS.DATASUBMISSION_KEY] = null;
        sandbox.stub(entityHelper, 'getRegEntity').resolves(true);
        sandbox.stub(Logger.prototype, 'info');

        await validateKey(req, res);

        expect(res.statusCode).to.be.equal(400);
        expect(res.json.calledOnce).to.be.true;
        expect(res.json.firstCall.args[0]).to.have.property('error');
        expect(res.json.firstCall.args[0].error).to.have.property('message');
    });


    it('should return 200 status code if holder ID is valid for use', async () => {
        req.body = {
            organization: 'holder-download',
            entity: 'holder-download'
        };
        req.headers[constants.REQUEST_HEADERS.DATASUBMISSION_KEY] = '01-key';
        sandbox.stub(entityHelper, 'getRegEntity').resolves(true);
        sandbox.stub(profileHelper, 'existProfile').resolves(false);
        sandbox.stub(Logger.prototype, 'info');

        await validateKey(req, res);

        expect(res.statusCode).to.be.equal(200);
        expect(res.json.calledOnce).to.be.true;
        expect(res.json.firstCall.args[0]).to.have.property('message');
    });

    it('should return 400 status code if holder ID already exits', async () => {
        req.body = {
            organization: 'holder-download',
            entity: 'holder-download'
        };
        req.headers[constants.REQUEST_HEADERS.DATASUBMISSION_KEY] = '01-key';
        sandbox.stub(entityHelper, 'getRegEntity').resolves(true);
        sandbox.stub(profileHelper, 'existProfile').resolves(false);
        sandbox.stub(Logger.prototype, 'info');

        await validateKey(req, res);

        expect(res.statusCode).to.be.equal(200);
        expect(res.json.calledOnce).to.be.true;
        expect(res.json.firstCall.args[0]).to.have.property('message');
    });

    it('should return 400 status code if holder ID already not exits', async () => {
        req.body = {
            organization: 'holder-download',
            entity: 'holder-download'
        };
        req.headers[constants.REQUEST_HEADERS.DATASUBMISSION_KEY] = '01-key';
        sandbox.stub(entityHelper, 'getRegEntity').resolves(true);
        sandbox.stub(profileHelper, 'existProfile').resolves(true);
        sandbox.stub(Logger.prototype, 'info');

        await validateKey(req, res);

        expect(res.statusCode).to.be.equal(400);
        expect(res.json.calledOnce).to.be.true;
        expect(res.json.firstCall.args[0]).to.have.property('error');
        expect(res.json.firstCall.args[0].error).to.have.property('message');
    });

});

describe('deleteRegistration()', () => {
    let req;
    let res;

    beforeEach(() => {
        req = httpMocks.createRequest();
        res = httpMocks.createResponse();
        res.json = sandbox.spy();
        req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID] = 'test-hpass-id';
        req.headers.authorization = 'some authorization';
        sandbox.stub(Logger.prototype, 'response');
        sandbox.stub(Logger.prototype, 'debug');
    });

    afterEach(() => {
        sandbox.restore();
    });

    it('should return 400 status code if not specify organization/entity in request body', async () => {

        await deleteRegistration(req, res);

        expect(res.statusCode).to.be.equal(400);
        expect(res.json.calledOnce).to.be.true;
        expect(res.json.firstCall.args[0]).to.have.property('error');
        expect(res.json.firstCall.args[0].error).to.have.property('message');
    });

    it('should return 400 status code if invalid holder ID', async () => {
        req.body = {
            organization: 'holder-download',
            entity: 'holder-download',
        };
        const resObj = {
            status: 400,
            message: "Failed to offboard holder",
        };
        sandbox.stub(profileHelper, 'getProfileDoc').resolves(resObj);
        sandbox.stub(CosHelper, 'getInstance').returns(true);

        await deleteRegistration(req, res);

        expect(res.statusCode).to.be.equal(400);
        expect(res.json.calledOnce).to.be.true;
        expect(res.json.firstCall.args[0]).to.have.property('error');
    });

    it('should return 400 status code if invalid entity', async () => {
        req.headers[constants.REQUEST_HEADERS.DOCUMENT_ID] = 'doc-id';
        req.body = {
            organization: 'holder-download',
            entity: 'holder-download',
        }
        const resObj = {
            status: 200,
            message: "Failed to offboard holder",
        };
        sandbox.stub(profileHelper, 'getProfileDoc').resolves(resObj);
        sandbox.stub(CosHelper, 'getInstance').returns(true);
        sandbox.stub(entityHelper, 'getRegEntity').returns(false);

        await deleteRegistration(req, res);

        expect(res.statusCode).to.be.equal(400);
        expect(res.json.calledOnce).to.be.true;
        expect(res.json.firstCall.args[0]).to.have.property('error');
    });

    it('should return 400 status code if no valid consent receipt found', async () => {
        req.headers[constants.REQUEST_HEADERS.DOCUMENT_ID] = 'doc-id';
        req.body = {
            organization: 'holder-download',
            entity: 'holder-download',
        }
        const resObj = {
            status: 200,
            message: "Failed to offboard holder",
        };
        const docSign = {
            success: false
        }
        sandbox.stub(profileHelper, 'getProfileDoc').resolves(resObj);
        sandbox.stub(CosHelper, 'getInstance').returns(true);
        sandbox.stub(entityHelper, 'getRegEntity').returns(true);
        sandbox.stub(dataHelper, 'validateDocSignature').returns(docSign);
        sandbox.stub(Logger.prototype, 'warn');

        await deleteRegistration(req, res);

        expect(res.statusCode).to.be.equal(400);
        expect(res.json.calledOnce).to.be.true;
        expect(res.json.firstCall.args[0]).to.have.property('message');
    });

    it('should return 500 status code if failed to create file', async () => {
        req.headers[constants.REQUEST_HEADERS.DOCUMENT_ID] = 'doc-id';
        req.body = {
            organization: 'holder-download',
            entity: 'holder-download',
        }
        const resObj = {
            status: 200,
            message: "Failed to offboard holder",
        };
        const docSign = {
            success: true,
            data: true
        }
        const rejectObj = {
            statusCode: 500
        }

        sandbox.stub(profileHelper, 'getProfileDoc').resolves(resObj);
        sandbox.stub(CosHelper, 'getInstance').returns(new CosHelper());
        sandbox.stub(entityHelper, 'getRegEntity').returns(true);
        sandbox.stub(dataHelper, 'validateDocSignature').returns(docSign);
        sandbox.stub(CosHelper.prototype, 'createFile').rejects(rejectObj);
        sandbox.stub(Logger.prototype, 'error');

        await deleteRegistration(req, res);

        expect(res.statusCode).to.be.equal(500);
        expect(res.json.calledOnce).to.be.true;
        expect(res.json.firstCall.args[0]).to.have.property('error');
        expect(res.json.firstCall.args[0].error).to.have.property('message');
    });

    it('should return 400 status code if unable to delete document', async () => {
        req.headers[constants.REQUEST_HEADERS.DOCUMENT_ID] = 'doc-id';

        req.body = {
            organization: 'holder-download',
            entity: 'holder-download',
        }
        const resObj = {
            status: 200,
            data: true,
            message: "offboard holder",
        };
        const docSign = {
            success: true,
            data: true
        }
        const delDocsObj = {
            status: 404
        };

        sandbox.stub(profileHelper, 'getProfileDoc').resolves(resObj);
        sandbox.stub(CosHelper, 'getInstance').returns(new CosHelper());
        sandbox.stub(entityHelper, 'getRegEntity').returns(true);
        sandbox.stub(dataHelper, 'validateDocSignature').returns(docSign);
        sandbox.stub(CosHelper.prototype, 'createFile').resolves(true);
        sandbox.stub(postboxHelper, 'deleteDocument').returns(delDocsObj);
        sandbox.stub(Logger.prototype, 'error');
        sandbox.stub(Logger.prototype, 'warn');
        sandbox.stub(Logger.prototype, 'info');

        await deleteRegistration(req, res);

        expect(res.statusCode).to.be.equal(400);
        expect(res.json.calledOnce).to.be.true;
        expect(res.json.firstCall.args[0]).to.have.property('error');
        expect(res.json.firstCall.args[0].error).to.have.property('message');
    });

});

describe('validateHoldersOnboardStatus()', () => {
    let req;
    let res;

    beforeEach(() => {
        req = httpMocks.createRequest();
        res = httpMocks.createResponse();
        res.json = sandbox.spy();
        req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID] = 'test-hpass-id';
        req.headers.authorization = 'some authorization';
        sandbox.stub(Logger.prototype, 'response');
        sandbox.stub(Logger.prototype, 'debug');
    });

    afterEach(() => {
        sandbox.restore();
    });

    it('should return 400 status code if not specify organization in request body', async () => {

        await validateHoldersOnboardStatus(req, res);

        expect(res.statusCode).to.be.equal(400);
        expect(res.json.calledOnce).to.be.true;
        expect(res.json.firstCall.args[0]).to.have.property('error');
        expect(res.json.firstCall.args[0].error).to.have.property('message');
    });

    it('should return 400 status code if not specify holders in request body', async () => {
        req.body = {
            organization: 'holder-upload'
        };

        await validateHoldersOnboardStatus(req, res);

        expect(res.statusCode).to.be.equal(400);
        expect(res.json.calledOnce).to.be.true;
        expect(res.json.firstCall.args[0]).to.have.property('error');
        expect(res.json.firstCall.args[0].error).to.have.property('message');
    });

    it('should return 400 status code if failed to validate holder status', async () => {
        req.body = {
            organization: 'holder-upload',
            holders: ['holder-group']
        };

        sandbox.stub(entityHelper, 'getRegEntity').returns(false);

        await validateHoldersOnboardStatus(req, res);

        expect(res.statusCode).to.be.equal(400);
        expect(res.json.calledOnce).to.be.true;
        expect(res.json.firstCall.args[0]).to.have.property('error');
        expect(res.json.firstCall.args[0].error).to.have.property('message');
    });

    it('should return 400 status code if no entity helper found', async () => {
        req.body = {
            organization: 'holder-upload',
            holders: ['holder-group']
        };

        sandbox.stub(entityHelper, 'getRegEntity').returns({ entityType: true });
        sandbox.stub(entityHelper, 'existRegEntityHelpers').returns(false);

        await validateHoldersOnboardStatus(req, res);

        expect(res.statusCode).to.be.equal(400);
        expect(res.json.calledOnce).to.be.true;
        expect(res.json.firstCall.args[0]).to.have.property('error');
        expect(res.json.firstCall.args[0].error).to.have.property('message');
    });

    it('should return 400 status code if invalid holderId', async () => {
        req.body = {
            organization: 'holder-upload',
            holders: ['holder-group']
        };

        sandbox.stub(entityHelper, 'getRegEntity').returns({ entityType: 'holder-upload' });
        sandbox.stub(entityHelper, 'existRegEntityHelpers').returns(false);

        await validateHoldersOnboardStatus(req, res);

        expect(res.statusCode).to.be.equal(400);
        expect(res.json.calledOnce).to.be.true;
        expect(res.json.firstCall.args[0]).to.have.property('error');
        expect(res.json.firstCall.args[0].error).to.have.property('message');
    });

    it('should return 400 status code if failed to validate holderId', async () => {
        req.body = {
            organization: 'holder-upload',
            holders: ['holder-group']
        };

        sandbox.stub(entityHelper, 'getRegEntity').returns({ entityType: 'holder-upload' });
        sandbox.stub(entityHelper, 'existRegEntityHelpers').returns(true);

        await validateHoldersOnboardStatus(req, res);

        expect(res.statusCode).to.be.equal(400);
        expect(res.json.calledOnce).to.be.true;
        expect(res.json.firstCall.args[0]).to.have.property('error');
        expect(res.json.firstCall.args[0].error).to.have.property('message');
    });

});