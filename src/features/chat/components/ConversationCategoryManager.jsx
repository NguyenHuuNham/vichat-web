import React, { useEffect, useMemo, useState } from 'react';

import { CONVERSATION_CATEGORY_COLORS } from '../services/conversationCategoryPolicy';

const EMPTY_DRAFT = Object.freeze({
  id: '',
  label: '',
  color: CONVERSATION_CATEGORY_COLORS[0],
  conversationIds: [],
});

function categoryErrorMessage(error, copy) {
  if (error === 'name_required') return copy.t('Vui lòng nhập tên thẻ phân loại.');
  if (error === 'name_duplicate') return copy.t('Tên thẻ phân loại đã tồn tại.');
  if (error === 'limit_reached') return copy.t('Bạn đã đạt giới hạn thẻ phân loại.');
  return error ? copy.t('Không thể lưu thẻ phân loại.') : '';
}

export default function ConversationCategoryManager({
  open,
  categories,
  assignments,
  conversations,
  copy,
  onClose,
  onSave,
  onDelete,
  onReorder,
}) {
  const [screen, setScreen] = useState('list');
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [notice, setNotice] = useState('');
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [conversationPickerOpen, setConversationPickerOpen] = useState(false);
  const [conversationSearch, setConversationSearch] = useState('');
  const [draggedCategoryId, setDraggedCategoryId] = useState('');

  useEffect(() => {
    if (!open) return;
    setScreen('list');
    setDraft(EMPTY_DRAFT);
    setNotice('');
    setColorPickerOpen(false);
    setConversationPickerOpen(false);
    setConversationSearch('');
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = event => {
      if (event.key !== 'Escape') return;
      if (screen === 'edit') {
        setScreen('list');
        setNotice('');
        setColorPickerOpen(false);
        setConversationPickerOpen(false);
      } else {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open, screen]);

  const filteredConversations = useMemo(() => {
    const query = conversationSearch.trim().toLocaleLowerCase('vi');
    if (!query) return conversations;
    return conversations.filter(conversation => (
      String(conversation.name || '').toLocaleLowerCase('vi').includes(query)
    ));
  }, [conversationSearch, conversations]);

  if (!open) return null;

  const openCreate = () => {
    setDraft({ ...EMPTY_DRAFT, conversationIds: [] });
    setNotice('');
    setColorPickerOpen(false);
    setConversationPickerOpen(false);
    setConversationSearch('');
    setScreen('edit');
  };

  const openEdit = category => {
    setDraft({
      id: category.id,
      label: category.label,
      color: category.color,
      conversationIds: Object.entries(assignments)
        .filter(([, categoryId]) => categoryId === category.id)
        .map(([conversationId]) => conversationId),
    });
    setNotice('');
    setColorPickerOpen(false);
    setConversationPickerOpen(false);
    setConversationSearch('');
    setScreen('edit');
  };

  const handleSave = event => {
    event.preventDefault();
    const result = onSave({
      ...draft,
      label: draft.label.trim(),
      conversationIds: [...new Set(draft.conversationIds)],
    });
    if (result?.error) {
      setNotice(categoryErrorMessage(result.error, copy));
      return;
    }
    setScreen('list');
    setNotice('');
  };

  const handleDelete = () => {
    if (!draft.id) return;
    if (!window.confirm(copy.t('Xóa thẻ này và bỏ thẻ khỏi các hội thoại đang gắn?'))) return;
    onDelete(draft.id);
    setScreen('list');
    setNotice('');
  };

  const toggleConversation = conversationId => {
    setDraft(previous => ({
      ...previous,
      conversationIds: previous.conversationIds.includes(conversationId)
        ? previous.conversationIds.filter(id => id !== conversationId)
        : [...previous.conversationIds, conversationId],
    }));
  };

  const handleDrop = targetCategoryId => {
    if (!draggedCategoryId || draggedCategoryId === targetCategoryId) return;
    const orderedIds = categories.map(category => category.id);
    const sourceIndex = orderedIds.indexOf(draggedCategoryId);
    const targetIndex = orderedIds.indexOf(targetCategoryId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    orderedIds.splice(targetIndex, 0, orderedIds.splice(sourceIndex, 1)[0]);
    onReorder(orderedIds);
    setDraggedCategoryId('');
  };

  return (
    <div className="conversation-category-manager-backdrop" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section
        className={`conversation-category-manager ${screen === 'edit' ? 'editor-open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="conversation-category-manager-title"
        onMouseDown={event => event.stopPropagation()}
      >
        {screen === 'list' ? (
          <>
            <header className="conversation-category-manager-header">
              <div>
                <span>{copy.t('PHÂN LOẠI HỘI THOẠI')}</span>
                <h2 id="conversation-category-manager-title">{copy.t('Quản lý thẻ phân loại')}</h2>
              </div>
              <button type="button" onClick={onClose} aria-label={copy.t('Đóng')}>
                <i className="fa-solid fa-xmark"></i>
              </button>
            </header>
            <div className="conversation-category-manager-body">
              <p className="conversation-category-manager-label">{copy.t('Danh sách thẻ phân loại')}</p>
              <div className="conversation-category-manager-list">
                {categories.map(category => (
                  <div
                    className="conversation-category-manager-row"
                    key={category.id}
                    draggable
                    onDragStart={() => setDraggedCategoryId(category.id)}
                    onDragEnd={() => setDraggedCategoryId('')}
                    onDragOver={event => event.preventDefault()}
                    onDrop={() => handleDrop(category.id)}
                  >
                    <span className="conversation-category-drag" title={copy.t('Kéo để sắp xếp')} aria-hidden="true">
                      <i className="fa-solid fa-grip-lines"></i>
                    </span>
                    <button type="button" className="conversation-category-manager-edit" onClick={() => openEdit(category)}>
                      <span className="conversation-category-shape" style={{ backgroundColor: category.color }}></span>
                      <span>{category.builtIn ? copy.t(category.label) : category.label}</span>
                      <small>{Object.values(assignments).filter(categoryId => categoryId === category.id).length} {copy.t('hội thoại')}</small>
                      <i className="fa-solid fa-pen" aria-hidden="true"></i>
                    </button>
                  </div>
                ))}
                {categories.length === 0 && (
                  <div className="conversation-category-manager-empty">
                    <i className="fa-solid fa-tags"></i>
                    <span>{copy.t('Chưa có thẻ phân loại nào.')}</span>
                  </div>
                )}
              </div>
              <button type="button" className="conversation-category-add" onClick={openCreate}>
                <i className="fa-solid fa-plus"></i>{copy.t('Thêm phân loại')}
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={handleSave}>
            <header className="conversation-category-manager-header editor">
              <button type="button" className="conversation-category-back" onClick={() => setScreen('list')} aria-label={copy.t('Quay lại')}>
                <i className="fa-solid fa-chevron-left"></i>
              </button>
              <div>
                <span>{copy.t(draft.id ? 'CHỈNH SỬA THẺ' : 'THẺ PHÂN LOẠI MỚI')}</span>
                <h2 id="conversation-category-manager-title">{copy.t(draft.id ? 'Sửa thẻ phân loại' : 'Thêm mới thẻ phân loại')}</h2>
              </div>
              <button type="button" onClick={onClose} aria-label={copy.t('Đóng')}>
                <i className="fa-solid fa-xmark"></i>
              </button>
            </header>
            <div className="conversation-category-editor-body">
              <label className="conversation-category-name-field">
                <span>{copy.t('Tên thẻ phân loại')}</span>
                <div>
                  <input
                    value={draft.label}
                    onChange={event => setDraft(previous => ({ ...previous, label: event.target.value.slice(0, 40) }))}
                    placeholder={copy.t('Nhập tên thẻ phân loại')}
                    maxLength={40}
                    autoFocus
                  />
                  <button
                    type="button"
                    className="conversation-category-color-trigger"
                    style={{ '--category-draft-color': draft.color }}
                    onClick={() => setColorPickerOpen(previous => !previous)}
                    aria-label={copy.t('Thay đổi màu thẻ')}
                    aria-expanded={colorPickerOpen}
                  >
                    <span className="conversation-category-shape"></span>
                  </button>
                  {colorPickerOpen && (
                    <div className="conversation-category-color-popover">
                      <strong>{copy.t('Thay đổi màu thẻ')}</strong>
                      <div>
                        {CONVERSATION_CATEGORY_COLORS.map(color => (
                          <button
                            type="button"
                            key={color}
                            className={draft.color === color ? 'selected' : ''}
                            style={{ backgroundColor: color }}
                            onClick={() => {
                              setDraft(previous => ({ ...previous, color }));
                              setColorPickerOpen(false);
                            }}
                            aria-label={color}
                          >
                            {draft.color === color && <i className="fa-solid fa-check"></i>}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </label>

              <section className="conversation-category-conversations" aria-labelledby="conversation-category-conversations-title">
                <div className="conversation-category-conversations-heading">
                  <div>
                    <strong id="conversation-category-conversations-title">{copy.t('Hội thoại được gắn thẻ')}</strong>
                    <small>{draft.conversationIds.length} {copy.t('hội thoại đã chọn')}</small>
                  </div>
                  <button type="button" onClick={() => setConversationPickerOpen(previous => !previous)}>
                    <i className={`fa-solid ${conversationPickerOpen ? 'fa-chevron-up' : 'fa-plus'}`}></i>
                    {copy.t(conversationPickerOpen ? 'Thu gọn' : 'Thêm hội thoại')}
                  </button>
                </div>
                <p>{copy.t('Mỗi hội thoại dùng một thẻ; chọn thẻ mới sẽ thay thẻ hiện tại.')}</p>
                {conversationPickerOpen && (
                  <div className="conversation-category-conversation-picker">
                    <label>
                      <i className="fa-solid fa-magnifying-glass"></i>
                      <input value={conversationSearch} onChange={event => setConversationSearch(event.target.value)} placeholder={copy.t('Tìm hội thoại')} />
                    </label>
                    <div>
                      {filteredConversations.map(conversation => {
                        const selected = draft.conversationIds.includes(conversation.id);
                        const currentCategory = categories.find(category => category.id === assignments[conversation.id]);
                        return (
                          <button
                            type="button"
                            className={selected ? 'selected' : ''}
                            key={conversation.id}
                            onClick={() => toggleConversation(conversation.id)}
                            role="checkbox"
                            aria-checked={selected}
                          >
                            <span className="conversation-category-conversation-icon"><i className={`fa-solid ${conversation.isGroup ? 'fa-user-group' : 'fa-user'}`}></i></span>
                            <span className="conversation-category-conversation-copy">
                              <strong>{conversation.name}</strong>
                              <small>{currentCategory ? `${copy.t('Đang gắn')}: ${currentCategory.builtIn ? copy.t(currentCategory.label) : currentCategory.label}` : copy.t('Chưa phân loại')}</small>
                            </span>
                            <span className="conversation-category-checkbox">{selected && <i className="fa-solid fa-check"></i>}</span>
                          </button>
                        );
                      })}
                      {filteredConversations.length === 0 && <p className="conversation-category-picker-empty">{copy.t('Không tìm thấy hội thoại phù hợp.')}</p>}
                    </div>
                  </div>
                )}
              </section>

              {notice && <div className="conversation-category-notice" role="alert"><i className="fa-solid fa-circle-exclamation"></i>{notice}</div>}
            </div>
            <footer className="conversation-category-editor-footer">
              {draft.id ? (
                <button type="button" className="conversation-category-delete" onClick={handleDelete}>
                  <i className="fa-regular fa-trash-can"></i>{copy.t('Xóa thẻ')}
                </button>
              ) : <span></span>}
              <div>
                <button type="button" className="btn-secondary" onClick={() => setScreen('list')}>{copy.t('Hủy')}</button>
                <button type="submit" className="btn-primary" disabled={!draft.label.trim()}>
                  <i className="fa-solid fa-check"></i>{copy.t(draft.id ? 'Lưu thay đổi' : 'Thêm phân loại')}
                </button>
              </div>
            </footer>
          </form>
        )}
      </section>
    </div>
  );
}
