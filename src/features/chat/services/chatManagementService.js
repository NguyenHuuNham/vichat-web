import { normalizeNotificationMuteUntil } from './conversationNotifications.js';
import { normalizeConversationFlag, normalizeConversationShape } from './chatRealtime.js';
import { normalizeGroupSettings } from './groupSettings.js';
import { normalizeDirectMessageBlockState } from './directMessageBlocking.js';
import {
  accountTenantId,
  filterAccountsByTenant,
  normalizeAccountShape,
  normalizeTenantShape,
} from '../../contacts/services/accountDirectory.js';

const env = import.meta.env || {};
const apiBase = String(env.VITE_CHAT_MANAGEMENT_API_URL || '').replace(/\/$/, '');
const remoteAuth = String(env.VITE_CHAT_MANAGEMENT_REMOTE_AUTH || '').toLowerCase() === 'true';
const tenantId = String(env.VITE_CHAT_TENANT_ID || '').trim();
// Employee ChatUI only permits manual credentials; Account SSO is reserved for admin.
export function normalizeChatAuthMode(value) {
  return String(value || '').trim().toLowerCase() === 'password' ? 'password' : 'account_password';
}
const authMode = normalizeChatAuthMode(env.VITE_CHAT_AUTH_MODE || 'account_password');
const accountUrl = String(env.VITE_ACCOUNT_URL || 'https://account.gonplatform.com').replace(/\/+$/, '');
const topicBindingsKey = 'vichat.management.topic-bindings.v1';

