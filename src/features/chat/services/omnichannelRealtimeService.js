import { chatManagementService } from './chatManagementService';

let eventSource = null;
let reconnectTimer = null;
const listeners = new Set();
let isConnecting = false;

export function subscribeOmnichannelEvents(callback) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function notifyListeners(event) {
  listeners.forEach(callback => {
    try {
      callback(event);
    } catch (err) {
      console.warn('Error in omnichannel event listener:', err);
    }
  });
}

let consecutiveErrors = 0;
const MAX_CONSECUTIVE_ERRORS = 3;

export function startOmnichannelStream() {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') return;
  if (eventSource || isConnecting) return;
  if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) return;

  const apiBase = chatManagementService.apiBase || '';
  const tenantId = chatManagementService.tenantId || '';
  const streamUrl = `${apiBase}/api/v1/omnichannel/stream`;

  try {
    isConnecting = true;
    const url = new URL(streamUrl, window.location.origin);
    if (tenantId) url.searchParams.set('tenant_id', tenantId);

    const source = new EventSource(url.toString(), { withCredentials: true });
    eventSource = source;
    isConnecting = false;

    source.onopen = () => {
      consecutiveErrors = 0;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    source.addEventListener('message', e => {
      try {
        const data = JSON.parse(e.data);
        notifyListeners({ type: 'message', ...data });
      } catch {
        // ignore malformed
      }
    });

    source.addEventListener('agent_message', e => {
      try {
        const data = JSON.parse(e.data);
        notifyListeners({ type: 'agent_message', ...data });
      } catch {
        // ignore malformed
      }
    });

    source.addEventListener('status_change', e => {
      try {
        const data = JSON.parse(e.data);
        notifyListeners({ type: 'status_change', ...data });
      } catch {
        // ignore malformed
      }
    });

    source.onerror = () => {
      if (source) source.close();
      eventSource = null;
      isConnecting = false;
      consecutiveErrors += 1;
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        console.warn('[Omnichannel] SSE stream unavailable on server; utilizing adaptive polling.');
        return;
      }
      if (!reconnectTimer) {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          startOmnichannelStream();
        }, 10000);
      }
    };
  } catch {
    isConnecting = false;
    eventSource = null;
  }
}

export function stopOmnichannelStream() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
  isConnecting = false;
}
