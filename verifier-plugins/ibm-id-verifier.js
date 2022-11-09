/* eslint-disable class-methods-use-this */
/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 */

const JSONNormalize = require('json-normalize');

const {
    VerifierPlugin,
    ECDSAUtils,
    VerificationResult,
    getCache,
} = require('dhp-verify-nodejs-lib');

const CRED_TYPE = 'ID';
const ISSUER_ID = 'hpass.issuer1';

class IbmIdVerifier extends VerifierPlugin {
    constructor() {
        super();
        this.ecdsaUtils = new ECDSAUtils();
    }

    async decode(params) {
        const credential = this.getCredential(params);

        if (!this.checkIsIbmCredential(credential)) {
            return new VerificationResult(false, null, CRED_TYPE);
        }

        return new VerificationResult(true, 'Credential Decoded', CRED_TYPE, credential);
    }

    async verify(credential, params) {
        const signatureValidResp = await this.isSignatureValid(credential, params);
        signatureValidResp.credType = CRED_TYPE;
        signatureValidResp.credential = credential;
        return signatureValidResp;
    }

    getName() {
        return 'ibm-id-verifier';
    }

    getCredential(params) {
        let cred = params.getCredential();
        if (typeof cred === 'string') {
            try {
                cred = JSON.parse(Buffer.from(cred, 'base64').toString())
            } catch(e) {
                cred = params.getCredential();
            }
        }
        return cred;
    }

    checkIsIbmCredential(cred) {
        return typeof cred === 'object'
        && cred.credentialSubject
        && cred.credentialSubject.type
        && cred.credentialSubject.type === 'id';
    }
    
    async isSignatureValid(credential, params) {
        const signature = credential.proof.signatureValue;        
        const jwkKeyResponse = await this.getPublicKey(
            ISSUER_ID, credential.issuer, credential.proof.creator, params
        );
        if (!jwkKeyResponse.success) {
            return jwkKeyResponse;
        }

        const jwkKey = jwkKeyResponse.message;        
        const unsignedCredential = JSON.parse(JSON.stringify(credential));
        delete unsignedCredential.proof.signatureValue;
        delete unsignedCredential.obfuscation;
        const normalizedCredential = JSONNormalize.normalizeSync(unsignedCredential);

        return this.ecdsaUtils.verifySignature(normalizedCredential, signature, jwkKey);
    }

    async getPublicKey(issuerId, credIssuer, creator, params) {
        const issuerResponse = await getCache().getIbmIssuer(
            issuerId, credIssuer, params
        );
        if (!issuerResponse.success) {
            return issuerResponse;
        }
        
        const issuer = issuerResponse.message;

        let jwkKey;
        issuer.publicKey.forEach((key) => {
            if (key.id === creator) {
                jwkKey = key.publicKeyJwk;
            }
        });

        if (!jwkKey) {
            return new VerificationResult(false, "Issuer's public key was not found");
        }
        return new VerificationResult(true, jwkKey);
    }
}

module.exports = IbmIdVerifier;
