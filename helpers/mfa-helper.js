/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
* 
*/

const registerCodeHelper = require('./register-code-helper');
const Logger = require('../config/logger');
const entityHelper = require('../entities');
const notificationHelper = require('./notification-helper');
const constants = require('./constants');
const config = require('../config');

const logger = new Logger('mfa-helper');

const createVerificationCodeDoc = async (
    txID,
    entity,
    registrationDocId,
    registerCode
) => {
    let status = 200;
    let message;
    let verificationCode;

    // Verification code is random up to 99,999,999 and it is unlikely
    // to not be unique but not impossible, so add a retry
    for (let i = 0; i < config.registrationCode.duplicateCodeRetry; i += 1) {
        // generate verification code
        verificationCode = Math.floor(Math.random() * (10 ** 8)); // 8-digit int
        logger.debug(`Generating new verification code: ${verificationCode}`, txID);

        // eslint-disable-next-line no-await-in-loop
        const createResp = await registerCodeHelper.createVerificationCodeDoc(
            txID, entity, verificationCode, registrationDocId, registerCode
        );

        status = createResp.status;
        message = createResp.message;

        if (createResp.status !== 409) {
            break;
        }
    }

    return {
        status,
        message,
        verificationCode
    };
}

const getRegInfo = (info) => {
    const doc = {...info};
    for (let i = 0; i < constants.DOC_EXCLUDE_LIST.length; i += 1) { 
        delete doc[constants.DOC_EXCLUDE_LIST[i]];
    }
    return doc;
}

// eslint-disable-next-line
const validateRegCode = async (txID, req, entity, regCode) => {
    const regCodeLogMsg = `registration code for organization ${entity}`;

    logger.debug(`Checking if entity ${entity} is onboarded`, txID);
    const entityData = await entityHelper.getRegEntity(txID, entity);
    if (!entityData) {
        const errMsg = `Invalid entity: ${entity}`;
        return {
            status: 400,
            message: errMsg
        };
    }

    // Get user registration from “Register” DB:
    const readRes = await registerCodeHelper.validateCodeDoc(txID, req, entity, regCode);
    if (readRes.status !== 200) {
        return {
            status: readRes.status,
            message: readRes.message
        };
    }

    if(!entityData.userRegistrationConfig.flow.mfaAuth){
        return {
            status: 200,
            message: `Successfully validated ${regCodeLogMsg}`,
            regInfo: getRegInfo(readRes.data)
        };
    }

    let notifyType = null;
    if (readRes.data.mobile && readRes.data.mobile !== "") {
        notifyType = constants.NOTIFICATION_TYPE.PHONE;
    } else {
        notifyType = constants.NOTIFICATION_TYPE.EMAIL;
    }

    const userVerificationDestination = readRes.data[notifyType];
    if (!userVerificationDestination) {
        const errMsg = `User registration data must include field: ${notifyType}`;
        return {
            status: 400,
            message: errMsg
        };
    }
    logger.debug(`Using destination data field: ${notifyType}`, txID);

    const registrationDoc = readRes.data;

    const createResp = await createVerificationCodeDoc(
        txID, entity, registrationDoc._id, registrationDoc.registerCode
    );

    if (createResp.status !== 200) {
        return {
            status: 500,
            message: createResp.message
        };
    }

    const { verificationCode } = createResp;

    // update verificationCode in registration CodeDoc
    registrationDoc.verificationCode = createResp.verificationCode;

    const updateResp = await registerCodeHelper.updateCodeDoc(txID, req, entity, registrationDoc);
    if (updateResp.status !== 200) {
        return {
            status: updateResp.status,
            message: updateResp.message
        };
    }

    if (entityData.userRegistrationConfig.flow.holderNotification == null 
        || entityData.userRegistrationConfig.flow.holderNotification) {
        // Send verification code to Holder
        const msgField = constants.NOTIFICATION_MSG.VERIFICATION_CODE_TEXT;
        if (!(msgField in entityData)) {
            const errMsg = `Unsupported config lookup for notification text: ${msgField}`;
            return {
                status: 500,
                message: errMsg
            };
        }

        const notifyTemplate = entityData[msgField];
        const textMsg = notificationHelper.getNotificationText(txID, notifyTemplate, entity, verificationCode);
        try {
            logger.info(`Sending verification code to holder's destination device`, txID);
            // / registry code
            if (notifyType === constants.NOTIFICATION_TYPE.EMAIL) {
                if (entityData.emailTemplate && entityData.emailTemplate.VerificationCode) {
                    const emailContent = {
                        "subject": entityData.emailTemplate.VerificationCode.subject,
                        "content": 
                            notificationHelper.getNotificationText(txID, 
                                entityData.emailTemplate.VerificationCode.content, 
                                entity, verificationCode)
                    }
                    await notificationHelper.sendEmailNotification(txID, 
                        req, 
                        userVerificationDestination, 
                        emailContent);
                } else {
                    const errMsg = `Email template is not defined in organization`;
                    return {
                        status: 500,
                        message: errMsg
                    };
                }
            } else {
                await notificationHelper.sendNotificationToHolder(txID, req, userVerificationDestination, textMsg);
            }
        } catch (err) {
            // error already get logged in sendNotificationToHolder func
            const errMsg = `Please try again in few minutes: ${err.message}`;
            return {
                status: 500,
                message: errMsg
            };
        }
    }

    const successMsg = `Successfully validated ${regCodeLogMsg}`;

    const regInfo = getRegInfo(registrationDoc);

    return {
        status: 200,
        message: successMsg,
        verificationCode,
        regInfo
    };
}

module.exports = {
    validateRegCode
};