import { StyleSheet, Text, View } from 'react-native';
import { ConnectionState } from '../types';
import { ThemeColors } from '../theme/colors';
import { useThemePalette } from '../theme/useThemePalette';
import { useI18n } from '../store/languageStore';

const labels: Record<ConnectionState, string> = { connected: 'Realtime', connecting: 'Đang nối', reconnecting: 'Đang nối lại', offline: 'Offline', error: 'Mất kết nối' };

export function ConnectionPill({ state }: { state: ConnectionState }) {
  const palette = useThemePalette();
  const { t } = useI18n();
  const styles = createStyles(palette);
  return (
    <View style={[styles.pill, state === 'connected' ? styles.good : styles.warn]}>
      <View style={[styles.dot, { backgroundColor: state === 'connected' ? palette.online : palette.warning }]} />
      <Text style={[styles.text, { color: state === 'connected' ? palette.online : palette.warning }]}>{t(labels[state])}</Text>
    </View>
  );
}

function createStyles(palette: ThemeColors) {
  return StyleSheet.create({
    pill: { height: 28, paddingHorizontal: 10, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 6 },
    good: { backgroundColor: `${palette.online}22` },
    warn: { backgroundColor: `${palette.warning}22` },
    dot: { width: 6, height: 6, borderRadius: 3 },
    text: { fontFamily: 'BeVietnamPro_600SemiBold', fontSize: 10 },
  });
}
