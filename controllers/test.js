/* eslint-disable complexity */
/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
* 
*/

const uuid = require('uuid');
const moment = require('moment');

const crypto = require('crypto');
const constants = require('../helpers/constants');
const profileHelper = require('../helpers/profile-helper');
const testHelper = require('../helpers/test-helper');
const onboardingHelper = require('../helpers/onboarding-helper');
const registerCodeHelper = require('../helpers/register-code-helper');
const mfaHelper = require('../helpers/mfa-helper');
const entityHelper = require('../entities');
const { logAndSendErrorResponse, validateReqBody } = require('../utils/index');
const Logger = require('../config/logger');

const logger = new Logger('test-controller');

exports.generateKeyPair = async (req, res) => {

    const txID = req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID];
    logger.info('Entering POST /key/generate controller', txID);
    try {
        const keys = testHelper.testGenerateKeyPair(txID);
        const symKey = crypto.randomBytes(constants.CRYPTO.KEY_LENGTH);
        const ivValue = crypto.randomBytes(constants.CRYPTO.IV_LENGTH);
        const symKeyEncoded = symKey.toString('base64');
        const ivValueEncoded = ivValue.toString('base64');

        return res.status(200).json({
            ...keys,
            symKeyEncoded,
            ivValueEncoded
        });
    } catch (err) {
        return logAndSendErrorResponse(txID, res, err, 'generateKeyPair');
    }
}

// testSubmitData
// 1. generates a registration code
// 2. onboards a test holder
// 3. encrypts uploads the provided credential to the test holder's postbox
// 4. calls submitEntityData with resulting holderID and postbox documentId
// 5. offboards test holder
// returns: registrationCode, holderID, postboxDocumentID, cosFileName
// eslint-disable-next-line complexity
exports.testSubmitData = async (req, res) => {
    const token = req.headers.authorization;
    const txID = req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID];
    logger.info('Entering POST /test/data/submit controller', txID);

    // Make sure entity is defined in input
    if (!req.body || !req.body.organization || req.body.organization.length === 0) {
        return res.status(400).json({
            error: {
                message: 'Missing organization',
            },
        });
    }
    const regEntity = req.body.organization;

    if (!req.body.credential) {
        return res.status(400).json({
            error: {
                message: 'Missing credential',
            },
        });
    }
    const testCredential = req.body.credential;

    try {
        // Make sure entity has entry in organization DB
        const regEntityData = await entityHelper.getRegEntity(txID, regEntity);
        if (!regEntityData) {
            return res.status(400).json({
                error: {
                    message: `Invalid organization ${regEntity}, no configuration found`,
                },
            });
        }
        const entityHelperName = regEntityData.entityType || regEntity;
        const existEntityHelpers = await entityHelper.existRegEntityHelpers(txID, entityHelperName);
        if (!existEntityHelpers) {
            return res.status(400).json({
                error: {
                    message: `Invalid organization ${regEntity}, no entity helpers found`,
                },
            });
        }

        // eslint-disable-next-line global-require, import/no-dynamic-require
        const entityIDHelper = require(`../entities/${entityHelperName}/id-helper`);

        // generate registration code for test holder
        const registrationCode = uuid.v4();
        await registerCodeHelper.updateRegistrationCodes(txID, req, regEntity, [registrationCode]);

        // onboard test holder
        const onboardRes = await testHelper.onboardHolderTest(
            txID,
            regEntity,
            regEntityData,
            req,
            registrationCode,
            entityIDHelper.holderIDField
        );
        if (onboardRes.status !== 200) {
            return res.status(onboardRes.status).json({
                error: {
                    message: `Failed to onboard test holder: ${onboardRes.message}`
                }
            });
        }
        const [profileCredential, idCredential] = onboardRes.payload;
        // eslint-disable-next-line global-require, import/no-dynamic-require
        const entityProfileHelper = require(`../entities/${entityHelperName}/profile-helper`);
        const holderID = entityProfileHelper.getHolderIDFromProfileCredential(profileCredential);
        req.body.link = entityProfileHelper.getLinkIdFromProfileCredential(profileCredential);

        // get test holder's profile
        const profileDocRes = await profileHelper.getProfileDoc(txID, req, regEntity, holderID);
        if (profileDocRes.status !== 200) {
            return res.status(profileDocRes.status).json({
                error: {
                    message: `Failed to get profile data for test holder ${holderID}: ${profileDocRes.message}`,
                },
            });
        }
        const profileData = profileDocRes.data;

        // upload test credential to test holder's postbox
        const documentId = await testHelper.uploadCredToPostboxTest(
            txID,
            token,
            holderID,
            regEntityData,
            idCredential,
            profileData,
            testCredential
        );
        // putting a sleep during before submit.
        await new Promise(resolve => setTimeout(resolve, 1000));
        // submit data in test holder's postbox
        // eslint-disable-next-line global-require, import/no-dynamic-require
        const entityDataHelper = require(`../entities/${entityHelperName}/data-helper`);
        req.body.documentId = documentId;

        // TODO move validateSelfAttestedSignature to request
        const submitDataRes = await entityDataHelper.submitEntityData(txID, req, token, regEntityData, req.body, true);

        // offboard test holder
        await onboardingHelper.deleteRegistration(txID, req, token, regEntityData, profileData, holderID);

        const successMsg = `Successfully submitted test data for organization ${regEntity}`;
        logger.response(200, successMsg, txID);
        return res.status(200).json({
            message: successMsg,
            registrationCode,
            holderID,
            postboxDocumentID: documentId,
            cosFileName: submitDataRes.fileName
        });
    } catch (err) {
        return logAndSendErrorResponse(txID, res, err, 'testSubmitData');
    }
};

