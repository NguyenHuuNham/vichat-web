import React, { useMemo, useState } from 'react';
import TaskCard from './TaskCard';

function initials(name) {
  return String(name || '?')
    .trim()
    .split(/\s+/)
    .slice(-2)
    .map(part => part[0])
    .join('')
    .toUpperCase();
}

function StaffAvatar({ account }) {
  if (account?.avatar) {
    return <img src={account.avatar} alt={account.name || ''} className="staff-avatar-img" />;
  }
  return <span className="staff-avatar-img fallback">{initials(account?.name)}</span>;
}

export default function CompanyStaffMatrixView({
  tasks = [],
  accounts = [],
  onSelectTask,
  onToggleComplete,
  onOpenChat,
  copy = { t: text => text },
}) {
  const [filterMode, setFilterMode] = useState('ALL'); // 'ALL' | 'OVERDUE_ONLY' | 'IDLE_STAFF'
  const [selectedDepartment, setSelectedDepartment] = useState('ALL');
  const [staffSearch, setStaffSearch] = useState('');
  const [expandedStaffIds, setExpandedStaffIds] = useState(new Set());

  const toggleStaffExpand = staffId => {
    setExpandedStaffIds(prev => {
      const next = new Set(prev);
      if (next.has(staffId)) next.delete(staffId);
      else next.add(staffId);
      return next;
    });
  };

  // Build matrix per employee
  const staffMatrix = useMemo(() => {
    return accounts.map(account => {
      const staffId = String(account.id || account.uid);
      const staffName = account.name || account.fullName || account.username || 'Nhân viên';
      const department = account.department || 'Nhân sự chung';

      // Tasks where staff is assignee or collaborator
      const assignedTasks = tasks.filter(t => String(t.assignee?.id) === staffId);
      const collabTasks = tasks.filter(t => (t.collaborators || []).some(c => String(c.id) === staffId));
      const allStaffTasks = [...new Set([...assignedTasks, ...collabTasks])];

      const ongoingTasks = allStaffTasks.filter(t => t.status !== 'DONE' && t.status !== 'CANCELLED');
      const completedTasks = allStaffTasks.filter(t => t.status === 'DONE');
      const overdueTasks = ongoingTasks.filter(t => t.dueStatus?.isOverdue);
      const todayTasks = ongoingTasks.filter(t => t.dueStatus?.isDueToday);

      const total = allStaffTasks.length;
      const doneCount = completedTasks.length;
      const progressPercent = total > 0 ? Math.round((doneCount / total) * 100) : 0;
      const isIdle = ongoingTasks.length === 0;

      return {
        account,
        staffId,
        staffName,
        department,
        allTasks: allStaffTasks,
        ongoingTasks,
        completedTasks,
        overdueTasks,
        todayTasks,
        total,
        doneCount,
        progressPercent,
        isIdle,
      };
    });
  }, [accounts, tasks]);

  // Unique departments
  const departments = useMemo(() => {
    const set = new Set();
    staffMatrix.forEach(s => {
      if (s.department) set.add(s.department);
    });
    return Array.from(set).sort();
  }, [staffMatrix]);

  // Overall company metrics
  const companyMetrics = useMemo(() => {
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.status === 'DONE').length;
    const overdueTasks = tasks.filter(t => t.status !== 'DONE' && t.status !== 'CANCELLED' && t.dueStatus?.isOverdue);
    const idleStaffCount = staffMatrix.filter(s => s.isIdle).length;

    return {
      totalTasks,
      completedTasks,
      overdueTasksCount: overdueTasks.length,
      idleStaffCount,
      overdueTasks,
    };
  }, [tasks, staffMatrix]);

  // Filtered staff list
  const filteredStaff = useMemo(() => {
    const q = staffSearch.trim().toLowerCase();
    return staffMatrix.filter(staff => {
      if (selectedDepartment !== 'ALL' && staff.department !== selectedDepartment) {
        return false;
      }
      if (q) {
        const matchName = staff.staffName.toLowerCase().includes(q);
        const matchDept = staff.department.toLowerCase().includes(q);
        if (!matchName && !matchDept) return false;
      }
      if (filterMode === 'OVERDUE_ONLY') {
        return staff.overdueTasks.length > 0;
      }
      if (filterMode === 'IDLE_STAFF') {
        return staff.isIdle;
      }
      return true;
    });
  }, [staffMatrix, selectedDepartment, staffSearch, filterMode]);

  // Group filtered staff by department
  const groupedByDept = useMemo(() => {
    const map = new Map();
    filteredStaff.forEach(staff => {
      const dept = staff.department || 'Phòng ban khác';
      if (!map.has(dept)) map.set(dept, []);
      map.get(dept).push(staff);
    });
    return Array.from(map.entries());
  }, [filteredStaff]);

  return (
    <div className="company-staff-matrix-view">
      {/* Thanh cảnh báo & Số liệu toàn cảnh của Sếp */}
      <div className="boss-command-banner">
        <div className="boss-banner-header">
          <div className="boss-banner-title">
            <span className="boss-badge">
              <i className="fa-solid fa-building-user"></i> {copy.t('COMMAND CENTER')}
            </span>
            <h3>{copy.t('Toàn cảnh Nhân sự & Tiến độ Công ty')}</h3>
          </div>
          <div className="boss-quick-filters">
            <button
              type="button"
              className={`boss-filter-btn ${filterMode === 'ALL' ? 'active' : ''}`}
              onClick={() => setFilterMode('ALL')}
            >
              <i className="fa-solid fa-users"></i>
              <span>{copy.t('Tất cả nhân sự')} ({accounts.length})</span>
            </button>
            <button
              type="button"
              className={`boss-filter-btn danger ${filterMode === 'OVERDUE_ONLY' ? 'active' : ''}`}
              onClick={() => setFilterMode('OVERDUE_ONLY')}
            >
              <i className="fa-solid fa-triangle-exclamation"></i>
              <span>{copy.t('Có việc quá hạn')} ({companyMetrics.overdueTasksCount})</span>
            </button>
            <button
              type="button"
              className={`boss-filter-btn warning ${filterMode === 'IDLE_STAFF' ? 'active' : ''}`}
              onClick={() => setFilterMode('IDLE_STAFF')}
            >
              <i className="fa-solid fa-user-clock"></i>
              <span>{copy.t('Chưa có việc hôm nay')} ({companyMetrics.idleStaffCount})</span>
            </button>
          </div>
        </div>

        {/* Thanh tìm kiếm & lọc phòng ban */}
        <div className="boss-controls-bar">
          <div className="boss-dept-pills">
            <button
              type="button"
              className={`dept-pill ${selectedDepartment === 'ALL' ? 'active' : ''}`}
              onClick={() => setSelectedDepartment('ALL')}
            >
              {copy.t('Tất cả phòng ban')}
            </button>
            {departments.map(dept => (
              <button
                type="button"
                key={dept}
                className={`dept-pill ${selectedDepartment === dept ? 'active' : ''}`}
                onClick={() => setSelectedDepartment(dept)}
              >
                {dept}
              </button>
            ))}
          </div>

          <div className="boss-staff-search">
            <i className="fa-solid fa-magnifying-glass"></i>
            <input
              type="search"
              placeholder={copy.t('Tìm tên nhân sự, chức vụ...')}
              value={staffSearch}
              onChange={e => setStaffSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Hiển thị danh sách nhân sự theo phòng ban */}
      <div className="matrix-content-scroll">
        {groupedByDept.length === 0 ? (
          <div className="matrix-empty">
            <i className="fa-solid fa-user-slash"></i>
            <span>{copy.t('Không tìm thấy nhân viên nào phù hợp bộ lọc hiện tại.')}</span>
            <button
              type="button"
              className="btn-reset-filters"
              onClick={() => {
                setFilterMode('ALL');
                setSelectedDepartment('ALL');
                setStaffSearch('');
              }}
            >
              {copy.t('Đặt lại bộ lọc')}
            </button>
          </div>
        ) : (
          groupedByDept.map(([deptName, staffList]) => (
            <section key={deptName} className="dept-matrix-section">
              <div className="dept-matrix-header">
                <div className="dept-title-wrap">
                  <i className="fa-solid fa-sitemap"></i>
                  <h4>{deptName}</h4>
                  <span className="dept-count-badge">{staffList.length} {copy.t('nhân sự')}</span>
                </div>
              </div>

              <div className="dept-staff-cards-grid">
                {staffList.map(staff => {
                  const isExpanded = expandedStaffIds.has(staff.staffId);
                  return (
                    <div
                      key={staff.staffId}
                      className={`staff-matrix-card ${staff.overdueTasks.length > 0 ? 'has-overdue' : ''} ${staff.isIdle ? 'is-idle' : ''}`}
                    >
                      {/* Header thẻ nhân sự */}
                      <div className="staff-card-header">
                        <div className="staff-info-col">
                          <StaffAvatar account={staff.account} />
                          <div className="staff-name-col">
                            <strong>{staff.staffName}</strong>
                            <small>{staff.account.title || staff.account.department || copy.t('Nhân viên')}</small>
                          </div>
                        </div>

                        {/* Nhãn trạng thái tải việc */}
                        <div className="staff-workload-tag">
                          {staff.overdueTasks.length > 0 ? (
                            <span className="workload-pill danger">
                              <i className="fa-solid fa-triangle-exclamation"></i>
                              {staff.overdueTasks.length} {copy.t('quá hạn')}
                            </span>
                          ) : staff.isIdle ? (
                            <span className="workload-pill idle">
                              <i className="fa-solid fa-couch"></i> {copy.t('Rảnh việc')}
                            </span>
                          ) : (
                            <span className="workload-pill active">
                              <i className="fa-solid fa-bolt"></i> {staff.ongoingTasks.length} {copy.t('đang làm')}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Thống kê tiến độ */}
                      <div className="staff-stats-strip">
                        <div className="stat-col">
                          <span className="stat-label">{copy.t('Đang làm')}</span>
                          <span className="stat-val ongoing">{staff.ongoingTasks.length}</span>
                        </div>
                        <div className="stat-col">
                          <span className="stat-label">{copy.t('Hôm nay')}</span>
                          <span className="stat-val today">{staff.todayTasks.length}</span>
                        </div>
                        <div className="stat-col">
                          <span className="stat-label">{copy.t('Đã xong')}</span>
                          <span className="stat-val done">{staff.completedTasks.length}</span>
                        </div>
                        <div className="stat-col">
                          <span className="stat-label">{copy.t('Tiến độ')}</span>
                          <span className="stat-val percent">{staff.progressPercent}%</span>
                        </div>
                      </div>

                      {/* Thanh Progress bar */}
                      <div className="staff-progress-bar">
                        <div
                          className="staff-progress-fill"
                          style={{ width: `${staff.progressPercent}%` }}
                        ></div>
                      </div>

                      {/* Nút bấm xem danh sách việc */}
                      <div className="staff-card-actions">
                        <button
                          type="button"
                          className="btn-toggle-tasks"
                          onClick={() => toggleStaffExpand(staff.staffId)}
                        >
                          <i className={`fa-solid ${isExpanded ? 'fa-chevron-up' : 'fa-chevron-down'}`}></i>
                          <span>
                            {isExpanded
                              ? copy.t('Thu gọn danh sách')
                              : `${copy.t('Xem chi tiết')} (${staff.allTasks.length} việc)`}
                          </span>
                        </button>
                      </div>

                      {/* Danh sách công việc mở rộng */}
                      {isExpanded && (
                        <div className="staff-expanded-tasks">
                          {staff.allTasks.length === 0 ? (
                            <div className="staff-empty-tasks">
                              <small>{copy.t('Nhân viên này chưa có công việc nào được gán.')}</small>
                            </div>
                          ) : (
                            <div className="staff-tasks-flow">
                              {staff.allTasks.map(task => (
                                <TaskCard
                                  key={task.id}
                                  task={task}
                                  onSelect={onSelectTask}
                                  onToggleComplete={onToggleComplete}
                                  onOpenChat={onOpenChat}
                                  copy={copy}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
