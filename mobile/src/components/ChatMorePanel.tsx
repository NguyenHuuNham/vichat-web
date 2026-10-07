import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AlarmClock, BarChart3, Camera, Contact, Film, MapPin, Paperclip, Spline, Type, Zap } from 'lucide-react-native';
import { useI18n } from '../store/languageStore';
import { useThemePalette } from '../theme/useThemePalette';
import { ThemeColors } from '../theme/colors';

export interface MoreActionItem {
  id: string;
  title: string;
  icon: any;
  bgColor: string;
  iconColor: string;
  onPress: () => void;
  groupOnly?: boolean;
}

interface Props {
  isGroup?: boolean;
  onSelectCamera?: () => void;
  onSelectLocation: () => void;
  onSelectDocument: () => void;
  onSelectReminder: () => void;
  onSelectQuickMessages: () => void;
  onSelectContact: () => void;
  onSelectGif: () => void;
  onSelectDoodle: () => void;
  onSelectTextStyle: () => void;
  onSelectPoll?: () => void;
  onClose?: () => void;
}

export function ChatMorePanel(props: Props) {
  const { t } = useI18n();
  const palette = useThemePalette();
  const styles = createStyles(palette);

  const actions: MoreActionItem[] = [
    {
      id: 'location',
      title: t('Vị trí'),
      icon: MapPin,
      bgColor: '#F25C54',
      iconColor: '#FFFFFF',
      onPress: () => {
        props.onSelectLocation();
      },
    },
    {
      id: 'camera',
      title: t('Máy ảnh'),
      icon: Camera,
      bgColor: '#2ED573',
      iconColor: '#FFFFFF',
      onPress: () => {
        props.onSelectCamera?.();
      },
    },
    {
      id: 'document',
      title: t('Tài liệu'),
      icon: Paperclip,
      bgColor: '#4A6CF7',
      iconColor: '#FFFFFF',
      onPress: () => {
        props.onSelectDocument();
      },
    },
    {
      id: 'reminder',
      title: t('Nhắc hẹn'),
      icon: AlarmClock,
      bgColor: '#E84393',
      iconColor: '#FFFFFF',
      onPress: () => {
        props.onSelectReminder();
      },
    },
    {
      id: 'quick_message',
      title: t('Tin nhắn nhanh'),
      icon: Zap,
      bgColor: '#0984E3',
      iconColor: '#FFFFFF',
      onPress: () => {
        props.onSelectQuickMessages();
      },
    },
    {
      id: 'contact',
      title: t('Danh thiếp'),
      icon: Contact,
      bgColor: '#00CEC9',
      iconColor: '#FFFFFF',
      onPress: () => {
        props.onSelectContact();
      },
    },
    {
      id: 'gif',
      title: t('@GIF'),
      icon: Film,
      bgColor: '#0068FF',
      iconColor: '#FFFFFF',
      onPress: () => {
        props.onSelectGif();
      },
    },
    {
      id: 'doodle',
      title: t('Vẽ hình'),
      icon: Spline,
      bgColor: '#E056FD',
      iconColor: '#FFFFFF',
      onPress: () => {
        props.onSelectDoodle();
      },
    },
    {
      id: 'text_style',
      title: t('Kiểu chữ'),
      icon: Type,
      bgColor: '#F39C12',
      iconColor: '#FFFFFF',
      onPress: () => {
        props.onSelectTextStyle();
      },
    },
  ];

  if (props.isGroup && props.onSelectPoll) {
    actions.push({
      id: 'poll',
      title: t('Bình chọn'),
      icon: BarChart3,
      bgColor: '#6C5CE7',
      iconColor: '#FFFFFF',
      onPress: () => {
        props.onSelectPoll?.();
      },
      groupOnly: true,
    });
  }

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.grid}
        bounces={false}
      >
        {actions.map(item => {
          const IconComponent = item.icon;
          return (
            <View key={item.id} style={styles.gridColumn}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={item.title}
                onPress={item.onPress}
                style={({ pressed }) => [
                  styles.itemButton,
                  pressed && styles.itemPressed,
                ]}
              >
                <View style={[styles.iconCircle, { backgroundColor: item.bgColor }]}>
                  {item.id === 'gif' ? (
                    <Text style={styles.gifBadgeText}>GIF</Text>
                  ) : item.id === 'text_style' ? (
                    <Text style={styles.typeBadgeText}>Aa</Text>
                  ) : (
                    <IconComponent color={item.iconColor} size={25} strokeWidth={2.2} />
                  )}
                </View>
                <Text numberOfLines={1} style={styles.itemTitle}>
                  {item.title}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

function createStyles(palette: ThemeColors) {
  return StyleSheet.create({
    container: {
      backgroundColor: palette.paper,
      borderTopWidth: 1,
      borderTopColor: palette.line,
      paddingTop: 12,
      paddingBottom: 14,
      paddingHorizontal: 8,
      maxHeight: 220,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'flex-start',
    },
    gridColumn: {
      width: '25%',
      alignItems: 'center',
      marginBottom: 16,
    },
    itemButton: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 4,
      paddingHorizontal: 2,
      width: '100%',
    },
    itemPressed: {
      opacity: 0.72,
      transform: [{ scale: 0.94 }],
    },
    iconCircle: {
      width: 54,
      height: 54,
      borderRadius: 27,
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 3,
      elevation: 3,
    },
    gifBadgeText: {
      color: '#FFFFFF',
      fontWeight: '900',
      fontSize: 16,
      letterSpacing: 0.5,
    },
    typeBadgeText: {
      color: '#FFFFFF',
      fontWeight: '800',
      fontSize: 19,
    },
    itemTitle: {
      marginTop: 8,
      fontSize: 12,
      fontWeight: '500',
      color: palette.ink,
      textAlign: 'center',
    },
  });
}
