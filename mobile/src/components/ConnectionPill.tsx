import { StyleSheet, Text, View } from 'react-native';
import { ConnectionState } from '../types';
import { colors } from '../theme/colors';

const labels: Record<ConnectionState, string> = { connected: 'Realtime', connecting: 'Đang nối', reconnecting: 'Đang nối lại', offline: 'Offline', error: 'Mất kết nối' };

export function ConnectionPill({ state }: { state: ConnectionState }) {
  return (
    <View style={[styles.pill, state === 'connected' ? styles.good : styles.warn]}>
      <View style={[styles.dot, { backgroundColor: state === 'connected' ? colors.online : colors.warning }]} />
      <Text style={[styles.text, { color: state === 'connected' ? colors.online : colors.warning }]}>{labels[state]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { height: 28, paddingHorizontal: 10, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 6 },
  good: { backgroundColor: '#E8F7F0' },
  warn: { backgroundColor: '#FFF4DB' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { fontFamily: 'BeVietnamPro_600SemiBold', fontSize: 10 },
});
