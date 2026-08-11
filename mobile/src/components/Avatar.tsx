import { Image, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';

interface Props { name?: string; uri?: string; size?: number; online?: boolean; rounded?: boolean }

function initials(name = '') {
  const clean = name.split('@')[0].trim();
  return clean.split(/\s+/).filter(Boolean).slice(-2).map(part => part[0]).join('').toUpperCase() || 'V';
}

export function Avatar({ name = '', uri = '', size = 48, online = false, rounded = true }: Props) {
  const radius = rounded ? size / 2 : Math.round(size * 0.3);
  return (
    <View style={{ width: size, height: size }}>
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size, borderRadius: radius, backgroundColor: colors.accentWash }} />
      ) : (
        <View style={[styles.fallback, { width: size, height: size, borderRadius: radius }]}>
          <Text style={[styles.initials, { fontSize: Math.max(13, size * 0.32) }]}>{initials(name)}</Text>
        </View>
      )}
      {online ? <View style={[styles.online, { width: size * 0.24, height: size * 0.24, borderRadius: size, right: 0, bottom: 0 }]} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  initials: { color: '#fff', fontFamily: 'BeVietnamPro_700Bold' },
  online: { position: 'absolute', backgroundColor: colors.online, borderWidth: 2.5, borderColor: colors.paper },
});
