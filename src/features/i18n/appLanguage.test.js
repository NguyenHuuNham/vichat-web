import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalizedCopy, translateUiText } from './appLanguage.js';

test('translates exact UI labels and keeps Vietnamese as the default', () => {
  assert.equal(translateUiText('Cài đặt', 'en'), 'Settings');
  assert.equal(translateUiText('Cài đặt', 'vi'), 'Cài đặt');
  assert.equal(translateUiText('Cài đặt'), 'Cài đặt');
});

test('translates message pin labels for the English UI', () => {
  assert.equal(translateUiText('Ghim tin nhắn', 'en'), 'Pin message');
  assert.equal(translateUiText('Bỏ ghim tin nhắn', 'en'), 'Unpin message');
  assert.equal(translateUiText('Tin nhắn đã ghim', 'en'), 'Pinned messages');
  assert.equal(translateUiText('Danh sách ghim', 'en'), 'Pinned list');
  assert.equal(translateUiText('Bình chọn', 'en'), 'Poll');
  assert.equal(translateUiText('Mở rộng tin nhắn đã ghim', 'en'), 'Expand pinned messages');
  assert.equal(translateUiText('Thu gọn tin nhắn đã ghim', 'en'), 'Collapse pinned messages');
});

test('translates poll composer and activity labels', () => {
  assert.equal(translateUiText('Tạo bình chọn', 'en'), 'Create poll');
  assert.equal(translateUiText('Cho phép chọn nhiều phương án', 'en'), 'Allow multiple choices');
  assert.equal(translateUiText('Khóa bình chọn', 'en'), 'Lock poll');
  assert.equal(translateUiText('Đã có người bình chọn trong nhóm.', 'en'), 'Someone voted in the group poll.');
});

test('translates the reply composer heading', () => {
  assert.equal(translateUiText('Trả lời', 'en'), 'Reply to');
});

test('translates tenant switch labels', () => {
  assert.equal(translateUiText('Chuyển công ty', 'en'), 'Switch company');
  assert.equal(translateUiText('Chọn công ty để làm việc', 'en'), 'Choose a company to work in');
  assert.equal(translateUiText('Công ty hiện tại', 'en'), 'Current company');
  assert.equal(translateUiText('Đang chuyển công ty...', 'en'), 'Switching company...');
  assert.equal(translateUiText('Xác nhận chuyển công ty', 'en'), 'Confirm company switch');
  assert.equal(translateUiText('Bạn có muốn chuyển sang công ty này không?', 'en'), 'Do you want to switch to this company?');
  assert.equal(translateUiText('Chuyển sang công ty này', 'en'), 'Switch to this company');
});

test('translates dynamic system text without translating user content', () => {
  assert.equal(
    translateUiText('Nguyễn đã xóa Lan khỏi nhóm', 'en'),
    'Nguyễn removed Lan from the group',
  );
  assert.equal(translateUiText('4 thành viên • 2 đang online', 'en'), '4 members • 2 online');
  assert.equal(translateUiText('Saved by an employee', 'en'), 'Saved by an employee');
  assert.equal(translateUiText('Đây là tin nhắn của nhân viên.', 'en'), 'Đây là tin nhắn của nhân viên.');
});

test('translates the group owner transfer system event', () => {
  assert.equal(
    translateUiText('Lan đã rời khỏi nhóm. Minh đã trở thành trưởng nhóm mới', 'en'),
    'Lan left the group. Minh is now the group owner',
  );
});

test('localized copy exposes the correct locale and translator', () => {
  const copy = createLocalizedCopy({ groups: 'Nhóm' }, 'en');
  assert.equal(copy.language, 'en');
  assert.equal(copy.locale, 'en-US');
  assert.equal(copy.groups, 'Nhóm');
  assert.equal(copy.t('Nhóm'), 'Group');
});

test('translates generated labels with preserved values', () => {
  assert.equal(
    translateUiText('Đã lưu âm báo "bell.mp3" trên thiết bị này.', 'en'),
    'Saved sound "bell.mp3" on this device.',
  );
  assert.equal(translateUiText('Cuộc gọi đến - Mất kết nối', 'en'), 'Incoming call - Disconnected');
  assert.equal(translateUiText('Đã gửi tệp report.pdf.', 'en'), 'Sent file report.pdf.');
});

test('translates attachment, upload and connection status messages', () => {
  assert.equal(translateUiText('File đính kèm', 'en'), 'Attachment');
  assert.equal(translateUiText('Gửi thất bại', 'en'), 'Failed to send');
  assert.equal(translateUiText('3 mục không phải ảnh đã được bỏ qua.', 'en'), '3 non-image items were skipped.');
  assert.equal(
    translateUiText('2 ảnh đã được bỏ qua; hãy dùng nút gửi ảnh.', 'en'),
    '2 images were skipped; use the image button.',
  );
  assert.equal(
    translateUiText('Kết nối realtime Tinode chưa sẵn sàng; dữ liệu Chatmgt vẫn đang hoạt động.', 'en'),
    'Tinode realtime is not ready; Chatmgt data is still available.',
  );
});

test('translates sticker picker labels and previews for the English UI', () => {
  assert.equal(translateUiText('Sticker và biểu cảm', 'en'), 'Stickers and emoji');
  assert.equal(translateUiText('Tích cực', 'en'), 'Positive');
  assert.equal(translateUiText('Không tìm thấy sticker phù hợp', 'en'), 'No matching stickers');
  assert.equal(translateUiText('Bạn đã gửi sticker', 'en'), 'You sent a sticker');
  assert.equal(translateUiText('Lan đã gửi sticker', 'en'), 'Lan sent a sticker');
});

test('translates group avatar and member management messages', () => {
  assert.equal(translateUiText('Không thể đọc ảnh nhóm.', 'en'), 'Unable to read the group image.');
  assert.equal(translateUiText('Không thể cập nhật ảnh nhóm.', 'en'), 'Unable to update the group image.');
  assert.equal(translateUiText('Không thể thêm thành viên vào nhóm.', 'en'), 'Unable to add members to the group.');
  assert.equal(translateUiText('Tất cả', 'en'), 'All');
});

test('translates history search filters', () => {
  assert.equal(translateUiText('Tất cả người gửi', 'en'), 'All senders');
  assert.equal(translateUiText('Tải thêm lịch sử cũ', 'en'), 'Load older history');
  assert.equal(translateUiText('Không tìm thấy tin nhắn phù hợp.', 'en'), 'No matching messages found.');
});
