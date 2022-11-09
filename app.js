/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 */

require('newrelic');

const cluster = require('cluster');
const { cpus } = require('os'); 
const bodyParser = require('body-parser');
const cors = require('cors');
const express = require('express');
const fs = require('fs');
const https = require('https');
const morgan = require('morgan');
const passport = require('passport');
const path = require('path');
const swaggerUI = require('swagger-ui-express');
const helmet = require('helmet');
const events = require('events');

const { getGdprLogger } = require('dhp-logging-lib/gdpr');
const { cronService } = require('./service/config/cron-service')
const healthRoutes = require('./routes/health');
const userRoutes = require('./routes/users');
const onboardingRoutes = require('./routes/onboarding');
const organizationRoutes = require('./routes/organization');
const registerCodeRoutes = require('./routes/register-code');
const dataRoutes = require('./routes/data');
const testRoutes = require('./routes/test');
const cosRoutes = require('./routes/cos');
const mapperRoutes = require('./routes/mapper');

const dataHelper = require('./helpers/data-helper');
const cacheHelper = require('./helpers/cache-helper');
const swaggerDoc = require('./swagger.json');
const tlsHelper = require('./helpers/tls-helper');
const constants = require('./helpers/constants');
const config = require('./config');
const Logger = require('./config/logger');

const index = require('./utils/index');

const port = process.env.PORT || process.env.VCAP_APP_PORT || 3000;
let useHTTPS = false;
let serverCert;
let serverKey;

const emitter = new events.EventEmitter()

const app = express();

const onStartUp = (logger) => {
    return async (err) => {
        if (err) {
            logger.error(`Error starting server: ${err}`);
            // eslint-disable-next-line no-process-exit
            process.exit(1);
        }
    
        try {
            if (config.cronSchedulerEnabled) {
                logger.info('Cron scheduler is enabled')
                cronService()
            } else {
                logger.info('Cron scheduler is not enabled')
            }
        } catch (e) {
            logger.error(`Error starting cron: ${e.message}`);
            // eslint-disable-next-line no-process-exit
            process.exit(1);
        }
        
        try {
            await index.setupCOS();
        } catch (error) {
            const errMsg = `Error starting server. Failed to setup COS: ${error}`;
            logger.warn(errMsg);
            // eslint-disable-next-line no-process-exit
            process.exit(1);
        }
    
        try {
            await index.setupScopesRoles();
        } catch (error) {
            const errMsg = `Error starting server. Failed to setup roles and scopes: ${error}`;
            logger.error(errMsg);
            // eslint-disable-next-line no-process-exit
            process.exit(1);
        }

        try {
            await index.setGlobalVariables('');
        } catch (error) {
            const errMsg = `Error starting server. Failed to set global variables: ${error}`;
            logger.error(errMsg);
            // eslint-disable-next-line no-process-exit
            process.exit(1);
        }

        emitter.emit("appStarted");
    };
}

const initializeExpress = () => {
    app.use(helmet());

    // TODO: may want to change to short or tiny
    app.use(morgan('dev'));
    app.use(
        bodyParser.urlencoded({
            extended: false,
        })
    );
    app.use(bodyParser.json());
    app.use(passport.initialize());

    return app;
}

const setupRoutes = (app) => {
    const contextRoot = config.context_root;
    
    // routes which should handle requests
    // TODO: add '/api/v1/' to routes
    app.use(`${contextRoot}/health`, healthRoutes);
    app.use(`${contextRoot}/users`, userRoutes);
    app.use(`${contextRoot}/organization`, organizationRoutes);
    app.use(`${contextRoot}/onboarding`, onboardingRoutes);
    app.use(`${contextRoot}/register-code`, registerCodeRoutes);
    app.use(`${contextRoot}/data`, dataRoutes);
    app.use(`${contextRoot}/cos`, cosRoutes);
    app.use(`${contextRoot}/mapper`, mapperRoutes);
    app.use(`${contextRoot}/test`, testRoutes);
    app.use(`${contextRoot}/api-docs`, swaggerUI.serve, swaggerUI.setup(swaggerDoc));
}

const setupExpressErrHandling = (app) => {
    app.use((req, res, next) => {
        const error = new Error('No route found');
        error.status = 404;
        next(error);
    });
    
    // eslint-disable-next-line no-unused-vars
    app.use((error, req, res, next) => {
        res.status(error.status || 500);
        res.json({
            error: {
                message: error.message,
            },
        });
    });
}

const logEnvVars = (logger) => {
    logger.info(`NODE JS RUNNING ON ${process.version}`);
    logger.info(`PORT = ${port}`);
    logger.info(`process.env.NODE_ENV = ${process.env.NODE_ENV}`);
    logger.info(`process.env.APP_ID_URL = ${process.env.APP_ID_URL}`);
    logger.info(`process.env.APP_ID_TENANT_ID = ${process.env.APP_ID_TENANT_ID}`);
    logger.info(`process.env.AUTH_STRATEGY = ${process.env.AUTH_STRATEGY}`);
}

