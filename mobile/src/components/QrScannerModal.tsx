import { useCallback, useEffect, useRef, useState } from 'react';
import { CameraView, BarcodeScanningResult, useCameraPermissions } from 'expo-camera';
import { Camera, CheckCircle2, ExternalLink, QrCode, RotateCcw, Settings, X } from 'lucide-react-native';
import { Linking as NativeLinking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { ThemeColors, shadow } from '../theme/colors';
import { typography } from '../theme/typography';
import { useThemePalette } from '../theme/useThemePalette';
import { beginTrustedExternalActivity } from '../services/appLifecycleService';
import { normalizeQrUrl } from '../utils/qrCode';
import { useI18n } from '../store/languageStore';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function QrScannerModal({ visible, onClose }: Props) {
  const palette = useThemePalette();
  const styles = createStyles(palette);
  const { t } = useI18n();
  const [permission, requestPermission] = useCameraPermissions();
  const [scannedValue, setScannedValue] = useState('');
  const [scanError, setScanError] = useState('');
  const scanLockedRef = useRef(false);

  useEffect(() => {
    if (!visible) {
      scanLockedRef.current = false;
      setScannedValue('');
      setScanError('');
      return;
    }
    if (permission && !permission.granted && permission.canAskAgain) void requestPermission();
  }, [permission, requestPermission, visible]);

  const resetScan = useCallback(() => {
    scanLockedRef.current = false;
    setScannedValue('');
    setScanError('');
  }, []);

  const openSettings = useCallback(() => {
    beginTrustedExternalActivity();
    void NativeLinking.openSettings().catch(() => {});
  }, []);

  const handleBarcodeScanned = useCallback(async ({ data }: BarcodeScanningResult) => {
    if (scanLockedRef.current) return;
    const value = String(data || '').trim();
    if (!value) return;
    scanLockedRef.current = true;
    const url = normalizeQrUrl(value);
    if (!url) {
      setScannedValue(value);
      setScanError(t('Mã QR này không phải liên kết web http/https nên ViChat không tự mở trình duyệt.'));
      return;
    }

    beginTrustedExternalActivity();
    try {
      if (!(await NativeLinking.canOpenURL(url))) throw new Error('Thiết bị không hỗ trợ mở liên kết này.');
      onClose();
      await NativeLinking.openURL(url);
    } catch (error) {
      setScannedValue(value);
      setScanError(error instanceof Error ? t(error.message) : t('Không thể mở liên kết QR trên thiết bị này.'));
      scanLockedRef.current = false;
    }
  }, [onClose, t]);

  const permissionBody = !permission
    ? <View style={styles.messageBox}><Camera color={palette.accent} size={28} /><Text style={styles.messageTitle}>{t('Đang kiểm tra camera')}</Text><Text style={styles.messageText}>{t('Vui lòng chờ một chút rồi thử quét lại.')}</Text></View>
    : !permission.granted
      ? <View style={styles.messageBox}><Camera color={palette.accent} size={28} /><Text style={styles.messageTitle}>{t('Cần quyền camera')}</Text><Text style={styles.messageText}>{t('Cho phép ViChat dùng camera để quét mã QR nhanh.')}</Text><View style={styles.actions}><Pressable onPress={() => void requestPermission()} style={styles.primaryButton}><Text style={styles.primaryButtonText}>{t('Cho phép camera')}</Text></Pressable>{!permission.canAskAgain ? <Pressable onPress={openSettings} style={styles.secondaryButton}><Settings color={palette.inkSoft} size={16} /><Text style={styles.secondaryButtonText}>{t('Mở cài đặt')}</Text></Pressable> : null}</View></View>
      : null;

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.headingCopy}><View style={styles.headingIcon}><QrCode color={palette.accent} size={21} /></View><View><Text style={styles.eyebrow}>{t('TIỆN ÍCH QR')}</Text><Text style={styles.title}>{t('Quét mã QR')}</Text></View></View>
            <Pressable accessibilityLabel={t('Đóng quét mã QR')} onPress={onClose} style={styles.closeButton}><X color={palette.inkSoft} size={20} /></Pressable>
          </View>
          <Text style={styles.hint}>{t('Đưa mã QR vào khung. Nếu mã chứa liên kết http/https, trình duyệt sẽ mở tự động.')}</Text>
          {permissionBody}
          {permission?.granted && !scannedValue ? <View style={styles.cameraFrame}><CameraView style={StyleSheet.absoluteFill} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={handleBarcodeScanned} /><View pointerEvents="none" style={styles.scanGuide}><View style={styles.scanBox} /><Text style={styles.scanCaption}>{t('Căn mã QR vào giữa khung')}</Text></View></View> : null}
          {scannedValue ? <View style={styles.resultBox}><View style={styles.resultHeading}><CheckCircle2 color={scanError ? palette.warning : palette.online} size={20} /><Text style={styles.messageTitle}>{scanError ? t('Đã nhận mã QR') : t('Đã quét mã QR')}</Text></View><Text selectable numberOfLines={5} style={styles.resultValue}>{scannedValue}</Text><Text style={styles.messageText}>{scanError || t('Đây là dữ liệu QR, không phải liên kết web.')}</Text><View style={styles.actions}><Pressable onPress={resetScan} style={styles.primaryButton}><RotateCcw color="#fff" size={16} /><Text style={styles.primaryButtonText}>{t('Quét mã khác')}</Text></Pressable><Pressable onPress={onClose} style={styles.secondaryButton}><ExternalLink color={palette.inkSoft} size={16} /><Text style={styles.secondaryButtonText}>{t('Đóng')}</Text></Pressable></View></View> : null}
        </View>
      </View>
    </Modal>
  );
}

