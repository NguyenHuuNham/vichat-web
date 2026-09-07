export async function fetchTopicData(topic, query) {
  const result = await topic.getMeta({ what: 'data', data: query.data });
  await new Promise(resolve => setTimeout(resolve, 0));
  const metadataParts = String(query.what || '').split(' ').filter(part => part && part !== 'data');
  if (metadataParts.length > 0) {
    const { data: _data, ...metadata } = query;
    await topic.getMeta({ ...metadata, what: metadataParts.join(' ') });
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  return result;
}

export function createLatestHistoryLoader() {
  const requests = new Map();
  const load = async (topic, limit, retry = true) => {
    let request = requests.get(topic);
    if (!request) {
      request = { sequence: Number(topic.seq) || 0, limit, active: true };
      const query = topic.startMetaQuery().withData(undefined, undefined, limit);
      if (limit >= 1000) query.withDel(undefined, limit);
      else query.withLaterDel(limit);
      request.promise = fetchTopicData(topic, query.build()).finally(() => {
        if (requests.get(topic) === request) requests.delete(topic);
      });
      requests.set(topic, request);
    }
    const result = await request.promise;
    if (!request.active) throw new Error('Conversation history request cancelled.');
    const loadedSequence = Number(topic.maxMsgSeq?.()) || Number(topic.latestMessage?.()?.seq) || 0;
    const newGap = Number(topic.seq) > request.sequence && loadedSequence < Number(topic.seq);
    if (request.limit < limit || (retry && newGap)) return load(topic, limit, false);
    return result;
  };
  return {
    load,
    remove(topic) {
      const request = requests.get(topic);
      if (request) request.active = false;
      requests.delete(topic);
    },
    clear() {
      for (const request of requests.values()) request.active = false;
      requests.clear();
    },
  };
}

export function createConversationDelivery({ delay = 20 } = {}) {
  const entries = new Map();
  return {
    enqueue(key, callbacks) {
      const entry = entries.get(key) || { revision: 0, timer: null };
      entry.revision += 1;
      entry.callbacks = callbacks;
      entries.set(key, entry);
      if (entry.timer !== null) return;
      entry.timer = setTimeout(() => {
        entry.timer = null;
        const revision = entry.revision;
        const { snapshot, enrich, emit, isCurrent } = entry.callbacks;
        if (!isCurrent()) return;
        const conversation = snapshot();
        emit(conversation);
        Promise.resolve().then(() => enrich(conversation)).then(enriched => {
          if (entries.get(key) !== entry || entry.revision !== revision || !isCurrent()) return;
          emit(enriched);
        }).catch(() => {});
      }, delay);
    },
    clear() {
      for (const entry of entries.values()) clearTimeout(entry.timer);
      entries.clear();
    },
  };
}
