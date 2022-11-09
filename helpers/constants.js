/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 */

exports.APP_ID_ROLES = {
    NIH_REPORTER: 'nih.reporter',
    HEALTHPASS_ADMIN: 'healthpass.admin',
    REGISTRATION_ADMIN: 'regadmin',
    TEST_ADMIN: 'testadmin',
    TEST_ROUTE: 'testroute',
    DATA_ADMIN: 'dataadmin',
    FILE_ADMIN: 'fileadmin', // auth strategy that encompasses regadmin and testadmin scopes,
    DES_PREFIX: 'des',
    APPLICATION: 'application'
};

exports.ERROR_CODES = {
    TIMEOUT: 'ECONNABORTED',
};

// Note: using lowercase letters here since keys correspond to actual request values
exports.CREDENTIAL_TYPES = {
    encoded: 'encoded',
    string: 'string',
    qr: 'qr',
};

// Registration code actions
exports.REGCODE_ACTIONS = {
    generate: 'generate',
    upload: 'upload',
};

exports.REQUEST_HEADERS = {
    ISSUER_ID: 'x-hpass-issuer-id',
    TRANSACTION_ID: 'x-hpass-txn-id',
    DATASUBMISSION_KEY: 'x-hpass-datasubmission-key',
    POSTBOX_TOKEN: 'x-postbox-access-token',
    SEND_SMS_OVERRIDE: 'x-hpass-send-sms',
    SEND_EMAIL_OVERRIDE: 'x-hpass-send-email',
    DISABLE_APPID_CREATE_OVERRIDE: 'x-hpass-disable-appid-create-roles',
    DISABLE_APPID_DELETE_OVERRIDE: 'x-hpass-disable-appid-delete-roles',
    DOCUMENT_ID: 'x-hpass-document-id',
    LINK_ID: 'x-hpass-link-id',
    PUBLIC_KEY_TYPE: "x-hpass-key-type",
    HPASS_SECRET: "x-hpass-secret"
};

// List of table/dbs for data submission service
exports.DB_NAMES = {
    ORG: 'datasubmission-organizations',
    REGISTER: 'register',
    PROFILE: 'profile',
    STATS: 'stats',
    BATCH: 'batch',
    BATCH_QUEUE: 'batch-queue',
    COS_INFO: 'cos-info',
    MAPPER: 'mapper',
};

exports.CRYPTO = {
    ALGORITHM: 'aes-256-cbc',
    KEY_LENGTH: 32,
    IV_LENGTH: 16,
};

exports.POSTBOX_DOC_EXPIRES_IN = 2; // In days

exports.ORGS_FIELDS = {
    MAPPER_REQUIRED: ['entity', 'mappers', 'issuerId'],
    REQUIRED: ['entity', 'profileSchema', 'userSchema', 'issuerId', 'userData']
};

exports.CLIENT_FIELDS = {
    // TODO: after universal linking is functional,
    // remove notifyTextDataIngestResultAndroid and notifyTextDataIngestResultiOS
    // add notifyTextDataIngestResult
    REQUIRED: ['organization', 'clientName', 'notifyTextDataIngestResultAndroid', 'notifyTextDataIngestResultiOS'],
};

exports.USER_REGISTRATION_FIELDS = {
    REQUIRED: ['registrationCode'],
};

exports.MAPPER_REGISTRATION_FIELDS = {
    REQUIRED: ["mapperName", "mapper", "type"],
    TYPE_REQUIRED: ["upload" , "download", "consent" , "reg", "metadata"]
};

exports.CREDENTIAL_HEADERS = [
    'id',
    'clientName',
];

exports.MFA_USER_REGISTRATION_FIELDS = ['id', 'clientName', 'givenName', 'familyName', 'location'];

exports.REG_UPLOAD = {
    REQUIRED: ['registrationCodes'],
};

exports.GENERATED_CREDENTIAL_TYPE = {
    PROFILE_CREDENTIAL: 'profile',
    USER_CREDENTIAL: 'id',
};

exports.NOTIFICATION_TYPE = {
    PHONE: 'mobile',
    EMAIL: 'email',
};

exports.NOTIFICATION_TEXT_VAR = {
    CODE_VALUE: 'CODE',
    ORG_NAME: 'ORG',
    PROFILE_CRED_ID: 'PROFILE_CRED',
};

exports.NOTIFICATION_MSG = {
    REG_CODE_TEXT: 'notifyTextRegistrationCode',
    REG_CODE_TEXT_ANDROID: 'notifyTextRegistrationCodeAndroid',
    REG_CODE_TEXT_IOS: 'notifyTextRegistrationCodeiOS',
    VERIFICATION_CODE_TEXT: 'notifyTextVerificationCode',
    DATA_INGEST_TEXT: 'notifyTextDataIngestResult',
    DATA_INGEST_TEXT_ANDROID: 'notifyTextDataIngestResultAndroid',
    DATA_INGEST_TEXT_IOS: 'notifyTextDataIngestResultiOS',
};

// TODO: consider moving these to config
exports.PROCESS_DATA_MIN_SEC = 150; // min number of seconds given to process each test result

exports.SCOPE_MAX_LENGTH = 20;
exports.ORGID_DEFAULT_MAX_LENGTH = 24;
// From Amazon S3 docs -
// Bucket names must be between 3 and 63 characters long
// 1 less for '-' character in bucket names
exports.COS_BUCKET_MAX_LENGTH = 62;

// white list consumers
exports.WHITELIST = [
    'http://localhost*',
    'https://localhost*',
    'https://*.acme.com',
    'https://*.mybluemix.net',
];

exports.FILE_MAX_SIZE = 2 * 1024 * 1024;

// doc-types used in cloudant
exports.DOC_TYPE = {
    PREREG_ITEM: 'PreRegItem',
    PREREG_BATCH_REPORT: 'PreRegBatchReport',
    TESTRESULT_ITEM: 'TestResultItem',
    TESTRESULT_BATCH_REPORT: 'TestResultBatchReport',
};

exports.DOC_EXCLUDE_LIST = ["_id","_rev","status","createdTimestamp","updatedTimestamp",
    "expirationTimestamp", "rowID", "type","batchID","registerCode","uid",
    "verificationCode"];

exports.PUBLIC_KEY_TYPE = {
    IOS: 'pkcs1',
    ANDROID: 'spki',
};

exports.CRED_TYPE = {
    ID: 'ID',
};

exports.BASE_URL = '/datasubmission';
exports.SECRET = '45ttf24ur0nmw8p3e8we';
exports.CREDENTIAL_DICTIONARY = 'credentialDictionary';
