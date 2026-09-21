import React, { useState } from 'react';

function formatSize(size) {
  const value = Number(size) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(value < 10 * 1024 ? 1 : 0)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(value < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
function fileIcon(file) {
  const mime = String(file?.mimeType || '').toLowerCase();
  if (mime.startsWith('image/')) return 'fa-file-image';
  if (mime.startsWith('video/')) return 'fa-file-video';
  if (mime.startsWith('audio/')) return 'fa-file-audio';
  if (mime === 'application/pdf') return 'fa-file-pdf';
  if (mime.includes('spreadsheet') || mime.includes('excel')) return 'fa-file-excel';
  if (mime.includes('word') || mime.includes('document')) return 'fa-file-word';
  if (mime.includes('zip') || mime.includes('compressed')) return 'fa-file-zipper';
  return 'fa-file-lines';
}

function formatMessageTime(timestamp) {
  const value = Number(timestamp);
  if (!Number.isFinite(value) || value <= 0) return '';
  try {
    return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(value * 1000));
  } catch {
    return '';
  }
}

export default function PersonalCloudPanel({
  copy,
  available,
  messages = [],
  messagesTotal = null,
  messagesHasMore = false,
  messagesLoading = false,
  messagesLoadingMore = false,
  messagesSending = false,
  files = [],
  total = null,
  hasMore = false,
  loadingMore = false,
  loading,
  uploading,
  onUpload,
  onOpen,
  onDownload,
  onDelete,
  onLoadMore,
  onLoadMoreMessages,
  onSendMessage,
  onDeleteMessage,
}) {
  const [draft, setDraft] = useState('');

  const submitMessage = async () => {
    const value = draft.trim();
    if (!value || messagesSending || !available) return;
    const sent = await onSendMessage?.(value);
    if (sent !== false) setDraft('');
  };

  const handleComposerKeyDown = event => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    submitMessage();
  };

  return (
    <div className="personal-cloud-panel">
      <div className="personal-cloud-hero">
        <div className="personal-cloud-hero-icon"><i className="fa-solid fa-cloud" aria-hidden="true"></i></div>
        <div>
          <span className="personal-cloud-eyebrow">{copy.t('Lưu trữ riêng tư')}</span>
          <h3>{copy.t('Cloud của tôi')}</h3>
          <p>{copy.t('Chỉ bạn có thể xem và quản lý file tại đây. Nhận mọi loại file, không có hạn mức ứng dụng.')}</p>
        </div>
        <label className={`personal-cloud-upload-button ${!available || uploading ? 'disabled' : ''}`}>
          <i className={`fa-solid ${uploading ? 'fa-spinner fa-spin' : 'fa-cloud-arrow-up'}`} aria-hidden="true"></i>
          <span>{uploading ? copy.t('Đang tải lên...') : copy.t('Tải file lên')}</span>
          <input type="file" multiple onChange={event => { const files = [...(event.target.files || [])]; if (files.length) onUpload(files); event.target.value = ''; }} disabled={!available || uploading} />
        </label>
      </div>

      {!available && <div className="personal-cloud-notice"><i className="fa-solid fa-server" aria-hidden="true"></i><span>{copy.t('Cloud cá nhân cần kết nối Chatmgt và S3.')}</span></div>}

      <section className="personal-cloud-messages" aria-label={copy.t('Tin nhắn riêng tư')}>
        <div className="personal-cloud-section-heading">
          <div><strong>{copy.t('Tin nhắn riêng tư')}</strong><small>{messagesTotal ?? messages.length} {copy.t('tin nhắn')}</small></div>
          <i className="fa-solid fa-message" title={copy.t('Chỉ mình tôi')} aria-label={copy.t('Chỉ mình tôi')}></i>
        </div>
        {messagesLoading ? (
          <div className="workspace-empty personal-cloud-message-empty"><i className="fa-solid fa-spinner fa-spin"></i><span>{copy.t('Đang tải...')}</span></div>
        ) : messages.length === 0 ? (
          <div className="workspace-empty personal-cloud-message-empty"><i className="fa-regular fa-message"></i><span>{copy.t('Chưa có tin nhắn riêng tư nào.')}</span></div>
        ) : (
          <div className="personal-cloud-message-list">
            {messages.map(message => (
              <article className="personal-cloud-message" key={message.id}>
                <div className="personal-cloud-message-bubble">
                  <p>{message.text}</p>
                  <time>{formatMessageTime(message.createdAt)}</time>
                </div>
                <button
                  type="button"
                  className="personal-cloud-message-delete"
                  title={copy.t('Xóa tin nhắn')}
                  aria-label={copy.t('Xóa tin nhắn')}
                  onClick={() => onDeleteMessage?.(message)}
                >
                  <i className="fa-regular fa-trash-can" aria-hidden="true"></i>
                </button>
              </article>
            ))}
          </div>
        )}
        {messagesHasMore && <button type="button" className="personal-cloud-load-more" onClick={onLoadMoreMessages} disabled={messagesLoadingMore}>
          <i className={`fa-solid ${messagesLoadingMore ? 'fa-spinner fa-spin' : 'fa-chevron-up'}`} aria-hidden="true"></i>
          {messagesLoadingMore ? copy.t('Đang tải thêm...') : copy.t('Tải tin nhắn cũ hơn')}
        </button>}
        <div className="personal-cloud-composer">
          <textarea
            value={draft}
            onChange={event => setDraft(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            placeholder={copy.t('Nhập tin nhắn riêng tư...')}
            aria-label={copy.t('Nhập tin nhắn riêng tư...')}
            rows={2}
            disabled={!available || messagesSending}
          />
          <button
            type="button"
            className="personal-cloud-send"
            onClick={submitMessage}
            disabled={!available || messagesSending || !draft.trim()}
            title={copy.t('Gửi tin nhắn')}
            aria-label={copy.t('Gửi tin nhắn')}
          >
            <i className={`fa-solid ${messagesSending ? 'fa-spinner fa-spin' : 'fa-paper-plane'}`} aria-hidden="true"></i>
          </button>
        </div>
      </section>

      <div className="personal-cloud-section-heading">
          <div><strong>{copy.t('File của tôi')}</strong><small>{total ?? files.length} {copy.t('file')}</small></div>
        <i className="fa-solid fa-lock" title={copy.t('Chỉ mình tôi')} aria-label={copy.t('Chỉ mình tôi')}></i>
      </div>

      {loading ? (
        <div className="workspace-empty personal-cloud-empty"><i className="fa-solid fa-spinner fa-spin"></i><span>{copy.t('Đang tải...')}</span></div>
      ) : files.length === 0 ? (
        <div className="workspace-empty personal-cloud-empty"><i className="fa-regular fa-folder-open"></i><span>{copy.t('Chưa có file riêng tư nào.')}</span></div>
      ) : (
        <div className="personal-cloud-file-list">
          {files.map(file => (
            <article className="personal-cloud-file" key={file.id}>
              <button type="button" className="personal-cloud-file-main" onClick={() => onOpen(file)}>
                <span className="personal-cloud-file-icon"><i className={`fa-solid ${fileIcon(file)}`} aria-hidden="true"></i></span>
                <span className="personal-cloud-file-copy"><strong title={file.fileName}>{file.fileName}</strong><small>{formatSize(file.size)} · {file.mimeType}</small></span>
              </button>
              <div className="personal-cloud-file-actions">
                <button type="button" title={copy.t('Mở file')} aria-label={`${copy.t('Mở file')} ${file.fileName}`} onClick={() => onOpen(file)}><i className="fa-regular fa-folder-open" aria-hidden="true"></i></button>
                <button type="button" title={copy.t('Tải xuống')} aria-label={`${copy.t('Tải xuống')} ${file.fileName}`} onClick={() => onDownload(file)}><i className="fa-solid fa-download" aria-hidden="true"></i></button>
                <button type="button" className="danger" title={copy.t('Xóa file')} aria-label={`${copy.t('Xóa file')} ${file.fileName}`} onClick={() => onDelete(file)}><i className="fa-regular fa-trash-can" aria-hidden="true"></i></button>
              </div>
            </article>
          ))}
        </div>
      )}
      {hasMore && <button type="button" className="personal-cloud-load-more" onClick={onLoadMore} disabled={loadingMore}>
        <i className={`fa-solid ${loadingMore ? 'fa-spinner fa-spin' : 'fa-chevron-down'}`} aria-hidden="true"></i>
        {loadingMore ? copy.t('Đang tải thêm...') : copy.t('Tải thêm')}
      </button>}
    </div>
  );
}
