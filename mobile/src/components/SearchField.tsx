import { Search, X } from 'lucide-react-native';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { colors } from '../theme/colors';

export function SearchField({ value, onChangeText, placeholder = 'Tìm kiếm' }: { value: string; onChangeText: (value: string) => void; placeholder?: string }) {
  return (
    <View style={styles.wrap}>
      <Search color={colors.muted} size={19} />
      <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.muted} style={styles.input} autoCorrect={false} />
      {value ? <Pressable onPress={() => onChangeText('')} hitSlop={12}><X color={colors.muted} size={18} /></Pressable> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { height: 50, borderRadius: 17, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, gap: 10 },
  input: { flex: 1, color: colors.ink, fontFamily: 'BeVietnamPro_400Regular', fontSize: 14, paddingVertical: 0 },
});
