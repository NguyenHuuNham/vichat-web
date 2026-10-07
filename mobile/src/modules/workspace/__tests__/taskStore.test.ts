import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTaskStore } from '../store/taskStore';
import { taskService } from '../services/taskService';

vi.mock('../services/taskService', () => ({
  taskService: {
    listTasks: vi.fn(),
    createTask: vi.fn(),
    toggleComplete: vi.fn(),
    updateTask: vi.fn(),
    deleteTask: vi.fn(),
    getStats: vi.fn(),
  },
}));

describe('useTaskStore', () => {
  beforeEach(() => {
    useTaskStore.setState({
      tasks: [],
      loading: false,
      refreshing: false,
      error: null,
      activeScope: 'OWNED',
      activeStatusFilter: 'ONGOING',
      groupBy: 'GROUP',
      sortBy: 'CUSTOM',
      collapsedGroups: {},
      isDrawerOpen: false,
      isFilterBarVisible: false,
      isCreateModalVisible: false,
      createTaskInitialGroup: 'Nhóm mặc định',
    });
    vi.clearAllMocks();
  });

  it('manages filter scope, status filter, and group collapse state correctly', () => {
    const store = useTaskStore.getState();

    store.setScope('SUBSCRIBED');
    expect(useTaskStore.getState().activeScope).toBe('SUBSCRIBED');
    expect(useTaskStore.getState().isDrawerOpen).toBe(false);

    store.setStatusFilter('COMPLETED');
    expect(useTaskStore.getState().activeStatusFilter).toBe('COMPLETED');

    store.toggleGroupCollapse('Nhóm mặc định');
    expect(useTaskStore.getState().collapsedGroups['Nhóm mặc định']).toBe(true);

    store.toggleGroupCollapse('Nhóm mặc định');
    expect(useTaskStore.getState().collapsedGroups['Nhóm mặc định']).toBe(false);
  });

  it('performs optimistic update on toggleComplete', async () => {
    const initialTask = {
      id: 'task-1',
      title: 'Kiểm tra toggle',
      description: '',
      status: 'TODO' as const,
      priority: 'NORMAL' as const,
      dueAt: null,
      startsAt: null,
      createdAt: null,
      updatedAt: null,
      ownerId: '',
      ownerName: '',
      assigneeId: null,
      assigneeName: null,
      groupName: 'Nhóm mặc định',
      subtasks: [],
      version: 1,
    };

    useTaskStore.setState({ tasks: [initialTask] });

    vi.mocked(taskService.toggleComplete).mockResolvedValueOnce({
      ...initialTask,
      status: 'DONE',
    });

    const promise = useTaskStore.getState().toggleComplete('task-1');

    // Immediately status should be optimistic DONE
    expect(useTaskStore.getState().tasks[0].status).toBe('DONE');

    await promise;

    expect(taskService.toggleComplete).toHaveBeenCalledTimes(1);
    expect(useTaskStore.getState().tasks[0].status).toBe('DONE');
  });

  it('reverts optimistic update if toggleComplete fails', async () => {
    const initialTask = {
      id: 'task-2',
      title: 'Tác vụ lỗi',
      description: '',
      status: 'TODO' as const,
      priority: 'NORMAL' as const,
      dueAt: null,
      startsAt: null,
      createdAt: null,
      updatedAt: null,
      ownerId: '',
      ownerName: '',
      assigneeId: null,
      assigneeName: null,
      groupName: 'Nhóm mặc định',
      subtasks: [],
      version: 1,
    };

    useTaskStore.setState({ tasks: [initialTask] });

    vi.mocked(taskService.toggleComplete).mockRejectedValueOnce(new Error('Network error'));

    await useTaskStore.getState().toggleComplete('task-2');

    // Reverted back to TODO
    expect(useTaskStore.getState().tasks[0].status).toBe('TODO');
  });

  it('controls drawer, filter bar, and create modal states', () => {
    const store = useTaskStore.getState();

    store.openDrawer();
    expect(useTaskStore.getState().isDrawerOpen).toBe(true);

    store.closeDrawer();
    expect(useTaskStore.getState().isDrawerOpen).toBe(false);

    store.toggleFilterBar();
    expect(useTaskStore.getState().isFilterBarVisible).toBe(true);

    store.openCreateModal('Dự án X');
    expect(useTaskStore.getState().isCreateModalVisible).toBe(true);
    expect(useTaskStore.getState().createTaskInitialGroup).toBe('Dự án X');

    store.closeCreateModal();
    expect(useTaskStore.getState().isCreateModalVisible).toBe(false);
  });
});
