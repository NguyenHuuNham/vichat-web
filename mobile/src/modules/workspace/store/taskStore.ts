import { create } from 'zustand';
import {
  CreateTaskPayload,
  TaskFilterScope,
  TaskGroupBy,
  TaskItem,
  TaskSortBy,
  TaskStatusFilter,
} from '../types';
import { taskService } from '../services/taskService';

interface TaskStore {
  tasks: TaskItem[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;

  activeScope: TaskFilterScope;
  activeStatusFilter: TaskStatusFilter;
  groupBy: TaskGroupBy;
  sortBy: TaskSortBy;
  searchQuery: string;

  collapsedGroups: Record<string, boolean>;
  isDrawerOpen: boolean;
  isFilterBarVisible: boolean;
  isCreateModalVisible: boolean;
  createTaskInitialGroup: string;

  fetchTasks: () => Promise<void>;
  refresh: () => Promise<void>;
  setScope: (scope: TaskFilterScope) => void;
  setStatusFilter: (status: TaskStatusFilter) => void;
  setGroupBy: (groupBy: TaskGroupBy) => void;
  setSortBy: (sortBy: TaskSortBy) => void;
  setSearchQuery: (query: string) => void;
  toggleGroupCollapse: (groupName: string) => void;

  toggleComplete: (taskId: string) => Promise<void>;
  quickAddTask: (groupName: string, title: string) => Promise<void>;
  createDetailedTask: (payload: CreateTaskPayload) => Promise<void>;

  openDrawer: () => void;
  closeDrawer: () => void;
  toggleFilterBar: () => void;
  openCreateModal: (groupName?: string) => void;
  closeCreateModal: () => void;
}

export const useTaskStore = create<TaskStore>((set, get) => ({
  tasks: [],
  loading: false,
  refreshing: false,
  error: null,

  activeScope: 'OWNED',
  activeStatusFilter: 'ONGOING',
  groupBy: 'GROUP',
  sortBy: 'CUSTOM',
  searchQuery: '',

  collapsedGroups: {},
  isDrawerOpen: false,
  isFilterBarVisible: false,
  isCreateModalVisible: false,
  createTaskInitialGroup: 'Nhóm mặc định',

  async fetchTasks() {
    set({ loading: true, error: null });
    try {
      const tasks = await taskService.listTasks();
      set({ tasks, loading: false });
    } catch (err: any) {
      set({ error: err?.message || 'Không thể tải danh sách nhiệm vụ', loading: false });
    }
  },

  async refresh() {
    set({ refreshing: true });
    try {
      const tasks = await taskService.listTasks();
      set({ tasks, refreshing: false });
    } catch {
      set({ refreshing: false });
    }
  },

  setScope(activeScope) {
    set({ activeScope, isDrawerOpen: false });
  },

  setStatusFilter(activeStatusFilter) {
    set({ activeStatusFilter });
  },

  setGroupBy(groupBy) {
    set({ groupBy });
  },

  setSortBy(sortBy) {
    set({ sortBy });
  },

  setSearchQuery(searchQuery) {
    set({ searchQuery });
  },

  toggleGroupCollapse(groupName) {
    const current = get().collapsedGroups;
    set({
      collapsedGroups: {
        ...current,
        [groupName]: !current[groupName],
      },
    });
  },

  async toggleComplete(taskId: string) {
    const target = get().tasks.find(t => t.id === taskId);
    if (!target) return;

    const previousStatus = target.status;
    const nextStatus = target.status === 'DONE' ? 'TODO' : 'DONE';

    // Optimistic update
    set({
      tasks: get().tasks.map(t =>
        t.id === taskId ? { ...t, status: nextStatus } : t
      ),
    });

    try {
      const updated = await taskService.toggleComplete(target);
      set({
        tasks: get().tasks.map(t => (t.id === taskId ? updated : t)),
      });
    } catch {
      // Revert on failure
      set({
        tasks: get().tasks.map(t =>
          t.id === taskId ? { ...t, status: previousStatus } : t
        ),
      });
    }
  },

  async quickAddTask(groupName: string, title: string) {
    if (!title.trim()) return;

    const optimisticId = `opt_${Date.now()}`;
    const optimisticTask: TaskItem = {
      id: optimisticId,
      title: title.trim(),
      description: '',
      status: 'TODO',
      priority: 'NORMAL',
      dueAt: null,
      startsAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ownerId: '',
      ownerName: '',
      assigneeId: null,
      assigneeName: null,
      groupName: groupName.trim() || 'Nhóm mặc định',
      subtasks: [],
      version: 1,
    };

    set({ tasks: [optimisticTask, ...get().tasks] });

    try {
      const created = await taskService.createTask({
        title: title.trim(),
        groupName: groupName.trim() || 'Nhóm mặc định',
      });
      set({
        tasks: get().tasks.map(t => (t.id === optimisticId ? created : t)),
      });
    } catch (err: any) {
      set({
        tasks: get().tasks.filter(t => t.id !== optimisticId),
        error: err?.message || 'Không thể tạo nhiệm vụ',
      });
    }
  },

  async createDetailedTask(payload: CreateTaskPayload) {
    set({ loading: true });
    try {
      const created = await taskService.createTask(payload);
      set({
        tasks: [created, ...get().tasks],
        loading: false,
        isCreateModalVisible: false,
      });
    } catch (err: any) {
      set({
        loading: false,
        error: err?.message || 'Không thể tạo nhiệm vụ',
      });
      throw err;
    }
  },

  openDrawer() {
    set({ isDrawerOpen: true });
  },

  closeDrawer() {
    set({ isDrawerOpen: false });
  },

  toggleFilterBar() {
    set({ isFilterBarVisible: !get().isFilterBarVisible });
  },

  openCreateModal(groupName?: string) {
    set({
      isCreateModalVisible: true,
      createTaskInitialGroup: groupName || 'Nhóm mặc định',
    });
  },

  closeCreateModal() {
    set({ isCreateModalVisible: false });
  },
}));
