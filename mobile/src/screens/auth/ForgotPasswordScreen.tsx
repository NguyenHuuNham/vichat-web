import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, ArrowRight, MailCheck } from 'lucide-react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../navigation/types';
import { authService } from '../../services/authService';
import { ThemeColors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { useThemePalette } from '../../theme/useThemePalette';
import { useI18n } from '../../store/languageStore';

type Props = NativeStackScreenProps<AuthStackParamList, 'ForgotPassword'>;

export function ForgotPasswordScreen({ navigation }: Props) {
  const palette = useThemePalette();
  const styles = createStyles(palette);
  const { t } = useI18n();
  const [identity, setIdentity] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    if (!identity.trim()) { setError(t('Nhập email công ty để nhận hướng dẫn.')); return; }
    setBusy(true); setError('');
    try { await authService.requestPasswordReset(identity); setDone(true); } catch (value) { setError(value instanceof Error ? t(value.message) : t('Không gửi được yêu cầu.')); } finally { setBusy(false); }
  };
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom', 'left', 'right']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Pressable onPress={() => navigation.goBack()} style={styles.back}><ArrowLeft color={palette.ink} size={20} /><Text style={styles.backText}>{t('Đăng nhập')}</Text></Pressable>
          <View style={styles.content}>
            <View style={styles.icon}><MailCheck color={palette.accent} size={28} /></View>
            <Text style={styles.title}>{t('Lấy lại quyền truy cập')}</Text>
            <Text style={styles.description}>{t('Nhập email UpGO Account. Nếu tài khoản hợp lệ, hệ thống sẽ gửi link đặt lại mật khẩu.')}</Text>
            {done ? <View style={styles.success}><Text style={styles.successText}>{t('Yêu cầu đã được tiếp nhận. Kiểm tra email công ty của bạn.')}</Text></View> : <>
              <TextInput value={identity} onChangeText={setIdentity} placeholder={t('Email công ty')} placeholderTextColor={palette.muted} autoCapitalize="none" keyboardType="email-address" style={styles.input} />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <Pressable onPress={submit} disabled={busy} style={[styles.button, busy && { opacity: 0.6 }]}><Text style={styles.buttonText}>{busy ? t('Đang gửi...') : t('Gửi hướng dẫn')}</Text><ArrowRight color="#fff" size={19} /></Pressable>
            </>}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function createStyles(palette: ThemeColors) {
  return StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: palette.canvas },
  scroll: { flexGrow: 1, padding: 24 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 12, paddingBottom: 24 },
  backText: { ...typography.bodyMedium, color: palette.ink },
  content: { paddingTop: 55 },
  icon: { width: 62, height: 62, borderRadius: 22, backgroundColor: palette.accentWash, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  title: { ...typography.display, fontSize: 28, color: palette.ink },
  description: { ...typography.body, color: palette.inkSoft, marginTop: 12, marginBottom: 26 },
  input: { height: 55, borderRadius: 17, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.paper, paddingHorizontal: 16, color: palette.ink, fontFamily: 'BeVietnamPro_400Regular', fontSize: 15 },
  error: { ...typography.caption, color: palette.danger, marginTop: 10 },
  success: { borderRadius: 16, backgroundColor: `${palette.online}18`, padding: 15 },
  successText: { ...typography.body, color: palette.online },
  button: { height: 55, borderRadius: 17, backgroundColor: palette.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 17 },
  buttonText: { ...typography.bodyMedium, color: '#fff' },
  });
}
