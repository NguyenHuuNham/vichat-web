import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { CalendarDays, Check, X } from 'lucide-react-native';
import { GroupEvent } from '../types';
import { ThemeColors } from '../theme/colors';
import { typography } from '../theme/typography';
import { useThemePalette } from '../theme/useThemePalette';
import { useI18n } from '../store/languageStore';

type Props = {
  visible: boolean;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (event: Pick<GroupEvent, 'title' | 'startsAt' | 'note' | 'reminderMinutes'>) => Promise<void> | void;
};

function localDateValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${day}/${month}/${year}`;
}

function parseLocalDateTime(dateValue: string, timeValue: string) {
  const dateMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dateValue);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(timeValue);
  if (!dateMatch || !timeMatch) return new Date(Number.NaN);
  const day = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const year = Number(dateMatch[3]);
  const hours = Number(timeMatch[1]);
  const minutes = Number(timeMatch[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hours > 23 || minutes > 59) return new Date(Number.NaN);
  const value = new Date(year, month - 1, day, hours, minutes, 0, 0);
  return value.getFullYear() === year
    && value.getMonth() === month - 1
    && value.getDate() === day
    && value.getHours() === hours
    && value.getMinutes() === minutes
    ? value
    : new Date(Number.NaN);
}

function localTimeValue(date = new Date(Date.now() + 60 * 60 * 1000)) {
  date.setMinutes(Math.ceil(date.getMinutes() / 5) * 5, 0, 0);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function GroupEventComposer({ visible, busy = false, onClose, onSubmit }: Props) {
  const palette = useThemePalette();
  const styles = createStyles(palette);
  const { t } = useI18n();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(localDateValue());
  const [time, setTime] = useState(localTimeValue());
  const [note, setNote] = useState('');
  const [reminderMinutes, setReminderMinutes] = useState(30);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setTitle('');
    setDate(localDateValue());
    setTime(localTimeValue());
    setNote('');
    setReminderMinutes(30);
    setError('');
  }, [visible]);

  const submit = () => {
    const cleanTitle = title.trim();
    const cleanDate = date.trim();
    const cleanTime = time.trim();
    const startsAt = parseLocalDateTime(cleanDate, cleanTime);
    if (!cleanTitle) {
      setError(t('Vui lòng nhập tên lịch.'));
      return;
    }
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(cleanDate) || Number.isNaN(startsAt.getTime())) {
      setError(t('Ngày phải có dạng DD/MM/YYYY.'));
      return;
    }
    if (!/^\d{2}:\d{2}$/.test(cleanTime)) {
      setError(t('Giờ phải có dạng HH:MM.'));
      return;
    }
    if (startsAt.getTime() <= Date.now() - 60_000) {
      setError(t('Thời gian lịch phải ở phía trước.'));
      return;
    }
    setError('');
    void onSubmit({
      title: cleanTitle,
      startsAt: startsAt.toISOString(),
      note: note.trim(),
      reminderMinutes,
    });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.header}><View style={styles.heading}><CalendarDays color={palette.accent} size={20} /><Text style={styles.title}>{t('Tạo lịch nhóm')}</Text></View><Pressable onPress={onClose} style={styles.icon} accessibilityLabel={t('Đóng')}><X color={palette.inkSoft} size={20} /></Pressable></View>
          <Text style={styles.label}>{t('Tên lịch')}</Text>
          <TextInput value={title} onChangeText={setTitle} maxLength={180} autoFocus placeholder={t('Ví dụ: Họp nhóm tuần này')} placeholderTextColor={palette.muted} style={styles.input} />
          <View style={styles.fields}><View style={styles.field}><Text style={styles.label}>{t('Ngày')}</Text><TextInput value={date} onChangeText={setDate} maxLength={10} keyboardType="numbers-and-punctuation" placeholder="DD/MM/YYYY" placeholderTextColor={palette.muted} style={styles.input} /></View><View style={styles.field}><Text style={styles.label}>{t('Giờ')}</Text><TextInput value={time} onChangeText={setTime} maxLength={5} keyboardType="numbers-and-punctuation" placeholder="HH:MM" placeholderTextColor={palette.muted} style={styles.input} /></View></View>
          <Text style={styles.label}>{t('Ghi chú')}</Text>
          <TextInput value={note} onChangeText={setNote} maxLength={1000} multiline numberOfLines={3} placeholder={t('Nội dung cần chuẩn bị (không bắt buộc)')} placeholderTextColor={palette.muted} style={[styles.input, styles.note]} />
          <Text style={styles.label}>{t('Nhắc trước')}</Text>
          <View style={styles.reminders}>{([[0, 'Không nhắc'], [10, '10 phút'], [30, '30 phút'], [60, '1 giờ'], [1440, '1 ngày']] as Array<[number, string]>).map(([value, label]) => <Pressable key={value} onPress={() => setReminderMinutes(value)} style={[styles.reminder, reminderMinutes === value && styles.reminderActive]}><Text style={[styles.reminderText, reminderMinutes === value && styles.reminderTextActive]}>{t(label)}</Text></Pressable>)}</View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable onPress={submit} disabled={busy} style={[styles.submit, busy && styles.disabled]}><Check color="#fff" size={18} /><Text style={styles.submitText}>{busy ? t('Đang tạo...') : t('Tạo lịch')}</Text></Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function createStyles(palette: ThemeColors) {
  return StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'flex-end' },
    backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(5,12,16,0.66)' },
    sheet: { maxHeight: '92%', padding: 18, borderTopLeftRadius: 26, borderTopRightRadius: 26, backgroundColor: palette.canvas },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
    heading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    title: { ...typography.title, color: palette.ink },
    icon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.paper },
    label: { ...typography.caption, color: palette.inkSoft, marginBottom: 5, marginTop: 8 },
    input: { minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.paper, color: palette.ink, paddingHorizontal: 13, paddingVertical: 10, fontFamily: 'BeVietnamPro_400Regular', fontSize: 14 },
    fields: { flexDirection: 'row', gap: 9 },
    field: { flex: 1 },
    note: { minHeight: 78, textAlignVertical: 'top' },
    reminders: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
    reminder: { minHeight: 34, borderRadius: 11, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.line, backgroundColor: palette.paper },
    reminderActive: { borderColor: palette.accent, backgroundColor: palette.accentWash },
    reminderText: { ...typography.caption, color: palette.inkSoft },
    reminderTextActive: { color: palette.accentDeep, fontFamily: 'BeVietnamPro_700Bold' },
    error: { ...typography.caption, color: palette.danger, marginTop: 10 },
    submit: { minHeight: 48, marginTop: 15, borderRadius: 15, backgroundColor: palette.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    submitText: { ...typography.bodyMedium, color: '#fff' },
    disabled: { opacity: 0.55 },
  });
}
