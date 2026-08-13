import { ChevronRight, UsersRound, Bot } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Conversation } from '../types';
import { colors, shadow } from '../theme/colors';
import { typography } from '../theme/typography';
import { formatConversationTime } from '../utils/timeFormatting';
import { Avatar } from './Avatar';

export function ConversationRow({ conversation, onPress, onLongPress }: { conversation: Conversation; onPress: () => void; onLongPress?: () => void }) {
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <Avatar name={conversation.name} uri={conversation.avatarUrl} size={52} rounded={!conversation.isGroup} />
      <View style={styles.body}>
        <View style={styles.topline}>
          <View style={styles.nameWrap}>
            {conversation.isChatbot ? <Bot color={colors.accent} size={15} strokeWidth={2.5} /> : conversation.isGroup ? <UsersRound color={colors.inkSoft} size={15} /> : null}
            <Text numberOfLines={1} style={styles.name}>{conversation.name}</Text>
          </View>
          <Text style={styles.time}>{formatConversationTime(conversation.updatedAt || conversation.time)}</Text>
        </View>
        <View style={styles.bottomline}>
          <Text numberOfLines={1} style={[styles.preview, conversation.badge > 0 && styles.previewUnread]}>{conversation.lastMsg || (conversation.isGroup ? `${conversation.membersCount || 'Nhóm nội bộ'}` : 'Bắt đầu cuộc trò chuyện')}</Text>
          {conversation.badge > 0 ? <View style={styles.badge}><Text style={styles.badgeText}>{conversation.badge > 99 ? '99+' : conversation.badge}</Text></View> : <ChevronRight color={colors.line} size={17} />}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 88, marginBottom: 12, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 13, borderRadius: 20, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, ...shadow },
  pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
  body: { flex: 1, minWidth: 0, gap: 8 },
  topline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  nameWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { ...typography.title, color: colors.ink, flexShrink: 1 },
  time: { ...typography.caption, color: colors.muted, flexShrink: 0 },
  bottomline: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  preview: { ...typography.body, color: colors.inkSoft, flex: 1, fontSize: 14 },
  previewUnread: { color: colors.ink, fontFamily: 'BeVietnamPro_600SemiBold' },
  badge: { minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  badgeText: { color: '#fff', fontFamily: 'BeVietnamPro_700Bold', fontSize: 10 },
});
