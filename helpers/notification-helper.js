/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 *
 */
const phone = require('phone');
const notificationLib = require('healthpass-notification');

const constants = require('./constants');
const config = require('../config')
const utils = require('../utils')
const Logger = require('../config/logger');

const logger = new Logger('notification-helper');

/* eslint-disable no-useless-escape */
const regexCodeValue = new RegExp(`\{${constants.NOTIFICATION_TEXT_VAR.CODE_VALUE}\}`, 'g');
const regexOrgName = new RegExp(`\{${constants.NOTIFICATION_TEXT_VAR.ORG_NAME}\}`, 'g');
const regexProfileCredID = new RegExp(`\{${constants.NOTIFICATION_TEXT_VAR.PROFILE_CRED_ID}\}`, 'g');

const configSMSEnabled = process.env.SMS_ENABLED; // applies to all SNS sms
const connectTimeout = process.env.SMS_CONNECT_TIMEOUT || 10000; // milliseconds
const timeout = process.env.SMS_TIMEOUT || 10000;
const maxRetries = process.env.SMS_MAX_RETRIES || 1;
const retryDelay = process.env.SMS_RETRY_DELAY || 15000; 


if (!configSMSEnabled) { // Refuse to start without the config set
    logger.error(`Error starting server: Environment variable SMS_ENABLED is not set`);
    // eslint-disable-next-line no-process-exit
    process.exit(1);
}

let configMailEnabled = 'true';
let mailConnectTimeout = 3000;
let mailTimeout = 3000;
let mailMaxRetries = 3;
let mailRetryDelay = 5000;
if (config.mail) {
    if (config.mail.connectTimeout)
        mailConnectTimeout = config.mail.connectTimeout;
    if (config.mail.timeout)
        mailTimeout = config.mail.timeout;
    if (config.mail.maxRetries)
        mailMaxRetries = config.mail.maxRetries;
    if (config.mail.retryDelay) {
        mailRetryDelay = config.mail.retryDelay;
    }
    if (config.mail.mailEnabled) {
        configMailEnabled = config.mail.mailEnabled;
    }
}

// eslint-disable-next-line complexity
const notificationSMSToPhone = async (
    txID,
    req,
    toPhoneNo,
    message,
) => {
    // give preference to Header flag over sms Config
    const smsFlagInHeader = utils.getSendSmsHeaderFlag(req);
    if (smsFlagInHeader === undefined && configSMSEnabled === 'false') {
        logger.info(`Using sms config value. Not sending sms notification: ${message}`, txID);
        return;
    }
    if (smsFlagInHeader === 'false') {
        logger.info(`Not sending notification per 
                ${constants.REQUEST_HEADERS.SEND_SMS_OVERRIDE} in header: ${message}`, txID);
        return;
    }
    let smsResp;

    // convert phone number to E.164 format
    const e164Format = phone(toPhoneNo);
    const formattedToPhoneNo = e164Format.length > 0 ? e164Format[0] : toPhoneNo;

    try {
        smsResp = await notificationLib.sendSMSMessage(
            formattedToPhoneNo,
            message,
            connectTimeout,
            timeout,
            maxRetries,
            retryDelay
        );
        logger.info(`sendSMS RequestId=${smsResp.ResponseMetadata.RequestId} MessageId=${smsResp.MessageId}`, txID);
    } catch (err) {
        logger.error(`Error calling SNS Api. ErrorDetails: ${err}`, txID);
        throw new Error(err);
    }

    if (smsResp.data && smsResp.data.status === 'failed') {
        const msg = `SMS message send failed. ${smsResp.data.error_message}`; // msg may be seen by user
        logger.error(`Failed to send SMS. Error: ${msg} ErrorCode: ${smsResp.data.error_code}`, txID);
        throw new Error(msg);
    }
}

const sendNotificationToHolder = async (txID, req, destinationId, msgText) => {

    // only SMS is supported for now
    logger.debug(`Attempting to send SMS notification: ${msgText}`, txID);
    await notificationSMSToPhone(
        txID,
        req,
        destinationId,
        msgText,
    );
}

const sendVerificationCodeNotification = async (txID, req, destinationId, msgText) => {

    logger.debug(`Attempting to send SMS verification code: ${msgText}`, txID);
    await notificationSMSToPhone(
        txID,
        req,
        destinationId,
        msgText,
    );
}

// populate notification template, for example: "HealthPass verification code: {CODE}"
const getNotificationText = (txID, notifyTemplate, entity, codeValue, profileCredID) => {
    let message = notifyTemplate;
    if (entity) {
        message = message.replace(regexOrgName, entity);
    }
    if (codeValue) {
        message = message.replace(regexCodeValue, codeValue);
    }
    if (profileCredID) {
        message = message.replace(regexProfileCredID, profileCredID);
    }

    if (message.includes('{') && message.includes('}')) {
        logger.warn(`Unresolved variable in notification SMS: ${message}`, txID);
    }
    return message;
}

const sendMFAHolderNotification = async (txID, req, destPhone, iosTextMsg, androidTextMsg) => {

    logger.debug(`Sending ${androidTextMsg} Android device`, txID);
    await sendNotificationToHolder(
        txID,
        req,
        destPhone,
        androidTextMsg
    );
    logger.debug(`Sending ${iosTextMsg} iOS device`, txID);
    await sendNotificationToHolder(
        txID,
        req,
        destPhone,
        iosTextMsg
    );
};

const sendEmailNotification = async (txID, req, email, message) => {

    logger.debug(`Sending email ${message.subject}`, txID);
    
    const mailFlagInHeader = utils.getSendMailHeaderFlag(req);
    if (mailFlagInHeader === undefined && configMailEnabled === 'false') {
        logger.info(`Using mail config value. Not sending mail notification: ${message}`, txID);
        return;
    }
    if (mailFlagInHeader === 'false') {
        logger.info(`Not sending mail notification per 
                ${constants.REQUEST_HEADERS.SEND_EMAIL_OVERRIDE} in header: ${message.subject}`, txID);
        return;
    }

    try {
        await notificationLib.sendEmail(email, 
            message, 
            mailConnectTimeout,
            mailTimeout, 
            mailMaxRetries, 
            mailRetryDelay);
        logger.info(`send email successfully`, txID);
    } catch (error) {
        logger.error(`Error sending email: ${error.message}`, txID);
        throw new Error(error);
    }
};

module.exports = {
    sendEmailNotification,
    sendMFAHolderNotification,
    sendVerificationCodeNotification,
    sendNotificationToHolder,
    getNotificationText,

};
