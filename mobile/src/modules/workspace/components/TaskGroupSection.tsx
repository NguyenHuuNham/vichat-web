import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ChevronDown, ChevronRight, MoreHorizontal, Plus } from 'lucide-react-native';
import { useThemePalette } from '../../../theme/useThemePalette';
import { typography } from '../../../theme/typography';
import { TaskGroup, TaskItem } from '../types';
import { useTaskStore } from '../store/taskStore';
import { TaskItemCard } from './TaskItemCard';

interface TaskGroupSectionProps {
  group: TaskGroup;
  onTaskPress?: (task: TaskItem) => void;
}

export function TaskGroupSection({ group, onTaskPress }: TaskGroupSectionProps) {
  const palette = useThemePalette();
  const toggleGroupCollapse = useTaskStore(state => state.toggleGroupCollapse);
  const quickAddTask = useTaskStore(state => state.quickAddTask);

  const [isAdding, setIsAdding] = useState(false);
  const [quickTitle, setQuickTitle] = useState('');

  const handleQuickAdd = async () => {
    if (!quickTitle.trim()) {
      setIsAdding(false);
      return;
    }
    const title = quickTitle.trim();
    setQuickTitle('');
    setIsAdding(false);
    await quickAddTask(group.name, title);
  };

  return (
    <View style={[styles.container, { backgroundColor: palette.paper, borderColor: palette.line }]}>
      {/* Group Header */}
      <Pressable
        onPress={() => toggleGroupCollapse(group.name)}
        style={styles.header}
      >
        <View style={styles.headerLeft}>
          {group.collapsed ? (
            <ChevronRight size={18} color={palette.inkSoft} />
          ) : (
            <ChevronDown size={18} color={palette.inkSoft} />
          )}

          <Text style={[styles.groupTitle, { color: palette.ink }]}>
            {group.name}
          </Text>

          <Text style={[styles.groupCount, { color: palette.muted }]}>
            {group.tasks.length}
          </Text>
        </View>

        <Pressable
          hitSlop={10}
          onPress={e => {
            e.stopPropagation();
            // Optional: group options menu
          }}
          style={styles.moreButton}
        >
          <MoreHorizontal size={18} color={palette.inkSoft} />
        </Pressable>
      </Pressable>

      {/* Group Content (when not collapsed) */}
      {!group.collapsed && (
        <View style={styles.content}>
          {/* Task Items */}
          {group.tasks.map(task => (
            <TaskItemCard
              key={task.id}
              task={task}
              onPress={() => onTaskPress?.(task)}
            />
          ))}

          {/* Quick-add Row matching Lark */}
          {isAdding ? (
            <View style={[styles.quickInputRow, { borderColor: palette.accent, backgroundColor: palette.canvas }]}>
              <TextInput
                autoFocus
                value={quickTitle}
                onChangeText={setQuickTitle}
                placeholder="Nhập tên nhiệm vụ và nhấn Xong..."
                placeholderTextColor={palette.muted}
                returnKeyType="done"
                onSubmitEditing={handleQuickAdd}
                onBlur={handleQuickAdd}
                style={[styles.quickInput, { color: palette.ink }]}
              />
            </View>
          ) : (
            <Pressable
              onPress={() => setIsAdding(true)}
              style={({ pressed }) => [
                styles.quickAddButton,
                pressed && { opacity: 0.7 },
              ]}
            >
              <Plus size={16} color={palette.muted} />
              <Text style={[styles.quickAddPlaceholder, { color: palette.muted }]}>
                Thêm nhiệm vụ
              </Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  groupTitle: {
    ...typography.bodyMedium,
    fontSize: 15,
    fontWeight: '700',
  },
  groupCount: {
    ...typography.caption,
    fontSize: 13,
    fontWeight: '500',
  },
  moreButton: {
    padding: 4,
  },
  content: {
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  quickAddButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  quickAddPlaceholder: {
    ...typography.body,
    fontSize: 14,
  },
  quickInputRow: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginVertical: 4,
  },
  quickInput: {
    ...typography.body,
    fontSize: 14,
    height: 38,
    padding: 0,
  },
});