exports.testRegisterAppIDUsers = async (req, res) => {
    const txID = req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID];
    logger.info('Entering POST /test/appid/users controller', txID);

    if (!req.body || !req.body.organization || req.body.organization.length === 0) {
        return res.status(400).json({
            error: {
                message: 'Missing organization',
            },
        });
    }
    if (!req.body.regAdminPassword) {
        return res.status(400).json({
            error: {
                message: 'Missing regAdminPassword',
            },
        });
    }
    if (!req.body.testAdminPassword) {
        return res.status(400).json({
            error: {
                message: 'Missing testAdminPassword',
            },
        });
    }

    if (!req.body.dataAdminPassword) {
        return res.status(400).json({
            error: {
                message: 'Missing dataAdminPassword',
            },
        });
    }
    const { organization, regAdminPassword, testAdminPassword, dataAdminPassword } = req.body;

    try {
        const regAdminGUID = await testHelper.registerRegAdminAppIDUser(txID, organization, regAdminPassword);
        const testAdminGUID = await testHelper.registerTestAdminAppIDUser(txID, organization, testAdminPassword);
        const dataAdminGUID = await testHelper.registerDataAdminAppIDUser(txID, organization, dataAdminPassword);

        const successMsg = `Successfully registered AppID users for organization ${organization}`;
        logger.response(201, successMsg, txID);
        return res.status(201).json({
            message: successMsg,
            regAdminGUID,
            testAdminGUID,
            dataAdminGUID
        });
    } catch (err) {
        return logAndSendErrorResponse(txID, res, err, 'testRegisterAppIDUsers');
    }
};
exports.testRegisterAppIDUser = async (req, res) => {
    const txID = req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID];
    const secret = req.headers[constants.REQUEST_HEADERS.HPASS_SECRET] || '';
    logger.info('Entering POST /test/appid/user controller', txID);
    const buff = Buffer.from(secret, 'base64');

    if (buff.toString('ascii') !== constants.SECRET) {
        return res.status(400).json({
            error: {
                message: 'Unauthorized request',
            },
        });
    }
    const errMsg = validateReqBody(txID, req.body, ["email", "displayName", "roleName", "organizations"]);
    if (errMsg) {
        return res.status(400).json({
            errMsg
        });
    };
    try {
        const adminGUID = await testHelper.registerAdminAppIDUser(txID, req.body);

        const successMsg = `Successfully registered AppID users`;
        logger.response(201, successMsg, txID);
        return res.status(201).json({
            message: successMsg,
            adminGUID
        });
    } catch (err) {
        return logAndSendErrorResponse(txID, res, err, 'testRegisterAppIDUsers');
    }
};
exports.testDeleteAppIDUsers = async (req, res) => {
    const txID = req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID];
    logger.info('Entering DELETE /test/appid/users controller', txID);

    if (!req.body.regAdminGUID) {
        return res.status(400).json({
            error: {
                message: 'Missing regAdminGUID',
            },
        });
    }
    if (!req.body.testAdminGUID) {
        return res.status(400).json({
            error: {
                message: 'Missing testAdminGUID',
            },
        });
    }
    if (!req.body.dataAdminGUID) {
        return res.status(400).json({
            error: {
                message: 'Missing dataAdminGUID',
            },
        });
    }

    const { regAdminGUID, testAdminGUID, dataAdminGUID } = req.body;

    try {
        await testHelper.deleteAppIDUser(txID, regAdminGUID);
        await testHelper.deleteAppIDUser(txID, testAdminGUID);
        await testHelper.deleteAppIDUser(txID, dataAdminGUID);

        const successMsg = 'Successfully deleted AppID users';
        logger.response(200, successMsg, txID);
        return res.status(200).json({
            message: successMsg
        });
    } catch (err) {
        return logAndSendErrorResponse(txID, res, err, 'testDeleteAppIDUsers');
    }
};

