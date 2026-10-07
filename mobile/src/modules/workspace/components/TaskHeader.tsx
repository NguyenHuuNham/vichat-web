import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Settings2 } from 'lucide-react-native';
import { useAppStore } from '../../../store/appStore';
import { useThemePalette } from '../../../theme/useThemePalette';
import { typography } from '../../../theme/typography';
import { Avatar } from '../../../components/Avatar';
import { useTaskStore } from '../store/taskStore';

interface TaskHeaderProps {
  onOpenSettings?: () => void;
}

export function TaskHeader({ onOpenSettings }: TaskHeaderProps) {
  const palette = useThemePalette();
  const session = useAppStore(state => state.session);
  const openDrawer = useTaskStore(state => state.openDrawer);

  const currentUser = session?.user;

  return (
    <View style={[styles.header, { backgroundColor: palette.canvas }]}>
      <Pressable onPress={openDrawer} style={styles.avatarButton}>
        <Avatar
          uri={currentUser?.avatar}
          name={currentUser?.name || 'User'}
          size={38}
        />
      </Pressable>

      <Text style={[styles.title, { color: palette.ink }]}>
        Nhiệm vụ
      </Text>

      <Pressable
        onPress={onOpenSettings}
        hitSlop={12}
        style={styles.settingsButton}
      >
        <Settings2 color={palette.inkSoft} size={22} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 10,
  },
  avatarButton: {
    padding: 2,
  },
  title: {
    ...typography.heading,
    fontSize: 20,
    fontWeight: '700',
  },
  settingsButton: {
    padding: 6,
    borderRadius: 20,
  },
});
