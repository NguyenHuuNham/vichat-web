import React, { useMemo, useState } from 'react';
import { FlatList, Image, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Film, Search, X } from 'lucide-react-native';
import { useI18n } from '../store/languageStore';
import { useThemePalette } from '../theme/useThemePalette';
import { ThemeColors } from '../theme/colors';

interface GifItem {
  id: string;
  url: string;
  previewUrl: string;
  title: string;
  category: string;
}

const GIF_DATA: GifItem[] = [
  // Trending / Vui vẻ
  {
    id: 'gif-1',
    url: 'https://media.giphy.com/media/artj92V8o75VPL7AeQ/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/artj92V8o75VPL7AeQ/200w.gif',
    title: 'Happy Dance',
    category: 'vui_ve',
  },
  {
    id: 'gif-2',
    url: 'https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/200w.gif',
    title: 'Laughing Cat',
    category: 'vui_ve',
  },
  {
    id: 'gif-3',
    url: 'https://media.giphy.com/media/blSTtZehjAZ8I/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/blSTtZehjAZ8I/200w.gif',
    title: 'Minion Celebrate',
    category: 'chuc_mung',
  },
  {
    id: 'gif-4',
    url: 'https://media.giphy.com/media/osAcIGJnyeBq30qDCM/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/osAcIGJnyeBq30qDCM/200w.gif',
    title: 'Thank You so much',
    category: 'cam_on',
  },
  {
    id: 'gif-5',
    url: 'https://media.giphy.com/media/108M7gCS1JSoO4/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/108M7gCS1JSoO4/200w.gif',
    title: 'Love Heart',
    category: 'tha_tim',
  },
  {
    id: 'gif-6',
    url: 'https://media.giphy.com/media/chzz1FQgqhytWRWbp3/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/chzz1FQgqhytWRWbp3/200w.gif',
    title: 'Clapping Hands',
    category: 'chuc_mung',
  },
  {
    id: 'gif-7',
    url: 'https://media.giphy.com/media/OPU6wzx8JrHna/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/OPU6wzx8JrHna/200w.gif',
    title: 'Sad Cry',
    category: 'buon',
  },
  {
    id: 'gif-8',
    url: 'https://media.giphy.com/media/5VKbvrjxpVJCM/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/5VKbvrjxpVJCM/200w.gif',
    title: 'Surprised Wow',
    category: 'ngac_nhien',
  },
  {
    id: 'gif-9',
    url: 'https://media.giphy.com/media/l41lI4bYmcsPJX9Go/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/l41lI4bYmcsPJX9Go/200w.gif',
    title: 'Thumbs Up Good Job',
    category: 'chuc_mung',
  },
  {
    id: 'gif-10',
    url: 'https://media.giphy.com/media/l3q2K5jinAlChoCLS/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/l3q2K5jinAlChoCLS/200w.gif',
    title: 'Blinking Guy Wow',
    category: 'ngac_nhien',
  },
  {
    id: 'gif-11',
    url: 'https://media.giphy.com/media/26gsjCZpPolPr3sBy/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/26gsjCZpPolPr3sBy/200w.gif',
    title: 'Thank You Bow',
    category: 'cam_on',
  },
  {
    id: 'gif-12',
    url: 'https://media.giphy.com/media/3o7TKoWXm3okO1kgHC/giphy.gif',
    previewUrl: 'https://media.giphy.com/media/3o7TKoWXm3okO1kgHC/200w.gif',
    title: 'Cat Heart Love',
    category: 'tha_tim',
  },
];

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (gifUrl: string) => void;
}