exports.testValidateRegistrationCode = async (req, res) => {
    const txID = req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID];
    try {
        let entity = req.body.organization;
        if (!entity) {
            const errMsg = 'Must specify "organization" in request body';
            logger.response(400, `Failed to validate registration code: ${errMsg}`, txID);
            return res.status(400).json({ error: { message: errMsg } });
        }

        entity = entity.toLowerCase();
        const regCode = req.params.code;

        const validateRes = await mfaHelper.validateRegCode(txID, req, entity, regCode);
        if (validateRes.status !== 200) {
            logger.response(
                validateRes.status,
                `Failed to validate registration code for organization ${entity}: ${validateRes.message}`,
                txID
            );
            return res.status(validateRes.status).json({
                error: {
                    message: validateRes.message
                }
            });
        }

        // return verification code in healthpass admin-protected test route
        logger.response(200, validateRes.message, txID);
        return res.status(200).json({
            message: validateRes.message,
            verificationCode: validateRes.verificationCode
        });
    } catch (err) {
        return logAndSendErrorResponse(txID, res, err, 'validateRegistrationCode');
    }
};

const makeProof = (holderID) => {
    return {
        created: moment().toISOString(),
        creator: holderID,
        type: 'CKM_SHA256_RSA_PKCS_PSS'
    }
}

const signCredential = (cred, privateKey, padding) => {
    return crypto.sign('sha256', Buffer.from(cred), {
        key: Buffer.from(privateKey),
        padding,
    });
};

exports.testSignSelfAttestedCredential = (req, res) => {
    const txID = req.headers[constants.REQUEST_HEADERS.TRANSACTION_ID];
    logger.info('Entering POST /test/credentials/sign controller', txID);

    if (!req.body.credential) {
        return res.status(400).json({
            error: {
                message: 'Missing credential',
            },
        });
    }

    if (!req.body.privateKey) {
        return res.status(400).json({
            error: {
                message: 'Missing private key',
            },
        });
    }

    if (!req.body.holderID) {
        return res.status(400).json({
            error: {
                message: 'Missing holder id',
            },
        });
    }

    const { credential, privateKey, holderID } = req.body;

    const signedCredential = credential;
    signedCredential.proof = makeProof(holderID);
    const signature = signCredential(
        JSON.stringify(signedCredential),
        Buffer.from(privateKey, "base64").toString(),
        crypto.constants.RSA_PKCS1_PSS_PADDING
    );
    signedCredential.proof.signatureValue = Buffer.from(signature).toString('base64');

    const successMsg = `Successfully signed self-attested credential`;
    logger.response(201, successMsg, txID);
    return res.status(201).json({
        message: successMsg,
        signedCredential
    });
}
