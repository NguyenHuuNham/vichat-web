import React from 'react';

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

export default function PersonalCloudPanel({
  copy,
  available,
  files = [],
  total = null,
  hasMore = false,
  loadingMore = false,
  loading,
  uploading,
  notice,
  onUpload,
  onOpen,
  onDownload,
  onDelete,
  onLoadMore,
}) {
  return (
    <div className="personal-cloud-panel">
      <div className="personal-cloud-hero">
        <div className="personal-cloud-hero-icon"><i className="fa-solid fa-cloud" aria-hidden="true"></i></div>
        <div>
          <span className="personal-cloud-eyebrow">{copy.t('Lưu trữ riêng tư')}</span>
          <h3>{copy.t('Cloud của tôi')}</h3>
          <p>{copy.t('Chỉ bạn có thể xem và quản lý những file được lưu tại đây.')}</p>
        </div>
        <label className={`personal-cloud-upload-button ${!available || uploading ? 'disabled' : ''}`}>
          <i className={`fa-solid ${uploading ? 'fa-spinner fa-spin' : 'fa-cloud-arrow-up'}`} aria-hidden="true"></i>
          <span>{uploading ? copy.t('Đang tải lên...') : copy.t('Tải file lên')}</span>
          <input type="file" onChange={event => { const file = event.target.files?.[0]; if (file) onUpload(file); event.target.value = ''; }} disabled={!available || uploading} />
        </label>
      </div>

      {notice && <div className="personal-cloud-notice" role="status"><i className="fa-solid fa-circle-info" aria-hidden="true"></i><span>{copy.t(notice)}</span></div>}
      {!available && !notice && <div className="personal-cloud-notice"><i className="fa-solid fa-server" aria-hidden="true"></i><span>{copy.t('Cloud cá nhân cần kết nối Chatmgt và S3.')}</span></div>}

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
