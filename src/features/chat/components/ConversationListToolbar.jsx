import React, { useRef, useState, useEffect, useCallback } from 'react';

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
  zaloBots = [],
  selectedBotId = '',
  onSelectBot = () => {},
  zaloTotal = 0,
  unreadCount = 0,
}) {
  const tabsRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const activeFilterCount = (status !== 'all' ? 1 : 0)
    + selectedCategoryIds.length
    + (strangersOnly ? 1 : 0);
  const categoryFilterActive = activeFilterCount > 0;

  const updateScrollIndicators = useCallback(() => {
    const el = tabsRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    updateScrollIndicators();
    const el = tabsRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateScrollIndicators, { passive: true });
    window.addEventListener('resize', updateScrollIndicators);
    return () => {
      el.removeEventListener('scroll', updateScrollIndicators);
      window.removeEventListener('resize', updateScrollIndicators);
    };
  }, [updateScrollIndicators, zaloBots]);

  const handleWheel = event => {
    if (tabsRef.current && event.deltaY) {
      tabsRef.current.scrollLeft += event.deltaY;
    }
  };

  const scrollTabs = direction => {
    if (tabsRef.current) {
      tabsRef.current.scrollBy({ left: direction * 140, behavior: 'smooth' });
    }
  };

  return (
    <div className="conversation-list-toolbar" onClick={event => event.stopPropagation()}>
      <div className="conversation-list-tabs-wrapper">
        {canScrollLeft && (
          <button
            type="button"
            className="conversation-tabs-scroll-btn left"
            onClick={() => scrollTabs(-1)}
            aria-label={copy.t('Cuộn sang trái')}
            tabIndex="-1"
          >
            <i className="fa-solid fa-chevron-left" aria-hidden="true"></i>
          </button>
        )}

        <div
          ref={tabsRef}
          className="conversation-list-tabs"
          role="tablist"
          aria-label={copy.t('Lọc hội thoại')}
          onWheel={handleWheel}
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'all'}
            className={tab === 'all' ? 'active' : ''}
            onClick={() => onTabChange('all')}
          >
            {copy.t('Tất cả')}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={tab === 'groups'}
            className={tab === 'groups' ? 'active' : ''}
            onClick={() => onTabChange('groups')}
          >
            {copy.t('Nhóm')}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={tab === 'zalo'}
            className={tab === 'zalo' ? 'active' : ''}
            onClick={() => onTabChange('zalo')}
          >
            {copy.t('Zalo OA')}
            {zaloTotal > 0 && <span className="tab-pill-badge">{zaloTotal}</span>}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={tab === 'livechat'}
            className={tab === 'livechat' ? 'active' : ''}
            onClick={() => onTabChange('livechat')}
          >
            {copy.t('Live Chat')}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={tab === 'facebook'}
            className={tab === 'facebook' ? 'active' : ''}
            onClick={() => onTabChange('facebook')}
          >
            {copy.t('Facebook')}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={tab === 'unread'}
            className={tab === 'unread' ? 'active' : ''}
            onClick={() => onTabChange('unread')}
          >
            <span>{copy.t('Chưa đọc')}</span>
            {unreadCount > 0 && (
              <span className={`tab-pill-badge ${tab === 'unread' ? '' : 'unread-badge'}`}>
                {unreadCount}
              </span>
            )}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={tab === 'categories' || categoryFilterActive}
            className={tab === 'categories' || categoryFilterActive ? 'active' : ''}
            onClick={onToggleCategoryMenu}
            aria-expanded={categoryMenuOpen}
            aria-haspopup="menu"
          >
            <span>{copy.t('Phân loại')}</span>
            {activeFilterCount > 0 && <span className="tab-pill-badge">{activeFilterCount}</span>}
          </button>

          <button
            type="button"
            className={`conversation-list-more ${moreMenuOpen ? 'active' : ''}`}
            onClick={onToggleMoreMenu}
            aria-expanded={moreMenuOpen}
            aria-haspopup="menu"
            aria-label={copy.t('Thêm bộ lọc')}
            title={copy.t('Thêm bộ lọc')}
          >
            <i className="fa-solid fa-ellipsis" aria-hidden="true"></i>
          </button>
        </div>

        {canScrollRight && (
          <button
            type="button"
            className="conversation-tabs-scroll-btn right"
            onClick={() => scrollTabs(1)}
            aria-label={copy.t('Cuộn sang phải')}
            tabIndex="-1"
          >
            <i className="fa-solid fa-chevron-right" aria-hidden="true"></i>
          </button>
        )}
      </div>

      {tab === 'zalo' && zaloBots.length > 0 && (
        <div className="zalo-bot-filter-bar" role="toolbar" aria-label={copy.t('Phân loại theo Bot')}>
          <div className="zalo-bot-select-wrap">
            <i className="fa-solid fa-robot" aria-hidden="true"></i>
            <select
              className="zalo-bot-select"
              value={selectedBotId || ''}
              onChange={e => onSelectBot(e.target.value)}
              aria-label={copy.t('Chọn Bot Zalo OA')}
            >
              <option value="">{copy.t('Tất cả Bot')} ({zaloTotal})</option>
              {zaloBots.map(bot => (
                <option key={bot.id} value={bot.id}>
                  {bot.name} ({bot.count})
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className={`zalo-bot-chip ${!selectedBotId ? 'active' : ''}`}
            onClick={() => onSelectBot('')}
          >
            <span>{copy.t('Tất cả')}</span>
            {zaloTotal > 0 && <span className="zalo-bot-chip-count">{zaloTotal}</span>}
          </button>
          {zaloBots.map(bot => (
            <button
              key={bot.id}
              type="button"
              className={`zalo-bot-chip ${selectedBotId === bot.id ? 'active' : ''}`}
              onClick={() => onSelectBot(bot.id)}
            >
              <span>{bot.name.replace(' global education', '').replace(' Mobile', '')}</span>
              {bot.count > 0 && <span className="zalo-bot-chip-count">{bot.count}</span>}
            </button>
          ))}
        </div>
      )}

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
