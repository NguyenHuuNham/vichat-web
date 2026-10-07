export type TaskPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';

export interface TaskSubtask {
  id: string;
  title: string;
  completed: boolean;
}

export interface TaskItem {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt: string | null;
  startsAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  ownerId: string;
  ownerName: string;
  assigneeId: string | null;
  assigneeName: string | null;
  groupName: string;
  subtasks: TaskSubtask[];
  version: number;
  rawItem?: any;
}

export interface TaskGroup {
  id: string;
  name: string;
  tasks: TaskItem[];
  collapsed: boolean;
}

export type TaskFilterScope =
  | 'OWNED'         // Đã sở hữu
  | 'SUBSCRIBED'    // Đã đăng ký
  | 'ACTIVITIES'    // Hoạt động
  | 'ALL'           // Tất cả tác vụ
  | 'CREATED'       // Đã tạo
  | 'ASSIGNED'      // Đã chỉ định
  | 'COMPLETED';    // Đã hoàn thành

export type TaskStatusFilter =
  | 'ONGOING'       // Đang diễn ra
  | 'COMPLETED'     // Đã hoàn thành
  | 'ALL';          // Tất cả

export type TaskGroupBy =
  | 'GROUP'         // Theo nhóm tác vụ
  | 'DUE_DATE'      // Theo hạn chót
  | 'PRIORITY'      // Theo mức ưu tiên
  | 'NONE';         // Không phân nhóm

export type TaskSortBy =
  | 'CUSTOM'        // Tùy chỉnh
  | 'DUE_DATE'      // Hạn chót
  | 'PRIORITY'      // Mức ưu tiên
  | 'CREATED_AT';   // Ngày tạo

export interface CreateTaskPayload {
  title: string;
  description?: string;
  dueAt?: string | null;
  priority?: TaskPriority;
  groupName?: string;
  assigneeId?: string | null;
  assigneeName?: string | null;
  subtasks?: string[];
}
