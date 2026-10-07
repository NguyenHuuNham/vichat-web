import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronDown, MessageSquareText } from 'lucide-react-native';
import { ChatMessage } from '../types';
import { ThemeColors } from '../theme/colors';
import { useThemePalette } from '../theme/useThemePalette';
import { useThemeStore } from '../store/themeStore';
import { useI18n } from '../store/languageStore';

interface Props {
  pinnedMessages: ChatMessage[];
  currentIndex?: number;
  onPressMessage: (message: ChatMessage) => void;
  onPressList: () => void;
}

import { getPinnedMessageSnippet } from '../utils/pinnedMessage';
export { getPinnedMessageSnippet };

export const PinnedMessageBar = memo(function PinnedMessageBar({
  pinnedMessages,
  currentIndex = 0,
  onPressMessage,
  onPressList,
}: Props) {
  const isDark = useThemeStore(state => state.resolved === 'dark');
  const palette = useThemePalette();
  const styles = createStyles(palette, isDark);
  const { t } = useI18n();

  if (!pinnedMessages || pinnedMessages.length === 0) return null;

  // By default, display the newest pinned message or current index
  const safeIndex = Math.max(0, Math.min(currentIndex, pinnedMessages.length - 1));
  const currentMessage = pinnedMessages[safeIndex] || pinnedMessages[pinnedMessages.length - 1];
  const snippet = getPinnedMessageSnippet(currentMessage, t);

  const senderName = currentMessage.sender === 'outgoing'
    ? t('Bạn')
    : (currentMessage.senderName || t('Thành viên'));
  const subtitle = `${t('Tin nhắn của')} ${senderName}`;
  const additionalCount = pinnedMessages.length - 1;

  return (
    <View style={styles.outerWrapper}>
      <View style={styles.card}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t('Tin nhắn đã ghim')}: ${snippet}`}
          onPress={() => onPressMessage(currentMessage)}
          style={({ pressed }) => [styles.mainContent, pressed && styles.contentPressed]}
        >
          <View style={styles.iconContainer}>
            <MessageSquareText color="#2196F3" size={23} strokeWidth={2.1} />
          </View>

          <View style={styles.textColumn}>
            <Text numberOfLines={1} style={styles.titleText}>
              {snippet}
            </Text>
            <Text numberOfLines={1} style={styles.subtitleText}>
              {subtitle}
            </Text>
          </View>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Danh sách ghim')}
          onPress={onPressList}
          style={({ pressed }) => [styles.pillButton, pressed && styles.pillPressed]}
        >
          {additionalCount > 0 ? (
            <Text style={styles.pillText}>+{additionalCount}</Text>
          ) : null}
          <ChevronDown
            color={isDark ? '#FFFFFF' : palette.ink}
            size={15}
            strokeWidth={2.4}
            style={additionalCount > 0 ? styles.pillChevronWithText : undefined}
          />
        </Pressable>
      </View>
    </View>
  );
});

function createStyles(palette: ThemeColors, isDark: boolean) {
  return StyleSheet.create({
    outerWrapper: {
      paddingHorizontal: 12,
      paddingTop: 6,
      paddingBottom: 4,
      zIndex: 20,
    },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? '#2D2D31' : '#FFFFFF',
      borderRadius: 15,
      paddingVertical: 9,
      paddingHorizontal: 13,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.11)' : 'rgba(0, 0, 0, 0.08)',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.28 : 0.09,
      shadowRadius: 5,
      elevation: 4,
    },
    mainContent: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      minWidth: 0,
      marginRight: 8,
    },
    contentPressed: {
      opacity: 0.72,
    },
    iconContainer: {
      marginRight: 11,
      alignItems: 'center',
      justifyContent: 'center',
    },
    textColumn: {
      flex: 1,
      minWidth: 0,
      justifyContent: 'center',
    },
    titleText: {
      fontSize: 14.5,
      fontWeight: '600',
      color: isDark ? '#FFFFFF' : palette.ink,
      lineHeight: 19,
    },
    subtitleText: {
      fontSize: 12,
      color: isDark ? '#9A9A9E' : palette.inkSoft,
      marginTop: 2,
      lineHeight: 16,
    },
    pillButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 18,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.28)' : 'rgba(0, 0, 0, 0.18)',
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.04)',
      paddingHorizontal: 11,
      paddingVertical: 5,
    },
    pillPressed: {
      opacity: 0.65,
    },
    pillText: {
      fontSize: 13,
      fontWeight: '600',
      color: isDark ? '#FFFFFF' : palette.ink,
    },
    pillChevronWithText: {
      marginLeft: 3,
    },
  });
}
