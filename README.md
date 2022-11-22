# HealthPass Data Submission API

This repo holds the sourcecode for the HealthPass Data Submission API whihc allows credentials to be exchanged via a built-in workflow, that includes:

    - Holder registration, including managing invitations, and identity issuance

    - Consent cryptographically signed by holder, in their wallet, and transmitted to verifier

    - Secure, encrypted, personal data vault for exchanging data, with a custom URL, passcode, and encryption keys tied to the holder’s wallet connection.


## Postman Testing

The HealthPass Data Submission API can be tested using the associated [postman collection](https://github.com/WH-HealthPass/datasubmission-api/blob/open-source-dev/postman/DES-holder-upload.postman_collection.json)

Follow these steps to run the requests:
- download a copy of the above-linked JSON file
- import the file into Postman
- create a new Postman environment
- create a new variable `DATASUBMISSION_API` in this environment
    - set it to `localhost:3000` if running the API locally
- create a new variable `DATASUBMISSION_KEY_HEADER` in this environment and set it to `x-hpass-datasubmission-key`
- run the defined requests using Postman

**Note:** the `login` request defined in the Postman collection must be run before making any other request in order to set the correct `HP_API_AUTH_TOKEN`

## Environment Variables

Create a `.env` file in the project root with the following required variables
Details for each of these variables are provided in their relevant sections

```
USE_HTTPS
TLS_FOLDER_PATH   // if set, overrides the default directory that holds the server.cert and server.key files
AUTH_STRATEGY
APP_ID_AUTH_SERVER_HOST
APP_ID_URL        // must be in the form of https://<APP_ID_HOST>/oauth/v4/<TENANT_ID>
APP_ID_TENANT_ID
APP_ID_CLIENT_ID
APP_ID_SECRET
CLOUDANT_URL
CLOUDANT_IAM_KEY

// Upload usecase
COS_API_KEY
COS_SERVICE_INSTANCE_ID
COS_BUCKET_SUFFIX

// MFA registration usecase
// SMS based notify using Amazon AWS SNS
SENDER_EMAIL_ID
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_REGION

// DEFAULT VERIFUCATION

VERIFIER_CONFIG_ID=b5e8a4a3-2278-4812-93cf-a2c27ec13f9b:latest

```

## TLS
To enable HTTPS with tls1.2, enable USE_HTTPS and set TLS_FOLDER_PATH to relative or abs path
to folder containing server.key & server.cert files. Without this setting, server starts up in http mode.

For e.g. set following env vars
```
USE_HTTPS=true
TLS_FOLDER_PATH=./config/tls
```

## User Registration
### Notifications workflow
SMS based notification, uses Amazon AWS SNS. FromPhone is configured in the AWS account > Pinpoint.
License credentials is set via following
```
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_REGION
```

## Authentication

HealthPass Data Submission uses two different authentication mechanisms
Which mechanism to use must be specified using the `AUTH_STRATEGY` environment variable

### Dev + JWT

If `AUTH_STRATEGY` is set to `DEVELOPMENT`, HealthPass Data Submission uses JSON Web Tokens or [JWT](https://jwt.io/) to authorize
requests
Since this mechanism should mainly be used for development and/or testing, any _valid_ values will be accepted in the login request
No predefined user credentials exist, so the request simply needs to contain a valid email and a non-empty password

```
{
    "email" : "foo@test.example",
    "password": "bar"
}
```

The jwt is signed with the following user object, the extra values being added to mirror AppID behavior:

```
{
    'email': req.body.email,
    'given_name': 'Tester',
    'family_name': 'POC',
    'name': 'Tester POC',
    'organization': 'HealthPassOrg',
    'subject': '1d44cdc1-4b78-4ef7-a5a2-08aabc13619f',
    'tenant': '14dbfeaa-d6bf-4c10-974c-2c45df4666df',
}
```

### Prod + AppID

If `AUTH_STRATEGY` is set to anything other than `DEVELOPMENT`, HealthPass Data Submission uses [AppID](https://www.ibm.com/cloud/app-id)
for user authentication and authorization
User credentials (email + password as above) must be registered to the relevant AppID instance _before_ making a login request
Additionally, the following environment variables need to be set with the appropriate values for the AppID instance

```
APP_ID_URL
APP_ID_AUTH_SERVER_HOST
APP_ID_TENANT_ID
APP_ID_CLIENT_ID
APP_ID_SECRET
```

### Login

The following request can be used to login to HealthPass Data Submission:
(the request is the same for dev and prod, only the underlying auth mechanism is different)

```
curl -X POST \
     -H "Content-Type: application/json" \
     -d '{ "email" : "tester@poc.com", "password": "CHANGETHEPASSWORD" }' \
     'http://localhost:3000/users/login'
```

On successful authentication, the following response is returned:

```
{
    "message": "Authorization successful",
    "token": $token
}
```

`$token` should then be included in the headers to any subsequent API call to HealthPass Data Submission:

```
curl -H "Authorization: Bearer $token" ...
```

## Library Licenses

This section lists open source libraries used in this SDK. 

**Table 3: Libraries and sources for this API** 

|name                 |license type|link                                                                |
|---------------------|------------|--------------------------------------------------------------------|
|@cloudant/cloudant   |Apache-2.0  |https://github.com/cloudant/nodejs-cloudant.git               |
|axios                |MIT         |https://github.com/axios/axios.git                              |
|bcryptjs             |MIT         |https://github.com/dcodeIO/bcrypt.js.git                        |
|body-parser          |MIT         |https://github.com/expressjs/body-parser.git                    |
|bottleneck           |MIT         |https://github.com/SGrondin/bottleneck.git                      |
|cluster-shared-memory|MIT         |https://github.com/FinalZJY/cluster-shared-memory.git           |
|cors                 |MIT         |https://github.com/expressjs/cors.git                           |
|crypto               |ISC         |https://github.com/npm/deprecate-holder.git                     |
|csvtojson            |MIT         |https://github.com/Keyang/node-csvtojson.git                    |
|dotenv               |BSD-2-Clause|https://github.com/motdotla/dotenv.git                                |
|express              |MIT         |https://github.com/expressjs/express.git                        |
|express-fileupload   |MIT         |https://github.com/richardgirges/express-fileupload.git         |
|express-validator    |MIT         |https://github.com/express-validator/express-validator.git            |
|fast-json-patch      |MIT         |https://github.com/Starcounter-Jack/JSON-Patch.git                    |
|helmet               |MIT         |https://github.com/helmetjs/helmet.git                                |
|ibm-cos-sdk          |Apache-2.0  |https://github.com/IBM/ibm-cos-sdk-js.git                       |
|ibmcloud-appid       |Apache-2.0  |https://github.com/ibm-cloud-security/appid-serversdk-nodejs.git|
|isbinaryfile         |MIT         |https://github.com/gjtorikian/isBinaryFile.git                  |
|jslt                 |ISC         |https://github.com/capriza/jslt.git                             |
|json-normalize       |ISC         |https://github.com/JasonPollman/JSONNormalize.git               |
|jsonpath             |MIT         |https://github.com/dchester/jsonpath.git                        |
|jsonschema           |MIT         |https://github.com/tdegrunt/jsonschema.git                            |
|jsonwebtoken         |MIT         |https://github.com/auth0/node-jsonwebtoken.git                  |
|license-report       |MIT         |https://github.com/ironSource/license-report.git                |
|log4js               |Apache-2.0  |https://github.com/log4js-node/log4js-node.git                  |
|moment               |MIT         |https://github.com/moment/moment.git                            |
|morgan               |MIT         |https://github.com/expressjs/morgan.git                         |
|newrelic             |Apache-2.0  |https://github.com/newrelic/node-newrelic.git                   |
|node-cron            |ISC         |https://github.com/merencia/node-cron.git                       |
|passport             |MIT         |https://github.com/jaredhanson/passport.git                           |
|phone                |MIT         |https://github.com/aftership/phone.git                          |
|querystring          |MIT         |https://github.com/Gozala/querystring.git                             |
|request-ip           |MIT         |https://github.com/pbojinov/request-ip.git                      |
|retry-axios          |Apache-2.0  |https://github.com/JustinBeckwith/retry-axios.git               |
|stjs                 |MIT         |https://github.com/SelectTransform/st.js.git                    |
|swagger-ui-express   |MIT         |https://github.com/scottie1984/swagger-ui-express.git         |
|uuid                 |MIT         |https://github.com/uuidjs/uuid.git                              |
