import { LucideIcon } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

export function EmptyState({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return (
    <View style={styles.wrap}>
      <View style={styles.icon}><Icon color={colors.accent} size={27} /></View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', padding: 40 },
  icon: { width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentWash, marginBottom: 16 },
  title: { ...typography.title, color: colors.ink, textAlign: 'center' },
  description: { ...typography.body, color: colors.inkSoft, textAlign: 'center', marginTop: 7 },
});
