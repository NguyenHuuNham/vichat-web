import { Conversation, User, WorkspaceItem } from '../types';
import { NavigatorScreenParams } from '@react-navigation/native';

export type RootStackParamList = {
  Main: NavigatorScreenParams<MainTabParamList>;
  ChatDetail: { conversationId: string };
  GroupInfo: { conversationId: string };
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
  Cloud: undefined;
  Workspace: undefined;
  Settings: undefined;
};

export type ConversationRoute = { params: { conversationId: Conversation['id'] } };
