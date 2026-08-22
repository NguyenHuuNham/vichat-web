const STICKER_ROOT = '/stickers/puppysoft';
const RECENT_STORAGE_PREFIX = 'vichat.stickers.recent.v1';

const packDefinitions = [
  {
    id: 'positive',
    label: 'Tích cực',
    color: '#2f9e44',
    icon: 'fa-thumbs-up',
    items: [
      ['Tuyệt vời!', 'tuyet voi tot lam'],
      ['OK!', 'ok dong y'],
      ['Hiểu rồi!', 'hieu roi'],
      ['Cảm ơn!', 'cam on thanks'],
      ['Tốt lắm!', 'tot lam thumbs up'],
      ['Chúc mừng!', 'chuc mung congratulations'],
      ['Yêu thích!', 'yeu thich love'],
      ['Quá đỉnh!', 'qua dinh cool'],
    ],
  },
  {
    id: 'response',
    label: 'Phản hồi',
    color: '#1672c4',
    icon: 'fa-reply',
    items: [
      ['Đồng ý!', 'dong y agree'],
      ['Got it!', 'got it'],
      ['Chắc chắn!', 'chac chan sure'],
      ['Sẽ làm ngay!', 'se lam ngay doing'],
      ['Đã nhận!', 'da nhan received'],
      ['Đang xử lý!', 'dang xu ly processing'],
      ['Copy that!', 'copy that'],
      ['Ổn áp!', 'on ap good'],
    ],
  },
  {
    id: 'neutral',
    label: 'Trung lập',
    color: '#65717b',
    icon: 'fa-circle-question',
    items: [
      ['Hmm...', 'hmm suy nghi'],
      ['Để mình xem', 'de minh xem look'],
      ['Đang xem xét', 'dang xem xet review'],
      ['Chờ chút nhé', 'cho chut nhe wait'],
      ['Không rõ', 'khong ro unclear'],
      ['Có thể', 'co the maybe'],
      ['Tạm ổn', 'tam on okay'],
      ['...', 'im lang neutral'],
    ],
  },
  {
    id: 'attention',
    label: 'Cần hỗ trợ',
    color: '#c95d2e',
    icon: 'fa-life-ring',
    items: [
      ['Giúp mình với!', 'giup minh voi help'],
      ['Có vấn đề!', 'co van de problem'],
      ['Quan trọng!', 'quan trong important'],
      ['Lưu ý nhé!', 'luu y attention'],
      ['Hạn chót!', 'han chot deadline'],
      ['Theo dõi nhé!', 'theo doi monitor'],
      ['Cần thêm info', 'can them info'],
      ['Ping mình nhé!', 'ping minh nhe'],
    ],
  },
  {
    id: 'emotions',
    label: 'Cảm xúc',
    color: '#c43d3d',
    icon: 'fa-face-smile',
    items: [
      ['Haha!', 'haha vui cuoi'],
      ['^^', 'smile vui'],
      ['Hihi', 'hihi vui'],
      ['Ồ wow!', 'oh wow ngac nhien'],
      ['Buồn quá', 'buon qua sad'],
      ['Mệt rồi', 'met roi tired'],
      ['Căng quá', 'cang qua stressed'],
      ['Thất vọng', 'that vong disappointed'],
    ],
  },
  {
    id: 'quick-actions',
    label: 'Hành động nhanh',
    color: '#7450b8',
    icon: 'fa-bolt',
    items: [
      ['Approved!', 'approved duyet'],
      ['Send it!', 'send it gui'],
      ['Later nhé', 'later nhe sau'],
      ['Ghim lại', 'ghim lai pin'],
      ['Reject', 'reject tu choi'],
      ['Chuyển tiếp', 'chuyen tiep forward'],
      ['Đánh dấu', 'danh dau mark'],
      ['Thêm vào', 'them vao add'],
    ],
  },
];

export const STICKER_PACKS = Object.freeze(packDefinitions.map(pack => Object.freeze({
  ...pack,
  items: Object.freeze(pack.items.map(([label, keywords], index) => Object.freeze({
    id: `${pack.id}-${index + 1}`,
    packId: pack.id,
    label,
    keywords,
    src: `${STICKER_ROOT}/${pack.id}-${index + 1}.png`,
    mime: 'image/png',
  }))),
})));

export const STICKER_ITEMS = Object.freeze(STICKER_PACKS.flatMap(pack => pack.items));

export function stickerById(id) {
  return STICKER_ITEMS.find(item => item.id === id) || null;
}

export function stickerPackById(id) {
  return STICKER_PACKS.find(pack => pack.id === id) || null;
}

export function filterStickers(items = STICKER_ITEMS, query = '') {
  const normalized = String(query || '').trim().toLocaleLowerCase('vi');
  if (!normalized) return items;
  return items.filter(item => `${item.label} ${item.keywords}`.toLocaleLowerCase('vi').includes(normalized));
}

export function recentStickerStorageKey(scope = 'anonymous') {
  return `${RECENT_STORAGE_PREFIX}:${String(scope || 'anonymous')}`;
}

export function readRecentStickerIds(scope = 'anonymous') {
  if (typeof window === 'undefined') return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(recentStickerStorageKey(scope)) || '[]');
    return Array.isArray(value)
      ? value.map(id => String(id || '')).filter(id => Boolean(stickerById(id))).slice(0, 24)
      : [];
  } catch {
    return [];
  }
}

export function rememberStickerId(scope, id) {
  const stickerId = String(id || '');
  if (!stickerById(stickerId) || typeof window === 'undefined') return readRecentStickerIds(scope);
  const next = [stickerId, ...readRecentStickerIds(scope).filter(value => value !== stickerId)].slice(0, 24);
  try {
    window.localStorage.setItem(recentStickerStorageKey(scope), JSON.stringify(next));
  } catch {
    // Recent stickers are optional and must never block sending.
  }
  return next;
}
