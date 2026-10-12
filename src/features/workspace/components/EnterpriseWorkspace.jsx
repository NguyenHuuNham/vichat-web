import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useDialogFocusTrap from '../../../components/useDialogFocusTrap';
import {
  ENTERPRISE_STATUSES,
  ENTERPRISE_TYPES,
  PARTICIPANT_ROLE_LABELS,
  enterpriseWorkspaceService,
  filterWorkspaceTasks,
  formatWorkspaceDate,
  groupWorkspaceTasks,
  mergeWorkspaceProperties,
  normalizeTaskExtended,
  workspaceStatusLabel,
  workspaceTypeMeta,
} from '../services/enterpriseWorkspaceService';
import TaskCard from './TaskCard';
import TaskCreateModal from './TaskCreateModal';
import CompanyStaffMatrixView from './CompanyStaffMatrixView';
import './enterpriseWorkspace.css';

const INITIAL_STATUS = {
  TASK: 'TODO', ANNOUNCEMENT: 'PUBLISHED', APPROVAL: 'PENDING', TICKET: 'OPEN',
  WIKI: 'DRAFT', EVENT: 'SCHEDULED', INTEGRATION: 'ACTIVE',
};

const PARTICIPANT_ROLE = {
  TASK: 'ASSIGNEE', ANNOUNCEMENT: 'RECIPIENT', APPROVAL: 'APPROVER', TICKET: 'ASSIGNEE',
  WIKI: 'EDITOR', EVENT: 'ATTENDEE', INTEGRATION: 'OWNER',
};

const ACTION_LABELS = {
  START: ['Bắt đầu', 'fa-play'], COMPLETE: ['Hoàn tất', 'fa-circle-check'], REOPEN: ['Mở lại', 'fa-rotate-left'],
  ACKNOWLEDGE: ['Đã đọc và xác nhận', 'fa-check-double'], APPROVE: ['Phê duyệt', 'fa-thumbs-up'],
  REJECT: ['Từ chối', 'fa-thumbs-down'], RESOLVE: ['Đã xử lý', 'fa-screwdriver-wrench'], CLOSE: ['Đóng', 'fa-lock'],
  PUBLISH: ['Phát hành', 'fa-paper-plane'], ARCHIVE: ['Lưu trữ', 'fa-box-archive'],
  RSVP_ATTENDING: ['Sẽ tham gia', 'fa-calendar-check'], RSVP_MAYBE: ['Có thể tham gia', 'fa-circle-question'],
  RSVP_DECLINED: ['Không tham gia', 'fa-calendar-xmark'], CANCEL: ['Hủy', 'fa-ban'],
  PAUSE: ['Tạm dừng', 'fa-pause'], RESUME: ['Kích hoạt', 'fa-bolt'],
};

const PRIORITY_LABELS = {
  LOW: 'Thấp', NORMAL: 'Bình thường', HIGH: 'Cao', URGENT: 'Khẩn cấp',
};

const PARTICIPANT_STATE_LABELS = {
  ACTIVE: 'Đang hoạt động', PENDING: 'Đang chờ', ACCEPTED: 'Đã chấp nhận',
  DECLINED: 'Đã từ chối', COMPLETED: 'Đã hoàn tất',
};

const ACTIVITY_LABELS = {
  COMMENT: 'Bình luận', CREATE: 'Tạo mới', UPDATE: 'Cập nhật', DELETE: 'Xóa',
};

function emptyForm(type = 'TASK', userId = '') {
  return {
    id: '', type, title: '', description: '', status: INITIAL_STATUS[type], priority: 'NORMAL',
    visibility: 'COMPANY', ownerId: userId, dueAt: '', startsAt: '', endsAt: '', participantIds: [], participantRoles: {},
    category: '', location: '', meetingUrl: '', provider: '', endpoint: '', requestKind: '',
    requiresAck: type === 'ANNOUNCEMENT', pinned: false, allDay: false, syncDirection: 'BIDIRECTIONAL', tags: '',
    sourceConversationName: '', sourceMessagePreview: '', conversationId: '', sourceMessageRef: '',
    originalProperties: {}, version: null,
  };
}

function toLocalInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function fromLocalInput(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function initials(name) {
  return String(name || '?').trim().split(/\s+/).slice(-2).map(part => part[0]).join('').toUpperCase();
}

function Avatar({ account, small = false }) {
  const className = 'enterprise-avatar' + (small ? ' small' : '');
  return account?.avatar
    ? <img className={className} src={account.avatar} alt="" />
    : <span className={className + ' fallback'}>{initials(account?.name || account?.fullName)}</span>;
}

function typeCanCreate(type, isAdmin) {
  return !['ANNOUNCEMENT', 'INTEGRATION'].includes(type) || isAdmin;
}

function localizedWorkspaceValue(value, labels, copy) {
  return copy.t(labels[value] || value || 'Chưa xác định');
}

function propertiesForForm(form) {
  if (form.type === 'TASK') return { source_conversation_name: form.sourceConversationName };
  if (form.type === 'ANNOUNCEMENT') return { pinned: form.pinned, requires_ack: form.requiresAck };
  if (form.type === 'APPROVAL') return { request_kind: form.requestKind };
  if (form.type === 'TICKET') return { category: form.category };
  if (form.type === 'WIKI') return { category: form.category, tags: form.tags.split(',').map(tag => tag.trim()).filter(Boolean) };
  if (form.type === 'EVENT') return { location: form.location, meeting_url: form.meetingUrl, all_day: form.allDay };
  return { provider: form.provider, endpoint: form.endpoint, sync_direction: form.syncDirection };
}

function formForItem(item, userId) {
  const properties = item.properties || {};
  return {
    ...emptyForm(item.type, userId),
    id: item.id,
    title: item.title,
    description: item.description,
    status: item.status,
    priority: item.priority,
    visibility: item.visibility,
    ownerId: item.ownerId || userId,
    dueAt: toLocalInput(item.dueAt),
    startsAt: toLocalInput(item.startsAt),
    endsAt: toLocalInput(item.endsAt),
    participantIds: item.participants.map(participant => participant.accountId),
    participantRoles: Object.fromEntries(item.participants.map(participant => [participant.accountId, participant.role])),
    category: properties.category || '',
    location: properties.location || '',
    meetingUrl: properties.meeting_url || '',
    provider: properties.provider || '',
    endpoint: properties.endpoint || '',
    requestKind: properties.request_kind || '',
    requiresAck: Boolean(properties.requires_ack),
    pinned: Boolean(properties.pinned),
    allDay: Boolean(properties.all_day),
    syncDirection: properties.sync_direction || 'BIDIRECTIONAL',
    tags: Array.isArray(properties.tags) ? properties.tags.join(', ') : '',
    sourceConversationName: properties.source_conversation_name || '',
    sourceMessagePreview: properties.source_message_preview || '',
    conversationId: item.conversationId || '',
    sourceMessageRef: item.sourceMessageRef || '',
    originalProperties: properties,
    version: item.version,
  };
}

function itemPayload(form, editing) {
  const payload = {
    type: form.type,
    title: form.title.trim(),
    description: form.description.trim(),
    priority: form.priority,
    visibility: form.visibility,
    owner_id: form.ownerId || undefined,
    due_at: fromLocalInput(form.dueAt),
    starts_at: fromLocalInput(form.startsAt),
    ends_at: fromLocalInput(form.endsAt),
    conversation_id: form.conversationId || null,
    source_message_ref: form.sourceMessageRef || null,
    properties: mergeWorkspaceProperties(form.originalProperties, propertiesForForm(form)),
    participants: form.participantIds.map(accountId => ({
      account_id: accountId,
      role: form.participantRoles?.[accountId] || PARTICIPANT_ROLE[form.type],
    })),
  };
  if (!editing) payload.status = form.status;
  else payload.version = form.version;
  return payload;
}

function FormField({ label, wide = false, children }) {
  return <label className={wide ? 'wide' : ''}><span>{label}</span>{children}</label>;
}

export default function EnterpriseWorkspace({
  user,
  accounts = [],
  copy = { t: value => value, locale: 'vi-VN' },
  taskSeed,
  onTaskSeedConsumed,
  onError,
  requestAppConfirmation = () => Promise.resolve(false),
  onOpenConversation,
}) {
  const userId = String(user?.id || user?.uid || '');
  const isAdmin = ['admin', 'owner', 'superadmin'].includes(String(user?.role || '').toLowerCase());

  // View modes: 'MY_WORK' | 'COMPANY_MATRIX'
  const [viewMode, setViewMode] = useState('MY_WORK');

  // Navigation module or task scope:
  // When activeType is 'TASK', taskScope determines the left filter (TODAY, ASSIGNED, COLLABORATING, CREATED, ALL, COMPLETED)
  const [activeType, setActiveType] = useState('TASK');
  const [taskScope, setTaskScope] = useState('TODAY');
  const [taskStatusFilter, setTaskStatusFilter] = useState('ALL'); // 'ALL' | 'ONGOING' | 'COMPLETED'
  const [taskGroupBy, setTaskGroupBy] = useState('DUE_DATE'); // 'DUE_DATE' | 'GROUP' | 'PRIORITY' | 'NONE'

  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [actionBusy, setActionBusy] = useState('');
  const [comment, setComment] = useState('');
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Advanced Task Create Modal
  const [isTaskCreateModalOpen, setIsTaskCreateModalOpen] = useState(false);

  const requestGenerationRef = useRef(0);
  const requestControllerRef = useRef(null);
  const nextCursorRef = useRef(null);
  const selectedItemIdRef = useRef('');
  const loadingMoreRef = useRef(false);
  const detailGenerationRef = useRef(0);
  const formDialogRef = useRef(null);

  useDialogFocusTrap(formDialogRef, Boolean(form), () => {
    if (!saving) setForm(null);
  });

  useEffect(() => {
    selectedItemIdRef.current = selectedItem?.id || '';
  }, [selectedItem?.id]);

  const reportError = useCallback(error => {
    const message = copy.t(error?.message || 'Không thể tải Enterprise Workspace.');
    setNotice(message);
    onError?.(message);
  }, [copy, onError]);

  const refresh = useCallback(async ({ background = false, append = false } = {}) => {
    if (append && (loadingMoreRef.current || !nextCursorRef.current)) return;
    if (append) {
      loadingMoreRef.current = true;
      setLoadingMore(true);
    } else {
      loadingMoreRef.current = false;
      setLoadingMore(false);
      nextCursorRef.current = null;
      setNextCursor(null);
      setHasMore(false);
    }
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    const generation = ++requestGenerationRef.current;
    if (!background && !append) setLoading(true);
    try {
      const result = await enterpriseWorkspaceService.listItems({
        limit: 100,
        q: query.trim(),
        ...(append && nextCursorRef.current ? { cursor: nextCursorRef.current } : {}),
        signal: controller.signal,
      });
      if (generation !== requestGenerationRef.current || controller.signal.aborted) return;
      setItems(previous => {
        if (!append && !background) return result.items;
        const byId = new Map(previous.map(item => [item.id, item]));
        result.items.forEach(item => byId.set(item.id, item));
        return [...byId.values()];
      });
      setSummary(result.summary);
      if (!background || append) {
        nextCursorRef.current = result.nextCursor;
        setNextCursor(result.nextCursor);
        setHasMore(result.hasMore);
      }
      if (!background || query.trim()) setNotice('');
      if (selectedItemIdRef.current) {
        const selected = await enterpriseWorkspaceService.getItem(selectedItemIdRef.current, { signal: controller.signal });
        if (generation === requestGenerationRef.current && !controller.signal.aborted) setSelectedItem(selected);
      }
    } catch (error) {
      if (error?.name !== 'AbortError' && generation === requestGenerationRef.current) reportError(error);
    } finally {
      if (generation === requestGenerationRef.current) setLoading(false);
      if (append) {
        loadingMoreRef.current = false;
        if (generation === requestGenerationRef.current) setLoadingMore(false);
      }
    }
  }, [query, reportError]);

  useEffect(() => () => {
    requestControllerRef.current?.abort();
    requestGenerationRef.current += 1;
  }, [userId, user?.tenantId, user?.tenant_id]);

  useEffect(() => {
    const delay = window.setTimeout(() => refresh(), query.trim() ? 250 : 0);
    return () => window.clearTimeout(delay);
  }, [query, refresh]);

  const loadMore = useCallback(() => {
    if (hasMore && nextCursor && !loading && !loadingMore) void refresh({ append: true });
  }, [hasMore, loading, loadingMore, nextCursor, refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'hidden') refresh({ background: true });
    }, 15000);
    const onFocus = () => refresh({ background: true });
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  useEffect(() => {
    if (!taskSeed) return;
    const seeded = emptyForm('TASK', userId);
    seeded.title = taskSeed.title || `${copy.t('Công việc từ')} ${taskSeed.conversationName || copy.t('cuộc trò chuyện')}`;
    seeded.description = taskSeed.preview || '';
    seeded.sourceConversationName = taskSeed.conversationName || '';
    seeded.sourceMessagePreview = taskSeed.preview || '';
    seeded.conversationId = taskSeed.conversationId || '';
    seeded.sourceMessageRef = taskSeed.messageRef || '';
    setActiveType('TASK');
    setForm(seeded);
    onTaskSeedConsumed?.();
  }, [copy, taskSeed, userId, onTaskSeedConsumed]);

  // Extended tasks normalized with collaboration & due status
  const normalizedTasks = useMemo(() => {
    return items
      .filter(item => item.type === 'TASK')
      .map(item => normalizeTaskExtended(item, accounts, userId));
  }, [items, accounts, userId]);

  // Tasks counts for left subnav badges
  const taskCounts = useMemo(() => {
    const today = normalizedTasks.filter(t => t.isMyTodayTask).length;
    const assigned = normalizedTasks.filter(t => t.isAssignedToMe && t.status !== 'DONE' && t.status !== 'CANCELLED').length;
    const collaborating = normalizedTasks.filter(t => t.isCollaboratingWithMe && t.status !== 'DONE' && t.status !== 'CANCELLED').length;
    const created = normalizedTasks.filter(t => t.isCreatedByMe).length;
    const completed = normalizedTasks.filter(t => t.status === 'DONE' || t.status === 'CANCELLED').length;
    const total = normalizedTasks.length;
    return { today, assigned, collaborating, created, completed, total };
  }, [normalizedTasks]);

  // Filtered tasks for current board view
  const currentFilteredTasks = useMemo(() => {
    return filterWorkspaceTasks(normalizedTasks, {
      scope: taskScope,
      statusFilter: taskStatusFilter,
      query: query.trim(),
    });
  }, [normalizedTasks, taskScope, taskStatusFilter, query]);

  // Grouped tasks
  const groupedTasks = useMemo(() => {
    return groupWorkspaceTasks(currentFilteredTasks, taskGroupBy);
  }, [currentFilteredTasks, taskGroupBy]);

  // For non-task enterprise types (Wiki, Announcements, etc.)
  const filteredNonTaskItems = useMemo(() => {
    if (activeType === 'TASK' || activeType === 'OVERVIEW') return [];
    return items.filter(item => item.type === activeType);
  }, [activeType, items]);

  const typeOptions = ENTERPRISE_TYPES.filter(type => type.value !== 'INTEGRATION' || isAdmin);

  const openCreate = type => {
    if (type === 'TASK') {
      setIsTaskCreateModalOpen(true);
    } else {
      setForm(emptyForm(type, userId));
    }
    setNotice('');
  };

  const openItem = async item => {
    const generation = ++detailGenerationRef.current;
    selectedItemIdRef.current = item.id;
    setSelectedItem(item);
    try {
      const detail = await enterpriseWorkspaceService.getItem(item.id);
      if (generation === detailGenerationRef.current && selectedItemIdRef.current === item.id) setSelectedItem(detail);
    } catch (error) {
      if (generation === detailGenerationRef.current && selectedItemIdRef.current === item.id) reportError(error);
    }
  };

  const reloadAfterConflict = async itemId => {
    try {
      const latest = await enterpriseWorkspaceService.getItem(itemId);
      if (selectedItemIdRef.current === itemId) setSelectedItem(latest);
      if (form?.id === itemId) setForm(formForItem(latest, userId));
      setNotice(copy.t('Mục này đã được thay đổi. Đã tải bản mới nhất; hãy kiểm tra rồi lưu lại.'));
    } catch (reloadError) {
      reportError(reloadError);
    }
  };

  const saveItem = async event => {
    event.preventDefault();
    if (!form?.title.trim()) return;
    setSaving(true);
    const editing = Boolean(form.id);
    try {
      const saved = editing
        ? await enterpriseWorkspaceService.updateItem(form.id, itemPayload(form, true))
        : await enterpriseWorkspaceService.createItem(itemPayload(form, false));
      setForm(null);
      setSelectedItem(await enterpriseWorkspaceService.getItem(saved.id));
      setNotice(copy.t(editing ? 'Đã cập nhật nội dung.' : 'Đã tạo mục công việc mới.'));
      await refresh({ background: true });
    } catch (error) {
      if (error?.status === 409 && editing) await reloadAfterConflict(form.id);
      else reportError(error);
    } finally {
      setSaving(false);
    }
  };

  // Submit from TaskCreateModal
  const handleCreateTaskFromModal = async payload => {
    try {
      const created = await enterpriseWorkspaceService.createItem(payload);
      setNotice(copy.t('Đã giao công việc thành công.'));
      await refresh({ background: true });
      if (payload.createChatGroup && onOpenConversation) {
        handleOpenChat(normalizeTaskExtended(created, accounts, userId));
      }
    } catch (error) {
      reportError(error);
    }
  };

  // Toggle complete nhanh từ TaskCard
  const handleToggleComplete = async task => {
    const isCompleted = task.status === 'DONE';
    const action = isCompleted ? 'REOPEN' : 'COMPLETE';
    setActionBusy(action);
    try {
      await enterpriseWorkspaceService.applyAction(task.id, action, '', task.version);
      await refresh({ background: true });
    } catch (error) {
      if (error?.status === 409) await reloadAfterConflict(task.id);
      else reportError(error);
    } finally {
      setActionBusy('');
    }
  };

  // 1-Click Chat action
  const handleOpenChat = task => {
    if (onOpenConversation) {
      const participantIds = [
        task.assignee?.id,
        task.creator?.id,
        ...(task.collaborators || []).map(c => c.id),
      ].filter(Boolean);

      onOpenConversation(task.conversationId || task.source_conversation_name, {
        title: task.title,
        conversationId: task.conversationId,
        participantIds: [...new Set(participantIds)],
      });
    } else {
      setNotice(copy.t(`Đã sẵn sàng kết nối trao đổi cho: "${task.title}".`));
    }
  };

  const applyAction = async action => {
    if (!selectedItem || actionBusy) return;
    if (['REJECT', 'CANCEL', 'ARCHIVE'].includes(action)) {
      const label = ACTION_LABELS[action]?.[0] || action;
      const confirmed = await requestAppConfirmation({
        title: `${copy.t(label)}?`,
        message: copy.t('Thao tác này sẽ cập nhật trạng thái của mục công việc.'),
        confirmLabel: copy.t(label),
        tone: 'danger',
      });
      if (!confirmed) return;
    }
    setActionBusy(action);
    try {
      await enterpriseWorkspaceService.applyAction(selectedItem.id, action, comment.trim(), selectedItem.version);
      setComment('');
      setSelectedItem(await enterpriseWorkspaceService.getItem(selectedItem.id));
      await refresh({ background: true });
    } catch (error) {
      if (error?.status === 409) await reloadAfterConflict(selectedItem.id);
      else reportError(error);
    } finally {
      setActionBusy('');
    }
  };

  const archiveItem = async () => {
    if (!selectedItem?.canEdit) return;
    const confirmed = await requestAppConfirmation({
      title: copy.t('Ẩn mục khỏi Workspace?'),
      message: copy.t('Mục này sẽ được lưu trữ và không còn xuất hiện trong danh sách đang theo dõi.'),
      confirmLabel: copy.t('Lưu trữ'),
      tone: 'danger',
    });
    if (!confirmed) return;
    setActionBusy('DELETE');
    try {
      await enterpriseWorkspaceService.archiveItem(selectedItem.id, selectedItem.version);
      setSelectedItem(null);
      await refresh({ background: true });
    } catch (error) {
      if (error?.status === 409) await reloadAfterConflict(selectedItem.id);
      else reportError(error);
    } finally {
      setActionBusy('');
    }
  };

  const selectedMeta = selectedItem ? workspaceTypeMeta(selectedItem.type) : null;
  const selectedExtendedTask = useMemo(() => {
    if (!selectedItem || selectedItem.type !== 'TASK') return null;
    return normalizeTaskExtended(selectedItem, accounts, userId);
  }, [selectedItem, accounts, userId]);

  return (
    <div className="enterprise-workspace">
      {/* THANH COMMAND BAR TRÊN CÙNG */}
      <header className="enterprise-commandbar">
        {/* Tìm kiếm */}
        <div className="enterprise-search">
          <i className="fa-solid fa-magnifying-glass"></i>
          <input
            name="workspace-search"
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder={copy.t('Tìm công việc, nhân sự, dự án, quy trình…')}
            aria-label={copy.t('Tìm trong Workspace')}
          />
          {loading && <i className="fa-solid fa-spinner fa-spin"></i>}
        </div>

        {/* Nút chuyển đổi View Mode (Chỉ hiển thị cho Sếp / Admin) */}
        {isAdmin && (
          <div className="workspace-view-switcher">
            <button
              type="button"
              className={`view-switch-btn ${viewMode === 'MY_WORK' ? 'active' : ''}`}
              onClick={() => setViewMode('MY_WORK')}
              title={copy.t('Bảng công việc cá nhân')}
            >
              <i className="fa-solid fa-user-check"></i>
              <span>{copy.t('Việc của tôi')}</span>
            </button>
            <button
              type="button"
              className={`view-switch-btn ${viewMode === 'COMPANY_MATRIX' ? 'active' : ''}`}
              onClick={() => setViewMode('COMPANY_MATRIX')}
              title={copy.t('Góc nhìn Toàn cảnh công ty cho Sếp')}
            >
              <i className="fa-solid fa-building-user"></i>
              <span>{copy.t('Toàn cảnh công ty')}</span>
            </button>
          </div>
        )}

        {/* Nút tạo mới nhanh */}
        <button
          type="button"
          className="enterprise-create-main"
          onClick={() => openCreate(activeType === 'OVERVIEW' ? 'TASK' : activeType)}
          disabled={!typeCanCreate(activeType === 'OVERVIEW' ? 'TASK' : activeType, isAdmin)}
        >
          <i className="fa-solid fa-plus"></i>
          <span>{copy.t('Giao việc mới')}</span>
        </button>
      </header>

      {/* THÔNG BÁO NOTICE NẾU CÓ */}
      {notice && (
        <div className="enterprise-notice">
          <i className="fa-solid fa-circle-info"></i>
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice('')}>
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>
      )}

      {/* CHẾ ĐỘ XEM 1: TOÀN CẢNH CÔNG TY (COMMAND CENTER CHO SẾP) */}
      {viewMode === 'COMPANY_MATRIX' ? (
        <CompanyStaffMatrixView
          tasks={normalizedTasks}
          accounts={accounts}
          onSelectTask={task => openItem(task)}
          onToggleComplete={handleToggleComplete}
          onOpenChat={handleOpenChat}
          copy={copy}
        />
      ) : (
        /* CHẾ ĐỘ XEM 2: TASK-CENTRIC WORKBOARD & AGENDA CHO NHÂN VIÊN */
        <div className="task-centric-layout">
          {/* CỘT ĐIỀU HƯỚNG TRÁI (SIDEBAR SUBNAV GIỐNG MOBILE) */}
          <aside className="task-subnav-sidebar" aria-label={copy.t('Điều hướng tác vụ')}>
            <div className="subnav-section-title">
              <i className="fa-solid fa-calendar-check"></i>
              <span>{copy.t('CÔNG VIỆC CỦA TÔI')}</span>
            </div>

            <button
              type="button"
              className={`task-subnav-btn ${activeType === 'TASK' && taskScope === 'TODAY' ? 'active' : ''}`}
              onClick={() => { setActiveType('TASK'); setTaskScope('TODAY'); }}
            >
              <span className="btn-icon star"><i className="fa-solid fa-star"></i></span>
              <span className="btn-label">{copy.t('Hôm nay làm gì')}</span>
              {taskCounts.today > 0 && <span className="subnav-badge warning">{taskCounts.today}</span>}
            </button>

            <button
              type="button"
              className={`task-subnav-btn ${activeType === 'TASK' && taskScope === 'ASSIGNED' ? 'active' : ''}`}
              onClick={() => { setActiveType('TASK'); setTaskScope('ASSIGNED'); }}
            >
              <span className="btn-icon target"><i className="fa-solid fa-bullseye"></i></span>
              <span className="btn-label">{copy.t('Được giao')}</span>
              {taskCounts.assigned > 0 && <span className="subnav-badge">{taskCounts.assigned}</span>}
            </button>

            <button
              type="button"
              className={`task-subnav-btn ${activeType === 'TASK' && taskScope === 'COLLABORATING' ? 'active' : ''}`}
              onClick={() => { setActiveType('TASK'); setTaskScope('COLLABORATING'); }}
            >
              <span className="btn-icon users"><i className="fa-solid fa-user-group"></i></span>
              <span className="btn-label">{copy.t('Cùng phối hợp')}</span>
              {taskCounts.collaborating > 0 && <span className="subnav-badge">{taskCounts.collaborating}</span>}
            </button>

            <button
              type="button"
              className={`task-subnav-btn ${activeType === 'TASK' && taskScope === 'CREATED' ? 'active' : ''}`}
              onClick={() => { setActiveType('TASK'); setTaskScope('CREATED'); }}
            >
              <span className="btn-icon creator"><i className="fa-solid fa-paper-plane"></i></span>
              <span className="btn-label">{copy.t('Tôi đã giao')}</span>
              {taskCounts.created > 0 && <span className="subnav-badge">{taskCounts.created}</span>}
            </button>

            <button
              type="button"
              className={`task-subnav-btn ${activeType === 'TASK' && taskScope === 'ALL' ? 'active' : ''}`}
              onClick={() => { setActiveType('TASK'); setTaskScope('ALL'); }}
            >
              <span className="btn-icon list"><i className="fa-solid fa-list-ul"></i></span>
              <span className="btn-label">{copy.t('Tất cả tác vụ')}</span>
              <span className="subnav-badge muted">{taskCounts.total}</span>
            </button>

            <button
              type="button"
              className={`task-subnav-btn ${activeType === 'TASK' && taskScope === 'COMPLETED' ? 'active' : ''}`}
              onClick={() => { setActiveType('TASK'); setTaskScope('COMPLETED'); }}
            >
              <span className="btn-icon done"><i className="fa-solid fa-circle-check"></i></span>
              <span className="btn-label">{copy.t('Đã hoàn thành')}</span>
              <span className="subnav-badge muted">{taskCounts.completed}</span>
            </button>

            {/* PHẦN MODULE DOANH NGHIỆP KHÁC */}
            <div className="subnav-divider"></div>
            <div className="subnav-section-title">
              <i className="fa-solid fa-cubes"></i>
              <span>{copy.t('MODULE DOANH NGHIỆP')}</span>
            </div>

            {typeOptions.filter(type => type.value !== 'TASK').map(type => (
              <button
                type="button"
                key={type.value}
                className={`task-subnav-btn module-btn ${activeType === type.value ? 'active' : ''}`}
                onClick={() => setActiveType(type.value)}
              >
                <span className={`btn-icon ${type.color}`}>
                  <i className={`fa-solid ${type.icon}`}></i>
                </span>
                <span className="btn-label">{copy.t(type.label)}</span>
                {summary?.byType?.[type.value] > 0 && (
                  <span className="subnav-badge muted">{summary.byType[type.value]}</span>
                )}
              </button>
            ))}
          </aside>

          {/* KHUNG NỘI DUNG CHÍNH (BOARD / LIST) */}
          <main className="task-main-board-pane">
            {activeType === 'TASK' ? (
              <>
                {/* TOOLBAR BỘ LỌC TRÊN BOARD */}
                <div className="task-board-filter-toolbar">
                  {/* Lọc trạng thái (Tất cả / Đang làm / Đã xong) */}
                  <div className="filter-pill-group">
                    <button
                      type="button"
                      className={`filter-pill ${taskStatusFilter === 'ALL' ? 'active' : ''}`}
                      onClick={() => setTaskStatusFilter('ALL')}
                    >
                      {copy.t('Tất cả')}
                    </button>
                    <button
                      type="button"
                      className={`filter-pill ${taskStatusFilter === 'ONGOING' ? 'active' : ''}`}
                      onClick={() => setTaskStatusFilter('ONGOING')}
                    >
                      {copy.t('Đang làm')}
                    </button>
                    <button
                      type="button"
                      className={`filter-pill ${taskStatusFilter === 'COMPLETED' ? 'active' : ''}`}
                      onClick={() => setTaskStatusFilter('COMPLETED')}
                    >
                      {copy.t('Đã xong')}
                    </button>
                  </div>

                  {/* Gom nhóm (Group By) */}
                  <div className="group-by-selector">
                    <span className="group-by-label">
                      <i className="fa-solid fa-layer-group"></i> {copy.t('Gom nhóm')}:
                    </span>
                    <select
                      value={taskGroupBy}
                      onChange={e => setTaskGroupBy(e.target.value)}
                      aria-label={copy.t('Gom nhóm tác vụ')}
                    >
                      <option value="DUE_DATE">{copy.t('Theo Hạn chót')}</option>
                      <option value="GROUP">{copy.t('Theo Dự án / Nhóm')}</option>
                      <option value="PRIORITY">{copy.t('Theo Mức ưu tiên')}</option>
                      <option value="NONE">{copy.t('Không phân nhóm')}</option>
                    </select>
                  </div>
                </div>

                {/* DANH SÁCH CÁC NHÓM CÔNG VIỆC */}
                <div className="task-groups-container">
                  {loading && items.length === 0 ? (
                    <div className="enterprise-empty">
                      <i className="fa-solid fa-spinner fa-spin"></i>
                      <span>{copy.t('Đang đồng bộ công việc...')}</span>
                    </div>
                  ) : currentFilteredTasks.length === 0 ? (
                    <div className="enterprise-empty">
                      <i className="fa-regular fa-calendar-check"></i>
                      <span>
                        {taskScope === 'TODAY'
                          ? copy.t('Tuyệt vời! Bạn không còn công việc nào cần xử lý hôm nay.')
                          : copy.t('Không có công việc nào trong danh mục này.')}
                      </span>
                      <button
                        type="button"
                        className="btn-create-task-empty"
                        onClick={() => setIsTaskCreateModalOpen(true)}
                      >
                        <i className="fa-solid fa-plus"></i> {copy.t('Tạo công việc mới')}
                      </button>
                    </div>
                  ) : (
                    groupedTasks.map(group => (
                      <section key={group.id} className="task-group-section">
                        <div className="task-group-header">
                          <div className="group-header-left">
                            <span className={`group-header-dot ${group.tone || 'neutral'}`}></span>
                            <h4 className="group-header-title">{group.title}</h4>
                            <span className="group-header-badge">{group.tasks.length}</span>
                          </div>
                        </div>

                        <div className="task-cards-list">
                          {group.tasks.map(task => (
                            <TaskCard
                              key={task.id}
                              task={task}
                              isSelected={selectedItem?.id === task.id}
                              onSelect={t => openItem(t)}
                              onToggleComplete={handleToggleComplete}
                              onOpenChat={handleOpenChat}
                              copy={copy}
                            />
                          ))}
                        </div>
                      </section>
                    ))
                  )}

                  {hasMore && (
                    <button
                      type="button"
                      className="enterprise-load-more"
                      onClick={loadMore}
                      disabled={loading || loadingMore}
                    >
                      <i className={`fa-solid ${loadingMore ? 'fa-spinner fa-spin' : 'fa-chevron-down'}`}></i>
                      {loadingMore ? copy.t('Đang tải thêm...') : copy.t('Tải thêm')}
                    </button>
                  )}
                </div>
              </>
            ) : (
              /* DANH SÁCH CHO CÁC MODULE DOANH NGHIỆP KHÁC (Wiki, Phê duyệt...) */
              <div className="enterprise-list-pane">
                <div className="enterprise-section-title">
                  <div>
                    <strong>{copy.t(workspaceTypeMeta(activeType).label)}</strong>
                    <small>{filteredNonTaskItems.length} {copy.t('mục có quyền truy cập')}</small>
                  </div>
                  {typeCanCreate(activeType, isAdmin) && (
                    <button type="button" onClick={() => openCreate(activeType)}>
                      <i className="fa-solid fa-plus"></i> {copy.t('Thêm')}
                    </button>
                  )}
                </div>

                {filteredNonTaskItems.length === 0 ? (
                  <div className="enterprise-empty">
                    <i className="fa-regular fa-folder-open"></i>
                    <span>{copy.t('Chưa có dữ liệu trong mục này.')}</span>
                    {typeCanCreate(activeType, isAdmin) && (
                      <button type="button" onClick={() => openCreate(activeType)}>
                        {copy.t('Tạo mục đầu tiên')}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="enterprise-item-list">
                    {filteredNonTaskItems.map(item => {
                      const meta = workspaceTypeMeta(item.type);
                      return (
                        <button
                          type="button"
                          key={item.id}
                          className={'enterprise-item-card' + (selectedItem?.id === item.id ? ' active' : '')}
                          onClick={() => openItem(item)}
                        >
                          <span className={'enterprise-type-icon ' + meta.color}>
                            <i className={'fa-solid ' + meta.icon}></i>
                          </span>
                          <span className="enterprise-item-copy">
                            <span className="enterprise-item-topline">
                              <b>{copy.t(meta.label)}</b>
                              <time>{formatWorkspaceDate(item.updatedAt, { locale: copy.locale })}</time>
                            </span>
                            <strong>{item.title}</strong>
                            <small>{item.description || copy.t('Không có mô tả')}</small>
                            <span className="enterprise-item-footer">
                              <em className={'status ' + item.status.toLowerCase()}>
                                {copy.t(workspaceStatusLabel(item.status))}
                              </em>
                              {item.dueAt && (
                                <em><i className="fa-regular fa-clock"></i> {formatWorkspaceDate(item.dueAt, { locale: copy.locale })}</em>
                              )}
                              <em>{item.participants.length} {copy.t('người')}</em>
                            </span>
                          </span>
                          <i className="fa-solid fa-chevron-right enterprise-chevron"></i>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </main>

          {/* CỘT CHI TIẾT (DETAIL DRAWER BÊN PHẢI) */}
          <aside className={`enterprise-detail-pane ${selectedItem ? 'open' : ''}`}>
            {!selectedItem ? (
              <div className="enterprise-detail-placeholder">
                <span><i className="fa-solid fa-arrow-pointer"></i></span>
                <strong>{copy.t('Chọn một công việc để xem chi tiết')}</strong>
                <small>{copy.t('Nhật ký làm việc, người phụ trách, phối hợp và tiến độ hiển thị tại đây.')}</small>
              </div>
            ) : (
              <>
                <div className="enterprise-detail-header">
                  <span className={'enterprise-type-icon ' + selectedMeta.color}>
                    <i className={'fa-solid ' + selectedMeta.icon}></i>
                  </span>
                  <div>
                    <span>{copy.t(selectedMeta.label)}</span>
                    <h3>{selectedItem.title}</h3>
                  </div>
                  <button type="button" onClick={() => setSelectedItem(null)} aria-label={copy.t('Đóng chi tiết')}>
                    <i className="fa-solid fa-xmark"></i>
                  </button>
                </div>

                <div className="enterprise-detail-scroll">
                  <div className="enterprise-detail-badges">
                    <span className={'status ' + selectedItem.status.toLowerCase()}>
                      {copy.t(workspaceStatusLabel(selectedItem.status))}
                    </span>
                    <span className={'priority ' + selectedItem.priority.toLowerCase()}>
                      {localizedWorkspaceValue(selectedItem.priority, PRIORITY_LABELS, copy)}
                    </span>
                    <span>
                      <i className="fa-solid fa-shield-halved"></i> {copy.t(selectedItem.visibility === 'COMPANY' ? 'Toàn công ty' : 'Người liên quan')}
                    </span>
                  </div>

                  {selectedItem.description && (
                    <p className="enterprise-description">{selectedItem.description}</p>
                  )}

                  {/* FACT SHEET MÓC NỐI NHÂN SỰ & THỜI HẠN */}
                  <dl className="enterprise-detail-facts">
                    {selectedExtendedTask ? (
                      <>
                        <div>
                          <dt>{copy.t('Người giao việc')}</dt>
                          <dd>
                            <Avatar account={selectedExtendedTask.creator} small />
                            <span>{selectedExtendedTask.creator?.name || copy.t('Hệ thống')}</span>
                          </dd>
                        </div>
                        <div>
                          <dt>{copy.t('Phụ trách chính')}</dt>
                          <dd>
                            <Avatar account={selectedExtendedTask.assignee} small />
                            <span>{selectedExtendedTask.assignee?.name || copy.t('Chưa gán')}</span>
                          </dd>
                        </div>
                        {selectedExtendedTask.approver && (
                          <div>
                            <dt>{copy.t('Người duyệt')}</dt>
                            <dd>
                              <Avatar account={selectedExtendedTask.approver} small />
                              <span>{selectedExtendedTask.approver.name}</span>
                            </dd>
                          </div>
                        )}
                        <div>
                          <dt>{copy.t('Hạn hoàn thành')}</dt>
                          <dd>{formatWorkspaceDate(selectedItem.dueAt, { locale: copy.locale })}</dd>
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <dt>{copy.t('Phụ trách')}</dt>
                          <dd><Avatar account={selectedItem.owner} small /> {selectedItem.owner?.name || copy.t('Chưa gán')}</dd>
                        </div>
                        <div>
                          <dt>{copy.t('Hạn xử lý')}</dt>
                          <dd>{formatWorkspaceDate(selectedItem.dueAt, { locale: copy.locale })}</dd>
                        </div>
                      </>
                    )}
                  </dl>

                  {/* CHECKLIST ĐẦU VIỆC CON TRONG DETAIL VIEW */}
                  {selectedExtendedTask?.subtasks?.length > 0 && (
                    <div className="enterprise-detail-subtasks-section">
                      <h4>
                        <i className="fa-regular fa-square-check"></i> {copy.t('Checklist đầu việc')} ({selectedExtendedTask.subtaskStats.completed}/{selectedExtendedTask.subtaskStats.total})
                      </h4>
                      <div className="detail-subtasks-list">
                        {selectedExtendedTask.subtasks.map(st => (
                          <div key={st.id} className="detail-subtask-item">
                            <i className={`fa-regular ${st.completed ? 'fa-circle-check completed-icon' : 'fa-circle'}`}></i>
                            <span className={st.completed ? 'subtask-done' : ''}>{st.title}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* DANH SÁCH NGƯỜI LIÊN QUAN / CÙNG LÀM */}
                  {selectedItem.participants.length > 0 && (
                    <div className="enterprise-participants">
                      <h4>{copy.t('Người liên quan & Phối hợp')}</h4>
                      <div>
                        {selectedItem.participants.map(participant => (
                          <span key={participant.id}>
                            <Avatar account={participant.account} small />
                            <b>{participant.account?.name || participant.accountId}</b>
                            <small>{localizedWorkspaceValue(participant.role, PARTICIPANT_ROLE_LABELS, copy)} · {localizedWorkspaceValue(participant.state, PARTICIPANT_STATE_LABELS, copy)}</small>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* NÚT THAO TÁC / HÀNH ĐỘNG */}
                  <div className="enterprise-actions">
                    {/* Nút 1-Click Thảo luận Chat */}
                    {selectedExtendedTask && (
                      <button
                        type="button"
                        className="btn-detail-chat"
                        onClick={() => handleOpenChat(selectedExtendedTask)}
                      >
                        <i className="fa-regular fa-comment-dots"></i>
                        {copy.t('Mở nhóm chat thảo luận')}
                      </button>
                    )}

                    {selectedItem.allowedActions.filter(action => action !== 'COMMENT').map(action => {
                      const label = ACTION_LABELS[action] || [action, 'fa-bolt'];
                      return (
                        <button
                          type="button"
                          key={action}
                          className={['REJECT', 'CANCEL', 'ARCHIVE'].includes(action) ? 'danger' : ''}
                          onClick={() => applyAction(action)}
                          disabled={Boolean(actionBusy)}
                        >
                          <i className={'fa-solid ' + (actionBusy === action ? 'fa-spinner fa-spin' : label[1])}></i>
                          {copy.t(label[0])}
                        </button>
                      );
                    })}

                    {selectedItem.canEdit && (
                      <button type="button" onClick={() => setForm(formForItem(selectedItem, userId))}>
                        <i className="fa-solid fa-pen"></i>{copy.t('Chỉnh sửa')}
                      </button>
                    )}
                    {selectedItem.canEdit && (
                      <button type="button" className="danger ghost" onClick={archiveItem} disabled={Boolean(actionBusy)}>
                        <i className="fa-solid fa-box-archive"></i>{copy.t('Ẩn khỏi Workspace')}
                      </button>
                    )}
                  </div>

                  {/* BÌNH LUẬN / TRAO ĐỔI NHANH */}
                  <form
                    className="enterprise-comment"
                    autoComplete="off"
                    onSubmit={event => { event.preventDefault(); if (comment.trim()) applyAction('COMMENT'); }}
                  >
                    <input
                      name="workspace-comment"
                      value={comment}
                      onChange={event => setComment(event.target.value)}
                      maxLength="5000"
                      placeholder={copy.t('Thêm trao đổi hoặc ghi chú…')}
                      aria-label={copy.t('Thêm trao đổi hoặc ghi chú')}
                    />
                    <button type="submit" disabled={!comment.trim() || Boolean(actionBusy)}>
                      <i className="fa-solid fa-paper-plane"></i>
                    </button>
                  </form>

                  {/* NHẬT KÝ HOẠT ĐỘNG */}
                  <div className="enterprise-activity">
                    <h4>{copy.t('Nhật ký hoạt động')}</h4>
                    {selectedItem.activity.length === 0 ? (
                      <small>{copy.t('Chưa có hoạt động.')}</small>
                    ) : (
                      selectedItem.activity.map(activity => (
                        <article key={activity.id}>
                          <span><i className="fa-solid fa-clock-rotate-left"></i></span>
                          <div>
                            <strong>{activity.actor?.name || copy.t('Hệ thống')} · {copy.t(ACTION_LABELS[activity.action]?.[0] || ACTIVITY_LABELS[activity.action] || activity.action)}</strong>
                            {activity.comment && <p>{activity.comment}</p>}
                            <time>{formatWorkspaceDate(activity.createdAt, { locale: copy.locale })}</time>
                          </div>
                        </article>
                      ))
                    )}
                  </div>
                </div>
              </>
            )}
          </aside>
        </div>
      )}

      {/* MODAL GIAO VIỆC NÂNG CAO (TASK-CENTRIC) */}
      <TaskCreateModal
        isOpen={isTaskCreateModalOpen}
        onClose={() => setIsTaskCreateModalOpen(false)}
        onSubmit={handleCreateTaskFromModal}
        accounts={accounts}
        currentUser={user}
        copy={copy}
      />

      {/* FORM MODAL CHỈNH SỬA / TẠO CHO CÁC MODULE KHÁC */}
      {form && (
        <div className="enterprise-form-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !saving) setForm(null); }}>
          <form ref={formDialogRef} className="enterprise-form-modal" autoComplete="off" role="dialog" aria-modal="true" aria-labelledby="enterprise-form-title" onSubmit={saveItem}>
            <header>
              <div>
                <span>{copy.t(form.id ? 'CẬP NHẬT' : 'TẠO MỚI')}</span>
                <h3 id="enterprise-form-title">{copy.t(workspaceTypeMeta(form.type).label)}</h3>
              </div>
              <button type="button" onClick={() => setForm(null)} disabled={saving} aria-label={copy.t('Đóng')}>
                <i className="fa-solid fa-xmark"></i>
              </button>
            </header>
            <div className="enterprise-form-scroll">
              {!form.id && (
                <FormField label={copy.t('Loại nghiệp vụ')}>
                  <select value={form.type} onChange={event => setForm(emptyForm(event.target.value, userId))}>
                    {typeOptions.filter(type => typeCanCreate(type.value, isAdmin)).map(type => (
                      <option value={type.value} key={type.value}>{copy.t(type.label)}</option>
                    ))}
                  </select>
                </FormField>
              )}
              <FormField label={copy.t('Tiêu đề')} wide>
                <input name="workspace-title" value={form.title} onChange={event => setForm(previous => ({ ...previous, title: event.target.value }))} maxLength="500" required />
              </FormField>
              <FormField label={copy.t('Nội dung')} wide>
                <textarea name="workspace-description" value={form.description} onChange={event => setForm(previous => ({ ...previous, description: event.target.value }))} rows="5" maxLength="100000" />
              </FormField>
              <FormField label={copy.t('Mức ưu tiên')}>
                <select value={form.priority} onChange={event => setForm(previous => ({ ...previous, priority: event.target.value }))}>
                  <option value="LOW">{copy.t('Thấp')}</option>
                  <option value="NORMAL">{copy.t('Bình thường')}</option>
                  <option value="HIGH">{copy.t('Cao')}</option>
                  <option value="URGENT">{copy.t('Khẩn cấp')}</option>
                </select>
              </FormField>
              <FormField label={copy.t('Phạm vi')}>
                <select value={form.visibility} onChange={event => setForm(previous => ({ ...previous, visibility: event.target.value }))}>
                  <option value="COMPANY">{copy.t('Toàn công ty')}</option>
                  <option value="PARTICIPANTS">{copy.t('Người liên quan')}</option>
                </select>
              </FormField>
              {!form.id && (
                <FormField label={copy.t('Trạng thái ban đầu')}>
                  <select value={form.status} onChange={event => setForm(previous => ({ ...previous, status: event.target.value }))}>
                    {ENTERPRISE_STATUSES[form.type].map(status => (
                      <option key={status} value={status}>{copy.t(workspaceStatusLabel(status))}</option>
                    ))}
                  </select>
                </FormField>
              )}
              <FormField label={copy.t('Người phụ trách')}>
                <select value={form.ownerId} onChange={event => setForm(previous => ({ ...previous, ownerId: event.target.value }))}>
                  {accounts.map(account => <option value={account.id} key={account.id}>{account.name}</option>)}
                </select>
              </FormField>
              {['TASK', 'APPROVAL', 'TICKET'].includes(form.type) && (
                <FormField label={copy.t('Hạn xử lý')}>
                  <input type="datetime-local" value={form.dueAt} onChange={event => setForm(previous => ({ ...previous, dueAt: event.target.value }))} />
                </FormField>
              )}
              {form.type === 'EVENT' && (
                <>
                  <FormField label={copy.t('Bắt đầu')}><input type="datetime-local" value={form.startsAt} onChange={event => setForm(previous => ({ ...previous, startsAt: event.target.value }))} required /></FormField>
                  <FormField label={copy.t('Kết thúc')}><input type="datetime-local" value={form.endsAt} onChange={event => setForm(previous => ({ ...previous, endsAt: event.target.value }))} /></FormField>
                  <FormField label={copy.t('Địa điểm')}><input value={form.location} onChange={event => setForm(previous => ({ ...previous, location: event.target.value }))} maxLength="255" /></FormField>
                  <FormField label={copy.t('Link họp')}><input type="url" value={form.meetingUrl} onChange={event => setForm(previous => ({ ...previous, meetingUrl: event.target.value }))} /></FormField>
                  <label className="enterprise-inline-toggle"><input type="checkbox" checked={form.allDay} onChange={event => setForm(previous => ({ ...previous, allDay: event.target.checked }))} /><span>{copy.t('Cả ngày')}</span></label>
                </>
              )}
              {['TICKET', 'WIKI'].includes(form.type) && <FormField label={copy.t('Danh mục')}><input value={form.category} onChange={event => setForm(previous => ({ ...previous, category: event.target.value }))} maxLength="255" /></FormField>}
              {form.type === 'WIKI' && <FormField label={copy.t('Thẻ, cách nhau bằng dấu phẩy')}><input value={form.tags} onChange={event => setForm(previous => ({ ...previous, tags: event.target.value }))} /></FormField>}
              {form.type === 'APPROVAL' && <FormField label={copy.t('Loại đề nghị')}><input value={form.requestKind} onChange={event => setForm(previous => ({ ...previous, requestKind: event.target.value }))} maxLength="255" /></FormField>}
              {form.type === 'INTEGRATION' && (
                <>
                  <FormField label={copy.t('Nhà cung cấp')}><input value={form.provider} onChange={event => setForm(previous => ({ ...previous, provider: event.target.value }))} maxLength="255" required /></FormField>
                  <FormField label={copy.t('Endpoint công khai')}><input type="url" value={form.endpoint} onChange={event => setForm(previous => ({ ...previous, endpoint: event.target.value }))} placeholder="https://..." /></FormField>
                  <FormField label={copy.t('Chiều đồng bộ')}><select value={form.syncDirection} onChange={event => setForm(previous => ({ ...previous, syncDirection: event.target.value }))}><option value="BIDIRECTIONAL">{copy.t('Hai chiều')}</option><option value="INBOUND">{copy.t('Vào Workspace')}</option><option value="OUTBOUND">{copy.t('Ra hệ thống')}</option></select></FormField>
                  <p className="enterprise-security-note wide"><i className="fa-solid fa-shield-halved"></i>{copy.t('Workspace không lưu API key, token hoặc mật khẩu tích hợp.')}</p>
                </>
              )}
              {form.type === 'ANNOUNCEMENT' && (
                <div className="enterprise-toggle-row wide">
                  <label><input type="checkbox" checked={form.requiresAck} onChange={event => setForm(previous => ({ ...previous, requiresAck: event.target.checked }))} /><span>{copy.t('Bắt buộc nhân viên xác nhận đã đọc')}</span></label>
                  <label><input type="checkbox" checked={form.pinned} onChange={event => setForm(previous => ({ ...previous, pinned: event.target.checked }))} /><span>{copy.t('Ghim thông báo')}</span></label>
                </div>
              )}
              <fieldset className="enterprise-member-picker wide">
                <legend>{copy.t(form.type === 'APPROVAL' ? 'Người phê duyệt' : form.type === 'EVENT' ? 'Người tham dự' : 'Người liên quan')}</legend>
                <div>
                  {accounts.filter(account => account.id !== userId || form.type === 'EVENT').map(account => {
                    const selected = form.participantIds.includes(account.id);
                    return (
                      <label key={account.id} className={selected ? 'selected' : ''}>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => setForm(previous => {
                            const participantIds = selected
                              ? previous.participantIds.filter(id => id !== account.id)
                              : [...previous.participantIds, account.id];
                            const participantRoles = { ...(previous.participantRoles || {}) };
                            if (selected) delete participantRoles[account.id];
                            else participantRoles[account.id] = participantRoles[account.id] || PARTICIPANT_ROLE[form.type];
                            return { ...previous, participantIds, participantRoles };
                          })}
                        />
                        <Avatar account={account} small />
                        <span><strong>{account.name}</strong><small>{account.department || account.title || account.username}</small></span>
                        <i className="fa-solid fa-check"></i>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            </div>
            <footer>
              <button type="button" onClick={() => setForm(null)} disabled={saving}>{copy.t('Hủy')}</button>
              <button type="submit" className="primary" disabled={saving || !form.title.trim()}>
                <i className={'fa-solid ' + (saving ? 'fa-spinner fa-spin' : 'fa-floppy-disk')}></i>
                {saving ? copy.t('Đang lưu...') : form.id ? copy.t('Lưu thay đổi') : copy.t('Tạo mục mới')}
              </button>
            </footer>
          </form>
        </div>
      )}
    </div>
  );
}
