import { memo, useEffect, useMemo, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { BellOff, Check, Clock, Moon, X } from 'lucide-react-native';
import { colorsForTheme, shadow, ThemeColors } from '../theme/colors';
import { typography } from '../theme/typography';
import { useThemeStore } from '../store/themeStore';
import { useI18n } from '../store/languageStore';
import {
  NOTIFICATION_MUTE_OPTIONS,
  NotificationMuteOption,
} from '../utils/conversationNotifications';

interface Props {
  visible: boolean;
  conversationName?: string;
  onClose: () => void;
  onConfirm: (option: NotificationMuteOption) => void | Promise<void>;
}

export const NotificationMuteModal = memo(function NotificationMuteModal({
  visible,
  conversationName,
  onClose,
  onConfirm,
}: Props) {
  const palette = colorsForTheme(useThemeStore(state => state.resolved));
  const styles = useMemo(() => createStyles(palette), [palette]);
  const { t } = useI18n();

  const [selectedOption, setSelectedOption] = useState<NotificationMuteOption>(
    NOTIFICATION_MUTE_OPTIONS.ONE_HOUR,
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setSelectedOption(NOTIFICATION_MUTE_OPTIONS.ONE_HOUR);
    }
  }, [visible]);

  const options = useMemo(() => [
    {
      key: NOTIFICATION_MUTE_OPTIONS.ONE_HOUR,
      label: t('Trong 1 giờ'),
      desc: t('Tự động bật lại sau 60 phút'),
      icon: Clock,
    },
    {
      key: NOTIFICATION_MUTE_OPTIONS.FOUR_HOURS,
      label: t('Trong 4 giờ'),
      desc: t('Tự động bật lại sau 4 tiếng'),
      icon: Clock,
    },
    {
      key: NOTIFICATION_MUTE_OPTIONS.UNTIL_EIGHT,
      label: t('Cho đến 8:00 sáng'),
      desc: t('Tự động bật lại vào 8 giờ sáng hôm sau'),
      icon: Moon,
    },
    {
      key: NOTIFICATION_MUTE_OPTIONS.UNTIL_MANUAL,
      label: t('Cho đến khi được mở lại'),
      desc: t('Tắt thông báo liên tục cho tới khi bạn bật lại'),
      icon: BellOff,
    },
  ], [t]);

  const handleConfirm = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm(selectedOption);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.dialog}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.eyebrow}>{t('THÔNG BÁO HỘI THOẠI')}</Text>
              <Text style={styles.title}>{t('Tắt thông báo')}</Text>
              {conversationName ? (
                <Text numberOfLines={1} style={styles.subtitle}>
                  {conversationName}
                </Text>
              ) : null}
            </View>
            <Pressable
              onPress={onClose}
              style={styles.closeBtn}
              accessibilityLabel={t('Đóng')}
              disabled={busy}
            >
              <X color={palette.inkSoft} size={20} />
            </Pressable>
          </View>

          <View style={styles.optionsList}>
            {options.map(item => {
              const Icon = item.icon;
              const isSelected = selectedOption === item.key;
              return (
                <Pressable
                  key={item.key}
                  onPress={() => setSelectedOption(item.key)}
                  style={[styles.optionRow, isSelected && styles.optionRowActive]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                >
                  <View style={[styles.optionIconBox, isSelected && styles.optionIconBoxActive]}>
                    <Icon color={isSelected ? palette.accent : palette.inkSoft} size={19} />
                  </View>
                  <View style={styles.optionInfo}>
                    <Text style={[styles.optionLabel, isSelected && styles.optionLabelActive]}>
                      {item.label}
                    </Text>
                    <Text style={styles.optionDesc}>{item.desc}</Text>
                  </View>
                  <View style={[styles.radioCircle, isSelected && styles.radioCircleActive]}>
                    {isSelected ? <Check color="#fff" size={13} strokeWidth={3} /> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.footer}>
            <Pressable
              onPress={onClose}
              style={styles.cancelBtn}
              disabled={busy}
              accessibilityLabel={t('Hủy')}
            >
              <Text style={styles.cancelText}>{t('Hủy')}</Text>
            </Pressable>
            <Pressable
              onPress={handleConfirm}
              style={[styles.confirmBtn, busy && styles.confirmBtnDisabled]}
              disabled={busy}
              accessibilityLabel={t('Đồng ý')}
            >
              <Text style={styles.confirmText}>{busy ? t('Đang lưu...') : t('Đồng ý')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
});

function createStyles(palette: ThemeColors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.55)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    backdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    },
    dialog: {
      width: '100%',
      maxWidth: 400,
      backgroundColor: palette.paper,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: palette.line,
      padding: 20,
      ...shadow,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 16,
    },
    headerText: {
      flex: 1,
      marginRight: 12,
    },
    eyebrow: {
      fontFamily: 'BeVietnamPro_600SemiBold',
      fontSize: 10,
      color: palette.accent,
      letterSpacing: 1.1,
      marginBottom: 3,
      textTransform: 'uppercase',
    },
    title: {
      ...typography.heading,
      fontSize: 19,
      color: palette.ink,
    },
    subtitle: {
      ...typography.caption,
      color: palette.inkSoft,
      marginTop: 2,
    },
    closeBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.canvas,
    },
    optionsList: {
      gap: 10,
      marginBottom: 20,
    },
    optionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 16,
      backgroundColor: palette.canvas,
      borderWidth: 1.5,
      borderColor: 'transparent',
    },
    optionRowActive: {
      backgroundColor: `${palette.accent}0E`,
      borderColor: palette.accent,
    },
    optionIconBox: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: palette.paper,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    optionIconBoxActive: {
      backgroundColor: `${palette.accent}20`,
    },
    optionInfo: {
      flex: 1,
      marginRight: 10,
    },
    optionLabel: {
      fontFamily: 'BeVietnamPro_600SemiBold',
      fontSize: 14,
      color: palette.ink,
    },
    optionLabelActive: {
      color: palette.accent,
    },
    optionDesc: {
      ...typography.caption,
      fontSize: 11,
      color: palette.muted,
      marginTop: 1,
    },
    radioCircle: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 2,
      borderColor: palette.line,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: palette.paper,
    },
    radioCircleActive: {
      backgroundColor: palette.accent,
      borderColor: palette.accent,
    },
    footer: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      gap: 12,
    },
    cancelBtn: {
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 14,
      backgroundColor: palette.canvas,
    },
    cancelText: {
      fontFamily: 'BeVietnamPro_600SemiBold',
      fontSize: 14,
      color: palette.inkSoft,
    },
    confirmBtn: {
      paddingVertical: 10,
      paddingHorizontal: 20,
      borderRadius: 14,
      backgroundColor: palette.accent,
    },
    confirmBtnDisabled: {
      opacity: 0.6,
    },
    confirmText: {
      fontFamily: 'BeVietnamPro_700Bold',
      fontSize: 14,
      color: '#FFFFFF',
    },
  });
}
