/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 */

const moment = require('moment');
const jslt = require("jslt");
const jp = require('jsonpath');
const Logger = require('../config/logger');

const logger = new Logger('metadata-helper');

const mapperHelper = require('./mapper-helper');
const cacheHelper = require('./cache-helper');
const constants = require('./constants');


const checkType = async (txID, input) => {
    const typeMapper = await mapperHelper.getMapperByName(txID, "credentialTypeMapper");
    const typeResult = jslt.transform(input, typeMapper);

    let type = null;
    Object.keys(typeResult).forEach((key) => {
        if (typeResult[key]) {
            type = key;
        }
    })

    return type;
}

const loadVariables = (config, input) => {
    const variables = {};
    config.variables.forEach((variable) => {
        const {options} = variable;
        let value = null;
        for (let i = 0; i < options.length; i+=1) {
            value = jp.value(input, options[i]);
            if (value) {
                break;
            }
        }
        variables[variable.name] = value;
    });

    return variables;
}

const replaceFields = async (config, variables, metadata, txID) => {
    config.replaceFields.forEach(async (field) => {
        if (field.direct) {
            if (variables[field.variableName]) {
                jp.value(metadata, field.path, variables[field.variableName]);
            } else {
                jp.value(metadata, field.path, field.default);
            }
        } else {
            // check if credentialDic is initialized
            let credentialDic = await cacheHelper.get(constants.CREDENTIAL_DICTIONARY);
            if (!credentialDic) {
                credentialDic = await mapperHelper.getMapperByName(txID, constants.CREDENTIAL_DICTIONARY);
                if (!credentialDic) {
                    logger.error(`Cannot find credentialDictionary in DB`, txID);
                    return;
                }
                await cacheHelper.set(constants.CREDENTIAL_DICTIONARY, credentialDic);
            }
            const dicValue = credentialDic[field.dictionary][variables[field.variableName]];
            if (dicValue) {
                jp.value(metadata, field.path, dicValue);
            } else if (field.default) {
                jp.value(metadata, field.path, field.default);
            } else {
                const parent = jp.parent(metadata, field.path);
                delete parent[field.fieldName];
            }
        }
    });
}

const verifyGroup = (group, metadata) => {
    let groupQualified = true;
    group.forEach((fieldPath) => {
        const fieldValue = jp.value(metadata, fieldPath);
        if (fieldValue == null || fieldValue === "") {
            groupQualified = false;
        }
    });
    return groupQualified;
}

const verifyRequiredFields = (config, metadata) => {
    const emptyFields = [];
    config.requiredFields.forEach((requireField) => {
        const {groups} = requireField;
        let fieldEmpty = true;
        for (let i=0; i < groups.length; i+=1) {
            if (verifyGroup(groups[i], metadata)) {
                fieldEmpty = false;
                break;
            }
        }
        if (fieldEmpty) {
            emptyFields.push(requireField.name);
        }
    });

    return emptyFields;
}

const generateMetadata = async (txID, input) => {
    const type = await checkType(txID, input);
    if (type) {
        // eslint-disable-next-line
        input.metadata.type = type;
        // load config
        const config = await mapperHelper.getMapperByName(txID, type);
        const {mapper} = config;
        const metadata = jslt.transform(input, mapper);

        if (config.addDate) {
            metadata.metadata.date = 
                moment(input.metadata[config.dateField] * 1000).format("yyyy-MM-DDTHH:mm:ss");
        }
        // load variables
        if (config.variables) {
            const variables = loadVariables(config, input);
            // replace with variables
            await replaceFields(config, variables, metadata, txID);
        }

        // verify mandatory fields
        if (config.requiredFields) {
            const emptyFields = verifyRequiredFields(config, metadata);
            if (emptyFields.length > 0) {
                // log & throw error
                logger.error(`These mandatory fields are empty: ${emptyFields.join()}`, txID);
                throw new Error(`These mandatory fields are empty: ${emptyFields.join()}`)
            }
        }

        return metadata;
    }

    logger.warn(`Type not supported, cannot generate metadata!`)
    return null;
}

module.exports = {
    generateMetadata
}