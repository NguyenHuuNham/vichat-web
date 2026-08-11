import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';

export function TypingIndicator({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return <View style={styles.wrap}><View style={styles.dots}><View style={styles.dot} /><View style={styles.dot} /><View style={styles.dot} /></View><Text style={styles.text}>đang nhập...</Text></View>;
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingBottom: 8 },
  dots: { flexDirection: 'row', gap: 3, paddingHorizontal: 9, paddingVertical: 8, borderRadius: 12, backgroundColor: colors.paper },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.muted },
  text: { fontFamily: 'BeVietnamPro_500Medium', fontSize: 11, color: colors.muted },
});
