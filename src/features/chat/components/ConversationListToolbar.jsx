import React from 'react';

function FilterChoice({ active, children, onClick, icon }) {
  return (
    <button type="button" className={`conversation-filter-choice ${active ? 'active' : ''}`} onClick={onClick} role="menuitemradio" aria-checked={active}>
      <i className={`fa-solid ${icon || (active ? 'fa-circle-check' : 'fa-circle')}`} aria-hidden="true"></i>
      <span>{children}</span>
    </button>
  );
}
export default function ConversationListToolbar({
  copy,
  tab,
  onTabChange,
  categoryOptions = [],
  categoryMenuOpen,
  onToggleCategoryMenu,
  status,
  onStatusChange,
  selectedCategoryIds = [],
  onToggleCategory,
  strangersOnly,
  onToggleStrangers,
  onManageCategories,
  moreMenuOpen,
  onToggleMoreMenu,
  onResetFilters,
}) {
  const activeFilterCount = (status !== 'all' ? 1 : 0)
    + selectedCategoryIds.length
    + (strangersOnly ? 1 : 0);
  const categoryFilterActive = activeFilterCount > 0;

  return (
    <div className="conversation-list-toolbar" onClick={event => event.stopPropagation()}>
      <div className="conversation-list-tabs" role="tablist" aria-label={copy.t('Lọc hội thoại')}>
        <button type="button" role="tab" aria-selected={tab === 'all'} className={tab === 'all' ? 'active' : ''} onClick={() => onTabChange('all')}>
          {copy.t('Tất cả')}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'groups'} className={tab === 'groups' ? 'active' : ''} onClick={() => onTabChange('groups')}>
          {copy.t('Nhóm')}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'categories' || categoryFilterActive} className={tab === 'categories' || categoryFilterActive ? 'active' : ''} onClick={onToggleCategoryMenu} aria-expanded={categoryMenuOpen} aria-haspopup="menu">
          <span>{copy.t('Phân loại')}</span>
          {activeFilterCount > 0 && <strong>{activeFilterCount}</strong>}
        </button>
        <button type="button" className={`conversation-list-more ${moreMenuOpen ? 'active' : ''}`} onClick={onToggleMoreMenu} aria-expanded={moreMenuOpen} aria-haspopup="menu" aria-label={copy.t('Thêm bộ lọc')} title={copy.t('Thêm bộ lọc')}>
          <i className="fa-solid fa-ellipsis" aria-hidden="true"></i>
        </button>
      </div>

      {categoryMenuOpen && (
        <div className="conversation-list-filter-menu" role="menu" aria-label={copy.t('Phân loại')}>
          <div className="conversation-list-filter-heading">
            <strong>{copy.t('Phân loại')}</strong>
            {categoryFilterActive && <button type="button" onClick={onResetFilters}>{copy.t('Đặt lại')}</button>}
          </div>
          <div className="conversation-list-filter-section">
            <span className="conversation-list-filter-label">{copy.t('Trạng thái')}</span>
            <FilterChoice active={status === 'all'} onClick={() => onStatusChange('all')} icon="fa-list">{copy.t('Tất cả')}</FilterChoice>
            <FilterChoice active={status === 'unread'} onClick={() => onStatusChange('unread')} icon="fa-envelope">{copy.t('Chưa đọc')}</FilterChoice>
          </div>
          <div className="conversation-list-filter-section">
            <span className="conversation-list-filter-label">{copy.t('Thẻ phân loại')}</span>
            {categoryOptions.map(category => {
              const selected = selectedCategoryIds.includes(category.id);
              return (
                <button type="button" role="menuitemcheckbox" aria-checked={selected} className={`conversation-filter-choice ${selected ? 'active' : ''}`} key={category.id} onClick={() => onToggleCategory(category.id)}>
                  <span className="conversation-filter-tag" style={{ backgroundColor: category.color }}></span>
                  <span>{category.builtIn ? copy.t(category.label) : category.label}</span>
                  {selected && <i className="fa-solid fa-check" aria-hidden="true"></i>}
                </button>
              );
            })}
          </div>
          <button type="button" role="menuitemcheckbox" aria-checked={strangersOnly} className={`conversation-filter-choice stranger ${strangersOnly ? 'active' : ''}`} onClick={onToggleStrangers}>
            <i className="fa-solid fa-user-secret" aria-hidden="true"></i>
            <span>{copy.t('Tin nhắn từ người lạ')}</span>
            {strangersOnly && <i className="fa-solid fa-check" aria-hidden="true"></i>}
          </button>
          <div className="conversation-list-filter-divider"></div>
          <button type="button" role="menuitem" className="conversation-filter-manage" onClick={onManageCategories}>
            <i className="fa-solid fa-sliders" aria-hidden="true"></i>
            <span>{copy.t('Quản lý thẻ phân loại')}</span>
          </button>
        </div>
      )}

      {moreMenuOpen && (
        <div className="conversation-list-filter-menu conversation-list-more-menu" role="menu" aria-label={copy.t('Thêm bộ lọc')}>
          <button type="button" role="menuitem" className="conversation-filter-manage" onClick={onManageCategories}>
            <i className="fa-solid fa-tags" aria-hidden="true"></i>
            <span>{copy.t('Quản lý thẻ phân loại')}</span>
          </button>
          {categoryFilterActive && (
            <button type="button" role="menuitem" className="conversation-filter-manage" onClick={onResetFilters}>
              <i className="fa-solid fa-rotate-left" aria-hidden="true"></i>
              <span>{copy.t('Đặt lại bộ lọc')}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
