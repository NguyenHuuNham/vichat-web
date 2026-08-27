export type AppStatus = 'booting' | 'signed_out' | 'loading' | 'ready' | 'error';
export type ConnectionState = 'offline' | 'connecting' | 'connected' | 'reconnecting' | 'error';

export interface Tenant {
  id: string;
  name: string;
  active?: boolean;
}

export interface User {
  id: string;
  uid: string;
  username: string;
  name: string;
  email?: string;
  avatar?: string;
  role?: string;
  department?: string;
  title?: string;
  active: boolean;
  tenantId: string;
  online?: boolean;
  type?: string;
}

export interface TinodeAuth {
  token: string;
  uid: string;
  username: string;
  expires?: string | number;
}

export interface LinkedDevice {
  id: string;
  kind: 'web' | 'mobile' | 'tablet' | 'desktop' | 'unknown';
  name: string;
  platform?: string;
  createdAt?: string;
  lastActiveAt?: string;
  current?: boolean;
}

export interface Session {
  user: User;
  tenant: Tenant | null;
  connection: string;
  tinodeAuth?: TinodeAuth | null;
  linkedDevices?: LinkedDevice[];
}

export interface FileAttachment {
  name: string;
  mime: string;
  size: number;
  url: string;
  ext?: string;
}

export type MessageType = 'text' | 'image' | 'file' | 'system' | 'reaction' | 'recall' | 'edit' | 'call';
export type DeliveryStatus = 'none' | 'sending' | 'sent' | 'received' | 'read' | 'failed';
export type RecallMode = 'self' | 'all';

export interface ChatMessage {
  id: string;
  seq?: number;
  type: MessageType;
  sender: 'incoming' | 'outgoing';
  senderId: string;
  senderName: string;
  avatar?: string;
  text: string;
  file?: FileAttachment;
  image?: string;
  createdAt?: string;
  time?: string;
  pending?: boolean;
  failed?: boolean;
  recalled?: boolean;
  edited?: boolean;
  editedAt?: string;
  mentions?: any[];
  editHistory?: Array<{
    eventId?: string;
    seq?: number;
    text: string;
    mentions?: any[];
    editedAt?: string;
  }>;
  deliveryStatus?: DeliveryStatus;
  reactions?: Record<string, number>;
  replyTo?: { id: string; text: string; senderName: string };
  sources?: Array<{
    title?: string;
    file_name?: string;
    snippet?: string;
    score?: number;
  }>;
  grounded?: boolean;
  call?: {
    audioOnly: boolean;
    state: string;
    duration: number;
    incoming: boolean;
  };
  raw?: any;
}

export interface ConversationMember extends User {
  mode?: string;
}

export interface Conversation {
  id: string;
  managementId: string;
  tinodeTopic: string;
  name: string;
  isGroup: boolean;
  adminId?: string;
  isChatbot?: boolean;
  avatarUrl?: string;
  description?: string;
  membersCount?: string;
  members?: ConversationMember[];
  participantIds?: string[];
  messages: ChatMessage[];
  lastMsg?: string;
  time?: string;
  updatedAt?: string;
  badge: number;
  notificationMutedUntil?: number | null;
}

export interface WorkspaceItem {
  id: string;
  type: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  visibility: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  dueAt?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  properties: Record<string, unknown>;
  participants: any[];
  activity?: any[];
  allowedActions: string[];
  canEdit: boolean;
}

export interface TinodeChatbotConfig {
  enabled: boolean;
  uid?: string;
  tinodeUid?: string;
  name?: string;
  title?: string;
  organization?: string;
  avatar?: string;
}

export interface PickerFile {
  uri: string;
  name: string;
  type: string;
  size?: number;
}
