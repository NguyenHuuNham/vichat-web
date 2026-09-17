const IMAGE_FILE_PATTERN = /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)$/i;

export const MAX_PASTED_ATTACHMENTS = 100;
export const PASTE_EVENT_DEDUPE_WINDOW_MS = 1000;
const CLIPBOARD_FILE_SAMPLE_BYTES = 64 * 1024;

function fileNameExtension(mime = '') {
  const normalized = String(mime || '').toLowerCase();
  const knownExtensions = {
    'image/jpeg': 'jpg',
    'image/svg+xml': 'svg',
    'text/plain': 'txt',
    'application/pdf': 'pdf',
  };
  return knownExtensions[normalized]
    || normalized.split('/')[1]?.split('+')[0]?.replace(/[^a-z0-9]/g, '')
    || 'bin';
}

function clipboardFileSignature(file) {
  const name = String(file?.name || '');
  const type = String(file?.type || '');
  const base = [name, type, file?.size];
  if (/^image\//i.test(type) || IMAGE_FILE_PATTERN.test(name)) return base.join('|');
  return [...base, file?.lastModified].join('|');
}

export function isPastedImageFile(file) {
  return /^image\//i.test(String(file?.type || ''))
    || IMAGE_FILE_PATTERN.test(String(file?.name || ''));
}

export function clipboardAttachmentFiles(clipboard) {
  if (!clipboard) return [];
  const itemFiles = Array.from(clipboard.items || [])
    .filter(item => item?.kind === 'file')
    .map(item => item.getAsFile?.())
    .filter(Boolean);
  const listedFiles = Array.from(clipboard.files || []).filter(Boolean);
  const seenReferences = new Set();
  const uniqueFiles = [];
  // Avoid appending the same File object exposed by both clipboard views.
  [...itemFiles, ...listedFiles].forEach(file => {
    if (seenReferences.has(file)) return;
    seenReferences.add(file);
    uniqueFiles.push(file);
  });
  return uniqueFiles;
}

export function clipboardAttachmentSignature(files) {
  return (Array.isArray(files) ? files : [])
    .filter(Boolean)
    .map(clipboardFileSignature)
    .join('||');
}

export function isDuplicateClipboardPaste(previous, current, now = Date.now()) {
  if (!previous || !current?.signature) return false;
  if (previous.target && current.target && previous.target !== current.target) return false;
  if (
    previous.conversationId
    && current.conversationId
    && String(previous.conversationId) !== String(current.conversationId)
  ) return false;
  const elapsed = Number(now) - Number(previous.timestamp);
  return previous.signature === current.signature
    && elapsed >= 0
    && elapsed <= PASTE_EVENT_DEDUPE_WINDOW_MS;
}

function updateClipboardHash(hash, bytes) {
  let next = hash;
  for (const byte of new Uint8Array(bytes)) {
    next ^= byte;
    next = Math.imul(next, 16777619);
  }
  return next >>> 0;
}

async function clipboardFileContentSignature(file) {
  const fallback = clipboardFileSignature(file);
  if (!isPastedImageFile(file)) return fallback;
  if (
    !file
    || typeof file.slice !== 'function'
    || typeof file.arrayBuffer !== 'function'
    || !Number.isFinite(Number(file.size))
  ) return fallback;

  try {
    const size = Math.max(0, Number(file.size));
    const sampleSize = Math.min(size, CLIPBOARD_FILE_SAMPLE_BYTES);
    let hash = 2166136261;
    const head = await file.slice(0, sampleSize).arrayBuffer();
    hash = updateClipboardHash(hash, head);
    if (size > sampleSize) {
      const tail = await file.slice(size - sampleSize, size).arrayBuffer();
      hash = updateClipboardHash(hash, tail);
    }
    return [String(file?.type || ''), size, hash].join('|');
  } catch {
    return fallback;
  }
}

export async function resolveClipboardAttachments(files) {
  const sourceFiles = Array.isArray(files) ? files.filter(Boolean) : [];
  const fingerprints = await Promise.all(sourceFiles.map(clipboardFileContentSignature));
  const seen = new Set();
  const uniqueFiles = [];
  const uniqueFingerprints = [];
  fingerprints.forEach((fingerprint, index) => {
    if (seen.has(fingerprint)) return;
    seen.add(fingerprint);
    uniqueFiles.push(sourceFiles[index]);
    uniqueFingerprints.push(fingerprint);
  });
  return {
    files: uniqueFiles,
    signature: uniqueFingerprints.join('||'),
  };
}

export function normalizePastedFile(file, index = 0, timestamp = Date.now()) {
  if (!file) return null;
  const mime = String(file.type || 'application/octet-stream');
  const currentName = String(file.name || '').trim();
  if (currentName) return file;
  const prefix = isPastedImageFile(file) ? 'pasted-image' : 'pasted-file';
  const name = `${prefix}-${timestamp}-${index + 1}.${fileNameExtension(mime)}`;
  if (typeof File !== 'function') return file;
  return new File([file], name, {
    type: mime,
    lastModified: Number(file.lastModified) || timestamp,
  });
}

export function pasteAttachmentSendPlan(attachments, caption = '', batchId = '') {
  const safeAttachments = Array.isArray(attachments) ? attachments.filter(item => item?.file) : [];
  const normalizedCaption = String(caption || '').trim();
  const allImages = safeAttachments.length > 1 && safeAttachments.every(item => item.isImage === true);
  const safeBatchId = allImages ? String(batchId || '').trim() : '';

  return safeAttachments.map((attachment, index) => ({
    attachment,
    caption: index === 0 ? normalizedCaption : '',
    imageBatch: safeBatchId
      ? { id: safeBatchId, index, size: safeAttachments.length }
      : null,
  }));
}

export function formatPasteAttachmentSize(size) {
  const bytes = Math.max(0, Number(size) || 0);
  if (bytes === 0) return '0 KB';
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}
