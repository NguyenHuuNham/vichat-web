import { describe, expect, it } from 'vitest';
import { formatMarkdown } from './textFormat';

describe('formatMarkdown utility', () => {
  it('wraps selected text with bold markdown markers', () => {
    const text = 'Xin chào thế giới';
    const selection = { start: 9, end: 17 }; // "thế giới"
    const result = formatMarkdown(text, selection, 'bold');
    expect(result.newText).toBe('Xin chào **thế giới**');
    expect(result.newSelection).toEqual({ start: 11, end: 19 });
  });

  it('inserts placeholder text when no text is selected', () => {
    const text = 'Xin chào ';
    const selection = { start: 9, end: 9 };
    const result = formatMarkdown(text, selection, 'bold');
    expect(result.newText).toBe('Xin chào **chữ đậm**');
    expect(result.newSelection).toEqual({ start: 11, end: 18 });
  });

  it('wraps selected text with italic markdown markers', () => {
    const text = 'Quan trọng';
    const selection = { start: 0, end: 10 };
    const result = formatMarkdown(text, selection, 'italic');
    expect(result.newText).toBe('*Quan trọng*');
    expect(result.newSelection).toEqual({ start: 1, end: 11 });
  });

  it('wraps selected text with strikethrough markers', () => {
    const text = 'Đã hủy';
    const selection = { start: 0, end: 6 };
    const result = formatMarkdown(text, selection, 'strike');
    expect(result.newText).toBe('~~Đã hủy~~');
    expect(result.newSelection).toEqual({ start: 2, end: 8 });
  });

  it('wraps selected inline text with code backticks', () => {
    const text = 'const x = 10;';
    const selection = { start: 0, end: 13 };
    const result = formatMarkdown(text, selection, 'code');
    expect(result.newText).toBe('`const x = 10;`');
    expect(result.newSelection).toEqual({ start: 1, end: 14 });
  });

  it('wraps multiline code with triple backticks', () => {
    const text = 'line 1\nline 2';
    const selection = { start: 0, end: 13 };
    const result = formatMarkdown(text, selection, 'code');
    expect(result.newText).toBe('```\nline 1\nline 2\n```');
  });

  it('prepends quote marker to text', () => {
    const text = 'Lời trích dẫn';
    const selection = { start: 0, end: 13 };
    const result = formatMarkdown(text, selection, 'quote');
    expect(result.newText).toBe('> Lời trích dẫn');
    expect(result.newSelection).toEqual({ start: 2, end: 15 });
  });

  it('prepends heading marker to text', () => {
    const text = 'Tiêu đề lớn';
    const selection = { start: 0, end: 11 };
    const result = formatMarkdown(text, selection, 'heading');
    expect(result.newText).toBe('# Tiêu đề lớn');
    expect(result.newSelection).toEqual({ start: 2, end: 13 });
  });
});
