import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Eye, EyeOff, ArrowRight, LockKeyhole, Mail } from 'lucide-react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../navigation/types';
import { ThemeColors, shadow } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { useThemePalette } from '../../theme/useThemePalette';
import { useAppStore } from '../../store/appStore';
import { GonLogo } from '../../components/GonLogo';
import { config } from '../../constants/config';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const palette = useThemePalette();
  const styles = createStyles(palette);
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
    <LinearGradient colors={[palette.canvas, palette.accentWash, `${palette.accent}24`]} style={styles.flex}>
      <SafeAreaView style={styles.flex} edges={['top', 'bottom', 'left', 'right']}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.brand}>
              <View style={styles.logo}><GonLogo size={72} /></View>
              <Text style={styles.brandName}>{config.brandLabel}</Text>
            </View>
            <View style={styles.card}>
              <View style={styles.field}>
                <Mail color={palette.muted} size={19} />
                <TextInput value={identity} onChangeText={setIdentity} placeholder="Email công ty" placeholderTextColor={palette.muted} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" style={styles.input} editable={!busy} />
              </View>
              <View style={styles.field}>
                <LockKeyhole color={palette.muted} size={19} />
                <TextInput value={password} onChangeText={setPassword} placeholder="Mật khẩu" placeholderTextColor={palette.muted} secureTextEntry={!showPassword} style={styles.input} editable={!busy} onSubmitEditing={submit} />
                <Pressable onPress={() => setShowPassword(value => !value)} hitSlop={12}>{showPassword ? <EyeOff color={palette.muted} size={19} /> : <Eye color={palette.muted} size={19} />}</Pressable>
              </View>
              {error || storeError ? <View style={styles.error}><Text style={styles.errorText}>{error || storeError}</Text></View> : null}
              <Pressable onPress={submit} disabled={busy} style={({ pressed }) => [styles.submit, pressed && styles.submitPressed, busy && styles.submitBusy]}>
                <Text style={styles.submitText}>{busy ? 'Đang xác thực...' : 'Đăng nhập'}</Text><ArrowRight color="#fff" size={20} />
              </Pressable>
              <Pressable onPress={() => navigation.navigate('ForgotPassword')} style={styles.forgot}><Text style={styles.forgotText}>Quên mật khẩu?</Text></Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

function createStyles(palette: ThemeColors) {
  return StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 28 },
  brand: { alignItems: 'center', marginBottom: 30 },
  logo: { width: 108, height: 108, borderRadius: 32, backgroundColor: palette.paper, alignItems: 'center', justifyContent: 'center', ...shadow },
  brandName: { ...typography.heading, color: palette.ink, letterSpacing: 2, marginTop: 18 },
  card: { backgroundColor: `${palette.paper}F5`, borderRadius: 27, padding: 21, ...shadow },
  field: { minHeight: 54, borderRadius: 17, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.canvas, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, gap: 10, marginBottom: 11 },
  input: { flex: 1, color: palette.ink, fontFamily: 'BeVietnamPro_400Regular', fontSize: 15, paddingVertical: 0 },
  error: { borderRadius: 13, padding: 11, backgroundColor: `${palette.danger}18`, marginBottom: 12 },
  errorText: { ...typography.caption, color: palette.danger },
  submit: { minHeight: 54, borderRadius: 17, backgroundColor: palette.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 3 },
  submitPressed: { transform: [{ scale: 0.98 }] },
  submitBusy: { opacity: 0.6 },
  submitText: { ...typography.bodyMedium, color: '#fff' },
  forgot: { alignItems: 'center', paddingTop: 18, paddingBottom: 2 },
  forgotText: { ...typography.caption, color: palette.accentDeep },
  });
}
