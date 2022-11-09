/* eslint-disable class-methods-use-this */
/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 */

const {
    VerifierPlugin,
    RSAUtils,
    VerificationResult
} = require('dhp-verify-nodejs-lib');

const PKCS1 = 'pkcs1';
const SPKI = 'spki';

const CRED_TYPE = {
    CONSENT_RECEIPT: 'CONSENT_RECEIPT',
    CONSENT_REVOKE: 'CONSENT_REVOKE',
    COS_ACCESS: 'COS_ACCESS',
}


class IbmSelfAttestedCredentialVerifier extends VerifierPlugin {
    constructor() {
        super();
        this.rsaUtils = new RSAUtils();
    }

    async decode(params) {
        const publicKey = params.getExtras()
            ? params.getExtras().publicKey : undefined;
        const publicKeyType = params.getExtras()
            ? params.getExtras().publicKeyType : undefined;
        const credential = params.getCredential();

        if (!this.checkRequiredParams(publicKey, publicKeyType)) {
            return new VerificationResult(false, null);
        }

        const getCredTypeResponse = this.getCredType(credential)
        if (!getCredTypeResponse.success) {
            return getCredTypeResponse;
        }

        const credType = getCredTypeResponse.message;

        return new VerificationResult(true, 'Credential Decoded', credType, credential);
    }

    async verify(cred, params) {
        let credential = JSON.parse(JSON.stringify(cred))
        const publicKey = params.getExtras()
            ? params.getExtras().publicKey : undefined;
        const publicKeyType = params.getExtras()
            ? params.getExtras().publicKeyType : undefined;

        if (!this.checkRequiredParams(publicKey, publicKeyType)) {
            return new VerificationResult(false, null);
        }

        const getCredTypeResponse = this.getCredType(credential)
        if (!getCredTypeResponse.success) {
            return getCredTypeResponse;
        }

        const credType = getCredTypeResponse.message;

        if (credType === CRED_TYPE.COS_ACCESS) {
            credential = credential.cosAccess;
        }

        const verificationResult = this.checkSignatureExists(credential);
        if (!verificationResult.success) {
            verificationResult.CREDTYPE = credType;
            return verificationResult;
        }

        const { signatureValue } = credential.proof;

        // need to delete before verifying
        delete credential.proof.signatureValue;

        const formattedKeyResult = this.formatKey(publicKey, publicKeyType);
        if (!formattedKeyResult.success) {
            formattedKeyResult.CREDTYPE = credType;
            return formattedKeyResult;
        }

        const verifySignatureResult = this.rsaUtils.verifySignature(
            credential, signatureValue, formattedKeyResult.message
        );

        credential.proof.signatureValue = signatureValue;
        verifySignatureResult.credType = credType;
        verifySignatureResult.credential = credential;
        return verifySignatureResult;
    }

    getName() {
        return 'ibm-self-attested-verifier';
    }

    getCredType(credential) {
        if (this.checkIsConsentReceipt(credential)) {
            return new VerificationResult(true, CRED_TYPE.CONSENT_RECEIPT);
        }
        if (this.checkIsConsentRevoke(credential)) {
            return new VerificationResult(true, CRED_TYPE.CONSENT_REVOKE);
        }
        if (this.checkIsCosAccess(credential)) {
            return new VerificationResult(true, CRED_TYPE.COS_ACCESS);
        }
        return new VerificationResult(false, null);
    }

    checkIsConsentReceipt(cred) {
        return typeof cred === 'object' && cred.proof && cred.consentId;
    }

    checkIsConsentRevoke(cred) {
        return typeof cred === 'object' && cred.proof && cred.consentRevokeId;
    }

    checkIsCosAccess(cred) {
        return typeof cred === 'object' && cred.cosAccess && cred.cosAccess.proof;
    }
    
    checkRequiredParams(publicKey, publicKeyType) {
        return (publicKey && publicKeyType);
    }

    checkSignatureExists(credential) {
        if (!credential.proof.signatureValue || !credential.proof.signatureValue.length) {
            return new VerificationResult(false, 'Signature is undefined');
        }
        return new VerificationResult(true, 'Signature exists');
    }

    formatKey(key, keyType) {
        const cleaned = key.replace(/(\r\n|\n|\r)/gm, '');
        const chunked = cleaned.trim().match(new RegExp('.{1,64}', 'g'));
        return this.addKeyHeaderAndFooter(chunked.join('\n'), keyType);
    }

    addKeyHeaderAndFooter(key, keyType) {
        let formattedKey;

        if (key.includes('PUBLIC KEY')) {
            formattedKey = key;
        }
        if (keyType === PKCS1) {
            formattedKey = `-----BEGIN RSA PUBLIC KEY-----\n${key}\n-----END RSA PUBLIC KEY-----`;
        }
        if (keyType === SPKI) {
            formattedKey = `-----BEGIN PUBLIC KEY-----\n${key}\n-----END PUBLIC KEY-----`;
        }
        if (formattedKey) {
            return new VerificationResult(true, formattedKey);
        }
        return new VerificationResult(false, 'Unknown public key type.  Expected pkcs1 or spki');
    }
}

module.exports = IbmSelfAttestedCredentialVerifier;
