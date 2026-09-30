import { describe, expect, it } from 'vitest';
import {
  isIncomingCallNotificationPayload,
  shouldSuppressRemoteMessageNotification,
} from './remoteNotificationPolicy';

describe('remote notification policy', () => {
  it('suppresses silent sender/device-sync pushes', () => {
    expect(shouldSuppressRemoteMessageNotification({ silent: 'true', topic: 'usr-room' })).toBe(true);
    expect(shouldSuppressRemoteMessageNotification({ data: { silent: true } })).toBe(true);
  });

  it('keeps recipient message notifications visible', () => {
    expect(shouldSuppressRemoteMessageNotification({ silent: 'false', topic: 'usr-room' })).toBe(false);
    expect(shouldSuppressRemoteMessageNotification({ body: 'Tin nhắn mới', topic: 'usr-room' })).toBe(false);
  });

  it('never applies the silent rule to incoming calls', () => {
    expect(isIncomingCallNotificationPayload({ silent: 'true', type: 'incoming-call' })).toBe(true);
    expect(shouldSuppressRemoteMessageNotification({ silent: 'true', type: 'incoming-call' })).toBe(false);
    expect(shouldSuppressRemoteMessageNotification({ silent: 'true', webrtc: 'started' })).toBe(false);
  });
});
