import React, { useState, useEffect, useMemo } from 'react';

const STORAGE_KEY = '@vichat_quick_messages';

export const DEFAULT_QUICK_MESSAGES = [];

const LEGACY_MOCK_IDS = new Set([
  'qm_tra_gop',
  'qm_chao_hoi',
  'qm_ton_kho',
  'qm_xin_sdt',
  'qm_bao_gia',
  'qm_bao_hanh',
  'qm_hen_lien_he',
  'qm_cam_on',
]);

export default function QuickMessagesModal({
  isOpen,
  onClose,
  onSelectMessage,
  onSendMessage,
  copy = { t: s => s },
}) {
  const [messages, setMessages] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          // Normalize and filter out legacy hardcoded mocks
          const valid = parsed
            .filter(item => {
              if (typeof item === 'string') return Boolean(item.trim());
              return item && item.id && !LEGACY_MOCK_IDS.has(item.id);
            })
            .map((item, idx) => {
              if (typeof item === 'string') {
                return { id: `stored_${idx}`, title: item.slice(0, 30), content: item, category: 'Tùy chỉnh' };
              }
              return item;
            });
          return valid;
        }
      }
    } catch (_) {}
    return [];
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState('Tư vấn');

  useEffect(() => {
    if (!isOpen) {
      setIsAdding(false);
      setSearchQuery('');
    }
  }, [isOpen]);

  const saveToStorage = (updated) => {
    setMessages(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (_) {}
  };

  const handleAdd = (e) => {
    e.preventDefault();
    const contentTrimmed = newContent.trim();
    if (!contentTrimmed) return;
    const titleTrimmed = newTitle.trim() || contentTrimmed.slice(0, 30);
    const newItem = {
      id: `custom_${Date.now()}`,
      title: titleTrimmed,
      content: contentTrimmed,
      category: newCategory || 'Tùy chỉnh',
      isCustom: true,
    };
    const updated = [newItem, ...messages];
    saveToStorage(updated);
    setNewTitle('');
    setNewContent('');
    setIsAdding(false);
  };

  const handleDelete = (id, e) => {
    e.stopPropagation();
    const updated = messages.filter(m => m.id !== id);
    saveToStorage(updated);
  };

  const categories = useMemo(() => {
    const set = new Set();
    messages.forEach(m => {
      if (m.category) set.add(m.category);
    });
    return ['all', ...Array.from(set)];
  }, [messages]);

  const filteredMessages = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return messages.filter(m => {
      const matchCat = selectedCategory === 'all' || m.category === selectedCategory;
      const matchQuery = !q ||
        (m.title && m.title.toLowerCase().includes(q)) ||
        (m.content && m.content.toLowerCase().includes(q));
      return matchCat && matchQuery;
    });
  }, [messages, searchQuery, selectedCategory]);

  if (!isOpen) return null;

  return (
    <div className="quick-messages-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="quick-messages-title">
      <div className="quick-messages-modal" onClick={e => e.stopPropagation()}>
        <div className="quick-messages-header">
          <div className="quick-messages-title-wrap">
            <span className="quick-messages-icon"><i className="fa-solid fa-bolt"></i></span>
            <div>
              <h3 id="quick-messages-title" className="quick-messages-title">{copy.t('Tin nhắn mẫu phản hồi')}</h3>
              <p className="quick-messages-subtitle">{copy.t('Chọn tin nhắn soạn sẵn để phản hồi nhanh cho khách hàng')}</p>
            </div>
          </div>
          <button type="button" className="quick-messages-close-btn" onClick={onClose} aria-label={copy.t('Đóng')}>
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        {/* Toolbar: Tìm kiếm + Nút thêm */}
        <div className="quick-messages-toolbar">
          <div className="quick-messages-search-wrap">
            <i className="fa-solid fa-magnifying-glass"></i>
            <input
              type="text"
              placeholder={copy.t('Tìm kiếm tin nhắn mẫu...')}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              autoFocus
            />
            {searchQuery && (
              <button type="button" className="quick-messages-search-clear" onClick={() => setSearchQuery('')}>
                <i className="fa-solid fa-circle-xmark"></i>
              </button>
            )}
          </div>
          <button
            type="button"
            className={`quick-messages-add-trigger ${isAdding ? 'active' : ''}`}
            onClick={() => setIsAdding(!isAdding)}
          >
            <i className={`fa-solid ${isAdding ? 'fa-minus' : 'fa-plus'}`}></i>
            <span>{isAdding ? copy.t('Hủy thêm') : copy.t('Tạo mẫu mới')}</span>
          </button>
        </div>

        {/* Form thêm mẫu mới */}
        {isAdding && (
          <form className="quick-messages-add-form" onSubmit={handleAdd}>
            <div className="quick-messages-form-row">
              <input
                type="text"
                placeholder={copy.t('Tiêu đề mẫu (vd: Tư vấn khách hàng)')}
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                required
              />
              <select value={newCategory} onChange={e => setNewCategory(e.target.value)}>
                <option value="Tư vấn">{copy.t('Tư vấn')}</option>
                <option value="Chào hỏi">{copy.t('Chào hỏi')}</option>
                <option value="Thông tin">{copy.t('Thông tin')}</option>
                <option value="Khuyến mãi">{copy.t('Khuyến mãi')}</option>
                <option value="Bảo hành">{copy.t('Bảo hành')}</option>
                <option value="Chăm sóc">{copy.t('Chăm sóc')}</option>
                <option value="Tùy chỉnh">{copy.t('Tùy chỉnh')}</option>
              </select>
            </div>
            <textarea
              placeholder={copy.t('Nội dung tin nhắn mẫu...')}
              rows={3}
              value={newContent}
              onChange={e => setNewContent(e.target.value)}
              required
            />
            <div className="quick-messages-form-actions">
              <button type="button" className="btn-secondary" onClick={() => setIsAdding(false)}>
                {copy.t('Hủy')}
              </button>
              <button type="submit" className="btn-primary">
                <i className="fa-solid fa-check"></i>
                <span>{copy.t('Lưu tin nhắn mẫu')}</span>
              </button>
            </div>
          </form>
        )}

        {/* Category Filter Chips (chỉ hiện khi có ít nhất 1 category tùy chỉnh) */}
        {categories.length > 1 && (
          <div className="quick-messages-categories">
            {categories.map(cat => (
              <button
                type="button"
                key={cat}
                className={`quick-messages-category-chip ${selectedCategory === cat ? 'active' : ''}`}
                onClick={() => setSelectedCategory(cat)}
              >
                {cat === 'all' ? copy.t('Tất cả') : cat}
              </button>
            ))}
          </div>
        )}

        {/* Danh sách templates */}
        <div className="quick-messages-list">
          {messages.length === 0 ? (
            <div className="quick-messages-empty" style={{ padding: '40px 16px', textAlign: 'center' }}>
              <i className="fa-solid fa-bolt" style={{ fontSize: '32px', color: '#0068ff', opacity: 0.8, marginBottom: '8px' }}></i>
              <h4 style={{ margin: '0 0 6px 0', fontSize: '15px', fontWeight: 600, color: 'var(--text-primary, #1e293b)' }}>
                {copy.t('Chưa có tin nhắn mẫu nào')}
              </h4>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary, #64748b)', maxWidth: '360px', lineHeight: 1.5 }}>
                {copy.t('Bạn có thể tạo các tin nhắn soạn sẵn để phản hồi nhanh cho khách hàng.')}
              </p>
              {!isAdding && (
                <button
                  type="button"
                  className="quick-messages-add-trigger"
                  onClick={() => setIsAdding(true)}
                  style={{ marginTop: '16px', background: '#0068ff', color: '#fff', border: 'none' }}
                >
                  <i className="fa-solid fa-plus"></i>
                  <span>{copy.t('Tạo mẫu mới')}</span>
                </button>
              )}
            </div>
          ) : filteredMessages.length === 0 ? (
            <div className="quick-messages-empty">
              <i className="fa-regular fa-comment-dots"></i>
              <p>{copy.t('Không tìm thấy tin nhắn mẫu nào phù hợp.')}</p>
            </div>
          ) : (
            filteredMessages.map(item => (
              <div key={item.id} className="quick-message-item">
                <div className="quick-message-item-main" onClick={() => onSelectMessage && onSelectMessage(item.content)}>
                  <div className="quick-message-item-header">
                    <strong className="quick-message-item-title">{item.title}</strong>
                    {item.category && <span className="quick-message-badge">{item.category}</span>}
                  </div>
                  <p className="quick-message-item-content">{item.content}</p>
                </div>
                <div className="quick-message-item-actions">
                  <button
                    type="button"
                    className="quick-message-btn-insert"
                    title={copy.t('Chèn vào khung chat để chỉnh sửa')}
                    onClick={() => onSelectMessage && onSelectMessage(item.content)}
                  >
                    <i className="fa-solid fa-pen-to-square"></i>
                    <span>{copy.t('Chèn')}</span>
                  </button>
                  {onSendMessage && (
                    <button
                      type="button"
                      className="quick-message-btn-send"
                      title={copy.t('Gửi trực tiếp tin nhắn này')}
                      onClick={() => onSendMessage(item.content)}
                    >
                      <i className="fa-solid fa-paper-plane"></i>
                      <span>{copy.t('Gửi ngay')}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="quick-message-btn-delete"
                    title={copy.t('Xóa mẫu này')}
                    onClick={e => handleDelete(item.id, e)}
                  >
                    <i className="fa-solid fa-trash-can"></i>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