export function GifPickerModal({ visible, onClose, onSelect }: Props) {
  const { t } = useI18n();
  const palette = useThemePalette();
  const styles = createStyles(palette);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  const CATEGORIES = [
    { id: 'all', label: t('Tất cả') },
    { id: 'vui_ve', label: t('Vui vẻ') },
    { id: 'cam_on', label: t('Cảm ơn') },
    { id: 'chuc_mung', label: t('Chúc mừng') },
    { id: 'tha_tim', label: t('Thả tim') },
    { id: 'buon', label: t('Buồn') },
    { id: 'ngac_nhien', label: t('Ngạc nhiên') },
  ];

  const filteredGifs = useMemo(() => {
    let list = GIF_DATA;
    if (selectedCategory !== 'all') {
      list = list.filter(g => g.category === selectedCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(g => g.title.toLowerCase().includes(q));
    }
    return list;
  }, [selectedCategory, searchQuery]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.iconCircle}>
                <Film color="#0068FF" size={20} />
              </View>
              <Text style={styles.headerTitle}>{t('Kho ảnh @GIF')}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('Đóng')}
              onPress={onClose}
              style={styles.closeButton}
            >
              <X color={palette.inkSoft} size={22} />
            </Pressable>
          </View>

          {/* Search bar */}
          <View style={styles.searchBox}>
            <Search color={palette.muted} size={18} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder={t('Tìm kiếm ảnh GIF...')}
              placeholderTextColor={palette.muted}
              style={styles.searchInput}
              clearButtonMode="while-editing"
            />
          </View>

          {/* Categories Tab */}
          <View style={styles.categoryRow}>
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={CATEGORIES}
              keyExtractor={item => item.id}
              contentContainerStyle={styles.categoryList}
              renderItem={({ item }) => {
                const isSelected = selectedCategory === item.id;
                return (
                  <Pressable
                    onPress={() => setSelectedCategory(item.id)}
                    style={[styles.categoryChip, isSelected && styles.categoryChipSelected]}
                  >
                    <Text
                      style={[
                        styles.categoryText,
                        isSelected && styles.categoryTextSelected,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                );
              }}
            />
          </View>

          {/* GIF Grid */}
          <FlatList
            data={filteredGifs}
            keyExtractor={item => item.id}
            numColumns={3}
            contentContainerStyle={styles.gridList}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  onSelect(item.url);
                  onClose();
                }}
                style={({ pressed }) => [styles.gifItem, pressed && styles.gifItemPressed]}
              >
                <Image
                  source={{ uri: item.previewUrl }}
                  style={styles.gifImage}
                  resizeMode="cover"
                />
              </Pressable>
            )}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>{t('Không tìm thấy GIF phù hợp.')}</Text>
              </View>
            }
          />
        </View>
      </View>
    </Modal>
  );
}

function createStyles(palette: ThemeColors) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'flex-end',
    },
    container: {
      backgroundColor: palette.paper,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      maxHeight: '80%',
      minHeight: 460,
      paddingBottom: 24,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: palette.line,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    iconCircle: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: 'rgba(0, 104, 255, 0.12)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    headerTitle: {
      fontSize: 17,
      fontWeight: '600',
      color: palette.ink,
    },
    closeButton: {
      padding: 6,
    },
    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: palette.canvas,
      marginHorizontal: 16,
      marginTop: 12,
      marginBottom: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: palette.line,
      gap: 8,
    },
    searchInput: {
      flex: 1,
      fontSize: 14,
      color: palette.ink,
      padding: 0,
    },
    categoryRow: {
      marginTop: 6,
      marginBottom: 8,
    },
    categoryList: {
      paddingHorizontal: 16,
      gap: 8,
    },
    categoryChip: {
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 16,
      backgroundColor: palette.canvas,
      borderWidth: 1,
      borderColor: palette.line,
    },
    categoryChipSelected: {
      backgroundColor: '#0068FF',
      borderColor: '#0068FF',
    },
    categoryText: {
      fontSize: 13,
      color: palette.inkSoft,
      fontWeight: '500',
    },
    categoryTextSelected: {
      color: '#FFFFFF',
      fontWeight: '600',
    },
    gridList: {
      paddingHorizontal: 12,
      paddingBottom: 16,
    },
    gifItem: {
      flex: 1 / 3,
      aspectRatio: 1,
      margin: 4,
      borderRadius: 10,
      overflow: 'hidden',
      backgroundColor: palette.canvas,
    },
    gifItemPressed: {
      opacity: 0.75,
      transform: [{ scale: 0.96 }],
    },
    gifImage: {
      width: '100%',
      height: '100%',
    },
    emptyContainer: {
      paddingVertical: 40,
      alignItems: 'center',
    },
    emptyText: {
      fontSize: 14,
      color: palette.muted,
    },
  });
}
