import { StyleSheet, Text, View } from 'react-native';
import { ThemeColors } from '../theme/colors';
import { useThemePalette } from '../theme/useThemePalette';
import { useI18n } from '../store/languageStore';

export function TypingIndicator({ visible }: { visible: boolean }) {
  const palette = useThemePalette();
  const { t } = useI18n();
  if (!visible) return null;
  const styles = createStyles(palette);
  return <View style={styles.wrap}><View style={styles.dots}><View style={styles.dot} /><View style={styles.dot} /><View style={styles.dot} /></View><Text style={styles.text}>{t('Đang nhập...')}</Text></View>;
}

function createStyles(palette: ThemeColors) {
  return StyleSheet.create({
    wrap: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingBottom: 8 },
    dots: { flexDirection: 'row', gap: 3, paddingHorizontal: 9, paddingVertical: 8, borderRadius: 12, backgroundColor: palette.paper },
    dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: palette.muted },
    text: { fontFamily: 'BeVietnamPro_500Medium', fontSize: 11, color: palette.muted },
  });
}
