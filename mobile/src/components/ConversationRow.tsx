import { memo } from 'react';
import { ChevronRight, UsersRound, Bot } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Conversation } from '../types';
import { ThemeColors, shadow } from '../theme/colors';
import { typography } from '../theme/typography';
import { useThemePalette } from '../theme/useThemePalette';
import { formatConversationTime } from '../utils/timeFormatting';
import { Avatar } from './Avatar';
import { ConversationViewerPreference } from '../services/conversationPreferenceService';
import { useI18n } from '../store/languageStore';

export const ConversationRow = memo(function ConversationRow({ conversation, preference, onPress, onLongPress }: { conversation: Conversation; preference?: ConversationViewerPreference; onPress: () => void; onLongPress?: () => void }) {
  const palette = useThemePalette();
  const styles = createStyles(palette);
  const { t } = useI18n();
  const compact = preference?.displayMode === 'compact';
  const category = preference?.category ? t(({ customer: 'Khách hàng', work: 'Công việc', urgent: 'Ưu tiên', 'follow-up': 'Cần theo dõi', other: 'Khác' } as Record<string, string>)[preference.category] || '') : '';
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} style={({ pressed }) => [styles.row, compact && styles.rowCompact, pressed && styles.pressed]}>
      <Avatar name={conversation.name} uri={conversation.avatarUrl} size={compact ? 44 : 52} rounded={!conversation.isGroup} />
      <View style={[styles.body, compact && styles.bodyCompact]}>
        <View style={styles.topline}>
          <View style={styles.nameWrap}>
            {conversation.isChatbot ? <Bot color={palette.accent} size={15} strokeWidth={2.5} /> : conversation.isGroup ? <UsersRound color={palette.inkSoft} size={15} /> : null}
            <Text numberOfLines={1} style={styles.name}>{conversation.name}</Text>
          </View>
          {category ? <Text numberOfLines={1} style={styles.category}>{category}</Text> : null}
          <Text style={styles.time}>{formatConversationTime(conversation.updatedAt || conversation.time)}</Text>
        </View>
        <View style={styles.bottomline}>
          <Text numberOfLines={1} style={[styles.preview, conversation.badge > 0 && styles.previewUnread]}>{conversation.lastMsg || (conversation.isGroup ? `${conversation.membersCount || t('Nhóm nội bộ')}` : t('Bắt đầu cuộc trò chuyện'))}</Text>
          {conversation.badge > 0 ? <View style={styles.badge}><Text style={styles.badgeText}>{conversation.badge > 99 ? '99+' : conversation.badge}</Text></View> : <ChevronRight color={palette.line} size={17} />}
        </View>
      </View>
    </Pressable>
  );
}, (previous, next) => previous.conversation === next.conversation && previous.preference === next.preference);

function createStyles(palette: ThemeColors) {
  return StyleSheet.create({
    row: { minHeight: 88, marginBottom: 12, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 13, borderRadius: 20, backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.line, ...shadow },
    rowCompact: { minHeight: 70, paddingVertical: 9, gap: 10 },
    pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
    body: { flex: 1, minWidth: 0, gap: 8 },
    bodyCompact: { gap: 4 },
    topline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    nameWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
    name: { ...typography.title, color: palette.ink, flexShrink: 1 },
    time: { ...typography.caption, color: palette.muted, flexShrink: 0 },
    category: { ...typography.caption, color: palette.accentDeep, maxWidth: 84, fontSize: 9 },
    bottomline: { flexDirection: 'row', alignItems: 'center', gap: 9 },
    preview: { ...typography.body, color: palette.inkSoft, flex: 1, fontSize: 14 },
    previewUnread: { color: palette.ink, fontFamily: 'BeVietnamPro_600SemiBold' },
    badge: { minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.accent },
    badgeText: { color: '#fff', fontFamily: 'BeVietnamPro_700Bold', fontSize: 10 },
  });
}
