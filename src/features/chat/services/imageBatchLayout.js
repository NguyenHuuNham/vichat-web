const IMAGE_FILE_EXTENSIONS = /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/i;

function textValue(value) {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

export function normalizeImageBatch(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const id = textValue(value.id || value.batchId || value.batch_id);
  const index = Number(value.index ?? value.batchIndex ?? value.batch_index);
  const size = Number(value.size ?? value.batchSize ?? value.batch_size);
  if (!id || id.length > 80 || !Number.isInteger(index) || index < 0 || !Number.isInteger(size) || size < 2 || size > 100) {
    return null;
  }
  return { id, index, size };
}

export function imageBatchLayoutClass(count) {
  const total = Number(count) || 0;
  if (total === 2) return 'two';
  if (total === 3) return 'three';
  if (total === 4) return 'four';
  if (total >= 5) return 'many';
  return 'single';
}

export function isBatchableImageMessage(message) {
  if (!message || message.type === 'sticker' || message.sticker || message.file?.ext === 'sticker') return false;
  const name = textValue(message.file?.name).toLowerCase();
  const mime = textValue(message.file?.mime).toLowerCase();
  return message.type === 'image' || mime.startsWith('image/') || IMAGE_FILE_EXTENSIONS.test(name);
}

function senderKey(message) {
  return textValue(
    message?.senderId
      || message?.raw?.from
      || message?.raw?.head?.['x-sender-id']
      || message?.sender,
  );
}

export function groupImageMessageEntries(messages, splitIndex = -1) {
  const source = Array.isArray(messages) ? messages : [];
  const entries = [];

  source.forEach((message, index) => {
    const batch = isBatchableImageMessage(message)
      ? normalizeImageBatch(message?.imageBatch || message?.image_batch)
      : null;
    const previous = entries.at(-1);
    const canAppend = Boolean(
      batch
      && previous?.kind === 'image-batch'
      && previous.batch.id === batch.id
      && previous.senderKey === senderKey(message)
      && previous.lastIndex === index - 1
      && previous.messages.length < batch.size
      && (splitIndex < 0 || !(previous.lastIndex < splitIndex && index >= splitIndex))
    );

    if (canAppend) {
      previous.messages.push(message);
      previous.lastIndex = index;
      return;
    }

    if (batch) {
      entries.push({
        kind: 'image-batch',
        key: `image-batch:${batch.id}:${message?.id || index}`,
        batch,
        senderKey: senderKey(message),
        messages: [message],
        index,
        lastIndex: index,
      });
      return;
    }

    entries.push({ kind: 'message', key: message?.id || `message:${index}`, message, index });
  });

  return entries.flatMap(entry => {
    if (entry.kind !== 'image-batch') return [entry];
    if (entry.messages.length === 1) {
      return [{ kind: 'message', key: entry.messages[0]?.id || entry.key, message: entry.messages[0], index: entry.index }];
    }
    return [{
      ...entry,
      messages: [...entry.messages].sort((first, second) => {
        const firstIndex = normalizeImageBatch(first?.imageBatch || first?.image_batch)?.index ?? 0;
        const secondIndex = normalizeImageBatch(second?.imageBatch || second?.image_batch)?.index ?? 0;
        return firstIndex - secondIndex;
      }),
    }];
  });
}
