import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  STICKER_ITEMS,
  STICKER_PACKS,
  filterStickers,
  forgetStickerId,
  readRecentStickerIds,
  rememberStickerId,
} from '../services/stickerCatalog';
import {
  CUSTOM_STICKER_MAX_ITEMS,
  CUSTOM_STICKER_PACK_ID,
  deleteCustomSticker,
  readCustomStickers,
  writeCustomStickerFiles,
} from '../services/customStickerStore';

const EMOJIS = [
  '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊', '😇',
  '🥰', '😍', '🤩', '😘', '😗', '😚', '😋', '😛', '😜', '🤪', '🤨', '🧐', '🤓',
  '😎', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', '😖', '😫',
  '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱',
  '😨', '😰', '😥', '😓', '🤗', '🤔', '🫡', '🤭', '🤫', '🤥', '😶', '😐', '😑',
  '😬', '🙄', '😯', '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐',
  '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕', '👍', '👎', '👌', '✌️', '🤞', '🤟',
  '🤘', '👏', '🙌', '👐', '🤝', '🙏', '💪', '👀', '❤️', '🧡', '💛', '💚', '💙',
  '💜', '🖤', '🤍', '🤎', '💔', '✨', '🔥', '🎉', '🎊', '✅', '❌', '⭐', '🌟',
  '💯', '🚀', '💡', '📌', '⏰', '🎯', '💬', '📣', '🆗', '🔔', '🙈', '🙉', '🙊',
];

