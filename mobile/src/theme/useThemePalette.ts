import { colorsForTheme, ThemeColors } from './colors';
import { useThemeStore } from '../store/themeStore';

/** Keep screen/component palettes tied to the persisted theme selection. */
export function useThemePalette(): ThemeColors {
  const resolved = useThemeStore(state => state.resolved);
  return colorsForTheme(resolved);
}
