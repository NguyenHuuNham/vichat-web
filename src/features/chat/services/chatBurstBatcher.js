/**
 * High-performance micro-batch queue for handling rapid realtime message bursts.
 * Coalesces incoming burst events (e.g. from SSE or WebSockets) within a small
 * time window (default 40-50ms) into a single batch dispatch to minimize React
 * renders and avoid layout thrashing.
 */

export function createBurstBatcher({ delay = 50, onFlush } = {}) {
  let timer = null;
  const queue = [];
  const keyedMap = new Map();

  function flush() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }

    if (queue.length === 0 && keyedMap.size === 0) {
      return [];
    }

    let items;
    if (keyedMap.size > 0) {
      items = Array.from(keyedMap.values());
      keyedMap.clear();
      queue.length = 0;
    } else {
      items = queue.slice();
      queue.length = 0;
    }

    if (typeof onFlush === 'function') {
      try {
        onFlush(items);
      } catch (err) {
        if (typeof console !== 'undefined' && console.error) {
          console.error('[chatBurstBatcher] Error in onFlush callback:', err);
        }
      }
    }

    return items;
  }

  function schedule() {
    if (!timer) {
      timer = setTimeout(() => {
        timer = null;
        flush();
      }, delay);
    }
  }

  function enqueue(item) {
    if (item === undefined || item === null) return;
    queue.push(item);
    schedule();
  }

  function enqueueKeyed(key, item, mergeFn) {
    if (!key || item === undefined || item === null) return;
    const existing = keyedMap.get(key);
    if (existing !== undefined && typeof mergeFn === 'function') {
      keyedMap.set(key, mergeFn(existing, item));
    } else {
      keyedMap.set(key, item);
    }
    schedule();
  }

  function clear() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    queue.length = 0;
    keyedMap.clear();
  }

  function size() {
    return keyedMap.size > 0 ? keyedMap.size : queue.length;
  }

  function hasPending() {
    return queue.length > 0 || keyedMap.size > 0;
  }

  return {
    enqueue,
    enqueueKeyed,
    flush,
    clear,
    size,
    hasPending,
  };
}
