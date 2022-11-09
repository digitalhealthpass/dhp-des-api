/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 */

/* eslint-disable max-len */
/* eslint-disable max-lines-per-function */

const { assert } = require('chai');

const {
    CredentialVerifierBuilder,
    VerificationResult,
} = require('dhp-verify-nodejs-lib');
const IbmSelfAttestedCredentialVerifier = require('../../verifier-plugins/ibm-self-attested-verifier');

describe.skip('verify IBM self attested credentials', () => {
    const healthpassHost = 'http://localhost:3000';

    let credential;

    const data = {
        collectionMethod: 'Data subject initiated via Digital Wallet',
        consentReceiptID: '28be5d77-2d47-4f9f-9bec-3442706c7d0d',
        consentTimestamp: 1616423696.7870278,
        jurisdiction: 'US',
        language: 'en',
        piiControllers: [
            {
                address: {
                    city: 'Bethesda',
                    country: 'United States',
                    line: '9000 Rockville Pike',
                    postalCode: '20892',
                    state: 'MD',
                },
                contact: 'John Smith, National Institutes of Health (NIH), Chief Data Privacy Officer',
                email: 'support@nih.gov',
                onbehalf: true,
                phone: '+13014964000',
                piiController: 'National Institutes of Health (NIH)',
                piiControllerUrl: 'https://www.nih.gov',
            },
        ],
        piiPrincipalId:
            'MIIBCgKCAQEAy0y8V1298yJA9NzNb/BeOShlb2zPIx9HW2wnnKfSFtUPEqeTM/Dmi41M2XLGGbXOoisoRCTc4up+kAY1K6fxReiGwOGX6Fz7m/sVnfs/CaBciSy2g8uky90V+4aUbwqDdsV8G2iuqHjOMYpVAjFxAmjP9dGtSU4SAaEECRSKZTHFjwDS8f3OxQV0+mPcaPSlVTeTAXsdtBlRItXaN6b4Rj3VvHLBwodxqmQxtEmUIzjdDq4zZEhYvMX4RUa4R6XZ9F0+kY/f+QS/C85CM+Pek8BS9m4yPGrQForyBIlShWBXDhBZIm4yu2k4qUQORgcvts/eA8hpCPKlgT2KgDnERQIDAQAB',
        policyUrl: 'https://www.nih.gov/privacypolicy',
        proof: {
            creator: "mockCreator",
            created: '2021-03-22T10:34:56.788-0400',
            type: 'CKM_SHA256_RSA_PKCS_PSS',
            signatureValue: 'CCN4s9REUXl96+0x61cm2L7lJglwkWbeIBu0wkJG4JxwLP/49/ajrL6f65L7ltmdfjqON2pbG5ActIbFKHe15+2gvouAbrQaxRz6tSd7aT3Jy6dPW7A2fu1pOfjNd0r0KKtLyiSJx+PSst0BP8AfP7BShJhq5PjOxSqzc8cHrmPuWBKiixNzYcA5lCuJsI4ILpi8Z3BUOCaA8/who4fybm2Wmp01UT+NdfZKX5eUa0iYijljBz5QBeSr0u7XbbSJlJONKhztRYmNZMXtn+YZPdKkuhOGvSlvLf/Y5mFIpQVkQUG7lMPyPUWaMX62SGdZB9zA5pB6QVwtEw91ru/cOw=='
        },
        sensitive: false,
        services: [
            {
                purposes: [
                    {
                        consentType: 'EXPLICIT',
                        piiCategory: ['Personal Data'],
                        purpose:
                            'NIH performs medical and behavioral research for the United States of America, and will use this data as part of that function.',
                        purposeCategory: 'Medical Research',
                        termination: 'Owner-mediated via Digital Wallet',
                        thirdPartyDisclosure: false,
                    },
                ],
                service: 'NIH Research',
            },
        ],
        spiCat: [''],
        version: 'ISO/IEC 29184:2020',
    };

    const verifierCredential = {
        "@context": [
            "https://www.w3.org/2018/credentials/v1"
        ],
        "id": "did:hpass:59cd606341eb4a4a6c1a25d94a5f842ecf83ccd441dbda8abcd9274c9acd9334:67cba75b1719b5efba1addd32602f827fd378f2654288b1a4e381f8dddf40af3#vc-44b15006-6dc0-4e44-99da-94cf4db58829",
        "type": [
            "VerifiableCredential"
        ],
        "issuer": "did:hpass:59cd606341eb4a4a6c1a25d94a5f842ecf83ccd441dbda8abcd9274c9acd9334:67cba75b1719b5efba1addd32602f827fd378f2654288b1a4e381f8dddf40af3",
        "issuanceDate": "2021-09-16T19:15:34Z",
        "expirationDate": "2032-12-17T00:00:00Z",
        "credentialSchema": {
            "id": "did:hpass:59cd606341eb4a4a6c1a25d94a5f842ecf83ccd441dbda8abcd9274c9acd9334:67cba75b1719b5efba1addd32602f827fd378f2654288b1a4e381f8dddf40af3;id=verifierlogin;version=0.3",
            "type": "JsonSchemaValidator2018"
        },
        "credentialSubject": {
            "customer": "Beta",
            "configId": "3e9b52cb-3177-4957-ab82-0384090637f6:latest",
            "customerId": "fa073d08-cb1b-4c0a-bfa4-5ff50a5286b1",
            "name": "Entry Scan",
            "organization": "Boston Corp",
            "organizationId": "2865c194-bf26-477d-a5c7-2cfc18fb3e83",
            "type": "VerifierCredential",
            "verifierType": "Nature Management"
        },
        "proof": {
            "created": "2021-09-16T19:15:34Z",
            "creator": "did:hpass:59cd606341eb4a4a6c1a25d94a5f842ecf83ccd441dbda8abcd9274c9acd9334:67cba75b1719b5efba1addd32602f827fd378f2654288b1a4e381f8dddf40af3#key-1",
            "nonce": "53c7e861-8517-4115-ba8f-32fd7ae06b39",
            "signatureValue": "MEUCIQDgjLXhxhD9OFQN3VjxF3pODQf4OG-XkGKYys7szk3NCwIgXR8_8h5HUxCbyUWOHemtoaKBUYpayqra2OnoCcqwGbE",
            "type": "EcdsaSecp256r1Signature2019"
        }
    };

    const PKCS1 = 'pkcs1';
    const SPKI = 'spki';

    const spkiPublicKey = 
    `MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEArTcOhtkGpgPQb3WoOFKv
    b718ZUj7jdMy50Kvx32SYEsTWhDd7jbzTjv5OB3RcGei7AEtg/jRb+KTqr9eQfe6
    iKG3Jab2rTygT8DdQFSLP4fw8FVO7cldMgZbMqbyLwOVtlQ4yaI6tWOdsRDy2yR1
    ++RgWOcu2FTk5EKL13SRbuvOOQrRsz3eJW/m0+18DNma0dzUNXfEjYO+mwcAPdPU
    IU5Svsg79A8vTwq06bW0jnnjXC1+C3uBesWCuHalTSBIwy35zXqsx8ccAcY3zlZW
    yt7htAzq8ABHb0dSjb9xGKrHCGWmmZrYDW5GAe3pbUBB3aW9nbO+eJ0rY3A2Ytep
    TwIDAQAB`;
    
    const pkcs1PublicKey =
    `MIIBCgKCAQEAyeirmsSAEe+X+bNHPkxf3Iql/cNW7ulNz5LsCml+u2rKZ4Rrzw5C
    gyXAMJdq1nUPVs1ymBDrI4OyP6uOvmR4X3hoSWcdUS70V6TjYSBYvegvk6rOic2b
    b2HmGxDxi1eZGmSAbOf5vtYNJRnLATLX9Ras67/IFntvT2EgnUZF/Cc7+C/LNf0Z
    K57X2QB5DeIcgtMWqLDs/6PBRRBxTYaRnkTeuneQ48rubIVqC2iF9ZwTLW3V0yhO
    ljlfZgnySHLPgw92pBrg79df0Hp3lXQNWhlyfFk9GUo/3ooWmKX3Uc4QPeFf4Xxg
    5EGvAm17ln/0VUeGd2zgeO85T22M0fQ/7wIDAQAB`;

    const verifierBuilder = new CredentialVerifierBuilder()
        .setAdditionalPlugins(IbmSelfAttestedCredentialVerifier)
        .setHealthpassHostUrl(healthpassHost)
        .setVerifierCredential(verifierCredential);

    verifierBuilder.init();

    beforeEach(() => {
        credential = JSON.parse(JSON.stringify(data));
    });

    it('with valid credential', async () => {
        // setupTokenNock();
        // setupHealthpassNock();
        // setupRulesNock();
        const result = await verifierBuilder
            .setCredential(credential)
            .setExtras({
                publicKey: spkiPublicKey,
                publicKeyType : SPKI
            })
            .build()
            .verify();

        assert.equal(
            JSON.stringify(result),
            JSON.stringify(new VerificationResult(
                true, `Certificate's signature passed verification`)
            )
        );
    });
    it('with valid credential and pkcs1 public key', async () => {         
        // setupTokenNock();
        // setupHealthpassNock();
        // setupRulesNock();

        const iosSig =
            'k/SfK2jGXM/Pu2vbjH5GZHLz7AJaoTX3YFBTjKTNcz9Cslv//6pNRRVNP6TX5kirhWXNUeqxYjtIMKDXLv7KJFzdsKnUNR9NcC7saa3FpKYCOK41611BgvfdZEMSoKqDRbk82DoE/weLVT0+CUz7s2L7s2OFWhwW0Tl98W2yBrP7BxqFeIXG/cwlAibI28w9FyrxrB8jTL5C1MzAZhzdmCRkR9+0+fQ15FMiGiI7xNoOUVDXBIdbOBkoO6njQ6eYnfxru03keoklz4jZ5DiviWONM/tljqQvkJvVDtdoLw5avkjI0exmOREIP0byTXmHjhwjHREVUDqg7ejCATY53Q==';

        credential.proof.signatureValue = iosSig;

        const result = await verifierBuilder
            .setCredential(credential)
            .setExtras({
                publicKey: pkcs1PublicKey,
                publicKeyType : PKCS1
            })
            .build()
            .verify();

        assert.equal(
            JSON.stringify(result),
            JSON.stringify(new VerificationResult(
                true, `Certificate's signature passed verification`)
            )
        );
    });
    it('without proof', async () => {
        delete credential.proof;

        const result = await verifierBuilder
            .setCredential(credential)
            .setExtras({
                publicKey: spkiPublicKey,
                publicKeyType : SPKI
            })
            .build()
            .verify();

        assert.equal(JSON.stringify(result), JSON.stringify(
            new VerificationResult(false, 'Unknown Credential Type', 'UNKNOWN')
        ));
    });
    it('without signatureValue', async () => {
        delete credential.proof.signatureValue;

        const result = await verifierBuilder
            .setCredential(credential)
            .setExtras({
                publicKey: spkiPublicKey,
                publicKeyType : SPKI
            })
            .build()
            .verify();

        assert.equal(
            JSON.stringify(result),
            JSON.stringify(new VerificationResult(false, 'Signature is undefined'))
        );
    });
    it('with invalid signature', async () => {
        credential.proof.signatureValue = 'invalid';

        const result = await verifierBuilder
            .setCredential(credential)
            .setExtras({
                publicKey: spkiPublicKey,
                publicKeyType : SPKI
            })
            .build()
            .verify();

        assert.equal(
            JSON.stringify(result),
            JSON.stringify(new VerificationResult(false, `Certificate's signature is not valid`))
        );
    });
    it('with unknown key type', async () => {
        const unknownKeyType = 'unknown';

        const result = await verifierBuilder
            .setCredential(credential)
            .setExtras({
                publicKey: spkiPublicKey,
                publicKeyType : unknownKeyType
            })
            .build()
            .verify();

        assert.equal(
            JSON.stringify(result),
            JSON.stringify(
                new VerificationResult(
                    false,
                    `Unknown public key type.  Expected pkcs1 or spki`
                )
            )
        );
    });
    it('with wrong key type', async () => {
        const wrongKeyType = 'pkcs1';

        const result = await verifierBuilder
            .setCredential(credential)
            .setExtras({
                publicKey: spkiPublicKey,
                publicKeyType : wrongKeyType
            })
            .build()
            .verify();

        assert.equal(
            JSON.stringify(result),
            JSON.stringify(
                new VerificationResult(
                    false,
                    `Certificate's signature is not valid. error:0D0680A8:asn1 encoding routines:asn1_check_tlen:wrong tag`
                )
            )
        );
    });
});
