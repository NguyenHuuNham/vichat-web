import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Check, CheckSquare } from 'lucide-react-native';
import { useThemePalette } from '../../../theme/useThemePalette';
import { typography } from '../../../theme/typography';
import { TaskItem } from '../types';
import { useTaskStore } from '../store/taskStore';
import { Avatar } from '../../../components/Avatar';

interface TaskItemCardProps {
  task: TaskItem;
  onPress?: () => void;
}

export function TaskItemCard({ task, onPress }: TaskItemCardProps) {
  const palette = useThemePalette();
  const toggleComplete = useTaskStore(state => state.toggleComplete);

  const isCompleted = task.status === 'DONE';

  // Format due date badge
  const getDueBadge = () => {
    if (!task.dueAt) return null;
    const due = new Date(task.dueAt);
    const now = new Date();
    const isToday =
      due.getFullYear() === now.getFullYear() &&
      due.getMonth() === now.getMonth() &&
      due.getDate() === now.getDate();

    const isOverdue = due.getTime() < now.getTime() && !isToday && !isCompleted;

    const dateStr = isToday
      ? 'Hôm nay'
      : `${due.getDate()}/${due.getMonth() + 1}`;

    return {
      text: dateStr,
      isOverdue,
      isToday,
    };
  };

  const dueBadge = getDueBadge();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: palette.paper, borderColor: palette.line },
        pressed && { opacity: 0.8 },
      ]}
    >
      {/* Circular Checkbox */}
      <Pressable
        hitSlop={12}
        onPress={() => toggleComplete(task.id)}
        style={[
          styles.checkbox,
          { borderColor: isCompleted ? palette.accent : palette.line },
          isCompleted && { backgroundColor: palette.accent },
        ]}
      >
        {isCompleted && <Check color="#ffffff" size={14} strokeWidth={3} />}
      </Pressable>

      {/* Task Content */}
      <View style={styles.content}>
        <Text
          numberOfLines={2}
          style={[
            styles.title,
            { color: isCompleted ? palette.muted : palette.ink },
            isCompleted && styles.titleCompleted,
          ]}
        >
          {task.title}
        </Text>

        {/* Metadata row: Due date badge, subtasks count */}
        <View style={styles.metaRow}>
          {dueBadge && (
            <View
              style={[
                styles.badge,
                {
                  backgroundColor: dueBadge.isOverdue
                    ? 'rgba(239, 68, 68, 0.16)'
                    : dueBadge.isToday
                    ? 'rgba(245, 158, 11, 0.16)'
                    : palette.canvas,
                },
              ]}
            >
              <Text
                style={[
                  styles.badgeText,
                  {
                    color: dueBadge.isOverdue
                      ? '#ef4444'
                      : dueBadge.isToday
                      ? '#f59e0b'
                      : palette.inkSoft,
                  },
                ]}
              >
                {dueBadge.text}
              </Text>
            </View>
          )}

          {task.subtasks.length > 0 && (
            <View style={styles.subtasksBadge}>
              <CheckSquare size={12} color={palette.inkSoft} />
              <Text style={[styles.badgeText, { color: palette.inkSoft }]}>
                {task.subtasks.filter(s => s.completed).length}/
                {task.subtasks.length}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Assignee Avatar */}
      {task.assigneeName ? (
        <Avatar name={task.assigneeName} size={24} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 6,
    gap: 12,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    gap: 4,
  },
  title: {
    ...typography.body,
    fontSize: 15,
    fontWeight: '500',
  },
  titleCompleted: {
    textDecorationLine: 'line-through',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: {
    ...typography.caption,
    fontSize: 11,
    fontWeight: '600',
  },
  subtasksBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
});
