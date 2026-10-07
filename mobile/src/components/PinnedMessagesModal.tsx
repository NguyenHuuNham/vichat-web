import { memo } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { ArrowUpRight, Pin, PinOff, X } from 'lucide-react-native';
import { ChatMessage } from '../types';
import { ThemeColors, shadow } from '../theme/colors';
import { typography } from '../theme/typography';
import { useThemePalette } from '../theme/useThemePalette';
import { useThemeStore } from '../store/themeStore';
import { useI18n } from '../store/languageStore';
import { Avatar } from './Avatar';
import { formatMessageTime } from '../utils/timeFormatting';
import { getPinnedMessageSnippet } from '../utils/pinnedMessage';

interface Props {
  visible: boolean;
  onClose: () => void;
  pinnedMessages: ChatMessage[];
  onSelectMessage: (message: ChatMessage) => void;
  onUnpinMessage?: (message: ChatMessage) => void;
  canUnpin?: boolean;
}

export const PinnedMessagesModal = memo(function PinnedMessagesModal({
  visible,
  onClose,
  pinnedMessages,
  onSelectMessage,
  onUnpinMessage,
  canUnpin = true,
}: Props) {
  const isDark = useThemeStore(state => state.resolved === 'dark');
  const palette = useThemePalette();
  const styles = createStyles(palette, isDark);
  const { t } = useI18n();

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.headerIcon}>
                <Pin color="#2196F3" size={19} />
              </View>
              <Text style={styles.title}>
                {t('Tin nhắn đã ghim')} ({pinnedMessages.length})
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('Đóng')}
              onPress={onClose}
              style={styles.closeBtn}
            >
              <X color={palette.inkSoft} size={20} />
            </Pressable>
          </View>

          {pinnedMessages.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Pin color={palette.muted} size={36} />
              <Text style={styles.emptyText}>{t('Chưa có tin nhắn đã ghim')}</Text>
            </View>
          ) : (
            <FlatList
              data={pinnedMessages.slice().reverse()} // Show newest first
              keyExtractor={item => String(item.id || item.seq)}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => {
                const snippet = getPinnedMessageSnippet(item, t);
                const senderName = item.sender === 'outgoing'
                  ? t('Bạn')
                  : (item.senderName || t('Thành viên'));
                const timeStr = formatMessageTime(item.createdAt || item.time);

                return (
                  <View style={styles.itemCard}>
                    <View style={styles.itemHeader}>
                      <Avatar name={senderName} uri={item.avatar} size={26} />
                      <Text numberOfLines={1} style={styles.itemSender}>
                        {senderName}
                      </Text>
                      <Text style={styles.itemTime}>{timeStr}</Text>
                    </View>

                    <Text numberOfLines={2} style={styles.itemSnippet}>
                      {snippet}
                    </Text>

                    <View style={styles.itemActions}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t('Đi tới tin nhắn')}
                        onPress={() => {
                          onClose();
                          onSelectMessage(item);
                        }}
                        style={styles.actionJump}
                      >
                        <ArrowUpRight color={palette.accent} size={16} />
                        <Text style={styles.actionJumpText}>{t('Đi tới tin nhắn')}</Text>
                      </Pressable>

                      {canUnpin && onUnpinMessage ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={t('Bỏ ghim')}
                          onPress={() => onUnpinMessage(item)}
                          style={styles.actionUnpin}
                        >
                          <PinOff color={palette.danger} size={15} />
                          <Text style={styles.actionUnpinText}>{t('Bỏ ghim')}</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                );
              }}
            />
          )}

          <Text style={styles.footerHint}>
            {t('Nhấn giữ vào tin nhắn bất kỳ để ghim hoặc bỏ ghim.')}
          </Text>
        </View>
      </View>
    </Modal>
  );
});

function createStyles(palette: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    backdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(10, 14, 20, 0.55)',
    },
    sheet: {
      backgroundColor: palette.canvas,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 28,
      maxHeight: '75%',
      ...shadow,
    },
    handle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: palette.muted,
      alignSelf: 'center',
      marginBottom: 12,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: palette.line,
      marginBottom: 12,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    headerIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: isDark ? 'rgba(33, 150, 243, 0.16)' : 'rgba(33, 150, 243, 0.12)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      ...typography.title,
      color: palette.ink,
      fontSize: 17,
    },
    closeBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: palette.paper,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyContainer: {
      paddingVertical: 36,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
    },
    emptyText: {
      ...typography.body,
      color: palette.inkSoft,
    },
    listContent: {
      paddingBottom: 8,
    },
    itemCard: {
      backgroundColor: palette.paper,
      borderRadius: 14,
      padding: 12,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: palette.line,
    },
    itemHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 8,
      gap: 8,
    },
    itemSender: {
      flex: 1,
      fontSize: 13,
      fontWeight: '600',
      color: palette.ink,
    },
    itemTime: {
      fontSize: 11,
      color: palette.inkSoft,
    },
    itemSnippet: {
      fontSize: 14,
      color: palette.ink,
      lineHeight: 19,
      marginBottom: 10,
    },
    itemActions: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 12,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: palette.line,
    },
    actionJump: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 4,
      paddingHorizontal: 8,
    },
    actionJumpText: {
      fontSize: 13,
      fontWeight: '600',
      color: palette.accent,
    },
    actionUnpin: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 4,
      paddingHorizontal: 8,
    },
    actionUnpinText: {
      fontSize: 13,
      fontWeight: '500',
      color: palette.danger,
    },
    footerHint: {
      fontSize: 12,
      color: palette.muted,
      textAlign: 'center',
      marginTop: 8,
    },
  });
}
