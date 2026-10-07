import { createElement, type ReactNode } from 'react';

export const Platform = {
  OS: 'web',
  select<T>(options: Record<string, T>) {
    return options.web ?? options.default;
  },
};

export const Appearance = {
  getColorScheme: () => 'light' as const,
  setColorScheme: (style: 'light' | 'dark' | null) => {
    if (style === null) throw new Error('Appearance.setColorScheme does not accept null on Android');
  },
  addChangeListener: () => ({ remove() {} }),
};

export const StyleSheet = {
  create<T extends Record<string, unknown>>(styles: T) {
    return styles;
  },
  hairlineWidth: 1,
};

export const AppState = {
  currentState: 'active' as const,
  addEventListener: () => ({ remove() {} }),
};

type NativeMockProps = { children?: ReactNode; [key: string]: unknown };

export function View({ children, ...props }: NativeMockProps) {
  return createElement('View', props, children);
}

export function Text({ children, ...props }: NativeMockProps) {
  return createElement('Text', props, children);
}

export default { AppState, Platform, Appearance, StyleSheet, View, Text };
