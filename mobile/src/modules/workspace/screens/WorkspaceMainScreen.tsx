import React, { useEffect, useMemo } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CheckCircle2, ListTodo } from 'lucide-react-native';
import { useThemePalette } from '../../../theme/useThemePalette';
import { typography } from '../../../theme/typography';
import { useAppStore } from '../../../store/appStore';
import { useTaskStore } from '../store/taskStore';
import { TaskGroup, TaskItem, TaskPriority } from '../types';
import { TaskHeader } from '../components/TaskHeader';
import { TaskSegmentedTabs } from '../components/TaskSegmentedTabs';
import { TaskFilterBar } from '../components/TaskFilterBar';
import { TaskDrawer } from '../components/TaskDrawer';
import { TaskGroupSection } from '../components/TaskGroupSection';
import { TaskFloatingButton } from '../components/TaskFloatingButton';
import { TaskCreateModal } from '../components/TaskCreateModal';

interface WorkspaceMainScreenProps {
  navigation?: any;
}

const PRIORITY_WEIGHT: Record<TaskPriority, number> = {
  URGENT: 4,
  HIGH: 3,
  NORMAL: 2,
  LOW: 1,
};

export function WorkspaceMainScreen({ navigation }: WorkspaceMainScreenProps) {
  const palette = useThemePalette();
  const session = useAppStore(state => state.session);
  const currentUserId = String(session?.user?.id || '');

  const tasks = useTaskStore(state => state.tasks);
  const loading = useTaskStore(state => state.loading);
  const refreshing = useTaskStore(state => state.refreshing);
  const activeScope = useTaskStore(state => state.activeScope);
  const activeStatusFilter = useTaskStore(state => state.activeStatusFilter);
  const groupBy = useTaskStore(state => state.groupBy);
  const sortBy = useTaskStore(state => state.sortBy);
  const collapsedGroups = useTaskStore(state => state.collapsedGroups);
  const fetchTasks = useTaskStore(state => state.fetchTasks);
  const refresh = useTaskStore(state => state.refresh);

  // Fetch tasks on mount
  useEffect(() => {
    void fetchTasks();
  }, [fetchTasks]);

  // Filter and group tasks
  const groupedTasks = useMemo<TaskGroup[]>(() => {
    // 1. Filter by scope
    let filtered = tasks.filter(task => {
      switch (activeScope) {
        case 'OWNED':
          return !task.ownerId || task.ownerId === currentUserId;
        case 'SUBSCRIBED':
          return task.assigneeId === currentUserId || task.ownerId !== currentUserId;
        case 'CREATED':
          return task.ownerId === currentUserId;
        case 'ASSIGNED':
          return task.assigneeId === currentUserId;
        case 'COMPLETED':
          return task.status === 'DONE';
        case 'ALL':
        case 'ACTIVITIES':
        default:
          return true;
      }
    });

    // 2. Filter by status filter
    if (activeScope !== 'COMPLETED') {
      if (activeStatusFilter === 'ONGOING') {
        filtered = filtered.filter(t => t.status !== 'DONE' && t.status !== 'CANCELLED');
      } else if (activeStatusFilter === 'COMPLETED') {
        filtered = filtered.filter(t => t.status === 'DONE');
      }
    }

    // 3. Sort tasks
    filtered = [...filtered].sort((a, b) => {
      if (sortBy === 'DUE_DATE') {
        if (!a.dueAt) return 1;
        if (!b.dueAt) return -1;
        return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
      }
      if (sortBy === 'PRIORITY') {
        return (PRIORITY_WEIGHT[b.priority] || 0) - (PRIORITY_WEIGHT[a.priority] || 0);
      }
      if (sortBy === 'CREATED_AT') {
        if (!a.createdAt) return 1;
        if (!b.createdAt) return -1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      return 0; // CUSTOM
    });

    // 4. Group tasks
    const groupsMap = new Map<string, TaskItem[]>();

    if (groupBy === 'GROUP') {
      filtered.forEach(task => {
        const groupName = task.groupName || 'Nhóm mặc định';
        const list = groupsMap.get(groupName) || [];
        list.push(task);
        groupsMap.set(groupName, list);
      });
      // Ensure 'Nhóm mặc định' is present even if empty
      if (!groupsMap.has('Nhóm mặc định')) {
        groupsMap.set('Nhóm mặc định', []);
      }
    } else if (groupBy === 'PRIORITY') {
      const priorityNames: Record<TaskPriority, string> = {
        URGENT: 'Khẩn cấp',
        HIGH: 'Ưu tiên cao',
        NORMAL: 'Bình thường',
        LOW: 'Ưu tiên thấp',
      };
      filtered.forEach(task => {
        const groupName = priorityNames[task.priority] || 'Bình thường';
        const list = groupsMap.get(groupName) || [];
        list.push(task);
        groupsMap.set(groupName, list);
      });
    } else if (groupBy === 'DUE_DATE') {
      const now = new Date();
      filtered.forEach(task => {
        let groupName = 'Không có hạn';
        if (task.dueAt) {
          const due = new Date(task.dueAt);
          if (due.getTime() < now.getTime() && task.status !== 'DONE') {
            groupName = 'Quá hạn';
          } else if (
            due.getFullYear() === now.getFullYear() &&
            due.getMonth() === now.getMonth() &&
            due.getDate() === now.getDate()
          ) {
            groupName = 'Hôm nay';
          } else {
            groupName = 'Sắp tới';
          }
        }
        const list = groupsMap.get(groupName) || [];
        list.push(task);
        groupsMap.set(groupName, list);
      });
    } else {
      // NONE
      groupsMap.set('Tất cả nhiệm vụ', filtered);
    }

    return Array.from(groupsMap.entries()).map(([name, groupTasks]) => ({
      id: name,
      name,
      tasks: groupTasks,
      collapsed: Boolean(collapsedGroups[name]),
    }));
  }, [tasks, activeScope, activeStatusFilter, groupBy, sortBy, collapsedGroups, currentUserId]);

  const handleTaskPress = (task: TaskItem) => {
    if (!navigation) return;
    const item = task.rawItem || {
      id: task.id,
      type: 'TASK',
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      visibility: 'COMPANY',
      dueAt: task.dueAt,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      properties: {
        source_conversation_name: task.groupName,
        checklist: task.subtasks.map(s => s.title),
      },
      participants: task.assigneeId
        ? [{ accountId: task.assigneeId, name: task.assigneeName, role: 'ASSIGNEE' }]
        : [],
      allowedActions: ['COMPLETE', 'START', 'REOPEN'],
    };
    navigation.navigate('WorkspaceDetail', { item });
  };

  const totalVisibleTasks = groupedTasks.reduce((sum, g) => sum + g.tasks.length, 0);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.canvas }]} edges={['top', 'left', 'right']}>
      {/* Top Header */}
      <TaskHeader onOpenSettings={useTaskStore.getState().toggleFilterBar} />

      {/* Segmented Tabs & Drawer / Filter toggles */}
      <TaskSegmentedTabs />

      {/* Collapsible Filter Toolbar */}
      <TaskFilterBar />

      {/* Main List */}
      <ScrollView
        contentContainerStyle={styles.scrollList}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={palette.accent}
            colors={[palette.accent]}
          />
        }
      >
        {loading && tasks.length === 0 ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={palette.accent} />
          </View>
        ) : totalVisibleTasks === 0 && groupedTasks.length === 1 && groupedTasks[0].tasks.length === 0 ? (
          // Empty State with default group quick-add intact
          <View>
            <TaskGroupSection
              group={groupedTasks[0]}
              onTaskPress={handleTaskPress}
            />
            <View style={styles.emptyCard}>
              <CheckCircle2 size={44} color={palette.muted} strokeWidth={1.5} />
              <Text style={[styles.emptyTitle, { color: palette.ink }]}>
                Không có nhiệm vụ nào
              </Text>
              <Text style={[styles.emptySub, { color: palette.inkSoft }]}>
                Nhập vào ô "+ Thêm nhiệm vụ" ở trên hoặc nhấn nút (+) bên dưới để tạo mới.
              </Text>
            </View>
          </View>
        ) : (
          groupedTasks.map(group => (
            <TaskGroupSection
              key={group.id}
              group={group}
              onTaskPress={handleTaskPress}
            />
          ))
        )}
      </ScrollView>

      {/* Floating Action Button (+) */}
      <TaskFloatingButton />

      {/* Navigation Drawer */}
      <TaskDrawer />

      {/* Detailed Task Creation BottomSheet */}
      <TaskCreateModal />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollList: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 160, // Ensure content is above bottom tab bar and FAB
  },
  loadingContainer: {
    paddingTop: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
    gap: 8,
  },
  emptyTitle: {
    ...typography.heading,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 8,
  },
  emptySub: {
    ...typography.body,
    fontSize: 13,
    textAlign: 'center',
  },
});
