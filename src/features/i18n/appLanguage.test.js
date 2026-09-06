import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalizedCopy, translateUiText } from './appLanguage.js';

test('translates exact UI labels and keeps Vietnamese as the default', () => {
  assert.equal(translateUiText('Cài đặt', 'en'), 'Settings');
  assert.equal(translateUiText('Bạn được nhắc đến', 'en'), 'You were mentioned');
  assert.equal(translateUiText('Cài đặt', 'vi'), 'Cài đặt');
  assert.equal(translateUiText('Cài đặt'), 'Cài đặt');
});

test('translates the tenant-scoped ViChat AI guidance', () => {
  assert.equal(translateUiText('Phạm vi công ty hiện tại', 'en'), 'Current company scope');
  assert.equal(translateUiText('Tách biệt theo công ty', 'en'), 'Isolated by company');
  assert.equal(translateUiText('Tóm tắt tài liệu', 'en'), 'Summarize a document');
  assert.equal(
    translateUiText('Câu trả lời bám theo tài liệu của công ty hiện tại. Luôn kiểm tra nguồn khi ra quyết định.', 'en'),
    'Answers follow the current company documents. Always verify sources before making decisions.',
  );
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
  assert.equal(translateUiText('Xem danh sách bình chọn', 'en'), 'See voter list');
  assert.equal(translateUiText('Chưa bình chọn', 'en'), 'Have not voted');
  assert.equal(translateUiText('Đã có người bình chọn trong nhóm.', 'en'), 'Someone voted in the group poll.');
});

test('translates the reply composer heading', () => {
  assert.equal(translateUiText('Trả lời', 'en'), 'Reply to');
});

test('translates message editing labels', () => {
  assert.equal(translateUiText('Sửa tin nhắn', 'en'), 'Edit message');
  assert.equal(translateUiText('Hủy sửa', 'en'), 'Cancel edit');
  assert.equal(translateUiText('Nhập nội dung mới...', 'en'), 'Enter new content...');
  assert.equal(translateUiText('Đã chỉnh sửa', 'en'), 'Edited');
  assert.equal(translateUiText('Lịch sử chỉnh sửa', 'en'), 'Edit history');
  assert.equal(translateUiText('Nội dung hiện tại', 'en'), 'Current content');
  assert.equal(translateUiText('Nội dung cũ', 'en'), 'Previous content');
  assert.equal(translateUiText('Đang lưu...', 'en'), 'Saving...');
});

test('translates pasted attachment draft controls', () => {
  assert.equal(translateUiText('Đang chờ gửi', 'en'), 'Waiting to send');
  assert.equal(translateUiText('Nhập mô tả rồi bấm Enter hoặc Gửi.', 'en'), 'Add a caption, then press Enter or Send.');
  assert.equal(translateUiText('Xóa tất cả', 'en'), 'Remove all');
});

test('translates tenant switch labels', () => {
  assert.equal(translateUiText('Chuyển công ty', 'en'), 'Switch company');
  assert.equal(translateUiText('Công ty', 'en'), 'Company');
  assert.equal(translateUiText('Chọn công ty', 'en'), 'Choose company');
  assert.equal(translateUiText('Trượt để chọn công ty', 'en'), 'Slide to choose a company');
  assert.equal(translateUiText('Công ty trước', 'en'), 'Previous company');
  assert.equal(translateUiText('Công ty tiếp theo', 'en'), 'Next company');
  assert.equal(translateUiText('Chọn công ty để làm việc', 'en'), 'Choose a company to work in');
  assert.equal(translateUiText('Chưa có công ty khác', 'en'), 'No other companies yet.');
  assert.equal(translateUiText('Công ty hiện tại', 'en'), 'Current company');
  assert.equal(translateUiText('Đang chuyển công ty...', 'en'), 'Switching company...');
  assert.equal(translateUiText('Xác nhận chuyển công ty', 'en'), 'Confirm company switch');
  assert.equal(translateUiText('Bạn có muốn chuyển sang công ty này không?', 'en'), 'Do you want to switch to this company?');
  assert.equal(translateUiText('Chuyển sang công ty này', 'en'), 'Switch to this company');
});

test('translates session bootstrap labels', () => {
  assert.equal(translateUiText('Đang tải Chat...', 'en'), 'Loading Chat...');
  assert.equal(translateUiText('Không thể tải Chat', 'en'), 'Unable to load Chat');
  assert.equal(translateUiText('Thử lại', 'en'), 'Try again');
});

test('translates the latest-message jump label', () => {
  assert.equal(translateUiText('Đi tới tin nhắn mới nhất', 'en'), 'Go to latest messages');
});

test('translates direct message blocking labels and notices', () => {
  assert.equal(translateUiText('Chặn', 'en'), 'Block');
  assert.equal(translateUiText('Bỏ chặn', 'en'), 'Unblock');
  assert.equal(
    translateUiText('Bạn đã chặn tin nhắn. Hãy bỏ chặn để tiếp tục.', 'en'),
    'You blocked messages. Unblock to continue.',
  );
  assert.equal(
    translateUiText('Người dùng đã chặn tin nhắn.', 'en'),
    'The user has blocked messages.',
  );
});

test('translates the live group spam cooldown countdown', () => {
  assert.equal(translateUiText('Đang tạm khóa gửi tin nhắn', 'en'), 'Sending temporarily paused');
  assert.equal(
    translateUiText('Bạn đang gửi quá nhanh. Có thể gửi lại sau 5 giây.', 'en'),
    'You are sending too quickly. Try again in 5 seconds.',
  );
});

test('translates conversation category management labels', () => {
  assert.equal(translateUiText('Quản lý thẻ phân loại', 'en'), 'Manage category tags');
  assert.equal(translateUiText('Thêm mới thẻ phân loại', 'en'), 'Add a new category tag');
  assert.equal(translateUiText('Hội thoại được gắn thẻ', 'en'), 'Tagged conversations');
  assert.equal(translateUiText('Trả lời sau', 'en'), 'Reply later');
});

test('translates message receipt empty states', () => {
  assert.equal(translateUiText('Chưa có ai xem tin nhắn này', 'en'), 'No one has seen this message yet');
  assert.equal(translateUiText('Chưa có ai nhận tin nhắn này', 'en'), 'No one has received this message yet');
});

test('translates dynamic system text without translating user content', () => {
  assert.equal(translateUiText('Trực tuyến', 'en'), 'Online');
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
  assert.equal(
    translateUiText('Bạn là thành viên cuối cùng. Rời nhóm sẽ đóng nhóm này.', 'en'),
    'You are the final member. Leaving will close this group.',
  );
  assert.equal(
    translateUiText('Bạn sẽ rời khỏi nhóm và hội thoại sẽ được gỡ khỏi danh sách của bạn.', 'en'),
    'You will leave the group and the conversation will be removed from your list.',
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
  assert.equal(translateUiText('Sticker của tôi', 'en'), 'My stickers');
  assert.equal(translateUiText('Thêm sticker', 'en'), 'Add stickers');
  assert.equal(translateUiText('Mỗi sticker phải nhỏ hơn hoặc bằng 2 MB.', 'en'), 'Each sticker must be 2 MB or smaller.');
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
