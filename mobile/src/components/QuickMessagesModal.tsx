import React, { useEffect, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Plus, Trash2, X, Zap, Send } from 'lucide-react-native';
import { useI18n } from '../store/languageStore';
import { useThemePalette } from '../theme/useThemePalette';
import { ThemeColors } from '../theme/colors';

const STORAGE_KEY = '@vichat_quick_messages';

const DEFAULT_MESSAGES = [
  'Tôi đang bận, sẽ phản hồi bạn sớm nhất có thể.',
  'Đã nhận được thông tin, tôi đang xử lý ngay.',
  'Vui lòng gửi lại cho tôi tài liệu chi tiết nhé.',
  'Tôi đang trên đường tới chỗ hẹn.',
  'Cảm ơn bạn rất nhiều!',
  'Xác nhận đã hoàn thành công việc.',
];

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (text: string, sendImmediately: boolean) => void;
}

export function QuickMessagesModal({ visible, onClose, onSelect }: Props) {
  const { t } = useI18n();
  const palette = useThemePalette();
  const styles = createStyles(palette);

  const [messages, setMessages] = useState<string[]>(DEFAULT_MESSAGES);
  const [isAdding, setIsAdding] = useState(false);
  const [newText, setNewText] = useState('');

  useEffect(() => {
    if (visible) {
      void loadMessages();
      setIsAdding(false);
      setNewText('');
    }
  }, [visible]);

  const loadMessages = async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
          return;
        }
      }
      setMessages(DEFAULT_MESSAGES);
    } catch {
      setMessages(DEFAULT_MESSAGES);
    }
  };

  const saveMessages = async (updated: string[]) => {
    setMessages(updated);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // Ignore async storage error
    }
  };

  const handleAddMessage = () => {
    const trimmed = newText.trim();
    if (!trimmed) return;
    const updated = [trimmed, ...messages];
    void saveMessages(updated);
    setNewText('');
    setIsAdding(false);
  };

  const handleDelete = (index: number) => {
    Alert.alert(
      t('Xóa tin nhắn nhanh'),
      t('Bạn có chắc chắn muốn xóa tin nhắn mẫu này không?'),
      [
        { text: t('Hủy'), style: 'cancel' },
        {
          text: t('Xóa'),
          style: 'destructive',
          onPress: () => {
            const updated = messages.filter((_, i) => i !== index);
            void saveMessages(updated);
          },
        },
      ]
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.iconCircle}>
                <Zap color="#0984E3" size={20} />
              </View>
              <Text style={styles.headerTitle}>{t('Tin nhắn nhanh')}</Text>
            </View>
            <View style={styles.headerRight}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('Thêm tin nhắn mẫu')}
                onPress={() => setIsAdding(prev => !prev)}
                style={styles.addButton}
              >
                <Plus color={palette.accent} size={22} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('Đóng')}
                onPress={onClose}
                style={styles.closeButton}
              >
                <X color={palette.inkSoft} size={22} />
              </Pressable>
            </View>
          </View>

          {/* Add Form */}
          {isAdding ? (
            <View style={styles.addForm}>
              <TextInput
                value={newText}
                onChangeText={setNewText}
                placeholder={t('Nhập nội dung tin nhắn nhanh mới...')}
                placeholderTextColor={palette.muted}
                style={styles.addInput}
                autoFocus
                multiline
              />
              <View style={styles.addActions}>
                <Pressable
                  onPress={() => {
                    setIsAdding(false);
                    setNewText('');
                  }}
                  style={styles.cancelButton}
                >
                  <Text style={styles.cancelText}>{t('Hủy')}</Text>
                </Pressable>
                <Pressable
                  onPress={handleAddMessage}
                  disabled={!newText.trim()}
                  style={[styles.saveButton, !newText.trim() && styles.buttonDisabled]}
                >
                  <Text style={styles.saveText}>{t('Lưu mẫu')}</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {/* List */}
          <FlatList
            data={messages}
            keyExtractor={(_, index) => `quick-msg-${index}`}
            contentContainerStyle={styles.list}
            renderItem={({ item, index }) => (
              <View style={styles.itemRow}>
                <Pressable
                  style={styles.itemTextContainer}
                  onPress={() => {
                    onSelect(item, false);
                    onClose();
                  }}
                >
                  <Text style={styles.itemText}>{item}</Text>
                </Pressable>
                <View style={styles.itemActions}>
                  <Pressable
                    accessibilityLabel={t('Gửi ngay')}
                    onPress={() => {
                      onSelect(item, true);
                      onClose();
                    }}
                    style={styles.quickSendButton}
                  >
                    <Send color="#0984E3" size={17} />
                  </Pressable>
                  <Pressable
                    accessibilityLabel={t('Xóa')}
                    onPress={() => handleDelete(index)}
                    style={styles.deleteButton}
                  >
                    <Trash2 color={palette.muted} size={17} />
                  </Pressable>
                </View>
              </View>
            )}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>{t('Chưa có tin nhắn nhanh nào.')}</Text>
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
      minHeight: 380,
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
      backgroundColor: 'rgba(9, 132, 227, 0.12)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    headerTitle: {
      fontSize: 17,
      fontWeight: '600',
      color: palette.ink,
    },
    headerRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    addButton: {
      padding: 6,
    },
    closeButton: {
      padding: 6,
    },
    addForm: {
      padding: 14,
      backgroundColor: palette.canvas,
      borderBottomWidth: 1,
      borderBottomColor: palette.line,
    },
    addInput: {
      backgroundColor: palette.paper,
      borderWidth: 1,
      borderColor: palette.line,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 14,
      color: palette.ink,
      minHeight: 56,
      textAlignVertical: 'top',
    },
    addActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      marginTop: 10,
      gap: 10,
    },
    cancelButton: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 8,
    },
    cancelText: {
      fontSize: 14,
      color: palette.inkSoft,
    },
    saveButton: {
      backgroundColor: palette.accent,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 8,
    },
    buttonDisabled: {
      opacity: 0.5,
    },
    saveText: {
      fontSize: 14,
      fontWeight: '600',
      color: '#FFFFFF',
    },
    list: {
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    itemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: palette.line,
    },
    itemTextContainer: {
      flex: 1,
      marginRight: 10,
    },
    itemText: {
      fontSize: 14,
      color: palette.ink,
      lineHeight: 20,
    },
    itemActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    quickSendButton: {
      padding: 6,
      backgroundColor: 'rgba(9, 132, 227, 0.1)',
      borderRadius: 16,
    },
    deleteButton: {
      padding: 6,
    },
    emptyContainer: {
      paddingVertical: 32,
      alignItems: 'center',
    },
    emptyText: {
      fontSize: 14,
      color: palette.muted,
    },
  });
}