function createStyles(palette: ThemeColors) {
  return StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(5,12,16,0.66)' },
    card: { maxHeight: '92%', borderTopLeftRadius: 27, borderTopRightRadius: 27, backgroundColor: palette.canvas, padding: 20, paddingBottom: 30, ...shadow },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    headingCopy: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
    headingIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.accentWash },
    eyebrow: { ...typography.caption, color: palette.accentDeep, letterSpacing: 0.8 },
    title: { ...typography.title, color: palette.ink, marginTop: 2 },
    closeButton: { width: 40, height: 40, borderRadius: 13, backgroundColor: palette.paper, alignItems: 'center', justifyContent: 'center' },
    hint: { ...typography.body, color: palette.inkSoft, marginTop: 13, marginBottom: 15 },
    cameraFrame: { height: 330, overflow: 'hidden', borderRadius: 22, backgroundColor: '#05090B' },
    scanGuide: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
    scanBox: { width: 225, height: 225, borderWidth: 2, borderColor: '#FFFFFF', borderRadius: 18, backgroundColor: 'transparent' },
    scanCaption: { ...typography.caption, color: '#fff', marginTop: 18, backgroundColor: 'rgba(0,0,0,0.46)', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 },
    messageBox: { minHeight: 230, borderRadius: 20, backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.line, alignItems: 'center', justifyContent: 'center', padding: 24 },
    messageTitle: { ...typography.title, color: palette.ink, marginTop: 10, textAlign: 'center' },
    messageText: { ...typography.body, color: palette.inkSoft, textAlign: 'center', marginTop: 8 },
    resultBox: { borderRadius: 20, backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.line, padding: 17 },
    resultHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    resultValue: { ...typography.bodyMedium, color: palette.ink, marginTop: 14, lineHeight: 21 },
    actions: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 9, marginTop: 19 },
    primaryButton: { minHeight: 42, borderRadius: 12, paddingHorizontal: 14, backgroundColor: palette.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
    primaryButtonText: { ...typography.caption, color: '#fff', fontFamily: 'BeVietnamPro_700Bold' },
    secondaryButton: { minHeight: 42, borderRadius: 12, paddingHorizontal: 14, backgroundColor: palette.accentWash, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
    secondaryButtonText: { ...typography.caption, color: palette.inkSoft, fontFamily: 'BeVietnamPro_700Bold' },
  });
}
