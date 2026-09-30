type TinodeIdentityClient = {
  getCurrentUserID?: () => unknown;
  isMe?: (uid: string) => boolean;
};

/**
 * Identity bundle that contains both the Chatmgt Account ID and the
 * Tinode UID so own-message checks work regardless of which identifier
 * the server includes in a particular packet.
 */
export interface CurrentIdentity {
  accountId?: string;
  tinodeUid?: string;
  userId?: string;
  uid?: string;
}

function asRecord(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown) {
  return String(value || '').trim();
}

function identityValues(client: TinodeIdentityClient, currentIdentity?: CurrentIdentity | null) {
  return new Set(
    [
      client?.getCurrentUserID?.(),
      currentIdentity?.accountId,
      currentIdentity?.tinodeUid,
      currentIdentity?.userId,
      currentIdentity?.uid,
    ]
      .map(stringValue)
      .filter(Boolean),
  );
}

function candidateSenderIds(raw: unknown) {
  const packet = asRecord(raw);
  const head = asRecord(packet.head);
  const content = asRecord(packet.content);
  const data = asRecord(packet.data ?? raw);
  return [...new Set([
    stringValue(packet.from),
    stringValue(head['x-sender-id']),
    stringValue(head['x-vichat-sender-id']),
    stringValue(content.sender),
    stringValue(content.sender_id),
    stringValue(content.account_id),
    stringValue(data.from),
    stringValue(data.sender),
    stringValue(data.sender_id),
    stringValue(data.account_id),
  ].filter(Boolean))];
}

export function resolveTinodeMessageOrigin(
  raw: unknown,
  client: TinodeIdentityClient,
  currentIdentity?: CurrentIdentity | null,
) {
  const candidates = candidateSenderIds(raw);
  const currentUserId = stringValue(client?.getCurrentUserID?.());
  const currentIdentityValues = identityValues(client, currentIdentity);
  const matchesCurrentUser = (value: string) => Boolean(value && (
    value === currentUserId || client?.isMe?.(value) === true
  ));
  const ownSenderId = candidates.find(matchesCurrentUser)
    || candidates.find(value => currentIdentityValues.has(value))
    || '';

  return {
    senderId: ownSenderId || candidates[0] || '',
    outgoing: Boolean(ownSenderId),
  };
}

export function isOwnTinodeMessage(raw: unknown, client: TinodeIdentityClient) {
  return resolveTinodeMessageOrigin(raw, client).outgoing;
}

/**
 * Extended own-message check that also compares sender identifiers against
 * the current Account ID and any other identity values from the session.
 *
 * This catches the case where the realtime packet carries an Account ID in
 * `x-sender-id` or `x-vichat-sender-id` rather than the Tinode UID,
 * preventing the sender from receiving a spurious local notification.
 */
export function isOwnMessageOrigin(
  raw: unknown,
  client: TinodeIdentityClient,
  currentIdentity?: CurrentIdentity | null,
) {
  return resolveTinodeMessageOrigin(raw, client, currentIdentity).outgoing;
}

/**
 * Notifications must fail closed when Tinode omits the sender or the viewer
 * identity is not ready. Rendering can still use the packet, but it must not
 * turn an unverified packet into a local incoming alert.
 */
export function hasKnownMessageOrigin(
  raw: unknown,
  client: TinodeIdentityClient,
  currentIdentity?: CurrentIdentity | null,
) {
  return candidateSenderIds(raw).length > 0 && identityValues(client, currentIdentity).size > 0;
}

export function isSafeIncomingMessageOrigin(
  raw: unknown,
  client: TinodeIdentityClient,
  currentIdentity?: CurrentIdentity | null,
) {
  return hasKnownMessageOrigin(raw, client, currentIdentity)
    && !isOwnMessageOrigin(raw, client, currentIdentity);
}
