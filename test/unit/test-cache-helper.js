/* eslint-disable no-underscore-dangle */
/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 */

const { expect } = require('chai');
const sinon = require('sinon');
const sharedMemoryController = require('cluster-shared-memory');

const cacheHelper = require('../../helpers/cache-helper');
const config = require('../../config/app/config.json');

const sandbox = sinon.createSandbox();

describe.only('test-cache-helper', () => {

    afterEach(() => {
        sandbox.restore();
    });

    describe('test setLRUOptions()', () => {
        it('should check if cache disabled', async () => {
            config.cache.cacheEnabled = false;
            const isDisable = await cacheHelper.setLRUOptions();
            expect(isDisable).to.equal(false);
        });

        it('should check if cache enabled and able to set option', async () => {
            config.cache.cacheEnabled = true;
            sandbox.stub(sharedMemoryController, 'setLRUOptions');
            const hasSetOption = await cacheHelper.setLRUOptions();
            expect(hasSetOption).to.equal(true);
        })

    });

    describe('test set()', () => {
        it('should check if cache disabled', async () => {
            config.cache.cacheEnabled = false;
            const key = 'someKey';
            const value = 'some value';
            const isDisable = await cacheHelper.set(key, value);
            expect(isDisable).to.equal(null);
        });

        it('should check if cache enabled and able to set key value', async () => {
            config.cache.cacheEnabled = true;
            const key = 'someKey';
            const value = 'some value';
            sandbox.stub(sharedMemoryController, 'mutex').resolves('OK');
            sandbox.stub(sharedMemoryController, 'setLRU').resolves('OK');

            const hasSet = await cacheHelper.set(key, value);
            expect(hasSet).to.equal('OK');
        })

    });

    describe('test get()', () => {
        it('should check if cache disabled', async () => {
            config.cache.cacheEnabled = false;
            const key = 'someKey';
            const isDisable = await cacheHelper.get(key);
            expect(isDisable).to.equal(null);
        });

        it('should check if cache enabled and able to get value using key', async () => {
            config.cache.cacheEnabled = true;
            const key = 'someKey';
            const value = 'some value';
            sandbox.stub(sharedMemoryController, 'getLRU').resolves(value);

            const result = await cacheHelper.get(key);
            expect(result).to.equal(value);
        })

    });

    describe('test remove()', () => {
        it('should check if cache disabled', async () => {
            config.cache.cacheEnabled = false;
            const key = 'someKey';
            const isDisable = await cacheHelper.remove(key);
            expect(isDisable).to.equal(null);
        });

        it('should check if cache enabled and able to remove from cache using key', async () => {
            config.cache.cacheEnabled = true;
            const key = 'someKey';
            sandbox.stub(sharedMemoryController, 'mutex').resolves('OK');
            sandbox.stub(sharedMemoryController, 'removeLRU').resolves('OK');

            const result = await cacheHelper.remove(key);
            expect(result).to.equal('OK');
        })

    });

});