function StickerArtwork({ sticker }) {
  const [source, setSource] = useState(() => String(sticker?.src || ''));

  useEffect(() => {
    if (!sticker?.blob || typeof URL === 'undefined' || !URL.createObjectURL) {
      setSource(String(sticker?.src || ''));
      return undefined;
    }
    const objectUrl = URL.createObjectURL(sticker.blob);
    setSource(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [sticker?.blob, sticker?.src]);

  return source
    ? <img src={source} alt="" loading="lazy" draggable="false" />
    : <i className="fa-regular fa-image" aria-hidden="true"></i>;
}

export default function StickerPicker({
  activeTab = 'stickers',
  onTabChange = () => {},
  onSelectSticker = () => {},
  onSelectEmoji = () => {},
  scope = 'anonymous',
  scopeAliases = [],
  copy = { t: value => value },
}) {
  const [selectedPack, setSelectedPack] = useState(() => (
    readRecentStickerIds(scope, scopeAliases).length > 0 ? 'recent' : STICKER_PACKS[0]?.id || 'recent'
  ));
  const [query, setQuery] = useState('');
  const [recentIds, setRecentIds] = useState(() => readRecentStickerIds(scope, scopeAliases));
  const [customStickers, setCustomStickers] = useState([]);
  const [customLoading, setCustomLoading] = useState(false);
  const [customSaving, setCustomSaving] = useState(false);
  const [deletingStickerId, setDeletingStickerId] = useState('');
  const [customNotice, setCustomNotice] = useState('');
  const [customError, setCustomError] = useState('');
  const uploadInputRef = useRef(null);
  const mountedRef = useRef(true);
  const scopeRef = useRef(scope);
  scopeRef.current = scope;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setCustomStickers([]);
    setCustomSaving(false);
    setDeletingStickerId('');
    setCustomNotice('');
    setCustomError('');
    setCustomLoading(true);
    readCustomStickers(scope, undefined, scopeAliases)
      .then(stickers => {
        if (active) setCustomStickers(stickers);
      })
      .catch(error => {
        if (active) setCustomError(error?.message || 'Không thể đọc kho sticker cá nhân.');
      })
      .finally(() => {
        if (active) setCustomLoading(false);
      });
    return () => {
      active = false;
    };
  }, [scope, scopeAliases]);

  const stickerLookup = useMemo(() => new Map(
    [...STICKER_ITEMS, ...customStickers].map(sticker => [sticker.id, sticker]),
  ), [customStickers]);

  useEffect(() => {
    const nextRecentIds = readRecentStickerIds(scope, scopeAliases).filter(id => stickerLookup.has(id));
    setRecentIds(nextRecentIds);
  }, [scope, scopeAliases, stickerLookup]);

  const selectedPackData = useMemo(
    () => STICKER_PACKS.find(pack => pack.id === selectedPack) || null,
    [selectedPack],
  );
  const selectedItems = useMemo(() => {
    if (selectedPack === 'recent') {
      return recentIds.map(id => stickerLookup.get(id)).filter(Boolean);
    }
    if (selectedPack === CUSTOM_STICKER_PACK_ID) return customStickers;
    return selectedPackData?.items || [];
  }, [customStickers, recentIds, selectedPack, selectedPackData, stickerLookup]);
  const visibleItems = useMemo(() => filterStickers(selectedItems, query), [selectedItems, query]);
  const selectedPackLabel = selectedPack === 'recent'
    ? copy.t('Gần đây')
    : selectedPack === CUSTOM_STICKER_PACK_ID
      ? copy.t('Sticker của tôi')
      : copy.t(selectedPackData?.label || 'Sticker');
  const emptyLabel = query
    ? 'Không tìm thấy sticker phù hợp'
    : selectedPack === CUSTOM_STICKER_PACK_ID
      ? 'Chưa có sticker cá nhân'
      : 'Chưa có sticker gần đây';

  const selectPack = packId => {
    setSelectedPack(packId);
    setQuery('');
    setCustomNotice('');
    setCustomError('');
  };

  const selectSticker = sticker => {
    const nextRecentIds = rememberStickerId(scope, sticker.id, scopeAliases);
    setRecentIds(nextRecentIds);
    onSelectSticker(sticker);
  };

  const handleCustomStickerUpload = async event => {
    const uploadScope = scope;
    const uploadScopeAliases = scopeAliases;
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length === 0) return;
    setCustomSaving(true);
    setCustomNotice('');
    setCustomError('');
    try {
      const result = await writeCustomStickerFiles(uploadScope, files, undefined, uploadScopeAliases);
      const next = await readCustomStickers(uploadScope, undefined, uploadScopeAliases);
      if (!mountedRef.current || scopeRef.current !== uploadScope) return;
      setCustomStickers(next);
      setSelectedPack(CUSTOM_STICKER_PACK_ID);
      if (result.added.length > 0) setCustomNotice('Đã thêm sticker vào kho của bạn.');
      else if (result.duplicateCount > 0) setCustomNotice('Sticker này đã có trong kho của bạn.');
    } catch (error) {
      if (mountedRef.current && scopeRef.current === uploadScope) {
        setCustomError(error?.message || 'Không thể lưu sticker cá nhân.');
      }
    } finally {
      if (mountedRef.current && scopeRef.current === uploadScope) setCustomSaving(false);
    }
  };

  const handleCustomStickerDelete = async sticker => {
    if (!sticker?.id || deletingStickerId) return;
    if (typeof window !== 'undefined' && !window.confirm(copy.t('Xóa sticker này khỏi thiết bị?'))) return;
    const deleteScope = scope;
    const deleteScopeAliases = scopeAliases;
    setDeletingStickerId(sticker.id);
    setCustomNotice('');
    setCustomError('');
    try {
      await deleteCustomSticker(deleteScope, sticker.id, undefined, deleteScopeAliases);
      if (!mountedRef.current || scopeRef.current !== deleteScope) return;
      setCustomStickers(previous => previous.filter(item => item.id !== sticker.id));
      setRecentIds(forgetStickerId(deleteScope, sticker.id, deleteScopeAliases));
      setCustomNotice('Đã xóa sticker khỏi thiết bị này.');
    } catch (error) {
      if (mountedRef.current && scopeRef.current === deleteScope) {
        setCustomError(error?.message || 'Không thể xóa sticker cá nhân.');
      }
    } finally {
      if (mountedRef.current && scopeRef.current === deleteScope) setDeletingStickerId('');
    }
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
          {selectedPack === CUSTOM_STICKER_PACK_ID && (
            <div className="custom-sticker-toolbar">
              <span className="custom-sticker-toolbar-copy">
                <strong>{copy.t('Tải ảnh sticker của bạn lên')}</strong>
                <small>{copy.t('PNG, JPG, WEBP, GIF hoặc AVIF · tối đa 2 MB mỗi ảnh')}</small>
              </span>
              <button
                type="button"
                className="custom-sticker-upload-button"
                disabled={customSaving || customStickers.length >= CUSTOM_STICKER_MAX_ITEMS}
                onMouseDown={event => event.preventDefault()}
                onClick={() => uploadInputRef.current?.click()}
              >
                <i className={`fa-solid ${customSaving ? 'fa-spinner fa-spin' : 'fa-cloud-arrow-up'}`} aria-hidden="true"></i>
                <span>{copy.t(customSaving ? 'Đang lưu...' : 'Thêm sticker')}</span>
              </button>
              <input
                ref={uploadInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,image/avif,.png,.jpg,.jpeg,.webp,.gif,.avif"
                multiple
                hidden
                onChange={handleCustomStickerUpload}
              />
            </div>
          )}
          {(customNotice || customError) && selectedPack === CUSTOM_STICKER_PACK_ID && (
            <div className={`custom-sticker-notice ${customError ? 'error' : 'success'}`} role="status">
              <i className={`fa-solid ${customError ? 'fa-circle-exclamation' : 'fa-circle-check'}`} aria-hidden="true"></i>
              <span>{copy.t(customError || customNotice)}</span>
            </div>
          )}
          <div className="sticker-picker-body">
            <div className="sticker-picker-heading">
              <span>{selectedPackLabel}</span>
              <small>{selectedPack === CUSTOM_STICKER_PACK_ID ? `${customStickers.length}/${CUSTOM_STICKER_MAX_ITEMS}` : visibleItems.length}</small>
            </div>
            <div className="sticker-grid" role="listbox" aria-label={copy.t('Danh sách sticker')}>
              {customLoading && selectedPack === CUSTOM_STICKER_PACK_ID ? (
                <div className="sticker-empty"><i className="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>{copy.t('Đang tải kho sticker...')}</div>
              ) : visibleItems.length > 0 ? visibleItems.map(sticker => sticker.custom ? (
                <div key={sticker.id} className="custom-sticker-option">
                  <button type="button" role="option" className="custom-sticker-send" title={sticker.label} aria-label={sticker.label} onMouseDown={event => event.preventDefault()} onClick={() => selectSticker(sticker)}>
                    <StickerArtwork sticker={sticker} />
                  </button>
                  <button
                    type="button"
                    className="custom-sticker-delete"
                    disabled={deletingStickerId === sticker.id}
                    title={copy.t('Xóa sticker này')}
                    aria-label={`${copy.t('Xóa sticker này')}: ${sticker.label}`}
                    onMouseDown={event => event.preventDefault()}
                    onClick={() => handleCustomStickerDelete(sticker)}
                  >
                    <i className={`fa-solid ${deletingStickerId === sticker.id ? 'fa-spinner fa-spin' : 'fa-xmark'}`} aria-hidden="true"></i>
                  </button>
                </div>
              ) : (
                <button type="button" role="option" key={sticker.id} className="sticker-option" title={sticker.label} aria-label={sticker.label} onMouseDown={event => event.preventDefault()} onClick={() => selectSticker(sticker)}>
                  <StickerArtwork sticker={sticker} />
                </button>
              )) : (
                <div className="sticker-empty">
                  {selectedPack === CUSTOM_STICKER_PACK_ID && !query && <i className="fa-regular fa-images" aria-hidden="true"></i>}
                  <span>{copy.t(emptyLabel)}</span>
                  {selectedPack === CUSTOM_STICKER_PACK_ID && !query && <small>{copy.t('Sticker được lưu trên trình duyệt này theo tài khoản.')}</small>}
                </div>
              )}
            </div>
          </div>
          <div className="sticker-pack-tabs" role="tablist" aria-label={copy.t('Nhóm sticker')}>
            <button type="button" role="tab" aria-selected={selectedPack === 'recent'} className={selectedPack === 'recent' ? 'active' : ''} title={copy.t('Gần đây')} aria-label={copy.t('Gần đây')} onClick={() => selectPack('recent')}><i className="fa-regular fa-clock"></i></button>
            <button
              type="button"
              role="tab"
              aria-selected={selectedPack === CUSTOM_STICKER_PACK_ID}
              className={`custom-sticker-pack-tab ${selectedPack === CUSTOM_STICKER_PACK_ID ? 'active' : ''}`}
              title={copy.t('Sticker của tôi')}
              aria-label={copy.t('Sticker của tôi')}
              style={{ '--sticker-pack-color': '#f4511e' }}
              onClick={() => selectPack(CUSTOM_STICKER_PACK_ID)}
            >
              {customStickers[0] ? <span className="sticker-pack-tab-preview"><StickerArtwork sticker={customStickers[0]} /></span> : <i className="fa-regular fa-images" aria-hidden="true"></i>}
              <span className="custom-sticker-pack-plus"><i className="fa-solid fa-plus" aria-hidden="true"></i></span>
            </button>
            {STICKER_PACKS.map(pack => <button type="button" role="tab" aria-selected={selectedPack === pack.id} key={pack.id} className={selectedPack === pack.id ? 'active' : ''} title={copy.t(pack.label)} aria-label={copy.t(pack.label)} style={{ '--sticker-pack-color': pack.color }} onClick={() => selectPack(pack.id)}><span className="sticker-pack-tab-preview"><img src={pack.items[0].src} alt="" loading="lazy" draggable="false" /></span><i className={`fa-solid ${pack.icon}`} aria-hidden="true"></i></button>)}
          </div>
        </>
      )}
    </div>
  );
}
