import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Check, Pencil, Trash2, X } from 'lucide-react-native';
import { Avatar } from './Avatar';
import { colorsForTheme, shadow } from '../theme/colors';
import { typography } from '../theme/typography';
import { useThemeStore } from '../store/themeStore';
import { ConversationMember } from '../types';

interface Props {
  visible: boolean;
  member: ConversationMember | null;
  initialNickname?: string;
  onCancel: () => void;
  onSave: (nickname: string) => Promise<void>;
}

function officialName(member: ConversationMember | null) {
  if (!member) return '';
  const source = member as any;
  return String(
    source.defaultName
      || source.default_name
      || source.fullName
      || source.full_name
      || source.name
      || source.username
      || source.id
      || 'Thành viên',
  ).trim();
}

export function ConversationNicknameModal({ visible, member, initialNickname = '', onCancel, onSave }: Props) {
  const palette = colorsForTheme(useThemeStore(state => state.resolved));
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [value, setValue] = useState(initialNickname);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const defaultName = officialName(member);

  useEffect(() => {
    if (!visible) return;
    setValue(String(initialNickname || '').slice(0, 80));
    setError('');
    setBusy(false);
  }, [initialNickname, member?.id, visible]);

  const submit = async () => {
    if (!member || busy) return;
    setBusy(true);
    setError('');
    try {
      await onSave(value.trim().slice(0, 80));
      onCancel();
    } catch (valueError) {
      setError(valueError instanceof Error ? valueError.message : 'Không lưu được biệt danh.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={busy ? undefined : onCancel}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={busy ? undefined : onCancel} />
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.headingCopy}>
              <View style={styles.eyebrowRow}><Pencil color={palette.accent} size={13} /><Text style={styles.eyebrow}>THÔNG TIN HỘI THOẠI</Text></View>
              <Text style={styles.title}>Đổi biệt danh</Text>
            </View>
            <Pressable disabled={busy} onPress={onCancel} style={styles.close} accessibilityLabel="Đóng"><X color={palette.inkSoft} size={19} /></Pressable>
          </View>
          <View style={styles.memberHero}>
            <Avatar name={defaultName} uri={member?.avatar} size={58} rounded={!member?.type || member.type !== 'group'} />
            <View style={styles.memberCopy}>
              <Text style={styles.heroLabel}>Đặt biệt danh cho</Text>
              <Text numberOfLines={1} style={styles.heroName}>{defaultName}</Text>
              <Text style={styles.heroHint}>Biệt danh được dùng trong cuộc trò chuyện này.</Text>
            </View>
          </View>
          <Text style={styles.fieldLabel}>Biệt danh trong cuộc trò chuyện</Text>
          <TextInput
            value={value}
            onChangeText={next => setValue(next.slice(0, 80))}
            placeholder={defaultName}
            placeholderTextColor={palette.muted}
            maxLength={80}
            autoFocus
            editable={!busy}
            style={styles.input}
            returnKeyType="done"
            onSubmitEditing={() => void submit()}
          />
          <Text style={styles.helper}>Để trống rồi lưu để xóa biệt danh.</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.actions}>
            <Pressable disabled={busy} onPress={onCancel} style={styles.secondaryButton}><Text style={styles.secondaryText}>Hủy</Text></Pressable>
            <Pressable disabled={busy} onPress={() => setValue('')} style={styles.clearButton}><Trash2 color={palette.danger} size={16} /><Text style={styles.clearText}>Xóa</Text></Pressable>
            <Pressable disabled={busy || !member} onPress={() => void submit()} style={[styles.primaryButton, busy && styles.disabled]}>{busy ? <ActivityIndicator color="#fff" size="small" /> : <Check color="#fff" size={17} />}<Text style={styles.primaryText}>{busy ? 'Đang lưu...' : 'Lưu biệt danh'}</Text></Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function createStyles(palette: ReturnType<typeof colorsForTheme>) {
  return StyleSheet.create({
    overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 22 },
    backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(5,12,16,0.66)' },
    card: { width: '100%', maxWidth: 520, borderRadius: 24, borderWidth: 1, borderColor: palette.line, padding: 20, backgroundColor: palette.paper, ...shadow },
    header: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    headingCopy: { flex: 1, minWidth: 0 },
    eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    eyebrow: { ...typography.caption, color: palette.accent, fontSize: 10, fontFamily: 'BeVietnamPro_700Bold' },
    title: { ...typography.title, color: palette.ink, marginTop: 4 },
    close: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.accentWash },
    memberHero: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 19, padding: 12, borderRadius: 16, backgroundColor: palette.canvas, borderWidth: 1, borderColor: palette.line },
    memberCopy: { flex: 1, minWidth: 0 },
    heroLabel: { ...typography.caption, color: palette.inkSoft },
    heroName: { ...typography.bodyMedium, color: palette.ink, marginTop: 2 },
    heroHint: { ...typography.caption, color: palette.muted, marginTop: 3 },
    fieldLabel: { ...typography.caption, color: palette.ink, fontFamily: 'BeVietnamPro_700Bold', marginTop: 18, marginBottom: 7 },
    input: { minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.canvas, color: palette.ink, paddingHorizontal: 13, fontFamily: 'BeVietnamPro_400Regular', fontSize: 14 },
    helper: { ...typography.caption, color: palette.muted, marginTop: 7 },
    error: { ...typography.caption, color: palette.danger, marginTop: 8 },
    actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginTop: 19 },
    secondaryButton: { minHeight: 42, borderRadius: 12, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.accentWash },
    secondaryText: { ...typography.caption, color: palette.inkSoft, fontFamily: 'BeVietnamPro_700Bold' },
    clearButton: { minHeight: 42, borderRadius: 12, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 5 },
    clearText: { ...typography.caption, color: palette.danger, fontFamily: 'BeVietnamPro_700Bold' },
    primaryButton: { minHeight: 42, borderRadius: 12, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: palette.accent },
    primaryText: { ...typography.caption, color: '#fff', fontFamily: 'BeVietnamPro_700Bold' },
    disabled: { opacity: 0.55 },
  });
}
