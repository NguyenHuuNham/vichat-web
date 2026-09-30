import { LucideIcon } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { ThemeColors } from '../theme/colors';
import { typography } from '../theme/typography';
import { useThemePalette } from '../theme/useThemePalette';

export function EmptyState({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  const palette = useThemePalette();
  const styles = createStyles(palette);
  return (
    <View style={styles.wrap}>
      <View style={styles.icon}><Icon color={palette.accent} size={27} /></View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
    </View>
  );
}

function createStyles(palette: ThemeColors) {
  return StyleSheet.create({
    wrap: { alignItems: 'center', justifyContent: 'center', padding: 40 },
    icon: { width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.accentWash, marginBottom: 16 },
    title: { ...typography.title, color: palette.ink, textAlign: 'center' },
    description: { ...typography.body, color: palette.inkSoft, textAlign: 'center', marginTop: 7 },
  });
}
