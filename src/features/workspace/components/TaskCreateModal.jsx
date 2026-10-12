import React, { useRef, useState } from 'react';
import useDialogFocusTrap from '../../../components/useDialogFocusTrap';

function initials(name) {
  return String(name || '?')
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map(part => part[0])
    .join('')
    .toUpperCase();
}

function AccountAvatar({ account, size = 24 }) {
  if (account?.avatar) {
    return <img src={account.avatar} alt={account.name || ''} className="picker-avatar-img" style={{ width: size, height: size }} />;
  }
  return <span className="picker-avatar-img fallback" style={{ width: size, height: size, fontSize: size * 0.4 }}>{initials(account?.name)}</span>;
}

export default function TaskCreateModal({
  isOpen,
  onClose,
  onSubmit,
  accounts = [],
  currentUser = {},
  copy = { t: text => text },
}) {
  const modalRef = useRef(null);
  const currentUserId = String(currentUser?.id || currentUser?.uid || '');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [groupName, setGroupName] = useState('Dự án chung');
  const [priority, setPriority] = useState('NORMAL');
  const [dueAt, setDueAt] = useState('');
  const [assigneeId, setAssigneeId] = useState(currentUserId);
  const [collaboratorIds, setCollaboratorIds] = useState([]);
  const [approverId, setApproverId] = useState('');
  const [subtasks, setSubtasks] = useState([]);
  const [subtaskInput, setSubtaskInput] = useState('');
  const [createChatGroup, setCreateChatGroup] = useState(true);
  const [saving, setSaving] = useState(false);

  // Search in member picker
  const [memberSearch, setMemberSearch] = useState('');

  useDialogFocusTrap(modalRef, isOpen, () => {
    if (!saving) onClose?.();
  });

  if (!isOpen) return null;

  // Shortcuts for due date
  const setQuickDue = type => {
    const date = new Date();
    date.setHours(18, 0, 0, 0);
    if (type === 'TODAY') {
      // today at 18:00
    } else if (type === 'TOMORROW') {
      date.setDate(date.getDate() + 1);
    } else if (type === 'THIS_FRIDAY') {
      const day = date.getDay();
      const diff = (5 - day + 7) % 7 || 7;
      date.setDate(date.getDate() + diff);
    } else if (type === 'NEXT_WEEK') {
      date.setDate(date.getDate() + 7);
    }
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    setDueAt(local.toISOString().slice(0, 16));
  };

  const handleAddSubtask = () => {
    const text = subtaskInput.trim();
    if (!text) return;
    setSubtasks([...subtasks, { id: String(Date.now()), title: text, completed: false }]);
    setSubtaskInput('');
  };

  const handleRemoveSubtask = id => {
    setSubtasks(subtasks.filter(s => s.id !== id));
  };

  const toggleCollaborator = id => {
    if (collaboratorIds.includes(id)) {
      setCollaboratorIds(collaboratorIds.filter(cId => cId !== id));
    } else {
      setCollaboratorIds([...collaboratorIds, id]);
    }
  };

  const handleSubmit = async event => {
    event.preventDefault();
    if (!title.trim() || saving) return;

    setSaving(true);
    try {
      // Construct participants list:
      // ASSIGNEE
      // COLLABORATORS
      // APPROVER
      const participants = [];
      if (assigneeId) {
        participants.push({ account_id: assigneeId, role: 'ASSIGNEE' });
      }
      collaboratorIds.forEach(cId => {
        if (cId !== assigneeId) {
          participants.push({ account_id: cId, role: 'COLLABORATOR' });
        }
      });
      if (approverId && approverId !== assigneeId && !collaboratorIds.includes(approverId)) {
        participants.push({ account_id: approverId, role: 'APPROVER' });
      }

      const isoDueAt = dueAt ? new Date(dueAt).toISOString() : null;

      const payload = {
        type: 'TASK',
        title: title.trim(),
        description: description.trim(),
        priority,
        visibility: 'COMPANY',
        status: 'TODO',
        due_at: isoDueAt,
        participants,
        properties: {
          group_name: groupName.trim() || 'Nhóm chung',
          source_conversation_name: groupName.trim() || 'Nhóm chung',
          checklist: subtasks.map(s => s.title),
          subtasks: subtasks.map(s => ({ id: s.id, title: s.title, completed: false })),
        },
        createChatGroup,
      };

      await onSubmit?.(payload);
      onClose?.();
    } finally {
      setSaving(false);
    }
  };

  const filteredAccounts = accounts.filter(acc => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      (acc.name || '').toLowerCase().includes(q) ||
      (acc.department || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="task-modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !saving) onClose?.(); }}>
      <form
        ref={modalRef}
        className="task-create-modal"
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-create-modal-title"
      >
        <header className="task-modal-header">
          <div className="task-modal-title-group">
            <span className="task-modal-eyebrow">
              <i className="fa-solid fa-list-check"></i> {copy.t('GIAO VIỆC & PHỐI HỢP')}
            </span>
            <h3 id="task-create-modal-title">{copy.t('Tạo công việc mới')}</h3>
          </div>
          <button
            type="button"
            className="task-modal-close"
            onClick={onClose}
            disabled={saving}
            aria-label={copy.t('Đóng')}
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </header>

        <div className="task-modal-scroll">
          {/* Tiêu đề & Nhóm */}
          <div className="modal-field">
            <label>
              <span>{copy.t('Tiêu đề công việc')} *</span>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder={copy.t('Ví dụ: Nâng cấp bảng tin Workspace, Gửi báo cáo doanh thu...')}
                required
                autoFocus
                maxLength={500}
              />
            </label>
          </div>

          <div className="modal-grid-2">
            <div className="modal-field">
              <label>
                <span>{copy.t('Dự án / Nhóm công việc')}</span>
                <input
                  type="text"
                  value={groupName}
                  onChange={e => setGroupName(e.target.value)}
                  placeholder={copy.t('Ví dụ: Kỹ thuật, Marketing, Vận hành...')}
                  maxLength={100}
                />
              </label>
            </div>

            <div className="modal-field">
              <label>
                <span>{copy.t('Mức độ ưu tiên')}</span>
                <select value={priority} onChange={e => setPriority(e.target.value)}>
                  <option value="LOW">{copy.t('Thấp')}</option>
                  <option value="NORMAL">{copy.t('Bình thường')}</option>
                  <option value="HIGH">{copy.t('Ưu tiên cao')}</option>
                  <option value="URGENT">{copy.t('Khẩn cấp 🚨')}</option>
                </select>
              </label>
            </div>
          </div>

          {/* Mô tả chi tiết */}
          <div className="modal-field">
            <label>
              <span>{copy.t('Mô tả / Yêu cầu chi tiết')}</span>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={3}
                placeholder={copy.t('Nội dung công việc, kết quả mong đợi...')}
                maxLength={10000}
              />
            </label>
          </div>

          {/* Phân công nhân sự: Người làm chính + Người cùng phối hợp + Người duyệt */}
          <div className="modal-assignment-section">
            <div className="modal-assignment-header">
              <strong>
                <i className="fa-solid fa-users-gear"></i> {copy.t('Phân công & Móc nối nhân sự')}
              </strong>
            </div>

            <div className="modal-grid-2">
              {/* Người làm chính (Single select) */}
              <div className="modal-field">
                <label>
                  <span>🎯 {copy.t('Người phụ trách chính')} *</span>
                  <select
                    value={assigneeId}
                    onChange={e => setAssigneeId(e.target.value)}
                  >
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} {acc.department ? `(${acc.department})` : ''}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {/* Người duyệt / Nghiệm thu */}
              <div className="modal-field">
                <label>
                  <span>📋 {copy.t('Người duyệt / Báo cáo cho')}</span>
                  <select
                    value={approverId}
                    onChange={e => setApproverId(e.target.value)}
                  >
                    <option value="">{copy.t('-- Mặc định người giao --')}</option>
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} {acc.department ? `(${acc.department})` : ''}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            {/* Người cùng phối hợp (Multi-select) */}
            <div className="modal-field">
              <span className="field-subheading">
                👥 {copy.t('Người cùng phối hợp')} ({collaboratorIds.length} {copy.t('người')})
              </span>
              <div className="modal-member-search">
                <i className="fa-solid fa-magnifying-glass"></i>
                <input
                  type="search"
                  placeholder={copy.t('Lọc danh sách đồng nghiệp...')}
                  value={memberSearch}
                  onChange={e => setMemberSearch(e.target.value)}
                />
              </div>

              <div className="collab-picker-grid">
                {filteredAccounts
                  .filter(acc => acc.id !== assigneeId)
                  .slice(0, 15)
                  .map(acc => {
                    const isSelected = collaboratorIds.includes(acc.id);
                    return (
                      <button
                        type="button"
                        key={acc.id}
                        className={`collab-chip ${isSelected ? 'selected' : ''}`}
                        onClick={() => toggleCollaborator(acc.id)}
                      >
                        <AccountAvatar account={acc} size={20} />
                        <span className="chip-name">{acc.name}</span>
                        {isSelected && <i className="fa-solid fa-check"></i>}
                      </button>
                    );
                  })}
              </div>
            </div>
          </div>

          {/* Thời hạn (Due date) & Phím tắt chọn nhanh */}
          <div className="modal-field">
            <div className="due-date-header">
              <span>⏰ {copy.t('Hạn hoàn thành (Deadline)')}</span>
              <div className="due-quick-btns">
                <button type="button" onClick={() => setQuickDue('TODAY')}>
                  {copy.t('Hôm nay')}
                </button>
                <button type="button" onClick={() => setQuickDue('TOMORROW')}>
                  {copy.t('Ngày mai')}
                </button>
                <button type="button" onClick={() => setQuickDue('THIS_FRIDAY')}>
                  {copy.t('Thứ 6')}
                </button>
                <button type="button" onClick={() => setQuickDue('NEXT_WEEK')}>
                  {copy.t('Tuần sau')}
                </button>
              </div>
            </div>
            <input
              type="datetime-local"
              value={dueAt}
              onChange={e => setDueAt(e.target.value)}
            />
          </div>

          {/* Checklist / Subtasks */}
          <div className="modal-field">
            <span className="field-subheading">
              📊 {copy.t('Checklist các đầu việc nhỏ (Subtasks)')}
            </span>
            <div className="subtask-input-row">
              <input
                type="text"
                placeholder={copy.t('Nhập đầu việc nhỏ và nhấn Thêm...')}
                value={subtaskInput}
                onChange={e => setSubtaskInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddSubtask();
                  }
                }}
              />
              <button
                type="button"
                className="btn-add-subtask"
                onClick={handleAddSubtask}
                disabled={!subtaskInput.trim()}
              >
                <i className="fa-solid fa-plus"></i> {copy.t('Thêm')}
              </button>
            </div>

            {subtasks.length > 0 && (
              <div className="subtasks-list">
                {subtasks.map((st, idx) => (
                  <div key={st.id} className="subtask-row-item">
                    <span className="subtask-idx">{idx + 1}.</span>
                    <span className="subtask-title-text">{st.title}</span>
                    <button
                      type="button"
                      className="btn-remove-subtask"
                      onClick={() => handleRemoveSubtask(st.id)}
                      title={copy.t('Xóa')}
                    >
                      <i className="fa-regular fa-trash-can"></i>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tùy chọn 1-Click Chat Group */}
          <div className="modal-field">
            <label className="checkbox-toggle-label">
              <input
                type="checkbox"
                checked={createChatGroup}
                onChange={e => setCreateChatGroup(e.target.checked)}
              />
              <span>
                💬 {copy.t('Tự động tạo hoặc kết nối nhóm chat thảo luận cho công việc này trên ViChat')}
              </span>
            </label>
          </div>
        </div>

        <footer className="task-modal-footer">
          <button
            type="button"
            className="btn-cancel"
            onClick={onClose}
            disabled={saving}
          >
            {copy.t('Hủy')}
          </button>
          <button
            type="submit"
            className="btn-submit"
            disabled={saving || !title.trim()}
          >
            <i className={`fa-solid ${saving ? 'fa-spinner fa-spin' : 'fa-check'}`}></i>
            <span>{saving ? copy.t('Đang tạo...') : copy.t('Tạo công việc')}</span>
          </button>
        </footer>
      </form>
    </div>
  );
}
