export type TextFormatType = 'bold' | 'italic' | 'strike' | 'code' | 'quote' | 'heading';

export function formatMarkdown(
  currentText: string,
  selection: { start: number; end: number } | null | undefined,
  type: TextFormatType
): { newText: string; newSelection: { start: number; end: number } } {
  const text = currentText || '';
  const start = Math.max(0, Math.min(selection?.start ?? text.length, text.length));
  const end = Math.max(start, Math.min(selection?.end ?? text.length, text.length));

  const selectedText = text.substring(start, end);
  const before = text.substring(0, start);
  const after = text.substring(end);

  let prefix = '';
  let suffix = '';

  switch (type) {
    case 'bold':
      prefix = '**';
      suffix = '**';
      break;
    case 'italic':
      prefix = '*';
      suffix = '*';
      break;
    case 'strike':
      prefix = '~~';
      suffix = '~~';
      break;
    case 'code':
      prefix = selectedText.includes('\n') ? '```\n' : '`';
      suffix = selectedText.includes('\n') ? '\n```' : '`';
      break;
    case 'quote':
      prefix = '> ';
      suffix = '';
      break;
    case 'heading':
      prefix = '# ';
      suffix = '';
      break;
  }

  const newSelectedText = selectedText || (type === 'bold' ? 'chữ đậm' : type === 'italic' ? 'chữ nghiêng' : type === 'code' ? 'mã code' : '');
  const replacement = `${prefix}${newSelectedText}${suffix}`;
  const newText = `${before}${replacement}${after}`;
  const newStart = start + prefix.length;
  const newEnd = newStart + newSelectedText.length;

  return {
    newText,
    newSelection: { start: newStart, end: newEnd },
  };
}
