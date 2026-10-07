import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Bold, Code, Heading, Italic, Quote, Strikethrough, X } from 'lucide-react-native';
import { useI18n } from '../store/languageStore';
import { useThemePalette } from '../theme/useThemePalette';
import { ThemeColors } from '../theme/colors';

import { formatMarkdown, TextFormatType } from '../utils/textFormat';

export { formatMarkdown, type TextFormatType };

interface Props {
  visible?: boolean;
  onApplyFormat: (type: TextFormatType) => void;
  onClose: () => void;
}

export function TextFormatBar({ visible = true, onApplyFormat, onClose }: Props) {
  const { t } = useI18n();
  const palette = useThemePalette();
  const styles = createStyles(palette);
  if (!visible) return null;

  const ITEMS: Array<{ type: TextFormatType; label: string; icon: any }> = [
    { type: 'bold', label: t('Đậm'), icon: Bold },
    { type: 'italic', label: t('Nghiêng'), icon: Italic },
    { type: 'strike', label: t('Gạch ngang'), icon: Strikethrough },
    { type: 'code', label: t('Mã code'), icon: Code },
    { type: 'quote', label: t('Trích dẫn'), icon: Quote },
    { type: 'heading', label: t('Tiêu đề'), icon: Heading },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.buttonGroup}>
        {ITEMS.map(item => {
          const IconComp = item.icon;
          return (
            <Pressable
              key={item.type}
              accessibilityLabel={item.label}
              onPress={() => onApplyFormat(item.type)}
              style={({ pressed }) => [styles.formatBtn, pressed && styles.btnPressed]}
            >
              <IconComp color={palette.ink} size={18} strokeWidth={2.4} />
            </Pressable>
          );
        })}
      </View>
      <Pressable
        accessibilityLabel={t('Đóng định dạng')}
        onPress={onClose}
        style={styles.closeBtn}
      >
        <X color={palette.inkSoft} size={18} />
      </Pressable>
    </View>
  );
}

function createStyles(palette: ThemeColors) {
  return StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: palette.paper,
      borderTopWidth: 1,
      borderTopColor: palette.line,
      borderBottomWidth: 1,
      borderBottomColor: palette.line,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    buttonGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    formatBtn: {
      padding: 8,
      borderRadius: 6,
      backgroundColor: palette.paper,
      borderWidth: 1,
      borderColor: palette.line,
      justifyContent: 'center',
      alignItems: 'center',
      minWidth: 36,
      height: 36,
    },
    btnPressed: {
      backgroundColor: 'rgba(243, 156, 18, 0.15)',
      borderColor: '#F39C12',
    },
    closeBtn: {
      padding: 6,
    },
  });
}
