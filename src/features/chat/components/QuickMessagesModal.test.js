import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('quick messages default is empty and contains no unauthorized mock templates', () => {
  const filePath = path.resolve('src/features/chat/components/QuickMessagesModal.jsx');
  const source = fs.readFileSync(filePath, 'utf-8');
  assert.match(source, /export const DEFAULT_QUICK_MESSAGES = \[\];/);
  assert.doesNotMatch(source, /Hoàng Hà Mobile/);
  assert.doesNotMatch(source, /Dạ bên em có hỗ trợ trả góp/);
});
