import React from 'react';

function initials(name) {
  return String(name || '?')
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map(part => part[0])
    .join('')
    .toUpperCase();
}

function MiniAvatar({ account, title, className = '' }) {
  if (account?.avatar) {
    return (
      <img
        src={account.avatar}
        alt={account.name || ''}
        title={title || account.name || ''}
        className={`task-card-avatar ${className}`}
      />
    );
  }
  return (
    <span
      className={`task-card-avatar fallback ${className}`}
      title={title || account?.name || ''}
    >
      {initials(account?.name)}
    </span>
  );
}

export default function TaskCard({
  task,
  isSelected = false,
  onSelect,
  onToggleComplete,
  onOpenChat,
  copy = { t: text => text },
}) {
  const isCompleted = task.status === 'DONE';
  const { dueStatus, subtaskStats, creator, assignee, collaborators, approver } = task;

  const handleCheckboxClick = event => {
    event.stopPropagation();
    onToggleComplete?.(task);
  };

  const handleChatClick = event => {
    event.stopPropagation();
    onOpenChat?.(task);
  };

  return (
    <article
      className={`task-card ${isSelected ? 'selected' : ''} ${isCompleted ? 'completed' : ''}`}
      onClick={() => onSelect?.(task)}
      role="button"
      tabIndex={0}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect?.(task);
        }
      }}
    >
      {/* Checkbox nhanh */}
      <button
        type="button"
        className={`task-card-checkbox ${isCompleted ? 'checked' : ''}`}
        onClick={handleCheckboxClick}
        aria-label={copy.t(isCompleted ? 'Đánh dấu chưa xong' : 'Đánh dấu hoàn thành')}
        title={copy.t(isCompleted ? 'Đánh dấu chưa xong' : 'Đánh dấu hoàn thành')}
      >
        {isCompleted && <i className="fa-solid fa-check"></i>}
      </button>

      {/* Nội dung công việc */}
      <div className="task-card-body">
        {/* Hàng trên: Nhóm việc & Mức ưu tiên */}
        <div className="task-card-header-row">
          <span className="task-card-group-badge">
            <i className="fa-regular fa-folder"></i>
            <span>{task.groupName}</span>
          </span>

          {task.priority === 'URGENT' && (
            <span className="task-priority-badge urgent">
              <i className="fa-solid fa-fire"></i> {copy.t('Khẩn cấp')}
            </span>
          )}
          {task.priority === 'HIGH' && (
            <span className="task-priority-badge high">
              <i className="fa-solid fa-arrow-up"></i> {copy.t('Ưu tiên cao')}
            </span>
          )}
        </div>

        {/* Tiêu đề & Mô tả */}
        <h4 className={`task-card-title ${isCompleted ? 'title-done' : ''}`}>
          {task.title}
        </h4>
        {task.description && (
          <p className="task-card-desc">{task.description}</p>
        )}

        {/* Tiến độ checklist con nếu có */}
        {subtaskStats?.total > 0 && (
          <div className="task-card-subtasks-row">
            <div className="task-card-subtask-bar">
              <div
                className="task-card-subtask-fill"
                style={{ width: `${subtaskStats.progress}%` }}
              ></div>
            </div>
            <span className="task-card-subtask-text">
              <i className="fa-regular fa-square-check"></i>
              {subtaskStats.completed}/{subtaskStats.total} ({subtaskStats.progress}%)
            </span>
          </div>
        )}

        {/* Khối móc nối nhân sự & hạn chót */}
        <div className="task-card-footer-row">
          <div className="task-card-people-badges">
            {/* Người giao việc */}
            {creator?.name && (
              <span className="task-person-badge creator" title={`${copy.t('Người giao việc')}: ${creator.name}`}>
                <MiniAvatar account={creator} />
                <span className="task-person-role-prefix">{copy.t('Giao')}:</span>
                <strong className="task-person-name">{creator.name}</strong>
              </span>
            )}

            {/* Người làm chính */}
            {assignee?.name && (
              <span className="task-person-badge assignee" title={`${copy.t('Phụ trách chính')}: ${assignee.name}`}>
                <MiniAvatar account={assignee} />
                <span className="task-person-role-prefix">{copy.t('Làm')}:</span>
                <strong className="task-person-name">{assignee.name}</strong>
              </span>
            )}

            {/* Nhóm cùng làm việc / phối hợp */}
            {collaborators && collaborators.length > 0 && (
              <div
                className="task-collabs-stack"
                title={`${copy.t('Cùng phối hợp')}: ${collaborators.map(c => c.name).join(', ')}`}
              >
                <span className="task-collabs-label">
                  <i className="fa-solid fa-user-group"></i>
                </span>
                <div className="task-collabs-avatars">
                  {collaborators.slice(0, 3).map((collab, idx) => (
                    <MiniAvatar
                      key={collab.id || idx}
                      account={collab}
                      className="stacked"
                    />
                  ))}
                  {collaborators.length > 3 && (
                    <span className="task-collabs-more">
                      +{collaborators.length - 3}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Người duyệt / Nghiệm thu */}
            {approver?.name && (
              <span className="task-person-badge approver" title={`${copy.t('Người duyệt')}: ${approver.name}`}>
                <i className="fa-solid fa-stamp"></i>
                <span>{approver.name}</span>
              </span>
            )}
          </div>

          <div className="task-card-meta-badges">
            {/* Hạn chót */}
            {dueStatus?.label && (
              <span className={`task-due-badge ${dueStatus.tone}`}>
                <i className={`fa-regular ${dueStatus.isDueToday ? 'fa-hourglass-half' : 'fa-clock'}`}></i>
                <span>{dueStatus.label}</span>
              </span>
            )}

            {/* Nút 1-Click Thảo Luận Chat */}
            <button
              type="button"
              className="task-chat-btn"
              onClick={handleChatClick}
              title={copy.t('Mở phòng chat thảo luận công việc này trên ViChat')}
              aria-label={copy.t('Thảo luận công việc')}
            >
              <i className="fa-regular fa-comment-dots"></i>
              <span>{copy.t('Thảo luận')}</span>
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
