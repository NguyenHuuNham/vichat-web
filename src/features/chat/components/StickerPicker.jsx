import React, { useEffect, useMemo, useState } from 'react';
import {
  STICKER_PACKS,
  filterStickers,
  readRecentStickerIds,
  rememberStickerId,
  stickerById,
} from '../services/stickerCatalog';

const EMOJIS = ['😀', '😂', '😍', '👍', '👏', '🎉', '🙏', '🔥', '✅', '❤️'];

export default function StickerPicker({
  activeTab = 'stickers',
  onTabChange = () => {},
  onSelectSticker = () => {},
  onSelectEmoji = () => {},
  scope = 'anonymous',
  copy = { t: value => value },
}) {
  const [selectedPack, setSelectedPack] = useState(() => (
    readRecentStickerIds(scope).length > 0 ? 'recent' : STICKER_PACKS[0]?.id || 'recent'
  ));
  const [query, setQuery] = useState('');
  const [recentIds, setRecentIds] = useState(() => readRecentStickerIds(scope));

  useEffect(() => {
    const nextRecentIds = readRecentStickerIds(scope);
    setRecentIds(nextRecentIds);
    setSelectedPack(current => current === 'recent' && nextRecentIds.length === 0
      ? STICKER_PACKS[0]?.id || 'recent'
      : current);
  }, [scope]);

  const selectedPackData = useMemo(
    () => STICKER_PACKS.find(pack => pack.id === selectedPack) || null,
    [selectedPack],
  );
  const selectedItems = useMemo(() => {
    if (selectedPack === 'recent') {
      return recentIds.map(stickerById).filter(Boolean);
    }
    return selectedPackData?.items || [];
  }, [recentIds, selectedPack, selectedPackData]);
  const visibleItems = useMemo(() => filterStickers(selectedItems, query), [selectedItems, query]);

  const selectPack = packId => {
    setSelectedPack(packId);
    setQuery('');
  };

  const selectSticker = sticker => {
    const nextRecentIds = rememberStickerId(scope, sticker.id);
    setRecentIds(nextRecentIds);
    onSelectSticker(sticker);
  };

  return (
    <div className="sticker-picker-panel" role="dialog" aria-label={copy.t('Sticker và biểu cảm')}>
      <div className="sticker-picker-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={activeTab === 'stickers'} className={activeTab === 'stickers' ? 'active' : ''} onClick={() => onTabChange('stickers')}>
          {copy.t('STICKER')}
        </button>
        <button type="button" role="tab" aria-selected={activeTab === 'emoji'} className={activeTab === 'emoji' ? 'active' : ''} onClick={() => onTabChange('emoji')}>
          {copy.t('EMOJI')}
        </button>
      </div>

      {activeTab === 'emoji' ? (
        <div className="sticker-emoji-grid" role="listbox" aria-label={copy.t('Chọn biểu cảm')}>
          {EMOJIS.map(emoji => (
            <button type="button" role="option" key={emoji} aria-label={emoji} onMouseDown={event => event.preventDefault()} onClick={() => onSelectEmoji(emoji)}>{emoji}</button>
          ))}
        </div>
      ) : (
        <>
          <label className="sticker-search">
            <i className="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder={copy.t('Tìm kiếm sticker')} aria-label={copy.t('Tìm kiếm sticker')} />
          </label>
          <div className="sticker-picker-body">
            <div className="sticker-picker-heading">
              <span>{selectedPack === 'recent' ? copy.t('Gần đây') : copy.t(selectedPackData?.label || 'Sticker')}</span>
              <small>{visibleItems.length}</small>
            </div>
            <div className="sticker-grid" role="listbox" aria-label={copy.t('Danh sách sticker')}>
              {visibleItems.length > 0 ? visibleItems.map(sticker => (
                <button type="button" role="option" key={sticker.id} className="sticker-option" title={sticker.label} aria-label={sticker.label} onMouseDown={event => event.preventDefault()} onClick={() => selectSticker(sticker)}>
                  <img src={sticker.src} alt="" loading="lazy" draggable="false" />
                </button>
              )) : <div className="sticker-empty">{copy.t(query ? 'Không tìm thấy sticker phù hợp' : 'Chưa có sticker gần đây')}</div>}
            </div>
          </div>
          <div className="sticker-pack-tabs" role="tablist" aria-label={copy.t('Nhóm sticker')}>
            <button type="button" role="tab" aria-selected={selectedPack === 'recent'} className={selectedPack === 'recent' ? 'active' : ''} title={copy.t('Gần đây')} aria-label={copy.t('Gần đây')} onClick={() => selectPack('recent')}><i className="fa-regular fa-clock"></i></button>
            {STICKER_PACKS.map(pack => <button type="button" role="tab" aria-selected={selectedPack === pack.id} key={pack.id} className={selectedPack === pack.id ? 'active' : ''} title={copy.t(pack.label)} aria-label={copy.t(pack.label)} style={{ '--sticker-pack-color': pack.color }} onClick={() => selectPack(pack.id)}><span className="sticker-pack-tab-preview"><img src={pack.items[0].src} alt="" loading="lazy" draggable="false" /></span><i className={`fa-solid ${pack.icon}`} aria-hidden="true"></i></button>)}
          </div>
        </>
      )}
    </div>
  );
}
