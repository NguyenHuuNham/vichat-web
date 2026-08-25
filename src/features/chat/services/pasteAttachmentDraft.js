const IMAGE_FILE_PATTERN = /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)$/i;

export const MAX_PASTED_ATTACHMENTS = 100;

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
  if (itemFiles.length === 0) return listedFiles;

  const duplicateCounts = new Map();
  itemFiles.forEach(file => {
    const signature = [file.name, file.type, file.size, file.lastModified].join('|');
    duplicateCounts.set(signature, (duplicateCounts.get(signature) || 0) + 1);
  });
  const extraFiles = listedFiles.filter(file => {
    const signature = [file.name, file.type, file.size, file.lastModified].join('|');
    const duplicateCount = duplicateCounts.get(signature) || 0;
    if (duplicateCount <= 0) return true;
    duplicateCounts.set(signature, duplicateCount - 1);
    return false;
  });
  return [...itemFiles, ...extraFiles];
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
