/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 */

const { expect } = require('chai');

const notificationHelper = require('../../helpers/notification-helper');

describe('test-notification-helper', () => {
    describe('getNotificationText()', () => {
        const entity = 'abc';
        const code = '12345';
        const profileCredID = 'vc-c03c3760-2243-4cc3-821c-5c2ebf92e2da';
        
        it('builds a notification message with no variables', () => {
            const template = 'Data available for download';
            
            const message = notificationHelper.getNotificationText('tx1', template, entity, code, profileCredID);
            expect(message).to.not.include(entity);
            expect(message).to.not.include(code);
            expect(message).to.not.include(profileCredID);
        });
        
        it('builds a notification message with entity', () => {
            const template = 'Data available for download {ORG}';

            const message = notificationHelper.getNotificationText('tx1', template, entity, code, profileCredID);
            expect(message).to.include(entity);
            expect(message).to.not.include(code);
            expect(message).to.not.include(profileCredID);
        });

        it('builds a notification message with code', () => {
            const template = 'Data available for download {CODE}';

            const message = notificationHelper.getNotificationText('tx1', template, entity, code, profileCredID);
            expect(message).to.not.include(entity);
            expect(message).to.include(code);
            expect(message).to.not.include(profileCredID);
        });
        
        it('builds a notification message with profile credential id', () => {
            const template = 'Data available for download {PROFILE_CRED}';

            const message = notificationHelper.getNotificationText('tx1', template, entity, code, profileCredID);
            expect(message).to.not.include(entity);
            expect(message).to.not.include(code);
            expect(message).to.include(profileCredID);
        });

        it('builds a notification message with multiple variables', () => {
            const template = 'Data available for download {ORG} {CODE} {PROFILE_CRED}';

            const message = notificationHelper.getNotificationText('tx1', template, entity, code, profileCredID);
            expect(message).to.include(entity);
            expect(message).to.include(code);
            expect(message).to.include(profileCredID);
        });

        it('builds a notification message with invalid template variable', () => {
            const template = 'Data available for download {INVALID}';
 
            const message = notificationHelper.getNotificationText('tx1', template, entity, code, profileCredID);
            expect(message).to.not.include(entity);
            expect(message).to.not.include(code);
            expect(message).to.not.include(profileCredID);
            expect(message).to.equal(template);
        });

        it('builds a notification message with unresolved template variable', () => {
            const template = 'Data available for download {CODE}';
 
            const message = notificationHelper.getNotificationText('tx1', template, entity);
            expect(message).to.not.include(entity);
            expect(message).to.not.include(code);
            expect(message).to.not.include(profileCredID);
            expect(message).to.equal(template);
        });
    });
});
