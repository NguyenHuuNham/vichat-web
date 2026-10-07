import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  CalendarClock,
  CheckCircle2,
  Clock,
  FolderPlus,
  ListTodo,
  Plus,
  User,
  UserCheck,
  Users,
} from 'lucide-react-native';
import { useThemePalette } from '../../../theme/useThemePalette';
import { typography } from '../../../theme/typography';
import { useTaskStore } from '../store/taskStore';
import { TaskFilterScope } from '../types';

export function TaskDrawer() {
  const palette = useThemePalette();
  const isOpen = useTaskStore(state => state.isDrawerOpen);
  const closeDrawer = useTaskStore(state => state.closeDrawer);
  const activeScope = useTaskStore(state => state.activeScope);
  const setScope = useTaskStore(state => state.setScope);

  const navItems: { scope: TaskFilterScope; label: string; icon: any }[] = [
    { scope: 'OWNED', label: 'Đã sở hữu', icon: UserCheck },
    { scope: 'SUBSCRIBED', label: 'Đã đăng ký', icon: Users },
    { scope: 'ACTIVITIES', label: 'Hoạt động', icon: Clock },
  ];

  const quickAccessItems: { scope: TaskFilterScope; label: string; icon: any }[] = [
    { scope: 'ALL', label: 'Tất cả tác vụ', icon: ListTodo },
    { scope: 'CREATED', label: 'Đã tạo', icon: User },
    { scope: 'ASSIGNED', label: 'Đã chỉ định', icon: CalendarClock },
    { scope: 'COMPLETED', label: 'Đã hoàn thành', icon: CheckCircle2 },
  ];

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="fade"
      onRequestClose={closeDrawer}
    >
      <View style={styles.overlay}>
        {/* Backdrop */}
        <Pressable style={styles.backdrop} onPress={closeDrawer} />

        {/* Drawer panel */}
        <View style={[styles.drawer, { backgroundColor: palette.paper }]}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.drawerContent}>
            {/* Header */}
            <View style={styles.drawerHeader}>
              <Text style={[styles.drawerTitle, { color: palette.ink }]}>
                Nhiệm vụ
              </Text>
            </View>

            {/* Main Categories */}
            <View style={styles.section}>
              {navItems.map(item => {
                const isSelected = activeScope === item.scope;
                const Icon = item.icon;
                return (
                  <Pressable
                    key={item.scope}
                    onPress={() => setScope(item.scope)}
                    style={[
                      styles.drawerItem,
                      isSelected && [styles.drawerItemActive, { backgroundColor: palette.accentWash }],
                    ]}
                  >
                    <Icon
                      size={20}
                      color={isSelected ? palette.accent : palette.inkSoft}
                    />
                    <Text
                      style={[
                        styles.drawerItemText,
                        { color: isSelected ? palette.accent : palette.ink },
                        isSelected && styles.drawerItemTextActive,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={[styles.divider, { backgroundColor: palette.line }]} />

            {/* Quick Access */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: palette.muted }]}>
                Truy cập nhanh
              </Text>
              {quickAccessItems.map(item => {
                const isSelected = activeScope === item.scope;
                const Icon = item.icon;
                return (
                  <Pressable
                    key={item.scope}
                    onPress={() => setScope(item.scope)}
                    style={[
                      styles.drawerItem,
                      isSelected && [styles.drawerItemActive, { backgroundColor: palette.accentWash }],
                    ]}
                  >
                    <Icon
                      size={18}
                      color={isSelected ? palette.accent : palette.inkSoft}
                    />
                    <Text
                      style={[
                        styles.drawerItemText,
                        { color: isSelected ? palette.accent : palette.ink },
                        isSelected && styles.drawerItemTextActive,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={[styles.divider, { backgroundColor: palette.line }]} />

            {/* Task Lists */}
            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={[styles.sectionTitle, { color: palette.muted }]}>
                  Danh sách tác vụ
                </Text>
                <Pressable hitSlop={10}>
                  <Plus size={16} color={palette.inkSoft} />
                </Pressable>
              </View>

              <Pressable
                onPress={() => setScope('ALL')}
                style={styles.drawerItem}
              >
                <ListTodo size={18} color={palette.inkSoft} />
                <Text style={[styles.drawerItemText, { color: palette.ink }]}>
                  Danh sách chính
                </Text>
              </Pressable>
            </View>

            <View style={[styles.divider, { backgroundColor: palette.line }]} />

            {/* New Group action */}
            <Pressable
              onPress={() => {
                closeDrawer();
                useTaskStore.getState().openCreateModal();
              }}
              style={styles.newGroupButton}
            >
              <FolderPlus size={18} color={palette.accent} />
              <Text style={[styles.newGroupText, { color: palette.accent }]}>
                + Nhóm mới
              </Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    flexDirection: 'row',
  },
  backdrop: {
    ...StyleSheet.absoluteFill as any,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  drawer: {
    width: '78%',
    maxWidth: 320,
    height: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 16,
  },
  drawerContent: {
    paddingTop: 48,
    paddingBottom: 32,
    paddingHorizontal: 16,
  },
  drawerHeader: {
    marginBottom: 18,
    paddingHorizontal: 8,
  },
  drawerTitle: {
    ...typography.heading,
    fontSize: 22,
    fontWeight: '700',
  },
  section: {
    marginVertical: 4,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
    marginBottom: 6,
  },
  sectionTitle: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 8,
    marginBottom: 4,
  },
  drawerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  drawerItemActive: {
    borderRadius: 12,
  },
  drawerItemText: {
    ...typography.body,
    fontSize: 15,
  },
  drawerItemTextActive: {
    fontWeight: '700',
  },
  divider: {
    height: 1,
    marginVertical: 12,
    marginHorizontal: 8,
  },
  newGroupButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginTop: 4,
  },
  newGroupText: {
    ...typography.bodyMedium,
    fontSize: 15,
    fontWeight: '600',
  },
});
