import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ENTERPRISE_STATUSES,
  ENTERPRISE_TYPES,
  enterpriseWorkspaceService,
  formatWorkspaceDate,
  mergeWorkspaceProperties,
  workspaceStatusLabel,
  workspaceTypeMeta,
} from '../services/enterpriseWorkspaceService';
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

const PARTICIPANT_ROLE_LABELS = {
  ASSIGNEE: 'Người phụ trách', RECIPIENT: 'Người nhận', APPROVER: 'Người phê duyệt',
  EDITOR: 'Biên tập viên', ATTENDEE: 'Người tham dự', OWNER: 'Phụ trách',
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

export default function EnterpriseWorkspace({ user, accounts = [], copy = { t: value => value, locale: 'vi-VN' }, taskSeed, onTaskSeedConsumed, onError, requestAppConfirmation = () => Promise.resolve(false) }) {
  const userId = String(user?.id || user?.uid || '');
  const isAdmin = ['admin', 'owner', 'superadmin'].includes(String(user?.role || '').toLowerCase());
  const [activeType, setActiveType] = useState('OVERVIEW');
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
  const requestGenerationRef = useRef(0);
  const requestControllerRef = useRef(null);
  const nextCursorRef = useRef(null);
  const selectedItemIdRef = useRef('');
  const loadingMoreRef = useRef(false);
  const detailGenerationRef = useRef(0);

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

  const filteredItems = useMemo(() => {
    const scoped = activeType === 'OVERVIEW' ? items : items.filter(item => item.type === activeType);
    return [...scoped].sort((first, second) => new Date(second.updatedAt || 0) - new Date(first.updatedAt || 0));
  }, [activeType, items]);

  const typeOptions = ENTERPRISE_TYPES.filter(type => type.value !== 'INTEGRATION' || isAdmin);

  const openCreate = type => {
    setForm(emptyForm(type, userId));
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
  const createType = activeType === 'OVERVIEW' ? 'TASK' : activeType;

  return (
    <div className="enterprise-workspace">
      <header className="enterprise-commandbar">
        <div className="enterprise-search">
          <i className="fa-solid fa-magnifying-glass"></i>
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder={copy.t('Tìm công việc, quy trình, ticket, sự kiện...')} />
          {loading && <i className="fa-solid fa-spinner fa-spin"></i>}
        </div>
        <button type="button" className="enterprise-create-main" onClick={() => openCreate(createType)} disabled={!typeCanCreate(createType, isAdmin)}>
          <i className="fa-solid fa-plus"></i><span>{copy.t('Tạo mới')}</span>
        </button>
      </header>

      <nav className="enterprise-tabs" aria-label={copy.t('Module doanh nghiệp')}>
        <button type="button" className={activeType === 'OVERVIEW' ? 'active' : ''} onClick={() => setActiveType('OVERVIEW')}>
          <i className="fa-solid fa-table-cells-large"></i><span>{copy.t('Tổng quan')}</span>
        </button>
        {typeOptions.map(type => (
          <button type="button" key={type.value} className={activeType === type.value ? 'active' : ''} onClick={() => setActiveType(type.value)}>
            <i className={'fa-solid ' + type.icon}></i><span>{copy.t(type.label)}</span>
            {summary?.byType?.[type.value] > 0 && <b>{summary.byType[type.value]}</b>}
          </button>
        ))}
      </nav>

      {notice && <div className="enterprise-notice"><i className="fa-solid fa-circle-info"></i><span>{notice}</span><button type="button" onClick={() => setNotice('')}><i className="fa-solid fa-xmark"></i></button></div>}

      {activeType === 'OVERVIEW' && (
        <section className="enterprise-overview">
          <div className="enterprise-hero-card">
            <span className="enterprise-eyebrow">{copy.t('TRUNG TÂM ĐIỀU HÀNH NỘI BỘ')}</span>
            <h3>{copy.t('Mọi việc cần làm, quyết định và tri thức nằm trong một luồng.')}</h3>
            <p>{copy.t('Workspace tách biệt khỏi dữ liệu tin nhắn Tinode, nhưng vẫn liên kết công việc với đúng cuộc trò chuyện.')}</p>
            <button type="button" onClick={() => openCreate('TASK')}><i className="fa-solid fa-bolt"></i> {copy.t('Giao việc nhanh')}</button>
          </div>
          <div className="enterprise-metric-grid">
            <article><span>{copy.t('Đang theo dõi')}</span><strong>{summary?.total || 0}</strong><i className="fa-solid fa-layer-group"></i></article>
            <article className="warning"><span>{copy.t('Sắp đến hạn')}</span><strong>{summary?.dueSoon || 0}</strong><i className="fa-solid fa-hourglass-half"></i></article>
            <article className="danger"><span>{copy.t('Quá hạn')}</span><strong>{summary?.overdue || 0}</strong><i className="fa-solid fa-triangle-exclamation"></i></article>
          </div>
        </section>
      )}

      <section className="enterprise-content-grid">
        <div className="enterprise-list-pane">
          <div className="enterprise-section-title">
            <div><strong>{activeType === 'OVERVIEW' ? copy.t('Hoạt động gần đây') : copy.t(workspaceTypeMeta(activeType).label)}</strong><small>{filteredItems.length} {copy.t('mục có quyền truy cập')}</small></div>
            {activeType !== 'OVERVIEW' && typeCanCreate(activeType, isAdmin) && <button type="button" onClick={() => openCreate(activeType)}><i className="fa-solid fa-plus"></i> {copy.t('Thêm')}</button>}
          </div>
          {loading && items.length === 0 ? (
            <div className="enterprise-empty"><i className="fa-solid fa-spinner fa-spin"></i><span>{copy.t('Đang đồng bộ Workspace...')}</span></div>
          ) : filteredItems.length === 0 ? (
            <div className="enterprise-empty"><i className="fa-regular fa-folder-open"></i><span>{copy.t('Chưa có dữ liệu trong mục này.')}</span>{typeCanCreate(createType, isAdmin) && <button type="button" onClick={() => openCreate(createType)}>{copy.t('Tạo mục đầu tiên')}</button>}</div>
          ) : (
            <div className="enterprise-item-list">
              {filteredItems.map(item => {
                const meta = workspaceTypeMeta(item.type);
                return (
                  <button type="button" key={item.id} className={'enterprise-item-card' + (selectedItem?.id === item.id ? ' active' : '')} onClick={() => openItem(item)}>
                    <span className={'enterprise-type-icon ' + meta.color}><i className={'fa-solid ' + meta.icon}></i></span>
                    <span className="enterprise-item-copy">
                      <span className="enterprise-item-topline"><b>{copy.t(meta.label)}</b><time>{formatWorkspaceDate(item.updatedAt, { locale: copy.locale })}</time></span>
                      <strong>{item.title}</strong>
                      <small>{item.description || copy.t('Không có mô tả')}</small>
                      <span className="enterprise-item-footer">
                        <em className={'status ' + item.status.toLowerCase()}>{copy.t(workspaceStatusLabel(item.status))}</em>
                        {item.dueAt && <em><i className="fa-regular fa-clock"></i> {formatWorkspaceDate(item.dueAt, { locale: copy.locale })}</em>}
                        <em>{item.participants.length} {copy.t('người')}</em>
                      </span>
                    </span>
                    <i className="fa-solid fa-chevron-right enterprise-chevron"></i>
                  </button>
                );
              })}
            </div>
          )}
          {hasMore && <button type="button" className="enterprise-load-more" onClick={loadMore} disabled={loading || loadingMore}>
            <i className={'fa-solid ' + (loadingMore ? 'fa-spinner fa-spin' : 'fa-chevron-down')}></i>
            {loadingMore ? copy.t('Đang tải thêm...') : copy.t('Tải thêm')}
          </button>}
        </div>

        <aside className={'enterprise-detail-pane' + (selectedItem ? ' open' : '')}>
          {!selectedItem ? (
            <div className="enterprise-detail-placeholder"><span><i className="fa-solid fa-arrow-pointer"></i></span><strong>{copy.t('Chọn một mục để xem chi tiết')}</strong><small>{copy.t('Lịch sử thao tác, người phụ trách và trạng thái được đồng bộ tại đây.')}</small></div>
          ) : (
            <>
              <div className="enterprise-detail-header">
                <span className={'enterprise-type-icon ' + selectedMeta.color}><i className={'fa-solid ' + selectedMeta.icon}></i></span>
                <div><span>{copy.t(selectedMeta.label)}</span><h3>{selectedItem.title}</h3></div>
                <button type="button" onClick={() => setSelectedItem(null)} aria-label={copy.t('Đóng chi tiết')}><i className="fa-solid fa-xmark"></i></button>
              </div>
              <div className="enterprise-detail-scroll">
                <div className="enterprise-detail-badges">
                  <span className={'status ' + selectedItem.status.toLowerCase()}>{copy.t(workspaceStatusLabel(selectedItem.status))}</span>
                  <span className={'priority ' + selectedItem.priority.toLowerCase()}>{localizedWorkspaceValue(selectedItem.priority, PRIORITY_LABELS, copy)}</span>
                  <span><i className="fa-solid fa-shield-halved"></i> {copy.t(selectedItem.visibility === 'COMPANY' ? 'Toàn công ty' : 'Người liên quan')}</span>
                </div>
                {selectedItem.description && <p className="enterprise-description">{selectedItem.description}</p>}
                <dl className="enterprise-detail-facts">
                  <div><dt>{copy.t('Phụ trách')}</dt><dd><Avatar account={selectedItem.owner} small /> {selectedItem.owner?.name || copy.t('Chưa gán')}</dd></div>
                  <div><dt>{copy.t('Hạn xử lý')}</dt><dd>{formatWorkspaceDate(selectedItem.dueAt, { locale: copy.locale })}</dd></div>
                  {selectedItem.startsAt && <div><dt>{copy.t('Bắt đầu')}</dt><dd>{formatWorkspaceDate(selectedItem.startsAt, { locale: copy.locale })}</dd></div>}
                  {selectedItem.endsAt && <div><dt>{copy.t('Kết thúc')}</dt><dd>{formatWorkspaceDate(selectedItem.endsAt, { locale: copy.locale })}</dd></div>}
                </dl>
                {selectedItem.participants.length > 0 && (
                  <div className="enterprise-participants"><h4>{copy.t('Người liên quan')}</h4><div>{selectedItem.participants.map(participant => (
                    <span key={participant.id}><Avatar account={participant.account} small /><b>{participant.account?.name || participant.accountId}</b><small>{localizedWorkspaceValue(participant.role, PARTICIPANT_ROLE_LABELS, copy)} · {localizedWorkspaceValue(participant.state, PARTICIPANT_STATE_LABELS, copy)}</small></span>
                  ))}</div></div>
                )}
                <div className="enterprise-actions">
                  {selectedItem.allowedActions.filter(action => action !== 'COMMENT').map(action => {
                    const label = ACTION_LABELS[action] || [action, 'fa-bolt'];
                    return <button type="button" key={action} className={['REJECT', 'CANCEL', 'ARCHIVE'].includes(action) ? 'danger' : ''} onClick={() => applyAction(action)} disabled={Boolean(actionBusy)}><i className={'fa-solid ' + (actionBusy === action ? 'fa-spinner fa-spin' : label[1])}></i>{copy.t(label[0])}</button>;
                  })}
                  {selectedItem.canEdit && <button type="button" onClick={() => setForm(formForItem(selectedItem, userId))}><i className="fa-solid fa-pen"></i>{copy.t('Chỉnh sửa')}</button>}
                  {selectedItem.canEdit && <button type="button" className="danger ghost" onClick={archiveItem} disabled={Boolean(actionBusy)}><i className="fa-solid fa-box-archive"></i>{copy.t('Ẩn khỏi Workspace')}</button>}
                </div>
                <form className="enterprise-comment" onSubmit={event => { event.preventDefault(); if (comment.trim()) applyAction('COMMENT'); }}>
                  <input value={comment} onChange={event => setComment(event.target.value)} maxLength="5000" placeholder={copy.t('Thêm trao đổi hoặc ghi chú...')} />
                  <button type="submit" disabled={!comment.trim() || Boolean(actionBusy)}><i className="fa-solid fa-paper-plane"></i></button>
                </form>
                <div className="enterprise-activity"><h4>{copy.t('Nhật ký hoạt động')}</h4>{selectedItem.activity.length === 0 ? <small>{copy.t('Chưa có hoạt động.')}</small> : selectedItem.activity.map(activity => (
                  <article key={activity.id}><span><i className="fa-solid fa-clock-rotate-left"></i></span><div><strong>{activity.actor?.name || copy.t('Hệ thống')} · {copy.t(ACTION_LABELS[activity.action]?.[0] || ACTIVITY_LABELS[activity.action] || activity.action)}</strong>{activity.comment && <p>{activity.comment}</p>}<time>{formatWorkspaceDate(activity.createdAt, { locale: copy.locale })}</time></div></article>
                ))}</div>
              </div>
            </>
          )}
        </aside>
      </section>

      {form && (
        <div className="enterprise-form-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !saving) setForm(null); }}>
          <form className="enterprise-form-modal" onSubmit={saveItem}>
            <header><div><span>{copy.t(form.id ? 'CẬP NHẬT' : 'TẠO MỚI')}</span><h3>{copy.t(workspaceTypeMeta(form.type).label)}</h3></div><button type="button" onClick={() => setForm(null)} disabled={saving} aria-label={copy.t('Đóng')}><i className="fa-solid fa-xmark"></i></button></header>
            <div className="enterprise-form-scroll">
              {!form.id && <FormField label={copy.t('Loại nghiệp vụ')}><select value={form.type} onChange={event => setForm(emptyForm(event.target.value, userId))}>{typeOptions.filter(type => typeCanCreate(type.value, isAdmin)).map(type => <option value={type.value} key={type.value}>{copy.t(type.label)}</option>)}</select></FormField>}
              <FormField label={copy.t('Tiêu đề')} wide><input value={form.title} onChange={event => setForm(previous => ({ ...previous, title: event.target.value }))} maxLength="500" required autoFocus /></FormField>
              <FormField label={copy.t('Nội dung')} wide><textarea value={form.description} onChange={event => setForm(previous => ({ ...previous, description: event.target.value }))} rows="5" maxLength="100000" /></FormField>
              <FormField label={copy.t('Mức ưu tiên')}><select value={form.priority} onChange={event => setForm(previous => ({ ...previous, priority: event.target.value }))}><option value="LOW">{copy.t('Thấp')}</option><option value="NORMAL">{copy.t('Bình thường')}</option><option value="HIGH">{copy.t('Cao')}</option><option value="URGENT">{copy.t('Khẩn cấp')}</option></select></FormField>
              <FormField label={copy.t('Phạm vi')}><select value={form.visibility} onChange={event => setForm(previous => ({ ...previous, visibility: event.target.value }))}><option value="COMPANY">{copy.t('Toàn công ty')}</option><option value="PARTICIPANTS">{copy.t('Người liên quan')}</option></select></FormField>
              {!form.id && <FormField label={copy.t('Trạng thái ban đầu')}><select value={form.status} onChange={event => setForm(previous => ({ ...previous, status: event.target.value }))}>{ENTERPRISE_STATUSES[form.type].map(status => <option key={status} value={status}>{copy.t(workspaceStatusLabel(status))}</option>)}</select></FormField>}
              <FormField label={copy.t('Người phụ trách')}><select value={form.ownerId} onChange={event => setForm(previous => ({ ...previous, ownerId: event.target.value }))}>{accounts.map(account => <option value={account.id} key={account.id}>{account.name}</option>)}</select></FormField>
              {['TASK', 'APPROVAL', 'TICKET'].includes(form.type) && <FormField label={copy.t('Hạn xử lý')}><input type="datetime-local" value={form.dueAt} onChange={event => setForm(previous => ({ ...previous, dueAt: event.target.value }))} /></FormField>}
              {form.type === 'EVENT' && <>
                <FormField label={copy.t('Bắt đầu')}><input type="datetime-local" value={form.startsAt} onChange={event => setForm(previous => ({ ...previous, startsAt: event.target.value }))} required /></FormField>
                <FormField label={copy.t('Kết thúc')}><input type="datetime-local" value={form.endsAt} onChange={event => setForm(previous => ({ ...previous, endsAt: event.target.value }))} /></FormField>
                <FormField label={copy.t('Địa điểm')}><input value={form.location} onChange={event => setForm(previous => ({ ...previous, location: event.target.value }))} maxLength="255" /></FormField>
                <FormField label={copy.t('Link họp')}><input type="url" value={form.meetingUrl} onChange={event => setForm(previous => ({ ...previous, meetingUrl: event.target.value }))} /></FormField>
                <label className="enterprise-inline-toggle"><input type="checkbox" checked={form.allDay} onChange={event => setForm(previous => ({ ...previous, allDay: event.target.checked }))} /><span>{copy.t('Cả ngày')}</span></label>
              </>}
              {['TICKET', 'WIKI'].includes(form.type) && <FormField label={copy.t('Danh mục')}><input value={form.category} onChange={event => setForm(previous => ({ ...previous, category: event.target.value }))} maxLength="255" /></FormField>}
              {form.type === 'WIKI' && <FormField label={copy.t('Thẻ, cách nhau bằng dấu phẩy')}><input value={form.tags} onChange={event => setForm(previous => ({ ...previous, tags: event.target.value }))} /></FormField>}
              {form.type === 'APPROVAL' && <FormField label={copy.t('Loại đề nghị')}><input value={form.requestKind} onChange={event => setForm(previous => ({ ...previous, requestKind: event.target.value }))} maxLength="255" /></FormField>}
              {form.type === 'INTEGRATION' && <>
                <FormField label={copy.t('Nhà cung cấp')}><input value={form.provider} onChange={event => setForm(previous => ({ ...previous, provider: event.target.value }))} maxLength="255" required /></FormField>
                <FormField label={copy.t('Endpoint công khai')}><input type="url" value={form.endpoint} onChange={event => setForm(previous => ({ ...previous, endpoint: event.target.value }))} placeholder="https://..." /></FormField>
                <FormField label={copy.t('Chiều đồng bộ')}><select value={form.syncDirection} onChange={event => setForm(previous => ({ ...previous, syncDirection: event.target.value }))}><option value="BIDIRECTIONAL">{copy.t('Hai chiều')}</option><option value="INBOUND">{copy.t('Vào Workspace')}</option><option value="OUTBOUND">{copy.t('Ra hệ thống')}</option></select></FormField>
                <p className="enterprise-security-note wide"><i className="fa-solid fa-shield-halved"></i>{copy.t('Workspace không lưu API key, token hoặc mật khẩu tích hợp.')}</p>
              </>}
              {form.type === 'ANNOUNCEMENT' && <div className="enterprise-toggle-row wide">
                <label><input type="checkbox" checked={form.requiresAck} onChange={event => setForm(previous => ({ ...previous, requiresAck: event.target.checked }))} /><span>{copy.t('Bắt buộc nhân viên xác nhận đã đọc')}</span></label>
                <label><input type="checkbox" checked={form.pinned} onChange={event => setForm(previous => ({ ...previous, pinned: event.target.checked }))} /><span>{copy.t('Ghim thông báo')}</span></label>
              </div>}
              <fieldset className="enterprise-member-picker wide">
                <legend>{copy.t(form.type === 'APPROVAL' ? 'Người phê duyệt' : form.type === 'EVENT' ? 'Người tham dự' : 'Người liên quan')}</legend>
                <div>{accounts.filter(account => account.id !== userId || form.type === 'EVENT').map(account => {
                  const selected = form.participantIds.includes(account.id);
                   return <label key={account.id} className={selected ? 'selected' : ''}><input type="checkbox" checked={selected} onChange={() => setForm(previous => {
                     const participantIds = selected
                       ? previous.participantIds.filter(id => id !== account.id)
                       : [...previous.participantIds, account.id];
                     const participantRoles = { ...(previous.participantRoles || {}) };
                     if (selected) delete participantRoles[account.id];
                     else participantRoles[account.id] = participantRoles[account.id] || PARTICIPANT_ROLE[form.type];
                     return { ...previous, participantIds, participantRoles };
                   })} /><Avatar account={account} small /><span><strong>{account.name}</strong><small>{account.department || account.title || account.username}</small></span><i className="fa-solid fa-check"></i></label>;
                })}</div>
              </fieldset>
            </div>
            <footer><button type="button" onClick={() => setForm(null)} disabled={saving}>{copy.t('Hủy')}</button><button type="submit" className="primary" disabled={saving || !form.title.trim()}><i className={'fa-solid ' + (saving ? 'fa-spinner fa-spin' : 'fa-floppy-disk')}></i>{saving ? copy.t('Đang lưu...') : form.id ? copy.t('Lưu thay đổi') : copy.t('Tạo mục mới')}</button></footer>
          </form>
        </div>
      )}
    </div>
  );
}