function createPresenceSessionId() {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

const presenceSessionId = createPresenceSessionId();
let presenceSequence = 0;

let activeSession = null;
let activeTinodePassword = '';
const lastDirectorySyncByTenant = new Map();
let tinodeTokenRequest = null;
let directorySessionGeneration = 0;

function tinodeTokenExpiresSoon(auth, skewSeconds = 30) {
  if (!auth?.token) return true;
  if (!auth.expires) return false;
  const expiresAt = typeof auth.expires === 'number'
    ? auth.expires * 1000
    : Date.parse(auth.expires);
  if (!Number.isFinite(expiresAt)) return true;
  return expiresAt <= Date.now() + (skewSeconds * 1000);
}

export function tinodeRefreshPayload(auth, password) {
  if (!tinodeTokenExpiresSoon(auth) || !password) return {};
  return { password: String(password) };
}

export function shouldRequestTinodeAuth(session, force = false) {
  return Boolean(force || session?.connection === 'tinode' || session?.tinodeAuth?.token);
}

export function isAccountManaged(account) {
  return Boolean(
    account?.accountManaged
      || account?.account_managed
      || account?.authSource === 'account'
      || account?.auth_source === 'account',
  );
}

export function isSessionRestoreAuthFailure(error) {
  return Number(error?.status) === 401;
}

export function shouldRetryTinodeMembership(error) {
  return ['TINODE_TOKEN_REQUIRED', 'TINODE_MEMBERSHIP_FAILED'].includes(error?.code)
    && [400, 401, 403, 409].includes(Number(error?.status));
}

export async function retryTinodeMembershipRequest(request, retryAvailable = true) {
  try {
    return await request(false);
  } catch (error) {
    if (!retryAvailable || !shouldRetryTinodeMembership(error)) throw error;
    return request(true);
  }
}

function readStorage(key, fallback) {
  if (typeof window === 'undefined') return fallback;
  try {
    return JSON.parse(window.localStorage.getItem(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  if (typeof window !== 'undefined') window.localStorage.setItem(key, JSON.stringify(value));
  return value;
}

function accountTenant(account) {
  return accountTenantId(account);
}

function activeSessionTenantId() {
  return scalarText(activeSession?.tenant?.id)
    || accountTenantId(activeSession?.user)
    || (authMode === 'password' ? tenantId : '');
}

function activeSessionUserId() {
  return [
    activeSession?.user?.id,
    activeSession?.user?.uid,
    activeSession?.user?.tinodeUid,
    activeSession?.user?.tinode_uid,
    activeSession?.user?.username,
  ].map(scalarText).find(Boolean) || '';
}

function captureDirectoryScope() {
  return {
    generation: directorySessionGeneration,
    tenantId: activeSessionTenantId(),
    userId: activeSessionUserId(),
  };
}

function assertDirectoryScope(scope) {
  if (
    !scope
    || directorySessionGeneration !== scope.generation
    || activeSessionTenantId() !== scope.tenantId
    || activeSessionUserId() !== scope.userId
  ) {
    const error = new Error('Directory response belongs to a previous company session.');
    error.code = 'DIRECTORY_SCOPE_CHANGED';
    error.status = 409;
    throw error;
  }
}

function accountsForActiveTenant(accounts) {
  const currentTenantId = activeSessionTenantId();
  return currentTenantId ? filterAccountsByTenant(accounts, currentTenantId) : [];
}

function scalarText(value) {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function avatarText(value) {
  const direct = scalarText(value);
  if (direct) return direct;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  return ['url', 'ref', 'src', 'href', 'path', 'uri']
    .map(name => scalarText(value[name]))
    .find(Boolean) || '';
}

function mediaVersionText(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  return ['version', 'updatedAt', 'updated_at', 'lastModified', 'last_modified']
    .map(name => scalarText(value[name]))
    .find(Boolean) || '';
}

function booleanValue(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  }
  return fallback;
}

export function normalizeTenantOptions(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.map(option => {
    if (!option || typeof option !== 'object') return null;
    const id = [option.id, option.tenantId, option.tenant_id].map(scalarText).find(Boolean) || '';
    if (!id || seen.has(id)) return null;
    seen.add(id);
    const name = [option.name, option.tenantName, option.tenant_name, id].map(scalarText).find(Boolean) || id;
    const normalized = {
      id,
      name,
      role: ([option.role, 'member'].map(scalarText).find(Boolean) || 'member').toLowerCase(),
      accountRole: ([option.accountRole, option.account_role, 'member'].map(scalarText).find(Boolean) || 'member').toLowerCase(),
      active: booleanValue(option.active ?? option.is_active, true),
    };
    const logo = [
      option.logo,
      option.logoUrl,
      option.logo_url,
      option.companyLogo,
      option.company_logo,
      option.company_logo_url,
      option.brandLogo,
      option.brand_logo,
      option.brand_logo_url,
    ].map(avatarText).find(Boolean) || '';
    const logoVersion = [
      option.logoVersion,
      option.logo_version,
      option.logoUpdatedAt,
      option.logo_updated_at,
      option.companyLogoVersion,
      option.company_logo_version,
      option.brandLogoVersion,
      option.brand_logo_version,
      option.updatedAt,
      option.updated_at,
      option.companyUpdatedAt,
      option.company_updated_at,
      option.brandUpdatedAt,
      option.brand_updated_at,
    ].map(scalarText).find(Boolean)
      || [option.logo, option.companyLogo, option.company_logo, option.brandLogo, option.brand_logo]
        .map(mediaVersionText)
        .find(Boolean)
      || '';
    if (logo) normalized.logo = logo;
    if (logoVersion) normalized.logoVersion = logoVersion;
    return normalized;
  }).filter(option => option?.active);
}

export function employeeLoginPayload(credentials = {}) {
  const payload = {
    identity: String(credentials.identity || credentials.username || '').trim(),
    password: String(credentials.password || ''),
  };
  // Account login derives the tenant from UpGO's verified current membership.
  // Only the legacy local-password flow needs the configured tenant hint.
  if (authMode === 'password' && tenantId) payload.tenant_id = tenantId;
  return payload;
}

function publicAccount(account) {
  if (!account) return null;
  const {
    password: _password,
    password_hash: _passwordHash,
    passwordHash: _passwordHashCamel,
    secret: _secret,
    ...safe
  } = account;
  const normalized = normalizeAccountShape(safe);
  if (!normalized) return null;
  const tenantOptions = normalizeTenantOptions(
    safe.tenantOptions || safe.tenant_options,
  );
  const normalizedTenantId = accountTenant(normalized);
  return {
    ...normalized,
    tenantId: normalizedTenantId,
    tenant_id: normalizedTenantId,
    tenantOptions,
    tenant_options: tenantOptions,
    tenant: normalizeTenantShape(safe.tenant || normalized.tenant),
  };
}

function hydrateActiveSession(payload, { preserveExisting = true } = {}) {
  const rawAccount = publicAccount(payload?.user || payload?.current_user || payload);
  const previousSession = activeSession;
  const previous = preserveExisting ? previousSession : null;
  const preservedAvatar = rawAccount?.avatar || (
    isAccountManaged(previousSession?.user) ? String(previousSession.user.avatar || '').trim() : ''
  );
  const account = rawAccount && preservedAvatar && !rawAccount.avatar
    ? { ...rawAccount, avatar: preservedAvatar, avatarUrl: preservedAvatar, avatar_url: preservedAvatar, photo: preservedAvatar }
    : rawAccount;
  const tenantOptions = normalizeTenantOptions(
    payload?.tenantOptions || payload?.tenant_options || account?.tenantOptions,
  );
  if (account) {
    account.tenantOptions = tenantOptions;
    account.tenant_options = tenantOptions;
  }
  const tenant = normalizeTenantShape(payload?.tenant || account?.tenant);
  const rawTinodeAuth = payload?.tinode || payload?.tinode_auth || {};
  const hasTinodeToken = Boolean(rawTinodeAuth.token || payload?.tinode_token);
  // Fresh server credentials must win over a token retained by an older tab.
  // /auth/me may omit Tinode credentials, in which case the current token is
  // still valid and can be retained for the active session.
  const tinodeAuth = hasTinodeToken
    ? {
      ...(previous?.tinodeAuth || {}),
      ...rawTinodeAuth,
      username: rawTinodeAuth.username || account?.tinodeUsername || account?.tinode_username || account?.username,
      uid: rawTinodeAuth.uid || account?.tinodeUid || account?.tinode_uid,
      token: rawTinodeAuth.token || payload?.tinode_token,
      displayName: account?.name || '',
      avatar: account?.avatar || '',
      tenantId: tenant?.id || account?.tenantId || account?.tenant_id || tenantId,
      tenantName: tenant?.name || account?.tenantName || account?.tenant_name || '',
    }
    : (previous?.tinodeAuth
      ? {
        ...previous.tinodeAuth,
        displayName: account?.name || previous.tinodeAuth.displayName || '',
        avatar: account?.avatar || previous.tinodeAuth.avatar || '',
      }
      : null);
  const connection = previous?.connection || payload?.connection || (hasTinodeToken ? 'tinode' : 'management');
  activeSession = {
    ...(previous || {}),
    user: account,
    tenant,
    tenantOptions,
    connection,
    tinodeAuth,
  };
  return { ...account, tenant, tenantOptions, connection };
}

function updateActiveSessionProfile(account) {
  if (!activeSession || !account) return;
  const nextAvatar = account.avatar || activeSession.user?.avatar || '';
  activeSession.user = {
    ...(activeSession.user || {}),
    ...account,
    avatar: nextAvatar,
    avatarUrl: nextAvatar,
    avatar_url: nextAvatar,
    photo: nextAvatar,
  };
  if (activeSession.tinodeAuth) {
    activeSession.tinodeAuth = {
      ...activeSession.tinodeAuth,
      displayName: account.name || activeSession.tinodeAuth.displayName || '',
      avatar: nextAvatar,
    };
  }
}

function responseItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.objects)) return payload.objects;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function responseNextCursor(payload) {
  return scalarText(payload?.next_cursor || payload?.nextCursor) || null;
}

function normalizePersonalCloudFile(record) {
  if (!record || typeof record !== 'object') return null;
  const id = scalarText(record.id || record.fileId || record.file_id);
  const uploadId = scalarText(record.uploadId || record.upload_id);
  if (!id || !uploadId) return null;
  const size = Number(record.size);
  const createdAt = Number(record.createdAt || record.created_at);
  const updatedAt = Number(record.updatedAt || record.updated_at);
  return {
    id,
    uploadId,
    fileName: scalarText(record.fileName || record.file_name) || 'tep-dinh-kem',
    mimeType: scalarText(record.mimeType || record.mime_type) || 'application/octet-stream',
    size: Number.isFinite(size) && size >= 0 ? size : 0,
    createdAt: Number.isFinite(createdAt) ? createdAt : 0,
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0,
  };
}

function normalizePersonalCloudMessage(record) {
  if (!record || typeof record !== 'object') return null;
  const id = scalarText(record.id || record.messageId || record.message_id);
  if (!id) return null;
  const text = typeof record.text === 'string'
    ? record.text
    : typeof record.content === 'string' ? record.content : '';
  const createdAt = Number(record.createdAt || record.created_at);
  const updatedAt = Number(record.updatedAt || record.updated_at);
  return {
    id,
    text,
    createdAt: Number.isFinite(createdAt) ? createdAt : 0,
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0,
  };
}

function normalizeProfileViewer(record) {
  if (!record || typeof record !== 'object') return null;
  const id = scalarText(record.id || record.viewerId || record.viewer_id);
  if (!id) return null;
  return {
    id,
    name: scalarText(record.name || record.fullName || record.full_name) || 'Thành viên',
    avatar: avatarText(record.avatar || record.avatarUrl || record.avatar_url || record.photo),
    title: scalarText(record.title),
    department: scalarText(record.department),
    role: scalarText(record.role),
    viewedAt: scalarText(record.viewedAt || record.viewed_at),
  };
}

function activeTenantDirectoryAccounts(payload) {
  return accountsForActiveTenant(responseItems(payload).map(publicAccount).filter(Boolean));
}

async function apiRequest(path, options = {}) {
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const response = await fetch(`${apiBase}${path}`, {
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(options.body && !isFormData ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error_message || payload?.message || `Management service HTTP ${response.status}`);
    error.code = payload?.error_code || `HTTP_${response.status}`;
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function membershipApiRequest(path, method, body = {}) {
  const request = async force => {
    const tinodeAuth = shouldRequestTinodeAuth(activeSession, force)
      ? await chatManagementService.getFreshTinodeAuth({ force })
      : null;
    return apiRequest(path, {
      method,
      body: JSON.stringify({
        ...body,
        tinode_token: tinodeAuth?.token || '',
      }),
    });
  };

  return retryTinodeMembershipRequest(
    request,
    Boolean(activeSession),
  );
}

function normalizeConversation(record) {
  const properties = record?.properties || {};
  const tinodeTopic = record?.tinodeTopic || record?.tinode_topic || record?.channel_thread_id || '';
  const managementId = String(record?.managementId || record?.id || record?.conversation_no || tinodeTopic);
  const hasConversationBackground = Object.prototype.hasOwnProperty.call(record || {}, 'conversationBackground')
    || Object.prototype.hasOwnProperty.call(record || {}, 'conversation_background')
    || Object.prototype.hasOwnProperty.call(properties, 'conversationBackground')
    || Object.prototype.hasOwnProperty.call(properties, 'conversation_background');
  const conversationBackground = record?.conversationBackground !== undefined
    ? record.conversationBackground
    : record?.conversation_background !== undefined
      ? record.conversation_background
      : properties.conversationBackground !== undefined
        ? properties.conversationBackground
        : properties.conversation_background;
  const notificationMutedUntil = normalizeNotificationMuteUntil(
    record?.notificationMutedUntil ?? record?.notification_muted_until,
  );
  const directBlockState = normalizeDirectMessageBlockState(record);
  return normalizeConversationShape({
    id: managementId,
    managementId,
    tinodeTopic,
    managementSnapshot: true,
    name: record?.name || record?.subject || properties.name || 'Cuoc tro chuyen',
    isGroup: record?.isGroup ?? properties.isGroup ?? properties.is_group ?? false,
    avatarHtml: record?.avatarHtml,
    avatarUrl: record?.avatarUrl || record?.avatar || properties.group_avatar || properties.avatar || '',
    avatarClass: record?.avatarClass || (record?.isGroup ? 'group' : ''),
    membersCount: record?.membersCount || properties.membersCount || '',
    description: record?.description || properties.description || '',
    admin: record?.admin || properties.admin || '',
    adminId: record?.adminId || properties.adminId || '',
    members: record?.members || properties.members || [],
    conversationNicknames: record?.conversationNicknames
      || record?.conversation_nicknames
      || properties.conversationNicknames
      || properties.conversation_nicknames
      || {},
    participantIds: record?.participantIds || properties.participantIds || [],
    pendingMembers: record?.pendingMembers || record?.pending_members || properties.pendingMembers || properties.pending_members || [],
    pendingParticipantIds: record?.pendingParticipantIds || record?.pending_participant_ids || properties.pendingParticipantIds || properties.pending_participant_ids || [],
    // Message history is loaded exclusively from Tinode/chatapi.
    messages: [],
    lastMsg: record?.lastMsg || properties.lastMessage || '',
    time: record?.time || properties.time || '',
    updatedAt: record?.updatedAt
      || record?.last_message_at
      || record?.updated_at
      || properties.updatedAt
      || properties.updated_at,
    deletedAt: record?.deletedAt || record?.deleted_at || properties.deletedAt || properties.deleted_at || '',
    badge: record?.badge || properties.unreadCount || 0,
    notificationMutedUntil,
    pinned: normalizeConversationFlag(record?.pinned ?? record?.isPinned ?? properties.pinned),
    pinnedAt: record?.pinnedAt || record?.pinned_at || properties.pinnedAt || null,
    ...directBlockState,
    groupSettings: record?.groupSettings
      || record?.group_settings
      || properties.groupSettings
      || properties.group_settings,
    ...(hasConversationBackground ? { conversationBackground } : {}),
  });
}

function bindingKey(userId, conversationId) {
  const sessionTenantId = activeSession?.tenant?.id || activeSession?.user?.tenantId || tenantId;
  return `${sessionTenantId}:${userId || 'anonymous'}:${conversationId}`;
}

export const chatManagementService = {
  get tenantId() {
    return tenantId;
  },

  get remote() {
    return Boolean(apiBase && remoteAuth);
  },

  get chatEngine() {
    return env.VITE_TINODE_HOST ? 'tinode' : 'demo';
  },

  get accountManaged() {
    return isAccountManaged(activeSession?.user);
  },

  get directorySync() {
    return lastDirectorySyncByTenant.get(activeSessionTenantId()) || null;
  },

  get presenceSessionId() {
    return presenceSessionId;
  },

  async login(credentials = {}) {
    if (!apiBase || !remoteAuth) throw new Error('Management service authentication is not configured.');
    directorySessionGeneration += 1;
    const passwordLogin = authMode === 'password';
    const accountCredentialLogin = authMode === 'account_password';
    const credentialLogin = passwordLogin || accountCredentialLogin;
    activeTinodePassword = '';
    lastDirectorySyncByTenant.clear();
    const payload = await apiRequest(
      accountCredentialLogin
        ? '/api/v1/auth/account-login'
        : (passwordLogin ? '/api/v1/auth/login' : '/api/v1/auth/sso'),
      {
        method: 'POST',
        ...(credentialLogin ? {
          body: JSON.stringify(employeeLoginPayload(credentials)),
        } : {}),
      },
    );
    const account = publicAccount(payload.user || payload.current_user || payload);
    const tenantOptions = normalizeTenantOptions(
      payload.tenantOptions || payload.tenant_options || account?.tenantOptions,
    );
    if (account) {
      account.tenantOptions = tenantOptions;
      account.tenant_options = tenantOptions;
    }
    const tenant = normalizeTenantShape(payload.tenant || account?.tenant);
    const rawTinodeAuth = payload.tinode || payload.tinode_auth || {};
    const hasTinodeToken = Boolean(rawTinodeAuth.token || payload.tinode_token);
    const connection = payload.connection || (hasTinodeToken ? 'tinode' : 'management');
    tinodeTokenRequest = null;
    activeTinodePassword = passwordLogin ? String(credentials.password || '') : '';
    activeSession = {
      user: account,
      tenant,
      tenantOptions,
      connection,
      tinodeAuth: hasTinodeToken ? {
        ...rawTinodeAuth,
        username: rawTinodeAuth.username || account?.tinodeUsername || account?.tinode_username || account?.username,
        uid: rawTinodeAuth.uid || account?.tinodeUid || account?.tinode_uid,
        token: rawTinodeAuth.token || payload.tinode_token,
        displayName: account?.name || '',
        avatar: account?.avatar || '',
        tenantId: tenant?.id || account?.tenantId || account?.tenant_id || tenantId,
        tenantName: tenant?.name || account?.tenantName || account?.tenant_name || '',
      } : null,
    };
    return { ...account, tenant, tenantOptions, connection };
  },

  async currentSession() {
    if (!apiBase || !remoteAuth) throw new Error('Management service authentication is not configured.');
    const session = await this.refreshSessionMetadata();
    return publicAccount(session);
  },

  async refreshSessionMetadata() {
    if (!apiBase || !remoteAuth) throw new Error('Management service authentication is not configured.');
    const payload = await apiRequest('/api/v1/auth/me', { cache: 'no-store' });
    return hydrateActiveSession(payload, { preserveExisting: true });
  },

  async restoreSession() {
    if (!apiBase || !remoteAuth) throw new Error('Management service authentication is not configured.');
    directorySessionGeneration += 1;
    const payload = await apiRequest('/api/v1/auth/me', { cache: 'no-store' });
    return hydrateActiveSession(payload, { preserveExisting: false });
  },

  async switchTenant(nextTenantId) {
    if (!apiBase || !remoteAuth) throw new Error('Management service authentication is not configured.');
    directorySessionGeneration += 1;
    const requestedTenantId = String(nextTenantId || '').trim();
    if (!requestedTenantId) throw new Error('A company is required.');
    const payload = await apiRequest('/api/v1/auth/switch-tenant', {
      method: 'POST',
      body: JSON.stringify({ tenant_id: requestedTenantId }),
    });
    activeTinodePassword = '';
    tinodeTokenRequest = null;
    lastDirectorySyncByTenant.clear();
    return hydrateActiveSession(payload, { preserveExisting: false });
  },

  async refreshTinodeToken() {
    if (!apiBase || !remoteAuth) throw new Error('Management service authentication is not configured.');
    if (!activeSession) throw new Error('Phiên Chatmgt chưa sẵn sàng.');
    if (!tinodeTokenRequest) {
      const requestedSession = activeSession;
      const request = apiRequest('/api/v1/auth/tinode-token', {
        method: 'POST',
        body: JSON.stringify(tinodeRefreshPayload(
          requestedSession.tinodeAuth,
          activeTinodePassword,
        )),
      })
        .then(payload => {
          if (!requestedSession || activeSession !== requestedSession) {
            throw new Error('Phiên tài khoản đã thay đổi trong khi kết nối Tinode.');
          }
          const tinodeAuth = payload.tinode_auth || payload.tinode || {};
          if (!tinodeAuth.token) throw new Error('Chatmgt did not return a Tinode token.');
          const mergedAuth = {
            ...(requestedSession.tinodeAuth || {}),
            ...tinodeAuth,
            displayName: requestedSession.user?.name || '',
            avatar: requestedSession.user?.avatar || '',
            tenantId: requestedSession.tenant?.id || requestedSession.user?.tenantId || tenantId,
            tenantName: requestedSession.tenant?.name || requestedSession.user?.tenantName || '',
          };
          requestedSession.tinodeAuth = mergedAuth;
          requestedSession.connection = payload.connection || 'tinode';
          return mergedAuth;
        })
        .finally(() => {
          if (tinodeTokenRequest === request) tinodeTokenRequest = null;
        });
      tinodeTokenRequest = request;
    }
    return tinodeTokenRequest;
  },

  async getFreshTinodeAuth({ force = false } = {}) {
    const current = activeSession?.tinodeAuth || null;
    if (!force && current && !tinodeTokenExpiresSoon(current)) return current;
    return this.refreshTinodeToken();
  },

  async logout({ throwOnError = false } = {}) {
    directorySessionGeneration += 1;
    let payload = null;
    let logoutError = null;
    if (apiBase && remoteAuth) {
      // Give the best-effort cleanup a short window without making logout
      // depend on a broken Redis/API connection.
      const presenceCleanup = this.clearPresence({ keepalive: true }).catch(() => null);
      await Promise.race([
        presenceCleanup,
        new Promise(resolve => setTimeout(resolve, 500)),
      ]);
      try {
        payload = await apiRequest('/api/v1/auth/logout', { method: 'POST' });
      } catch (error) {
        logoutError = error;
      }
    }
    activeSession = null;
    activeTinodePassword = '';
    lastDirectorySyncByTenant.clear();
    tinodeTokenRequest = null;
    if (logoutError && throwOnError) throw logoutError;
    return payload;
  },

  async requestPasswordReset(identity) {
    if (!apiBase || !remoteAuth) throw new Error('Management service authentication is not configured.');
    return apiRequest('/api/v1/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ identity: String(identity || '').trim(), tenant_id: tenantId }),
    });
  },

  async resetPassword(token, newPassword) {
    if (!apiBase || !remoteAuth) throw new Error('Management service authentication is not configured.');
    return apiRequest('/api/v1/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, new_password: newPassword }),
    });
  },

  async changePassword(currentPassword, newPassword) {
    if (!apiBase || !remoteAuth) throw new Error('Management service authentication is not configured.');
    const payload = await apiRequest('/api/v1/auth/password', {
      method: 'POST',
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    });
    activeTinodePassword = String(newPassword || '');
    if (payload?.user) hydrateActiveSession(payload, { preserveExisting: true });
    return payload;
  },

  async updateProfile(profile) {
    if (!apiBase || !remoteAuth) throw new Error('Management service authentication is not configured.');
    const payload = await apiRequest('/api/v1/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(profile || {}),
    });
    const rawAccount = publicAccount(payload.user || payload);
    const previousAvatar = String(activeSession?.user?.avatar || '').trim();
    const avatar = rawAccount?.avatar || previousAvatar;
    const account = rawAccount && avatar && !rawAccount.avatar
      ? { ...rawAccount, avatar, avatarUrl: avatar, avatar_url: avatar, photo: avatar }
      : rawAccount;
    updateActiveSessionProfile(account);
    return account;
  },

  async updateAvatar(file) {
    if (!apiBase || !remoteAuth) throw new Error('Management service authentication is not configured.');
    if (!file) throw new Error('Vui lòng chọn ảnh đại diện.');
    const form = new FormData();
    form.append('avatar', file, file.name || 'avatar');
    const payload = await apiRequest('/api/v1/auth/avatar', {
      method: 'POST',
      body: form,
    });
    const account = publicAccount(payload.user || payload);
    updateActiveSessionProfile(account);
    return account;
  },

  async recordProfileView(profileId) {
    if (!apiBase || !remoteAuth) return null;
    const id = String(profileId || '').trim();
    if (!id) return null;
    return apiRequest('/api/v1/profile/views', {
      method: 'POST',
      body: JSON.stringify({ profile_id: id }),
    });
  },

  async listProfileViewers({ signal, cursor = '', limit = 100 } = {}) {
    if (!apiBase || !remoteAuth) {
      return Object.assign([], { nextCursor: null, hasMore: false, total: 0 });
    }
    const scope = captureDirectoryScope();
    const params = new URLSearchParams({
      limit: String(Math.min(100, Math.max(1, Number(limit) || 100))),
    });
    if (cursor) params.set('cursor', String(cursor));
    const payload = await apiRequest(`/api/v1/profile/views?${params.toString()}`, {
      cache: 'no-store',
      signal,
    });
    assertDirectoryScope(scope);
    const latestByViewer = new Map();
    responseItems(payload).map(normalizeProfileViewer).filter(Boolean).forEach(viewer => {
      const previous = latestByViewer.get(viewer.id);
      const previousTime = Date.parse(previous?.viewedAt || '') || 0;
      const nextTime = Date.parse(viewer.viewedAt || '') || 0;
      if (!previous || nextTime >= previousTime) latestByViewer.set(viewer.id, {
        ...previous,
        ...viewer,
        name: viewer.name || previous.name,
        avatar: viewer.avatar || previous.avatar,
      });
    });
    const viewers = [...latestByViewer.values()].sort((first, second) => (
      (Date.parse(second.viewedAt || '') || 0) - (Date.parse(first.viewedAt || '') || 0)
    ));
    viewers.nextCursor = responseNextCursor(payload);
    viewers.hasMore = Boolean(payload?.has_more ?? payload?.hasMore ?? viewers.nextCursor);
    viewers.total = Number.isFinite(Number(payload?.total ?? payload?.count))
      ? Number(payload.total ?? payload.count)
      : null;
    return viewers;
  },

  getTinodeAuth() {
    return activeSession?.tinodeAuth || null;
  },

  async listUsers({ signal, cursor = '', query = '', limit = 100 } = {}) {
    if (!apiBase || !remoteAuth) throw new Error('Management service authentication is not configured.');
    const directoryScope = captureDirectoryScope();
    const params = new URLSearchParams({ limit: String(Math.min(100, Math.max(1, Number(limit) || 100))) });
    if (cursor) params.set('cursor', String(cursor));
    if (String(query || '').trim()) params.set('q', String(query).trim());
    const payload = await apiRequest(`/api/v1/chat/users?${params.toString()}`, {
      cache: 'no-store',
      signal,
    });
    assertDirectoryScope(directoryScope);
    const accounts = activeTenantDirectoryAccounts(payload);
    accounts.nextCursor = responseNextCursor(payload);
    accounts.hasMore = Boolean(payload?.has_more ?? payload?.hasMore ?? accounts.nextCursor);
    accounts.total = Number.isFinite(Number(payload?.total)) ? Number(payload.total) : null;
    if (directoryScope.tenantId) {
      lastDirectorySyncByTenant.set(directoryScope.tenantId, payload?.directory_sync || null);
    }
    return accounts;
  },

  async listPersonalCloudFiles({ signal, cursor = '', limit = 100 } = {}) {
    if (!apiBase || !remoteAuth) return Object.assign([], { nextCursor: null, hasMore: false, total: 0 });
    const scope = captureDirectoryScope();
    const params = new URLSearchParams({ limit: String(Math.min(100, Math.max(1, Number(limit) || 100))) });
    if (cursor) params.set('cursor', String(cursor));
    const payload = await apiRequest(`/api/v1/chat/cloud/files?${params.toString()}`, { signal, cache: 'no-store' });
    assertDirectoryScope(scope);
    const files = responseItems(payload).map(normalizePersonalCloudFile).filter(Boolean);
    files.nextCursor = responseNextCursor(payload);
    files.hasMore = Boolean(payload?.has_more ?? payload?.hasMore ?? files.nextCursor);
    files.total = Number.isFinite(Number(payload?.total ?? payload?.count)) ? Number(payload.total ?? payload.count) : null;
    return files;
  },

  async listPersonalCloudMessages({ signal, cursor = '', limit = 100 } = {}) {
    if (!apiBase || !remoteAuth) return Object.assign([], { nextCursor: null, hasMore: false, total: 0 });
    const scope = captureDirectoryScope();
    const params = new URLSearchParams({ limit: String(Math.min(100, Math.max(1, Number(limit) || 100))) });
    if (cursor) params.set('cursor', String(cursor));
    const payload = await apiRequest(`/api/v1/chat/cloud/messages?${params.toString()}`, { signal, cache: 'no-store' });
    assertDirectoryScope(scope);
    const messages = responseItems(payload).map(normalizePersonalCloudMessage).filter(Boolean);
    messages.nextCursor = responseNextCursor(payload);
    messages.hasMore = Boolean(payload?.has_more ?? payload?.hasMore ?? messages.nextCursor);
    messages.total = Number.isFinite(Number(payload?.total ?? payload?.count)) ? Number(payload.total ?? payload.count) : null;
    return messages;
  },

  async sendPersonalCloudMessage(text) {
    if (!apiBase || !remoteAuth) throw new Error('Personal cloud storage is not configured.');
    const value = String(text || '').trim();
    if (!value) throw new Error('Vui lòng nhập tin nhắn.');
    const payload = await apiRequest('/api/v1/chat/cloud/messages', {
      method: 'POST',
      body: JSON.stringify({ text: value }),
    });
    return normalizePersonalCloudMessage(payload);
  },

  async deletePersonalCloudMessage(messageId) {
    if (!apiBase || !remoteAuth) throw new Error('Personal cloud storage is not configured.');
    return apiRequest(`/api/v1/chat/cloud/messages/${encodeURIComponent(messageId)}`, {
      method: 'DELETE',
    });
  },

  async uploadPersonalCloudFile(file, { onProgress } = {}) {
    if (!apiBase || !remoteAuth) throw new Error('Personal cloud storage is not configured.');
    if (!file || typeof file.size !== 'number' || file.size <= 0) {
      throw new Error('Vui long chon mot file khong rong.');
    }
    const prepared = await apiRequest('/api/v1/chat/cloud/uploads', {
      method: 'POST',
      body: JSON.stringify({
        file_name: String(file.name || 'tep-dinh-kem'),
        content_type: String(file.type || 'application/octet-stream'),
        size: file.size,
      }),
    });
    const uploadUrl = scalarText(prepared?.upload_url || prepared?.uploadUrl);
    if (!uploadUrl) throw new Error('May chu khong tra ve dia chi tai file.');
    const uploadResponse = await fetch(uploadUrl, {
      method: String(prepared.method || 'PUT').toUpperCase(),
      credentials: 'omit',
      headers: prepared.headers || {},
      body: file,
    });
    if (!uploadResponse.ok) {
      const error = new Error(`Cloud storage HTTP ${uploadResponse.status}`);
      error.status = uploadResponse.status;
      error.code = 'PERSONAL_CLOUD_UPLOAD_FAILED';
      throw error;
    }
    onProgress?.(1);
    const uploadId = scalarText(prepared.upload_id || prepared.uploadId);
    const completed = await apiRequest(`/api/v1/chat/cloud/uploads/${encodeURIComponent(uploadId)}/complete`, {
      method: 'POST',
      body: JSON.stringify({
        size: file.size,
        upload_token: prepared.upload_token || prepared.uploadToken || '',
      }),
    });
    return normalizePersonalCloudFile(completed);
  },

  async getPersonalCloudDownloadUrl(fileId, { download = false } = {}) {
    if (!apiBase || !remoteAuth) throw new Error('Personal cloud storage is not configured.');
    const params = new URLSearchParams({ format: 'json' });
    if (download) params.set('download', '1');
    const payload = await apiRequest(
      `/api/v1/chat/cloud/files/${encodeURIComponent(fileId)}/download?${params}`,
      { cache: 'no-store' },
    );
    const url = scalarText(payload?.url);
    if (!url) throw new Error('May chu khong tra ve dia chi file.');
    return url;
  },

  async deletePersonalCloudFile(fileId) {
    if (!apiBase || !remoteAuth) throw new Error('Personal cloud storage is not configured.');
    const payload = await apiRequest(`/api/v1/chat/cloud/files/${encodeURIComponent(fileId)}`, {
      method: 'DELETE',
    });
    return payload;
  },

  async heartbeatPresence(accountIds = []) {
    if (!apiBase || !remoteAuth) throw new Error('Management service authentication is not configured.');
    const ids = [...new Set((Array.isArray(accountIds) ? accountIds : [])
      .map(value => String(value || '').trim())
      .filter(Boolean))].slice(0, 1000);
    return apiRequest('/api/v1/chat/presence/heartbeat', {
      method: 'POST',
      body: JSON.stringify({
        session_id: presenceSessionId,
        sequence: ++presenceSequence,
        account_ids: ids,
      }),
    });
  },

  async listPresence(accountIds = []) {
    if (!apiBase || !remoteAuth) throw new Error('Management service authentication is not configured.');
    const ids = [...new Set((Array.isArray(accountIds) ? accountIds : [])
      .map(value => String(value || '').trim())
      .filter(Boolean))].slice(0, 1000);
    return apiRequest('/api/v1/chat/presence/batch', {
      method: 'POST',
      body: JSON.stringify({ account_ids: ids }),
    });
  },

  async clearPresence({ keepalive = false } = {}) {
    if (!apiBase || !remoteAuth) return null;
    return apiRequest('/api/v1/chat/presence/offline', {
      method: 'POST',
      keepalive,
      body: JSON.stringify({ session_id: presenceSessionId, sequence: ++presenceSequence }),
    });
  },

  async updateConversationNickname(conversationId, targetId, nickname) {
    if (!apiBase || !remoteAuth) throw new Error('Management service authentication is not configured.');
    const conversationKey = String(conversationId || '').trim();
    const memberKey = String(targetId || '').trim();
    if (!conversationKey || !memberKey) throw new Error('Conversation member information is missing.');
    const payload = await apiRequest(
      `/api/v1/chat/threads/${encodeURIComponent(conversationKey)}/nicknames/${encodeURIComponent(memberKey)}`,
      {
        method: 'PUT',
        body: JSON.stringify({ nickname: String(nickname || '').trim() }),
      },
    );
    return normalizeConversation(payload);
  },

  async searchUsers(query, { excludeUserId = '', signal } = {}) {
    const value = String(query || '').trim();
    if (!value) return [];
    if (apiBase && remoteAuth) {
      const directoryScope = captureDirectoryScope();
      const params = new URLSearchParams({ q: value, limit: '50' });
      if (excludeUserId) params.set('exclude_user_id', excludeUserId);
      const payload = await apiRequest(`/api/v1/chat/users?${params}`, { cache: 'no-store', signal });
      assertDirectoryScope(directoryScope);
      return accountsForActiveTenant(responseItems(payload).map(publicAccount))
        .filter(account => account?.id !== excludeUserId);
    }
    throw new Error('Management service authentication is not configured.');
  },

  async sendFriendRequest({ sender, recipient, note = '' }) {
    if (!sender?.id || !recipient?.id) throw new Error('Thong tin loi moi ket ban khong hop le.');
    if (!apiBase || !remoteAuth) throw new Error('Management service authentication is not configured.');
    return apiRequest('/api/v1/friend-request', {
      method: 'POST',
      body: JSON.stringify({
        recipient_id: recipient.id,
        note: String(note || '').trim().slice(0, 500),
      }),
    });
  },

  async respondFriendRequest({ request, responder, accepted }) {
    if (!request?.requestId || !responder?.id) throw new Error('Loi moi ket ban khong hop le.');
    if (!apiBase || !remoteAuth) throw new Error('Management service authentication is not configured.');
    return apiRequest(`/api/v1/friend-request/${encodeURIComponent(request.requestId)}`, {
      method: 'PUT',
      body: JSON.stringify({ accepted: Boolean(accepted) }),
    });
  },

  async listFriendRequests(userId, { signal, updatedSince = 0, cursor = '', limit = 100 } = {}) {
    if (!userId) return [];
    if (!apiBase || !remoteAuth) throw new Error('Management service authentication is not configured.');
    const scope = captureDirectoryScope();
    const params = new URLSearchParams({ limit: String(Math.min(100, Math.max(1, Number(limit) || 100))) });
    if (updatedSince) params.set('updated_since', String(Math.max(0, Number(updatedSince) || 0)));
    if (cursor) params.set('cursor', String(cursor));
    const payload = await apiRequest(`/api/v1/friend-request?${params}`, { cache: 'no-store', signal });
    assertDirectoryScope(scope);
    const records = responseItems(payload);
    records.nextCursor = responseNextCursor(payload);
    records.hasMore = Boolean(payload?.has_more ?? payload?.hasMore ?? records.nextCursor);
    return records;
  },

  async listConversations({ signal, cursor = '', limit = 100 } = {}) {
    if (!apiBase || !remoteAuth) throw new Error('Management service authentication is not configured.');
    const scope = captureDirectoryScope();
    const params = new URLSearchParams({ limit: String(Math.min(100, Math.max(1, Number(limit) || 100))) });
    if (cursor) params.set('cursor', String(cursor));
    const payload = await apiRequest(`/api/v1/conversation?${params.toString()}`, { signal, cache: 'no-store' });
    assertDirectoryScope(scope);
    const records = responseItems(payload);
    const conversations = records.map(normalizeConversation);
    return {
      conversations,
      groups: [],
      directs: [],
      nextCursor: responseNextCursor(payload),
      hasMore: Boolean(payload?.has_more ?? payload?.hasMore ?? responseNextCursor(payload)),
      total: Number.isFinite(Number(payload?.total)) ? Number(payload.total) : null,
    };
  },

  async searchConversationHistory(conversationId, filters = {}) {
    if (!apiBase || !remoteAuth) throw new Error('Management service authentication is not configured.');
    const request = async force => {
      const tinodeAuth = shouldRequestTinodeAuth(activeSession, force)
        ? await this.getFreshTinodeAuth({ force })
        : null;
      const body = {
        query: String(filters.query || '').trim(),
        sender_id: String(filters.senderId || filters.sender_id || '').trim(),
        from_date: String(filters.fromDate || filters.from_date || '').trim(),
        to_date: String(filters.toDate || filters.to_date || '').trim(),
        type: String(filters.type || 'all').trim(),
        limit: Math.min(200, Math.max(1, Number(filters.limit) || 100)),
        cursor: filters.cursor || null,
        tinode_token: tinodeAuth?.token || '',
      };
      return apiRequest(`/api/v1/conversation/${encodeURIComponent(conversationId)}/search`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
    };
    try {
      return await request(false);
    } catch (error) {
      if (!activeSession || !['TINODE_SEARCH_AUTH_FAILED', 'TINODE_TOKEN_REQUIRED'].includes(error?.code)) {
        throw error;
      }
      return request(true);
    }
  },

  async createConversation({ subject, isGroup = false, participantIds = [], properties = {} }) {
    if (!apiBase || !remoteAuth) throw new Error('Management service authentication is not configured.');
    const payload = await apiRequest('/api/v1/conversation', {
      method: 'POST',
      body: JSON.stringify({
        subject,
        is_group: isGroup,
        participant_ids: participantIds,
        properties,
      }),
    });
    return normalizeConversation(payload);
  },

  async addConversationParticipants(conversationId, participantIds = []) {
    if (!apiBase || !remoteAuth) throw new Error('Management service authentication is not configured.');
    // Chatmgt performs the Tinode add with the owner bridge credential. The
    // current member's browser token is not needed and may lack invite rights.
    const payload = await apiRequest(`/api/v1/conversation/${encodeURIComponent(conversationId)}/participants`, {
      method: 'POST',
      body: JSON.stringify({ participant_ids: participantIds }),
    });
    return normalizeConversation(payload);
  },

  async updateConversationParticipantApproval(conversationId, participantId, approved) {
    if (!apiBase || !remoteAuth) throw new Error('Management service authentication is not configured.');
    const payload = await apiRequest(
      `/api/v1/conversation/${encodeURIComponent(conversationId)}/participants/${encodeURIComponent(participantId)}/approval`,
      {
        method: 'PUT',
        body: JSON.stringify({ approved: Boolean(approved) }),
      },
    );
    return normalizeConversation(payload);
  },

  async updateConversationParticipantRole(conversationId, participantId, role) {
    if (!apiBase || !remoteAuth) throw new Error('Management service authentication is not configured.');
    const normalizedRole = String(role || '').trim().toUpperCase();
    if (!['ADMIN', 'MEMBER'].includes(normalizedRole)) {
      throw new Error('Vai trò phó nhóm không hợp lệ.');
    }
    const payload = await apiRequest(
      `/api/v1/conversation/${encodeURIComponent(conversationId)}/participants/${encodeURIComponent(participantId)}/role`,
      {
        method: 'PUT',
        body: JSON.stringify({ role: normalizedRole }),
      },
    );
    return normalizeConversation(payload);
  },

  async removeConversationParticipant(conversationId, participantId, { replacementId = '' } = {}) {
    if (!apiBase || !remoteAuth) throw new Error('Management service authentication is not configured.');
    const payload = await membershipApiRequest(
      `/api/v1/conversation/${encodeURIComponent(conversationId)}/participants/${encodeURIComponent(participantId)}`,
      'DELETE',
      replacementId ? { replacement_id: replacementId } : {},
    );
    return normalizeConversation(payload);
  },

  async deleteConversationForCurrentUser(conversationId, { replacementId = '' } = {}) {
    if (!apiBase || !remoteAuth) throw new Error('Management service authentication is not configured.');
    const path = `/api/v1/conversation/${encodeURIComponent(conversationId)}/self`;
    const body = replacementId ? { replacement_id: replacementId } : {};
    const request = tinodeToken => apiRequest(path, {
      method: 'DELETE',
      body: JSON.stringify({
        ...body,
        tinode_token: String(tinodeToken || '').trim(),
      }),
    });
    let payload;
    try {
      // Direct deletion and final-member group closure are authoritative in
      // Chatmgt and must not be blocked by a Tinode token refresh.
      payload = await request(activeSession?.tinodeAuth?.token || '');
    } catch (error) {
      if (!activeSession || !shouldRetryTinodeMembership(error)) throw error;
      const tinodeAuth = await this.getFreshTinodeAuth({ force: true });
      payload = await request(tinodeAuth?.token || '');
    }
    return normalizeConversation(payload);
  },

  async updateConversationNotifications(conversationId, mutedUntil) {
    if (!apiBase || !remoteAuth) throw new Error('Management service authentication is not configured.');
    const payload = await apiRequest(`/api/v1/conversation/${encodeURIComponent(conversationId)}/notification-settings`, {
      method: 'PUT',
      body: JSON.stringify({ muted_until: mutedUntil }),
    });
    return normalizeConversation(payload);
  },

  async listDirectBlockStates() {
    if (!apiBase || !remoteAuth) throw new Error('Management service authentication is not configured.');
    const payload = await apiRequest('/api/v1/conversation/direct-block-state');
    return responseItems(payload).map(record => ({
      conversationId: String(record?.conversationId || record?.conversation_id || ''),
      ...normalizeDirectMessageBlockState(record),
    })).filter(record => record.conversationId);
  },

  async updateDirectMessageBlock(conversationId, blocked) {
    if (!apiBase || !remoteAuth) throw new Error('Management service authentication is not configured.');
    const payload = await apiRequest(`/api/v1/conversation/${encodeURIComponent(conversationId)}/block`, {
      method: 'PUT',
      body: JSON.stringify({ blocked: Boolean(blocked) }),
    });
    return normalizeConversation(payload);
  },

  async updateConversationPin(conversationId, pinned) {
    if (!apiBase || !remoteAuth) throw new Error('Management service authentication is not configured.');
    const payload = await apiRequest(`/api/v1/conversation/${encodeURIComponent(conversationId)}/pin`, {
      method: 'PUT',
      body: JSON.stringify({ pinned: Boolean(pinned) }),
    });
    return normalizeConversation(payload);
  },

  async updateGroupSettings(conversationId, { name, settings, background } = {}) {
    if (!apiBase || !remoteAuth) throw new Error('Management service authentication is not configured.');
    const body = {};
    if (name !== undefined) body.name = String(name || '').trim();
    if (settings !== undefined) body.settings = normalizeGroupSettings(settings);
    if (background !== undefined) body.background = background;
    const payload = await apiRequest(`/api/v1/conversation/${encodeURIComponent(conversationId)}/group-settings`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    return normalizeConversation(payload);
  },

  async dissolveGroup(conversationId) {
    if (!apiBase || !remoteAuth) throw new Error('Management service authentication is not configured.');
    return apiRequest(`/api/v1/conversation/${encodeURIComponent(conversationId)}/dissolve`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },

  async updateGroupProfile(conversationId, profile = {}) {
    if (!apiBase || !remoteAuth) throw new Error('Management service authentication is not configured.');
    const body = {};
    if (profile.name !== undefined) body.name = String(profile.name || '').trim();
    if (profile.avatar !== undefined) body.avatar = String(profile.avatar || '').trim();
    const payload = await apiRequest(`/api/v1/conversation/${encodeURIComponent(conversationId)}/group-settings`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    return normalizeConversation(payload);
  },

  async prepareTinodeConversation(conversationId) {
    if (!apiBase || !remoteAuth) throw new Error('Management service authentication is not configured.');
    const payload = await apiRequest(`/api/v1/conversation/${encodeURIComponent(conversationId)}/tinode-prepare`, {
      method: 'POST',
    });
    return normalizeConversation(payload);
  },

  getTinodeTopic(userId, conversationId) {
    // In remote mode chatmgt is authoritative. Old browser bindings may point
    // at a topic created before the management conversation was persisted.
    if (apiBase && remoteAuth) return '';
    const bindings = readStorage(topicBindingsKey, {});
    return bindings[bindingKey(userId, conversationId)] || '';
  },

  async bindTinodeTopic(userId, conversationId, topicName, { avatarUrl = '' } = {}) {
    if (!conversationId || !topicName) return topicName;
    let bindingPayload = null;
    if (apiBase && remoteAuth) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(conversationId))) {
        throw new Error('Mã cuộc trò chuyện của chatmgt không hợp lệ.');
      }
      // Re-authenticate before a bind so a repaired Tinode UID from another
      // tab cannot leave this request carrying an old member token.
      const tinodeAuth = await this.getFreshTinodeAuth({ force: true });
      const tinodeToken = String(tinodeAuth?.token || '').trim();
      if (!tinodeToken) throw new Error('Chatmgt did not return a Tinode token.');
      bindingPayload = await apiRequest(`/api/v1/conversation/${encodeURIComponent(conversationId)}/tinode-topic`, {
        method: 'PUT',
        body: JSON.stringify({
          tinode_topic: topicName,
          tinode_token: tinodeToken,
          ...(String(avatarUrl || '').trim()
            ? { avatar: String(avatarUrl).trim() }
            : {}),
        }),
      });
    }
    const canonicalTopic = scalarText(
      bindingPayload?.tinodeTopic
        || bindingPayload?.tinode_topic
        || bindingPayload?.channel_thread_id,
    ) || String(topicName).trim();
    const bindings = readStorage(topicBindingsKey, {});
    bindings[bindingKey(userId, conversationId)] = canonicalTopic;
    writeStorage(topicBindingsKey, bindings);
    return bindingPayload
      ? { ...bindingPayload, tinodeTopic: canonicalTopic, tinode_topic: canonicalTopic }
      : canonicalTopic;
  },

  async enableTinodeChatbot(conversationId) {
    if (!apiBase || !remoteAuth) return false;
    await membershipApiRequest(
      `/api/v1/conversation/${encodeURIComponent(conversationId)}/tinode-chatbot`,
      'POST',
    );
    return true;
  },
};

function toLoginSession(account) {
  const auth = chatManagementService.getTinodeAuth();
  const tenant = account.tenant || null;
  return {
    uid: account.id,
    login: account.username,
    connection: account.connection || (auth?.token ? 'tinode' : 'management'),
    role: account.role,
    email: account.email,
    department: account.department,
    tenantId: account.tenantId || account.tenant_id,
    tenantName: tenant?.name || account.tenantName || account.tenant_name || '',
    tenant,
    tenantOptions: normalizeTenantOptions(account.tenantOptions || account.tenant_options),
    tinodeUid: account.tinodeUid || auth?.uid,
    tinodeAuth: auth,
    authSource: account.authSource || account.auth_source || '',
    accountManaged: isAccountManaged(account),
    mustChangePassword: Boolean(account.mustChangePassword || account.must_change_password),
    profile: {
      name: account.name,
      title: account.title || '',
      avatar: account.avatar || '',
    },
  };
}

export const managementAuthClient = {
  enabled: Boolean(apiBase && remoteAuth),
  accountUrl,
  mode: authMode,

  accountLoginUrl() {
    if (typeof window === 'undefined') return accountUrl;
    const continueUrl = new URL(window.location.href);
    continueUrl.searchParams.set('account_sso', '1');
    const loginUrl = new URL(`${accountUrl}/`);
    loginUrl.searchParams.set('continue', continueUrl.toString());
    return loginUrl.toString();
  },

  async login(credentials) {
    return toLoginSession(await chatManagementService.login(credentials));
  },

  async restoreSession() {
    return toLoginSession(await chatManagementService.restoreSession());
  },

  async logout() {
    return chatManagementService.logout({ throwOnError: true });
  },

  async requestPasswordReset(identity) {
    return chatManagementService.requestPasswordReset(identity);
  },

  async resetPassword(token, newPassword) {
    return chatManagementService.resetPassword(token, newPassword);
  },
};
