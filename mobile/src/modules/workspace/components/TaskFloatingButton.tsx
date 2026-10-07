import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Plus } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemePalette } from '../../../theme/useThemePalette';
import { useTaskStore } from '../store/taskStore';

export function TaskFloatingButton() {
  const palette = useThemePalette();
  const insets = useSafeAreaInsets();
  const openCreateModal = useTaskStore(state => state.openCreateModal);

  // Position above the bottom tab bar (72 + insets.bottom)
  const bottomPosition = 86 + Math.max(0, insets.bottom);

  return (
    <Pressable
      onPress={() => openCreateModal()}
      style={({ pressed }) => [
        styles.fab,
        {
          backgroundColor: palette.accent,
          bottom: bottomPosition,
        },
        pressed && styles.fabPressed,
      ]}
      accessibilityLabel="Tạo nhiệm vụ mới"
    >
      <Plus color="#ffffff" size={28} strokeWidth={2.4} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 20,
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 99,
  },
  fabPressed: {
    transform: [{ scale: 0.94 }],
    opacity: 0.9,
  },
});
