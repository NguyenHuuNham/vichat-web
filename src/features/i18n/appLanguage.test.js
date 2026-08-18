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
  assert.equal(translateUiText('Mở rộng tin nhắn đã ghim', 'en'), 'Expand pinned messages');
  assert.equal(translateUiText('Thu gọn tin nhắn đã ghim', 'en'), 'Collapse pinned messages');
});

test('translates tenant switch labels', () => {
  assert.equal(translateUiText('Chuyển công ty', 'en'), 'Switch company');
  assert.equal(translateUiText('Chọn công ty để làm việc', 'en'), 'Choose a company to work in');
  assert.equal(translateUiText('Công ty hiện tại', 'en'), 'Current company');
  assert.equal(translateUiText('Đang chuyển công ty...', 'en'), 'Switching company...');
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

test('translates group avatar and member management messages', () => {
  assert.equal(translateUiText('Không thể đọc ảnh nhóm.', 'en'), 'Unable to read the group image.');
  assert.equal(translateUiText('Không thể cập nhật ảnh nhóm.', 'en'), 'Unable to update the group image.');
  assert.equal(translateUiText('Không thể thêm thành viên vào nhóm.', 'en'), 'Unable to add members to the group.');
  assert.equal(translateUiText('Tất cả', 'en'), 'All');
});
