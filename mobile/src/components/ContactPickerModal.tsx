import React, { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Contact, Search, X } from 'lucide-react-native';
import { useAppStore } from '../store/appStore';
import { useI18n } from '../store/languageStore';
import { useThemePalette } from '../theme/useThemePalette';
import { ThemeColors } from '../theme/colors';
import { Avatar } from './Avatar';
import { ContactCardAttachment, ConversationMember, User } from '../types';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (contact: ContactCardAttachment) => void;
  members?: ConversationMember[];
}

export function ContactPickerModal({ visible, onClose, onSelect, members = [] }: Props) {
  const { t } = useI18n();
  const palette = useThemePalette();
  const styles = createStyles(palette);
  const directory = useAppStore(state => state.directory);
  const currentUserId = useAppStore(state => state.session?.user?.id);

  const [query, setQuery] = useState('');

  const candidates = useMemo(() => {
    const map = new Map<string, User | ConversationMember>();
    // Add directory users
    directory.forEach(u => {
      const id = String(u.id || (u as any).uid || '');
      if (id && id !== String(currentUserId)) {
        map.set(id, u);
      }
    });
    // Add conversation members
    members.forEach(m => {
      const id = String(m.id || (m as any).uid || '');
      if (id && id !== String(currentUserId)) {
        map.set(id, { ...map.get(id), ...m });
      }
    });

    const list = Array.from(map.values());
    const q = query.trim().toLowerCase();
    if (!q) return list;

    return list.filter(item => {
      const name = String(item.name || '').toLowerCase();
      const email = String((item as any).email || '').toLowerCase();
      const phone = String((item as any).phone || '').toLowerCase();
      const department = String((item as any).department || '').toLowerCase();
      const title = String((item as any).title || (item as any).role || '').toLowerCase();
      return name.includes(q) || email.includes(q) || phone.includes(q) || department.includes(q) || title.includes(q);
    });
  }, [directory, members, currentUserId, query]);

  const handleSelect = (item: User | ConversationMember) => {
    const contact: ContactCardAttachment = {
      userId: String(item.id || (item as any).uid || ''),
      name: item.name || t('Thành viên'),
      avatar: item.avatar,
      title: (item as any).title || (item as any).role,
      department: (item as any).department,
      phone: (item as any).phone,
      email: (item as any).email,
    };
    onSelect(contact);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.iconCircle}>
                <Contact color="#00CEC9" size={20} />
              </View>
              <Text style={styles.headerTitle}>{t('Chia sẻ danh thiếp')}</Text>
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
              value={query}
              onChangeText={setQuery}
              placeholder={t('Tìm theo tên, chức vụ, phòng ban...')}
              placeholderTextColor={palette.muted}
              style={styles.searchInput}
              clearButtonMode="while-editing"
            />
          </View>

          {/* List */}
          <FlatList
            data={candidates}
            keyExtractor={item => String(item.id || (item as any).uid || Math.random())}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                onPress={() => handleSelect(item)}
                style={({ pressed }) => [styles.contactRow, pressed && styles.rowPressed]}
              >
                <Avatar name={item.name} uri={item.avatar} size={44} rounded />
                <View style={styles.contactInfo}>
                  <Text numberOfLines={1} style={styles.contactName}>{item.name}</Text>
                  <Text numberOfLines={1} style={styles.contactSub}>
                    {[(item as any).title || (item as any).role, (item as any).department, (item as any).phone]
                      .filter(Boolean)
                      .join(' · ') || t('Thành viên')}
                  </Text>
                </View>
              </Pressable>
            )}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>{t('Không tìm thấy liên hệ nào.')}</Text>
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
      minHeight: 420,
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
      backgroundColor: 'rgba(0, 206, 201, 0.12)',
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
    list: {
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    contactRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: palette.line,
      gap: 12,
    },
    rowPressed: {
      opacity: 0.7,
      backgroundColor: palette.canvas,
    },
    contactInfo: {
      flex: 1,
    },
    contactName: {
      fontSize: 15,
      fontWeight: '600',
      color: palette.ink,
      marginBottom: 2,
    },
    contactSub: {
      fontSize: 13,
      color: palette.inkSoft,
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
