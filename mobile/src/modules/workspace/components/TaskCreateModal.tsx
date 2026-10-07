import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  AlignLeft,
  Calendar,
  CheckSquare,
  Folder,
  Plus,
  Trash2,
  User,
  X,
} from 'lucide-react-native';
import { useThemePalette } from '../../../theme/useThemePalette';
import { typography } from '../../../theme/typography';
import { useAppStore } from '../../../store/appStore';
import { useTaskStore } from '../store/taskStore';
import { TaskPriority } from '../types';
import { Avatar } from '../../../components/Avatar';

export function TaskCreateModal() {
  const palette = useThemePalette();
  const session = useAppStore(state => state.session);
  const isVisible = useTaskStore(state => state.isCreateModalVisible);
  const initialGroup = useTaskStore(state => state.createTaskInitialGroup);
  const closeCreateModal = useTaskStore(state => state.closeCreateModal);
  const createDetailedTask = useTaskStore(state => state.createDetailedTask);

  const currentUser = session?.user;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [groupName, setGroupName] = useState(initialGroup || 'Nhóm mặc định');
  const [priority, setPriority] = useState<TaskPriority>('NORMAL');
  const [dueDateType, setDueDateType] = useState<'NONE' | 'TODAY' | 'TOMORROW' | 'NEXT_WEEK'>('NONE');
  const [subtasks, setSubtasks] = useState<string[]>([]);
  const [subtaskInput, setSubtaskInput] = useState('');
  const [isAddingSubtask, setIsAddingSubtask] = useState(false);
  const [saving, setSaving] = useState(false);

  // Compute calculated due date
  const computeDueDate = () => {
    if (dueDateType === 'NONE') return null;
    const date = new Date();
    date.setHours(23, 59, 59, 0);

    if (dueDateType === 'TOMORROW') {
      date.setDate(date.getDate() + 1);
    } else if (dueDateType === 'NEXT_WEEK') {
      date.setDate(date.getDate() + 7);
    }
    return date.toISOString();
  };

  const handleReset = () => {
    setTitle('');
    setDescription('');
    setGroupName(initialGroup || 'Nhóm mặc định');
    setPriority('NORMAL');
    setDueDateType('NONE');
    setSubtasks([]);
    setSubtaskInput('');
    setIsAddingSubtask(false);
    setSaving(false);
  };

  const handleClose = () => {
    handleReset();
    closeCreateModal();
  };

  const handleAddSubtask = () => {
    if (!subtaskInput.trim()) {
      setIsAddingSubtask(false);
      return;
    }
    setSubtasks([...subtasks, subtaskInput.trim()]);
    setSubtaskInput('');
    setIsAddingSubtask(false);
  };

  const handleRemoveSubtask = (index: number) => {
    setSubtasks(subtasks.filter((_, idx) => idx !== index));
  };

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('Chưa nhập tên', 'Vui lòng nhập tiêu đề cho nhiệm vụ.');
      return;
    }

    setSaving(true);
    try {
      await createDetailedTask({
        title: title.trim(),
        description: description.trim(),
        groupName: groupName.trim() || 'Nhóm mặc định',
        priority,
        dueAt: computeDueDate(),
        assigneeId: currentUser?.id ? String(currentUser.id) : null,
        assigneeName: currentUser?.name || null,
        subtasks,
      });
      handleClose();
    } catch (err: any) {
      Alert.alert('Lỗi tạo nhiệm vụ', err?.message || 'Không thể tạo nhiệm vụ. Thử lại sau.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={isVisible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <Pressable style={styles.backdrop} onPress={handleClose} />

        <View style={[styles.bottomSheet, { backgroundColor: palette.paper }]}>
          {/* Header Row */}
          <View style={[styles.modalHeader, { borderBottomColor: palette.line }]}>
            <Pressable hitSlop={12} onPress={handleClose} disabled={saving}>
              <Text style={[styles.cancelText, { color: palette.inkSoft }]}>
                Hủy
              </Text>
            </Pressable>

            <Text style={[styles.headerTitle, { color: palette.ink }]}>
              Thêm nhiệm vụ
            </Text>

            <Pressable
              hitSlop={12}
              onPress={handleSave}
              disabled={saving || !title.trim()}
              style={[styles.saveButton, { backgroundColor: palette.accent }]}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.saveButtonText}>
                  Tạo
                </Text>
              )}
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            {/* Title Input */}
            <TextInput
              autoFocus
              value={title}
              onChangeText={setTitle}
              placeholder="Thêm nhiệm vụ"
              placeholderTextColor={palette.muted}
              style={[styles.titleInput, { color: palette.ink }]}
              multiline
            />

            {/* Description Input */}
            <View style={styles.fieldRow}>
              <AlignLeft size={20} color={palette.inkSoft} style={styles.fieldIcon} />
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Thêm mô tả"
                placeholderTextColor={palette.muted}
                style={[styles.descriptionInput, { color: palette.ink }]}
                multiline
              />
            </View>

            {/* Assignee & Group row */}
            <View style={styles.fieldRow}>
              <User size={20} color={palette.inkSoft} style={styles.fieldIcon} />
              <View style={styles.chipsContainer}>
                {/* Assignee Chip */}
                <View
                  style={[
                    styles.userChip,
                    { backgroundColor: palette.accentWash, borderColor: palette.accent },
                  ]}
                >
                  <Avatar name={currentUser?.name || 'User'} size={20} />
                  <Text style={[styles.chipText, { color: palette.accent }]}>
                    {currentUser?.name || 'Tôi'}
                  </Text>
                </View>

                {/* Group Input */}
                <View
                  style={[
                    styles.groupChip,
                    { backgroundColor: palette.canvas, borderColor: palette.line },
                  ]}
                >
                  <Folder size={14} color={palette.inkSoft} />
                  <TextInput
                    value={groupName}
                    onChangeText={setGroupName}
                    placeholder="Tên nhóm"
                    placeholderTextColor={palette.muted}
                    style={[styles.groupInput, { color: palette.ink }]}
                  />
                </View>
              </View>
            </View>

            {/* Due Date Chips */}
            <View style={styles.fieldRow}>
              <Calendar size={20} color={palette.inkSoft} style={styles.fieldIcon} />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.dateChipsScroll}
              >
                <Pressable
                  onPress={() => setDueDateType(dueDateType === 'TODAY' ? 'NONE' : 'TODAY')}
                  style={[
                    styles.dateChip,
                    { backgroundColor: palette.canvas, borderColor: palette.line },
                    dueDateType === 'TODAY' && [styles.dateChipActive, { backgroundColor: palette.accentWash, borderColor: palette.accent }],
                  ]}
                >
                  <Text
                    style={[
                      styles.dateChipText,
                      { color: dueDateType === 'TODAY' ? palette.accent : palette.ink },
                    ]}
                  >
                    Hôm nay
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setDueDateType(dueDateType === 'TOMORROW' ? 'NONE' : 'TOMORROW')}
                  style={[
                    styles.dateChip,
                    { backgroundColor: palette.canvas, borderColor: palette.line },
                    dueDateType === 'TOMORROW' && [styles.dateChipActive, { backgroundColor: palette.accentWash, borderColor: palette.accent }],
                  ]}
                >
                  <Text
                    style={[
                      styles.dateChipText,
                      { color: dueDateType === 'TOMORROW' ? palette.accent : palette.ink },
                    ]}
                  >
                    Ngày mai
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setDueDateType(dueDateType === 'NEXT_WEEK' ? 'NONE' : 'NEXT_WEEK')}
                  style={[
                    styles.dateChip,
                    { backgroundColor: palette.canvas, borderColor: palette.line },
                    dueDateType === 'NEXT_WEEK' && [styles.dateChipActive, { backgroundColor: palette.accentWash, borderColor: palette.accent }],
                  ]}
                >
                  <Text
                    style={[
                      styles.dateChipText,
                      { color: dueDateType === 'NEXT_WEEK' ? palette.accent : palette.ink },
                    ]}
                  >
                    Tuần tới
                  </Text>
                </Pressable>
              </ScrollView>
            </View>

            {/* Priority Selector */}
            <View style={[styles.prioritySection, { borderColor: palette.line }]}>
              <Text style={[styles.sectionSubtitle, { color: palette.muted }]}>
                Mức độ ưu tiên
              </Text>
              <View style={styles.priorityRow}>
                {(['LOW', 'NORMAL', 'HIGH', 'URGENT'] as TaskPriority[]).map(p => {
                  const isSelected = priority === p;
                  const labels: Record<TaskPriority, string> = {
                    LOW: 'Thấp',
                    NORMAL: 'Bình thường',
                    HIGH: 'Cao',
                    URGENT: 'Khẩn cấp',
                  };
                  return (
                    <Pressable
                      key={p}
                      onPress={() => setPriority(p)}
                      style={[
                        styles.priorityPill,
                        { backgroundColor: palette.canvas, borderColor: palette.line },
                        isSelected && [styles.priorityPillActive, { backgroundColor: palette.accent, borderColor: palette.accent }],
                      ]}
                    >
                      <Text
                        style={[
                          styles.priorityText,
                          { color: isSelected ? '#ffffff' : palette.inkSoft },
                        ]}
                      >
                        {labels[p]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Subtasks Section */}
            <View style={[styles.subtasksSection, { borderColor: palette.line }]}>
              <View style={styles.subtasksHeader}>
                <CheckSquare size={18} color={palette.inkSoft} />
                <Text style={[styles.sectionSubtitle, { color: palette.ink }]}>
                  Tác vụ con ({subtasks.length})
                </Text>
              </View>

              {/* Subtasks List */}
              {subtasks.map((st, idx) => (
                <View key={idx} style={[styles.subtaskItem, { backgroundColor: palette.canvas }]}>
                  <Text style={[styles.subtaskText, { color: palette.ink }]}>
                    {idx + 1}. {st}
                  </Text>
                  <Pressable hitSlop={8} onPress={() => handleRemoveSubtask(idx)}>
                    <Trash2 size={16} color={palette.danger || '#ef4444'} />
                  </Pressable>
                </View>
              ))}

              {/* Inline Add Subtask */}
              {isAddingSubtask ? (
                <View style={[styles.subtaskInputRow, { borderColor: palette.accent, backgroundColor: palette.canvas }]}>
                  <TextInput
                    autoFocus
                    value={subtaskInput}
                    onChangeText={setSubtaskInput}
                    placeholder="Nhập nội dung tác vụ con..."
                    placeholderTextColor={palette.muted}
                    returnKeyType="done"
                    onSubmitEditing={handleAddSubtask}
                    onBlur={handleAddSubtask}
                    style={[styles.subtaskInput, { color: palette.ink }]}
                  />
                </View>
              ) : (
                <Pressable
                  onPress={() => setIsAddingSubtask(true)}
                  style={styles.addSubtaskBtn}
                >
                  <Plus size={16} color={palette.accent} />
                  <Text style={[styles.addSubtaskText, { color: palette.accent }]}>
                    Thêm tác vụ con
                  </Text>
                </Pressable>
              )}
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill as any,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  bottomSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '88%',
    paddingBottom: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  cancelText: {
    ...typography.bodyMedium,
    fontSize: 16,
  },
  headerTitle: {
    ...typography.heading,
    fontSize: 17,
    fontWeight: '700',
  },
  saveButton: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 18,
    minWidth: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonText: {
    ...typography.bodyMedium,
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  content: {
    padding: 20,
    gap: 16,
  },
  titleInput: {
    ...typography.heading,
    fontSize: 20,
    fontWeight: '600',
    minHeight: 44,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  fieldIcon: {
    marginTop: 4,
  },
  descriptionInput: {
    flex: 1,
    ...typography.body,
    fontSize: 15,
    minHeight: 40,
  },
  chipsContainer: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  userChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
  },
  chipText: {
    ...typography.caption,
    fontSize: 13,
    fontWeight: '600',
  },
  groupChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 16,
    borderWidth: 1,
  },
  groupInput: {
    ...typography.caption,
    fontSize: 13,
    minWidth: 80,
    height: 28,
    padding: 0,
  },
  dateChipsScroll: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  dateChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  dateChipActive: {
    borderWidth: 1.5,
  },
  dateChipText: {
    ...typography.caption,
    fontSize: 13,
    fontWeight: '500',
  },
  prioritySection: {
    marginTop: 4,
  },
  sectionSubtitle: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  priorityRow: {
    flexDirection: 'row',
    gap: 8,
  },
  priorityPill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  priorityPillActive: {
    elevation: 2,
  },
  priorityText: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '600',
  },
  subtasksSection: {
    marginTop: 6,
    borderTopWidth: 1,
    paddingTop: 14,
  },
  subtasksHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  subtaskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 6,
  },
  subtaskText: {
    ...typography.body,
    fontSize: 14,
    flex: 1,
  },
  subtaskInputRow: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginTop: 4,
  },
  subtaskInput: {
    ...typography.body,
    fontSize: 14,
    height: 36,
  },
  addSubtaskBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  addSubtaskText: {
    ...typography.bodyMedium,
    fontSize: 14,
    fontWeight: '600',
  },
});
