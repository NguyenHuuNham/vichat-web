import { useMemo, useState } from 'react';
import { FlatList, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Search, X } from 'lucide-react-native';
import { Sticker } from '../types';
import { STICKER_PACKS, STICKER_ITEMS, filterStickers } from '../services/stickerCatalog';
import { colors, shadow } from '../theme/colors';
import { typography } from '../theme/typography';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (sticker: Sticker) => void;
}

export function StickerPicker({ visible, onClose, onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [packId, setPackId] = useState('');
  const filtered = useMemo(() => {
    const source = packId ? STICKER_ITEMS.filter(item => item.packId === packId) : STICKER_ITEMS;
    return filterStickers(source, query);
  }, [packId, query]);

  const close = () => {
    setQuery('');
    setPackId('');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close} statusBarTranslucent>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={close} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View><Text style={styles.title}>Sticker</Text><Text style={styles.subtitle}>Chọn sticker từ kho của ViChat</Text></View>
            <Pressable accessibilityLabel="Đóng sticker" onPress={close} style={styles.close}><X color={colors.inkSoft} size={20} /></Pressable>
          </View>
          <View style={styles.search}><Search color={colors.muted} size={17} /><TextInput value={query} onChangeText={setQuery} placeholder="Tìm sticker..." placeholderTextColor={colors.muted} style={styles.searchInput} /></View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.packs}>
            <Pressable onPress={() => setPackId('')} style={[styles.pack, !packId && styles.packActive]}><Text style={[styles.packText, !packId && styles.packTextActive]}>Tất cả</Text></Pressable>
            {STICKER_PACKS.map(pack => <Pressable key={pack.id} onPress={() => setPackId(pack.id)} style={[styles.pack, packId === pack.id && styles.packActive]}><Text style={[styles.packText, packId === pack.id && styles.packTextActive]}>{pack.label}</Text></Pressable>)}
          </ScrollView>
          <FlatList
            data={filtered}
            keyExtractor={item => item.id}
            numColumns={4}
            columnWrapperStyle={styles.row}
            contentContainerStyle={styles.grid}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <Pressable accessibilityLabel={`Gửi sticker ${item.label || item.id}`} onPress={() => { close(); onSelect(item); }} style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}>
                <Image source={{ uri: item.src }} style={styles.image} resizeMode="contain" />
                <Text numberOfLines={1} style={styles.label}>{item.label}</Text>
              </Pressable>
            )}
            ListEmptyComponent={<Text style={styles.empty}>Không tìm thấy sticker phù hợp.</Text>}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(12,20,27,0.45)' },
  sheet: { height: '72%', backgroundColor: colors.canvas, borderTopLeftRadius: 27, borderTopRightRadius: 27, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 18, ...shadow },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 11 },
  title: { ...typography.title, color: colors.ink },
  subtitle: { ...typography.caption, color: colors.inkSoft, marginTop: 2 },
  close: { width: 38, height: 38, borderRadius: 13, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' },
  search: { minHeight: 43, borderRadius: 14, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line },
  searchInput: { flex: 1, color: colors.ink, fontFamily: 'BeVietnamPro_400Regular', fontSize: 13 },
  packs: { gap: 7, paddingVertical: 11 },
  pack: { minHeight: 32, paddingHorizontal: 11, borderRadius: 12, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, justifyContent: 'center' },
  packActive: { backgroundColor: colors.accentWash, borderColor: colors.accent },
  packText: { ...typography.caption, color: colors.inkSoft, fontSize: 11 },
  packTextActive: { color: colors.accentDeep },
  grid: { paddingBottom: 16 },
  row: { gap: 8, marginBottom: 8 },
  item: { flex: 1, maxWidth: '25%', minHeight: 86, borderRadius: 14, padding: 5, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  itemPressed: { opacity: 0.65, transform: [{ scale: 0.96 }] },
  image: { width: 62, height: 62 },
  label: { ...typography.caption, color: colors.inkSoft, fontSize: 9, maxWidth: '100%' },
  empty: { ...typography.body, color: colors.inkSoft, textAlign: 'center', padding: 28 },
});
