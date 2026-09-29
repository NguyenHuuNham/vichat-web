export const colors = {
  ink: '#17212B',
  inkSoft: '#52606D',
  accent: '#F4511E',
  accentDeep: '#C9360D',
  accentWash: '#FFF0E9',
  canvas: '#F7F5F0',
  paper: '#FFFFFF',
  line: '#E7E2DA',
  muted: '#8B929A',
  online: '#25A56A',
  danger: '#D64545',
  warning: '#B7791F',
  bubbleOutgoing: '#F4511E',
  bubbleIncoming: '#FFFFFF',
  darkCanvas: '#11171C',
  darkPaper: '#1C252C',
  darkLine: '#2B3942',
} as const;

export const darkColors = {
  ink: '#F2F5F7',
  inkSoft: '#B5C0C7',
  accent: '#FF7043',
  accentDeep: '#FF9879',
  accentWash: '#3A2620',
  canvas: '#10171C',
  paper: '#1B252C',
  line: '#33414A',
  muted: '#84929B',
  online: '#54C98B',
  danger: '#FF7C7C',
  warning: '#E4B65D',
  bubbleOutgoing: '#C94B27',
  bubbleIncoming: '#1B252C',
  darkCanvas: '#10171C',
  darkPaper: '#1B252C',
  darkLine: '#33414A',
} as const;

export type ThemeColors = { [key in keyof typeof colors]: string };

export function colorsForTheme(theme: 'light' | 'dark'): ThemeColors {
  return theme === 'dark' ? darkColors : colors;
}

export const shadow = {
  shadowColor: '#17212B',
  shadowOpacity: 0.08,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 8 },
  elevation: 4,
};
