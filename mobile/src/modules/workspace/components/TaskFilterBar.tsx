import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ChevronDown } from 'lucide-react-native';
import { useThemePalette } from '../../../theme/useThemePalette';
import { typography } from '../../../theme/typography';
import { useTaskStore } from '../store/taskStore';
import { TaskGroupBy, TaskSortBy, TaskStatusFilter } from '../types';

export function TaskFilterBar() {
  const palette = useThemePalette();
  const isVisible = useTaskStore(state => state.isFilterBarVisible);
  const activeStatusFilter = useTaskStore(state => state.activeStatusFilter);
  const setStatusFilter = useTaskStore(state => state.setStatusFilter);
  const groupBy = useTaskStore(state => state.groupBy);
  const setGroupBy = useTaskStore(state => state.setGroupBy);
  const sortBy = useTaskStore(state => state.sortBy);
  const setSortBy = useTaskStore(state => state.setSortBy);

  if (!isVisible) return null;

  // Cycle status filter
  const handleStatusPress = () => {
    const cycle: Record<TaskStatusFilter, TaskStatusFilter> = {
      ONGOING: 'COMPLETED',
      COMPLETED: 'ALL',
      ALL: 'ONGOING',
    };
    setStatusFilter(cycle[activeStatusFilter]);
  };

  const getStatusLabel = () => {
    switch (activeStatusFilter) {
      case 'ONGOING': return 'Đang diễn ra';
      case 'COMPLETED': return 'Đã hoàn thành';
      case 'ALL': return 'Tất cả trạng thái';
    }
  };

  // Cycle group by
  const handleGroupPress = () => {
    const cycle: Record<TaskGroupBy, TaskGroupBy> = {
      GROUP: 'DUE_DATE',
      DUE_DATE: 'PRIORITY',
      PRIORITY: 'NONE',
      NONE: 'GROUP',
    };
    setGroupBy(cycle[groupBy]);
  };

  const getGroupLabel = () => {
    switch (groupBy) {
      case 'GROUP': return 'Phân nhóm: Tùy chỉnh';
      case 'DUE_DATE': return 'Phân nhóm: Hạn chót';
      case 'PRIORITY': return 'Phân nhóm: Ưu tiên';
      case 'NONE': return 'Phân nhóm: Không';
    }
  };

  // Cycle sort by
  const handleSortPress = () => {
    const cycle: Record<TaskSortBy, TaskSortBy> = {
      CUSTOM: 'DUE_DATE',
      DUE_DATE: 'PRIORITY',
      PRIORITY: 'CREATED_AT',
      CREATED_AT: 'CUSTOM',
    };
    setSortBy(cycle[sortBy]);
  };

  const getSortLabel = () => {
    switch (sortBy) {
      case 'CUSTOM': return 'Sắp xếp: Tùy chỉnh';
      case 'DUE_DATE': return 'Sắp xếp: Hạn chót';
      case 'PRIORITY': return 'Sắp xếp: Ưu tiên';
      case 'CREATED_AT': return 'Sắp xếp: Ngày tạo';
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: palette.canvas }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Status chip */}
        <Pressable
          onPress={handleStatusPress}
          style={[styles.chip, { backgroundColor: palette.paper, borderColor: palette.line }]}
        >
          <Text style={[styles.chipText, { color: palette.ink }]}>
            {getStatusLabel()}
          </Text>
          <ChevronDown color={palette.inkSoft} size={14} />
        </Pressable>

        {/* Group chip */}
        <Pressable
          onPress={handleGroupPress}
          style={[styles.chip, { backgroundColor: palette.paper, borderColor: palette.line }]}
        >
          <Text style={[styles.chipText, { color: palette.ink }]}>
            {getGroupLabel()}
          </Text>
          <ChevronDown color={palette.inkSoft} size={14} />
        </Pressable>

        {/* Sort chip */}
        <Pressable
          onPress={handleSortPress}
          style={[styles.chip, { backgroundColor: palette.paper, borderColor: palette.line }]}
        >
          <Text style={[styles.chipText, { color: palette.ink }]}>
            {getSortLabel()}
          </Text>
          <ChevronDown color={palette.inkSoft} size={14} />
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  scrollContent: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
  },
  chipText: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '500',
  },
});
