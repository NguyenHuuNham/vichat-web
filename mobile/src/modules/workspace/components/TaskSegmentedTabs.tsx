import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Menu, SlidersHorizontal } from 'lucide-react-native';
import { useThemePalette } from '../../../theme/useThemePalette';
import { typography } from '../../../theme/typography';
import { useTaskStore } from '../store/taskStore';
import { TaskFilterScope } from '../types';

export function TaskSegmentedTabs() {
  const palette = useThemePalette();
  const activeScope = useTaskStore(state => state.activeScope);
  const setScope = useTaskStore(state => state.setScope);
  const openDrawer = useTaskStore(state => state.openDrawer);
  const isFilterBarVisible = useTaskStore(state => state.isFilterBarVisible);
  const toggleFilterBar = useTaskStore(state => state.toggleFilterBar);

  const isOwned = activeScope === 'OWNED';
  const isSubscribed = activeScope === 'SUBSCRIBED';

  return (
    <View style={[styles.container, { backgroundColor: palette.canvas }]}>
      {/* Drawer Toggle */}
      <Pressable
        onPress={openDrawer}
        hitSlop={10}
        style={[styles.iconButton, { backgroundColor: palette.paper }]}
      >
        <Menu color={palette.ink} size={20} strokeWidth={2.2} />
      </Pressable>

      {/* Segmented Pills */}
      <View style={[styles.segmentContainer, { backgroundColor: palette.paper }]}>
        <Pressable
          onPress={() => setScope('OWNED')}
          style={[
            styles.segmentPill,
            isOwned && [styles.segmentPillActive, { backgroundColor: palette.accent }],
          ]}
        >
          <Text
            style={[
              styles.segmentText,
              { color: isOwned ? '#ffffff' : palette.inkSoft },
              isOwned && styles.segmentTextActive,
            ]}
          >
            Đã sở hữu
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setScope('SUBSCRIBED')}
          style={[
            styles.segmentPill,
            isSubscribed && [styles.segmentPillActive, { backgroundColor: palette.accent }],
          ]}
        >
          <Text
            style={[
              styles.segmentText,
              { color: isSubscribed ? '#ffffff' : palette.inkSoft },
              isSubscribed && styles.segmentTextActive,
            ]}
          >
            Đã đăng ký
          </Text>
        </Pressable>
      </View>

      {/* Filter Toolbar Toggle */}
      <Pressable
        onPress={toggleFilterBar}
        hitSlop={10}
        style={[
          styles.iconButton,
          {
            backgroundColor: isFilterBarVisible
              ? palette.accentWash
              : palette.paper,
          },
        ]}
      >
        <SlidersHorizontal
          color={isFilterBarVisible ? palette.accent : palette.ink}
          size={19}
          strokeWidth={2.2}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 10,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentContainer: {
    flex: 1,
    flexDirection: 'row',
    borderRadius: 20,
    padding: 3,
  },
  segmentPill: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
  },
  segmentPillActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  segmentText: {
    ...typography.caption,
    fontSize: 13,
    fontWeight: '500',
  },
  segmentTextActive: {
    fontWeight: '700',
  },
});