const setupHttps = (logger) => {
    if (!process.env.USE_HTTPS || (process.env.USE_HTTPS !== 'true' && process.env.USE_HTTPS !== 'TRUE')) {
        return;
    }
    useHTTPS = true;
    const tlsFolder = process.env.TLS_FOLDER_PATH || './config/tls';
    serverCert = path.resolve(tlsFolder, 'cert/server.cert');
    serverKey = path.resolve(tlsFolder, 'key/server.key');

    logger.info(`process.env.USE_HTTPS = ${process.env.USE_HTTPS}`);
    logger.info(`Using server.key & server.cert from folder = ${tlsFolder}`);
    logger.info(`server cert file = ${serverCert}`);
    logger.info(`server key file = ${serverKey}`);
}

const setupProcessCallbacks = (logger) => {
    process.on('warning', (warning) => {
        logger.warn('XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX');
        logger.warn(`Warning name: ${warning.name}`);
        logger.warn(`Warning message: ${warning.message}`);
        logger.warn(`Stack trace: ${warning.stack}`);
        logger.warn('XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX');
    });
    
    process.on('unhandledRejection', (reason, p) => {
        logger.warn('XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX');
        logger.warn(`Unhandled Rejection at promise: ${JSON.stringify(p)} reason: ${reason}`);
        logger.warn('XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX');
    });
    
    process.on('uncaughtException', (err) => {
        logger.warn('XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX');
        logger.warn(`Uncaught exception = ${err}`);
        logger.warn(`Uncaught stack = ${err.stack}`);
        logger.warn('XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX');
    });
}

const setupCors = (app) => {
    const corsOptions = {
        origin(origin, callback) {
            if (constants.WHITELIST.indexOf(origin) !== -1) {
                callback(null, true);
            } else {
                callback(null, false);
            }
        },
        optionsSuccessStatus: 200, // some legacy browsers 
    };
    app.use(cors(corsOptions));
}

const startListeningOnPort = (app, logger) => {
    if (useHTTPS) {
        logger.info('useHTTPS is true');
        const foundKeyFiles = tlsHelper.validateSSLFiles(serverKey, serverCert);
        if (foundKeyFiles) {
            const options = {
                key: fs.readFileSync(serverKey),
                cert: fs.readFileSync(serverCert),
                secureOptions: tlsHelper.getSecureOptions(),
                ciphers: tlsHelper.getCiphersForServerOptions(),
                honorCipherOrder: true,
            };
            https.createServer(options, app).listen(port, onStartUp(logger));
        }
    } else {
        logger.info('useHTTPS is false');
        app.listen(port, onStartUp(logger));
    }
}

const setupCloudant = async (logger) => {
    try {
        await index.setupCloudant();
    } catch (error) {
        const errMsg = `Error starting server. Failed to setup Cloudant: ${error}`;
        logger.error(errMsg);
        // eslint-disable-next-line no-process-exit
        process.exit(1);
    }
}

const initVerifierBuilder= async (logger) => {
    logger.info('initializing verifier builder');

    process.env.HEALTHPASS_API = config.hpassAPI.hostname;
    process.env.METERING_API = config.meteringAPI.hostname;
    process.env.VERIFIER_CONFIG_API = config.verifierConfigAPI.hostname;

    const response = await dataHelper.initVerifierBuilder();
    if (!response.success) {
        logger.error(`Error starting server: unable to initialize verifier builder: ${response.message}`);
        // eslint-disable-next-line no-process-exit
        process.exit(1);
    }
    logger.info('verifier builder initilized')
}

const startApp = async (logger) => {
    await setupCloudant();

    await initVerifierBuilder(logger);
    // initialize GDPR logger
    await getGdprLogger().initCloudantConnection();
    
    const app = initializeExpress();
    setupRoutes(app);
    setupExpressErrHandling(app);
    logEnvVars(logger);
    setupHttps(logger);
    setupProcessCallbacks(logger);
    setupCors(app);
    startListeningOnPort(app, logger);
}

const fork = async (logger) => {
    let processes = process.env.CLUSTER_PROCESSES || cpus().length

    if (typeof processes === 'string') {
        processes = parseInt(processes, 10);
    }

    logger.info(`${processes} CPU's available for worker processes`);

    for (let i = 0; i < processes; i += 1) {

        // cluster starts up too fast and causes high global queries
        // eslint-disable-next-line no-await-in-loop
        await new Promise(resolve => setTimeout(resolve, 1000));

        cluster.fork();
    }

    cluster.on('exit', (worker) => {
        logger.info(`worker process ${worker.process.pid} died.  Starting another one`);
        cluster.fork();
    });
}

const startCluster = async () => {
    const logger = new Logger(`app_master`);

    if(process.env.CLUSTER_PROCESSES
            && (process.env.CLUSTER_PROCESSES === '0' || process.env.CLUSTER_PROCESSES === 0)) {
        startApp(logger);
        return;
    }

    if (cluster.isMaster) {

        await cacheHelper.setLRUOptions();

        await fork(logger);
    } else {
        await startApp(logger);
    }

    logger.info(`Server running on port ${port}`);
}

// Comment out the line below and uncomment the two lines below that to run a signle process.
startCluster();
// const logger = new Logger(`app_master`);
// startApp(logger);

module.exports = {
    app,
    emitter
};
