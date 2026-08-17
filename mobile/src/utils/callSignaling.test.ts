import { describe, expect, it } from 'vitest';
import {
  extractCallSequence,
  normalizeCallCandidate,
  normalizeCallDescription,
  normalizeCallPayload,
  publishCallInvite,
} from './callSignaling';

describe('mobile call signaling', () => {
  it('normalizes object, JSON-string, and wrapped SDP/ICE payloads', () => {
    const offer = { type: 'offer', sdp: 'v=0\\r\\n' };
    const candidate = { candidate: 'candidate:1 1 udp 1 192.0.2.1 5000 typ host', sdpMid: '0', sdpMLineIndex: 0 };

    expect(normalizeCallPayload(JSON.stringify(offer))).toEqual(offer);
    expect(normalizeCallPayload({ payload: JSON.stringify(offer) })).toEqual(offer);
    expect(normalizeCallDescription(JSON.stringify(offer), 'offer')).toEqual(offer);
    expect(normalizeCallDescription('v=0\\r\\n', 'answer')).toEqual({ type: 'answer', sdp: 'v=0\\r\\n' });
    expect(normalizeCallCandidate(JSON.stringify({ payload: candidate }))).toEqual(candidate);
  });

  it('uses the Tinode server sequence returned by client-level publish', async () => {
    const draft: any = {};
    const published: any[] = [];
    const result = await publishCallInvite({
      draft,
      publish: async message => {
        published.push(message);
        return { params: { seq: '31' }, ts: '2026-08-17T10:00:00.000Z' };
      },
    });

    expect(published).toHaveLength(1);
    expect(result.seq).toBe(31);
    expect(extractCallSequence({ params: {} }, draft)).toBe(31);
    expect(draft.ts).toBe('2026-08-17T10:00:00.000Z');
  });

  it('reports rejected and incomplete invite publishes', async () => {
    await expect(publishCallInvite({
      draft: {},
      publish: async () => { throw Object.assign(new Error('not implemented'), { code: 501 }); },
    })).rejects.toThrow(/chưa bật WebRTC\/ICE authoritative/);

    await expect(publishCallInvite({ draft: {}, publish: async () => ({ params: {} }) }))
      .rejects.toThrow(/không trả về mã cuộc gọi/);
  });
});
