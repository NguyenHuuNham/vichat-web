import { Conversation, User, WorkspaceItem } from '../types';

export type RootStackParamList = {
  Main: undefined;
  ChatDetail: { conversationId: string };
  NewGroup: undefined;
  UserProfile: { user: User };
  WorkspaceDetail: { item: WorkspaceItem };
  EditProfile: undefined;
  LinkedDevices: undefined;
};

export type AuthStackParamList = {
  Login: undefined;
  ForgotPassword: undefined;
};

export type MainTabParamList = {
  Chats: undefined;
  Contacts: undefined;
  Workspace: undefined;
  Settings: undefined;
};

export type ConversationRoute = { params: { conversationId: Conversation['id'] } };
