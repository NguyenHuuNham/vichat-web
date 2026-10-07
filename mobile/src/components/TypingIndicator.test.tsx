import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it, vi } from 'vitest';
import { TypingIndicator } from './TypingIndicator';

const mocks = vi.hoisted(() => ({
  language: 'vi',
  palette: { paper: '#ffffff', muted: '#667085' },
}));

vi.mock('../theme/useThemePalette', () => ({
  useThemePalette: () => mocks.palette,
}));

vi.mock('../store/languageStore', () => ({
  useI18n: () => ({
    t: (value: string) => mocks.language === 'en' && value === 'Đang nhập...' ? 'Typing...' : value,
  }),
}));

function textNode(renderer: ReactTestRenderer) {
  const root = renderer.toJSON();
  if (!root || Array.isArray(root)) return null;
  const node = root.children?.[1];
  return node && typeof node !== 'string' && !Array.isArray(node) ? node : null;
}

function textChildren(renderer: ReactTestRenderer) {
  return textNode(renderer)?.children?.filter((child): child is string => typeof child === 'string') || [];
}

describe('TypingIndicator', () => {
  it('keeps hook order stable while visibility, theme, and language change', () => {
    let renderer!: ReactTestRenderer;

    act(() => {
      renderer = create(<TypingIndicator visible={false} />);
    });
    expect(renderer.toJSON()).toBeNull();

    act(() => {
      renderer.update(<TypingIndicator visible />);
    });
    expect(textChildren(renderer)).toEqual(['Đang nhập...']);

    mocks.language = 'en';
    mocks.palette = { paper: '#101820', muted: '#b7c2cc' };
    act(() => {
      renderer.update(<TypingIndicator visible />);
    });
    expect(textChildren(renderer)).toEqual(['Typing...']);
    expect(textNode(renderer)?.props.style.color).toBe('#b7c2cc');

    act(() => {
      renderer.update(<TypingIndicator visible={false} />);
      renderer.unmount();
      renderer = create(<TypingIndicator visible />);
    });
    expect(textChildren(renderer)).toEqual(['Typing...']);
  });
});
