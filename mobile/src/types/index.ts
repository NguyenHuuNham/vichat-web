export type AppStatus = 'booting' | 'signed_out' | 'loading' | 'ready' | 'error';
export type ConnectionState = 'offline' | 'connecting' | 'connected' | 'reconnecting' | 'error';

export interface Tenant {
  id: string;
  name: string;
  active?: boolean;
}

export interface TenantOption extends Tenant {
  role?: string;
  accountRole?: string;
  logo?: string;
  logoVersion?: string;
}

export interface User {
  id: string;
  uid: string;
  tinodeUid?: string;
  username: string;
  name: string;
  defaultName?: string;
  default_name?: string;
  fullName?: string;
  full_name?: string;
  displayName?: string;
  display_name?: string;
  nickname?: string;
  conversationNickname?: string;
  conversation_nickname?: string;
  email?: string;
  avatar?: string;
  role?: string;
  department?: string;
  title?: string;
  active: boolean;
  tenantId: string;
  online?: boolean;
  type?: string;
  isChatbot?: boolean;
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
  tenantOptions?: TenantOption[];
  connection: string;
  tinodeAuth?: TinodeAuth | null;
  linkedDevices?: LinkedDevice[];
  /** Monotonic in-memory namespace used to reject stale async updates. */
  generation: number;
  hydratedAt: number;
}

export interface FileAttachment {
  name: string;
  mime: string;
  size: number;
  url: string;
  ext?: string;
}

export interface Sticker {
  id: string;
  stickerId?: string;
  packId: string;
  label?: string;
  src: string;
  mime?: string;
  version?: string;
  fileName?: string;
}

export interface GroupSettings {
  allowMembersEditInfo: boolean;
  allowPinMessages: boolean;
  allowMessages: boolean;
  allowPolls: boolean;
  approveMembers: boolean;
  newMemberHistory: boolean;
}

export interface PollSettings {
  expiresAt: string;
  allowMultiple: boolean;
  allowAddOptions: boolean;
  hideResultsUntilVote: boolean;
  hideVoters: boolean;
  pinPoll: boolean;
}

export interface PollOption {
  id: string;
  text: string;
}

export interface PollVote {
  optionIds: string[];
  name?: string;
  avatar?: string;
  createdAt?: string;
}

export interface Poll {
  id: string;
  question: string;
  options: PollOption[];
  settings: PollSettings;
  creatorId: string;
  creatorName?: string;
  creatorAvatar?: string;
  locked: boolean;
  votes: Record<string, PollVote>;
  lastActivitySeq?: number;
  lastActivityAt?: string;
}

export interface PollEvent {
  action: 'poll_vote' | 'poll_option_added' | 'poll_locked';
  pollId: string;
  actorId?: string;
  pollQuestion?: string;
  optionIds?: string[];
  optionId?: string;
  optionText?: string;
  actorName?: string;
  actorAvatar?: string;
  createdAt?: string;
}

export type MessageType = 'text' | 'image' | 'file' | 'sticker' | 'system' | 'reaction' | 'recall' | 'edit' | 'call' | 'poll_event';
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
  sticker?: {
    id: string;
    stickerId?: string;
    packId: string;
    label?: string;
    version?: string;
  };
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
  pinned?: boolean;
  systemEvent?: Record<string, any>;
  poll?: Poll;
  pollEvent?: PollEvent;
  pollActivity?: PollEvent;
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
  role?: string;
  groupRole?: 'OWNER' | 'ADMIN' | 'MEMBER' | string;
}

export interface Conversation {
  id: string;
  managementId: string;
  tinodeTopic: string;
  /** Identifies whether the snapshot came from Chatmgt or the realtime topic. */
  snapshotSource?: 'management' | 'tinode';
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
  /** Viewer-scoped direct-chat deletion marker returned by Chatmgt. */
  deletedAt?: string;
  /** True after Tinode has checked the latest history page for this topic. */
  historyVerified?: boolean;
  badge: number;
  /** Tinode read cursor for positioning the first unread message. */
  readSeq?: number;
  notificationMutedUntil?: number | null;
  pinned?: boolean;
  groupSettings?: GroupSettings;
  pendingMembers?: ConversationMember[];
  conversationNicknames?: Record<string, string>;
  conversationBackground?: unknown;
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

export interface PersonalCloudFile {
  id: string;
  uploadId: string;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: number;
  updatedAt: number;
}

export interface PersonalCloudMessage {
  id: string;
  text: string;
  createdAt: number;
  updatedAt: number;
}
