import { Search, X } from 'lucide-react-native';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { ThemeColors } from '../theme/colors';
import { useThemePalette } from '../theme/useThemePalette';

export function SearchField({ value, onChangeText, placeholder = 'Tìm kiếm' }: { value: string; onChangeText: (value: string) => void; placeholder?: string }) {
  const palette = useThemePalette();
  const styles = createStyles(palette);
  return (
    <View style={styles.wrap}>
      <Search color={palette.muted} size={19} />
      <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={palette.muted} style={styles.input} autoCorrect={false} />
      {value ? <Pressable onPress={() => onChangeText('')} hitSlop={12}><X color={palette.muted} size={18} /></Pressable> : null}
    </View>
  );
}

function createStyles(palette: ThemeColors) {
  return StyleSheet.create({
    wrap: { height: 50, borderRadius: 17, backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.line, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, gap: 10 },
    input: { flex: 1, color: palette.ink, fontFamily: 'BeVietnamPro_400Regular', fontSize: 14, paddingVertical: 0 },
  });
}
