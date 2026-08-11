import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Eye, EyeOff, ArrowRight, LockKeyhole, Mail } from 'lucide-react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../navigation/types';
import { colors, shadow } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { useAppStore } from '../../store/appStore';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const login = useAppStore(state => state.login);
  const storeError = useAppStore(state => state.error);
  const [identity, setIdentity] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!identity.trim() || !password) { setError('Nhập email và mật khẩu UpGO Account để tiếp tục.'); return; }
    setError('');
    setBusy(true);
    try { await login(identity, password); } catch (value) { setError(value instanceof Error ? value.message : 'Đăng nhập thất bại.'); } finally { setBusy(false); }
  };

  return (
    <LinearGradient colors={[colors.canvas, '#FFF8F2', '#FDE4D4']} style={styles.flex}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <View style={styles.logo}><Text style={styles.logoText}>V</Text></View>
            <Text style={styles.kicker}>GON PLATFORM · WORKSPACE CHAT</Text>
            <Text style={styles.heading}>Làm việc liền mạch{`\n`}giữa những người cùng đội.</Text>
            <Text style={styles.subheading}>Đăng nhập bằng UpGO Account của công ty để vào đúng không gian làm việc.</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Chào mừng trở lại</Text>
            <Text style={styles.cardHint}>Tài khoản của bạn được bảo vệ bởi UpGO Account.</Text>
            <View style={styles.field}>
              <Mail color={colors.muted} size={19} />
              <TextInput value={identity} onChangeText={setIdentity} placeholder="Email công ty" placeholderTextColor={colors.muted} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" style={styles.input} editable={!busy} />
            </View>
            <View style={styles.field}>
              <LockKeyhole color={colors.muted} size={19} />
              <TextInput value={password} onChangeText={setPassword} placeholder="Mật khẩu" placeholderTextColor={colors.muted} secureTextEntry={!showPassword} style={styles.input} editable={!busy} onSubmitEditing={submit} />
              <Pressable onPress={() => setShowPassword(value => !value)} hitSlop={12}>{showPassword ? <EyeOff color={colors.muted} size={19} /> : <Eye color={colors.muted} size={19} />}</Pressable>
            </View>
            {error || storeError ? <View style={styles.error}><Text style={styles.errorText}>{error || storeError}</Text></View> : null}
            <Pressable onPress={submit} disabled={busy} style={({ pressed }) => [styles.submit, pressed && styles.submitPressed, busy && styles.submitBusy]}>
              <Text style={styles.submitText}>{busy ? 'Đang xác thực...' : 'Vào ViChat'}</Text><ArrowRight color="#fff" size={20} />
            </Pressable>
            <Pressable onPress={() => navigation.navigate('ForgotPassword')} style={styles.forgot}><Text style={styles.forgotText}>Quên mật khẩu?</Text></Pressable>
          </View>
          <Text style={styles.footer}>Chat nội bộ tenant-scoped · Không lưu mật khẩu trên thiết bị</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, padding: 24, paddingTop: 62, paddingBottom: 30 },
  hero: { marginBottom: 28 },
  logo: { width: 56, height: 56, borderRadius: 18, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-6deg' }], marginBottom: 24 },
  logoText: { color: '#fff', fontFamily: 'BeVietnamPro_800ExtraBold', fontSize: 29, transform: [{ rotate: '6deg' }] },
  kicker: { ...typography.caption, color: colors.accentDeep, letterSpacing: 1.2, marginBottom: 12 },
  heading: { ...typography.display, color: colors.ink, fontSize: 29, lineHeight: 36 },
  subheading: { ...typography.body, color: colors.inkSoft, marginTop: 13, maxWidth: 340 },
  card: { backgroundColor: 'rgba(255,255,255,0.94)', borderRadius: 27, padding: 21, ...shadow },
  cardTitle: { ...typography.heading, color: colors.ink },
  cardHint: { ...typography.caption, color: colors.inkSoft, marginTop: 5, marginBottom: 20 },
  field: { minHeight: 54, borderRadius: 17, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.canvas, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, gap: 10, marginBottom: 11 },
  input: { flex: 1, color: colors.ink, fontFamily: 'BeVietnamPro_400Regular', fontSize: 15, paddingVertical: 0 },
  error: { borderRadius: 13, padding: 11, backgroundColor: '#FDECEC', marginBottom: 12 },
  errorText: { ...typography.caption, color: colors.danger },
  submit: { minHeight: 54, borderRadius: 17, backgroundColor: colors.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 3 },
  submitPressed: { transform: [{ scale: 0.98 }] },
  submitBusy: { opacity: 0.6 },
  submitText: { ...typography.bodyMedium, color: '#fff' },
  forgot: { alignItems: 'center', paddingTop: 18, paddingBottom: 2 },
  forgotText: { ...typography.caption, color: colors.accentDeep },
  footer: { ...typography.caption, color: colors.inkSoft, textAlign: 'center', marginTop: 'auto', paddingTop: 26 },
});
