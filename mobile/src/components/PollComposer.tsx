import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Check, Plus, X } from 'lucide-react-native';
import { Poll, PollSettings } from '../types';
import { ThemeColors, shadow } from '../theme/colors';
import { typography } from '../theme/typography';
import { useThemePalette } from '../theme/useThemePalette';

interface Props {
  visible: boolean;
  allowPin?: boolean;
  onClose: () => void;
  onSubmit: (poll: Pick<Poll, 'question' | 'options' | 'settings'>) => void;
}

type Duration = 'none' | '1d' | '7d' | '30d';

const defaultSettings: PollSettings = { expiresAt: '', allowMultiple: false, allowAddOptions: false, hideResultsUntilVote: false, hideVoters: false, pinPoll: false };

function expiryFor(duration: Duration) {
  if (duration === 'none') return '';
  const days = duration === '1d' ? 1 : duration === '7d' ? 7 : 30;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

export function PollComposer({ visible, allowPin = false, onClose, onSubmit }: Props) {
  const palette = useThemePalette();
  const styles = createStyles(palette);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [allowAddOptions, setAllowAddOptions] = useState(false);
  const [hideResultsUntilVote, setHideResultsUntilVote] = useState(false);
  const [hideVoters, setHideVoters] = useState(false);
  const [pinPoll, setPinPoll] = useState(false);
  const [duration, setDuration] = useState<Duration>('none');

  const close = () => {
    setQuestion('');
    setOptions(['', '']);
    setAllowMultiple(false);
    setAllowAddOptions(false);
    setHideResultsUntilVote(false);
    setHideVoters(false);
    setPinPoll(false);
    setDuration('none');
    onClose();
  };

  const submit = () => {
    const values = [...new Set(options.map(value => value.trim()).filter(Boolean))].slice(0, 20);
    if (!question.trim() || values.length < 2) return;
    onSubmit({
      question: question.trim(),
      options: values.map((text, index) => ({ id: `option-${index + 1}`, text })),
      settings: { ...defaultSettings, allowMultiple, allowAddOptions, hideResultsUntilVote, hideVoters, pinPoll: allowPin && pinPoll, expiresAt: expiryFor(duration) },
    });
    close();
  };

  const valid = Boolean(question.trim()) && options.filter(value => value.trim()).length >= 2;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={close} />
        <View style={styles.sheet}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetContent}>
            <View style={styles.header}>
              <Text style={styles.title}>Tạo bình chọn</Text>
              <Pressable onPress={close} style={styles.close}><X color={palette.inkSoft} size={19} /></Pressable>
            </View>
            <TextInput value={question} onChangeText={setQuestion} maxLength={200} placeholder="Câu hỏi" placeholderTextColor={palette.muted} style={styles.question} />
            {options.map((value, index) => (
              <View key={index} style={styles.optionRow}>
                <TextInput value={value} onChangeText={next => setOptions(current => current.map((item, itemIndex) => itemIndex === index ? next : item))} maxLength={120} placeholder={`Lựa chọn ${index + 1}`} placeholderTextColor={palette.muted} style={styles.optionInput} />
                {options.length > 2 ? <Pressable onPress={() => setOptions(current => current.filter((_, itemIndex) => itemIndex !== index))} style={styles.optionRemove}><X color={palette.danger} size={17} /></Pressable> : null}
              </View>
            ))}
            {options.length < 20 ? <Pressable onPress={() => setOptions(current => [...current, ''])} style={styles.addOption}><Plus color={palette.accent} size={17} /><Text style={styles.addOptionText}>Thêm lựa chọn</Text></Pressable> : null}
            <Text style={styles.settingsTitle}>Thiết lập</Text>
            <ToggleRow palette={palette} value={allowMultiple} onChange={setAllowMultiple} label="Cho chọn nhiều đáp án" />
            <ToggleRow palette={palette} value={allowAddOptions} onChange={setAllowAddOptions} label="Cho thành viên thêm phương án" />
            <ToggleRow palette={palette} value={hideResultsUntilVote} onChange={setHideResultsUntilVote} label="Ẩn kết quả trước khi bình chọn" />
            <ToggleRow palette={palette} value={hideVoters} onChange={setHideVoters} label="Ẩn danh sách người bình chọn" />
            {allowPin ? <ToggleRow palette={palette} value={pinPoll} onChange={setPinPoll} label="Ghim bình chọn sau khi tạo" /> : null}
            <Text style={styles.expiryLabel}>Thời hạn</Text>
            <View style={styles.durationRow}>
              {([['none', 'Không hết hạn'], ['1d', '1 ngày'], ['7d', '7 ngày'], ['30d', '30 ngày']] as Array<[Duration, string]>).map(([value, label]) => <Pressable key={value} onPress={() => setDuration(value)} style={[styles.duration, duration === value && styles.durationActive]}><Text style={[styles.durationText, duration === value && styles.durationTextActive]}>{label}</Text></Pressable>)}
            </View>
            <Pressable onPress={submit} disabled={!valid} style={[styles.submit, !valid && styles.disabled]}><Check color="#fff" size={18} /><Text style={styles.submitText}>Đăng bình chọn</Text></Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function ToggleRow({ palette, value, onChange, label }: { palette: ThemeColors; value: boolean; onChange: (value: boolean) => void; label: string }) {
  const styles = createStyles(palette);
  return <Pressable onPress={() => onChange(!value)} style={styles.multipleRow}><View style={[styles.check, value && styles.checkActive]}>{value ? <Check color="#fff" size={14} /> : null}</View><Text style={styles.multipleText}>{label}</Text></Pressable>;
}

function createStyles(palette: ThemeColors) {
  return StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(12,20,27,0.46)' },
  sheet: { maxHeight: '92%', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 18, backgroundColor: palette.canvas, ...shadow },
  sheetContent: { paddingBottom: 10 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { ...typography.title, color: palette.ink },
  close: { width: 37, height: 37, borderRadius: 12, backgroundColor: palette.paper, alignItems: 'center', justifyContent: 'center' },
  question: { minHeight: 50, borderRadius: 15, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.paper, paddingHorizontal: 14, color: palette.ink, fontFamily: 'BeVietnamPro_400Regular', fontSize: 14, marginBottom: 8 },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 8 },
  optionInput: { flex: 1, height: 46, borderRadius: 14, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.paper, paddingHorizontal: 13, color: palette.ink, fontFamily: 'BeVietnamPro_400Regular', fontSize: 13 },
  optionRemove: { width: 35, height: 35, borderRadius: 11, backgroundColor: `${palette.danger}18`, alignItems: 'center', justifyContent: 'center' },
  addOption: { minHeight: 42, marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 13, borderWidth: 1, borderColor: palette.accent, borderStyle: 'dashed' },
  addOptionText: { ...typography.caption, color: palette.accentDeep },
  settingsTitle: { ...typography.caption, color: palette.accentDeep, fontFamily: 'BeVietnamPro_700Bold', marginTop: 16, marginBottom: 2 },
  multipleRow: { minHeight: 43, flexDirection: 'row', alignItems: 'center', gap: 9 },
  check: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: palette.line, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.paper },
  checkActive: { backgroundColor: palette.accent, borderColor: palette.accent },
  multipleText: { ...typography.body, color: palette.ink },
  expiryLabel: { ...typography.caption, color: palette.inkSoft, marginTop: 8, marginBottom: 6 },
  durationRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 15 },
  duration: { minHeight: 35, paddingHorizontal: 10, borderRadius: 11, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.paper, alignItems: 'center', justifyContent: 'center' },
  durationActive: { borderColor: palette.accent, backgroundColor: palette.accentWash },
  durationText: { ...typography.caption, color: palette.inkSoft, fontSize: 10.5 },
  durationTextActive: { color: palette.accentDeep, fontFamily: 'BeVietnamPro_700Bold' },
  submit: { minHeight: 49, borderRadius: 15, backgroundColor: palette.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  disabled: { opacity: 0.4 },
  submitText: { ...typography.bodyMedium, color: '#fff' },
  });
}
