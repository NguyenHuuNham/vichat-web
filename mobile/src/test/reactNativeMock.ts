export const Platform = {
  OS: 'web',
  select<T>(options: Record<string, T>) {
    return options.web ?? options.default;
  },
};

export const StyleSheet = {
  create<T extends Record<string, unknown>>(styles: T) {
    return styles;
  },
  hairlineWidth: 1,
};

export default { Platform, StyleSheet };
