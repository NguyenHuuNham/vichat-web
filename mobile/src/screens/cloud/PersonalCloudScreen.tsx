import { useCallback, useEffect, useRef, useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Linking, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Cloud, Download, FileArchive, FileAudio, FileImage, FileText, FileVideo, HardDrive, LockKeyhole, MessageSquareText, Send, ShieldCheck, Trash2, UploadCloud } from 'lucide-react-native';
import { MainTabParamList } from '../../navigation/types';
import { useAppStore } from '../../store/appStore';
import { personalCloudService } from '../../services/personalCloudService';
import { beginTrustedExternalActivity } from '../../services/appLifecycleService';
import { PersonalCloudFile, PersonalCloudMessage, PickerFile } from '../../types';
import { ThemeColors, shadow } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { useThemePalette } from '../../theme/useThemePalette';
import { EmptyState } from '../../components/EmptyState';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { displayCurrentTenantName } from '../../utils/tenantDisplay';
import { useI18n } from '../../store/languageStore';

type Props = BottomTabScreenProps<MainTabParamList, 'Cloud'>;
type DeleteTarget = { kind: 'message'; item: PersonalCloudMessage } | { kind: 'file'; item: PersonalCloudFile };

function sortMessages(values: PersonalCloudMessage[]) {
  return [...values].sort((left, right) => (
    left.createdAt - right.createdAt
      || left.updatedAt - right.updatedAt
      || left.id.localeCompare(right.id)
  ));
}

function sortFiles(values: PersonalCloudFile[]) {
  return [...values].sort((left, right) => (
    right.updatedAt - left.updatedAt
      || right.createdAt - left.createdAt
      || right.id.localeCompare(left.id)
  ));
}

function formatSize(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(value < 10 * 1024 ? 1 : 0)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(value < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatCloudTime(value: number) {
  if (!value) return '';
  try {
    return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value * 1000));
  } catch {
    return '';
  }
}

function fileIcon(mimeType: string) {
  const mime = mimeType.toLowerCase();
  if (mime.startsWith('image/')) return FileImage;
  if (mime.startsWith('video/')) return FileVideo;
  if (mime.startsWith('audio/')) return FileAudio;
  if (mime.includes('zip') || mime.includes('compressed') || mime.includes('archive')) return FileArchive;
  return FileText;
}

function safeFileName(value: string) {
  return String(value || 'tep-dinh-kem').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 150);
}

export function PersonalCloudScreen(_props: Props) {
  const palette = useThemePalette();
  const styles = createStyles(palette);
  const { language, t } = useI18n();
  const session = useAppStore(state => state.session);
  const mountedRef = useRef(true);
  const [messages, setMessages] = useState<PersonalCloudMessage[]>([]);
  const [files, setFiles] = useState<PersonalCloudFile[]>([]);
  const [messageCursor, setMessageCursor] = useState<string | null>(null);
  const [fileCursor, setFileCursor] = useState<string | null>(null);
  const [messagesHasMore, setMessagesHasMore] = useState(false);
  const [filesHasMore, setFilesHasMore] = useState(false);
  const [messagesTotal, setMessagesTotal] = useState<number | null>(null);
  const [filesTotal, setFilesTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMoreMessages, setLoadingMoreMessages] = useState(false);
  const [loadingMoreFiles, setLoadingMoreFiles] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [busyFileId, setBusyFileId] = useState('');
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => () => { mountedRef.current = false; }, []);

  const loadCloud = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const [messagePage, filePage] = await Promise.all([
        personalCloudService.listMessages(),
        personalCloudService.listFiles(),
      ]);
      if (!mountedRef.current) return;
      setMessages(sortMessages(messagePage.items));
      setMessageCursor(messagePage.nextCursor);
      setMessagesHasMore(messagePage.hasMore);
      setMessagesTotal(messagePage.total);
      setFiles(sortFiles(filePage.items));
      setFileCursor(filePage.nextCursor);
      setFilesHasMore(filePage.hasMore);
      setFilesTotal(filePage.total);
    } catch (value) {
      if (mountedRef.current) setError(value instanceof Error ? t(value.message) : t('Không tải được Cloud cá nhân.'));
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => { void loadCloud(); }, [loadCloud]);

  const loadMoreMessages = async () => {
    if (!messageCursor || loadingMoreMessages) return;
    setLoadingMoreMessages(true);
    try {
      const page = await personalCloudService.listMessages({ cursor: messageCursor });
      if (!mountedRef.current) return;
      setMessages(current => sortMessages([...current, ...page.items]));
      setMessageCursor(page.nextCursor);
      setMessagesHasMore(page.hasMore);
      if (page.total !== null) setMessagesTotal(page.total);
    } catch (value) {
      if (mountedRef.current) setError(value instanceof Error ? t(value.message) : t('Không tải thêm tin nhắn Cloud.'));
    } finally {
      if (mountedRef.current) setLoadingMoreMessages(false);
    }
  };

  const loadMoreFiles = async () => {
    if (!fileCursor || loadingMoreFiles) return;
    setLoadingMoreFiles(true);
    try {
      const page = await personalCloudService.listFiles({ cursor: fileCursor });
      if (!mountedRef.current) return;
      setFiles(current => sortFiles([...current, ...page.items]));
      setFileCursor(page.nextCursor);
      setFilesHasMore(page.hasMore);
      if (page.total !== null) setFilesTotal(page.total);
    } catch (value) {
      if (mountedRef.current) setError(value instanceof Error ? t(value.message) : t('Không tải thêm file Cloud.'));
    } finally {
      if (mountedRef.current) setLoadingMoreFiles(false);
    }
  };

  const sendMessage = async () => {
    const value = draft.trim();
    if (!value || sending) return;
    setSending(true);
    setError('');
    try {
      const message = await personalCloudService.sendMessage(value);
      if (!message || !mountedRef.current) return;
      setMessages(current => sortMessages([...current, message]));
      setMessagesTotal(current => current === null ? current : current + 1);
      setDraft('');
    } catch (valueError) {
      if (mountedRef.current) setError(valueError instanceof Error ? t(valueError.message) : t('Không thể gửi tin nhắn Cloud.'));
    } finally {
      if (mountedRef.current) setSending(false);
    }
  };

  const deleteMessage = (message: PersonalCloudMessage) => {
    setDeleteTarget({ kind: 'message', item: message });
  };

  const pickFiles = async () => {
    if (uploading) return;
    try {
      beginTrustedExternalActivity();
      const result: any = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: true });
      if (result.canceled || !result.assets?.length) return;
      setUploading(true);
      setError('');
      const uploaded: PersonalCloudFile[] = [];
      const failed: string[] = [];
      for (const asset of result.assets) {
        const file: PickerFile = {
          uri: asset.uri,
          name: asset.name || 'tep-dinh-kem',
          type: asset.mimeType || 'application/octet-stream',
          size: asset.size,
        };
        try {
          uploaded.push(await personalCloudService.uploadFile(file));
        } catch (value) {
          failed.push(`${file.name}: ${value instanceof Error ? t(value.message) : t('tải lên thất bại')}`);
        }
      }
      if (mountedRef.current && uploaded.length) {
        setFiles(current => sortFiles([...uploaded, ...current]));
        setFilesTotal(current => current === null ? current : current + uploaded.length);
      }
      if (mountedRef.current && failed.length) setError(failed.length === 1 ? failed[0] : `${t('Có')} ${failed.length} ${t('file tải lên thất bại')}.`);
    } catch (value) {
      if (mountedRef.current) setError(value instanceof Error ? t(value.message) : t('Không thể chọn file.'));
    } finally {
      if (mountedRef.current) setUploading(false);
    }
  };

  const openFile = async (file: PersonalCloudFile, download = false) => {
    if (busyFileId) return;
    setBusyFileId(file.id);
    setError('');
    try {
      beginTrustedExternalActivity();
      const url = await personalCloudService.getDownloadUrl(file.id, download);
      if (!download || Platform.OS === 'web') {
        await Linking.openURL(url);
      } else {
        const fileSystem: any = require('expo-file-system');
        const sharing: any = require('expo-sharing');
        if (!fileSystem.File?.downloadFileAsync || !fileSystem.Paths?.cache) {
          await Linking.openURL(url);
        } else {
          const target = new fileSystem.File(fileSystem.Paths.cache, `vichat-cloud-${Date.now()}-${safeFileName(file.fileName)}`);
          const downloaded = await fileSystem.File.downloadFileAsync(url, target, { idempotent: true });
          if (await sharing.isAvailableAsync()) await sharing.shareAsync(downloaded.uri, { mimeType: file.mimeType, dialogTitle: file.fileName });
          else await Linking.openURL(downloaded.uri);
        }
      }
    } catch (value) {
      if (mountedRef.current) setError(value instanceof Error ? t(value.message) : t('Không thể mở file Cloud.'));
    } finally {
      if (mountedRef.current) setBusyFileId('');
    }
  };

  const deleteFile = (file: PersonalCloudFile) => {
    setDeleteTarget({ kind: 'file', item: file });
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deleteBusy) return;
    setDeleteBusy(true);
    try {
      if (deleteTarget.kind === 'message') {
        await personalCloudService.deleteMessage(deleteTarget.item.id);
        if (mountedRef.current) {
          setMessages(current => current.filter(item => item.id !== deleteTarget.item.id));
          setMessagesTotal(current => current === null ? current : Math.max(0, current - 1));
        }
      } else {
        await personalCloudService.deleteFile(deleteTarget.item.id);
        if (mountedRef.current) {
          setFiles(current => current.filter(item => item.id !== deleteTarget.item.id));
          setFilesTotal(current => current === null ? current : Math.max(0, current - 1));
        }
      }
      setDeleteTarget(null);
    } catch (value) {
      if (mountedRef.current) setError(value instanceof Error ? t(value.message) : t('Không thể xóa khỏi Cloud.'));
    } finally {
      setDeleteBusy(false);
    }
  };

  const header = (
    <>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>{t('PRIVATE STORAGE')}</Text>
          <Text style={styles.title}>{t('Cloud của tôi')}</Text>
          <Text numberOfLines={2} ellipsizeMode="tail" style={styles.subtitle}>{displayCurrentTenantName(session, t('Không gian riêng tư của bạn'))}</Text>
        </View>
        <View style={styles.headerIcon}><Cloud color={palette.accent} size={24} /></View>
      </View>

      <View style={styles.hero}>
        <View style={styles.heroIcon}><LockKeyhole color={palette.accentDeep} size={24} /></View>
        <View style={styles.heroCopy}>
          <Text style={styles.heroTitle}>{t('Chỉ mình bạn biết')}</Text>
          <Text style={styles.heroText}>{t('Tin nhắn và file được khóa theo tài khoản, tenant và phiên đăng nhập hiện tại.')}</Text>
        </View>
        <ShieldCheck color={palette.online} size={21} />
      </View>

      {error ? <Pressable onPress={() => setError('')} style={styles.error}><Text style={styles.errorText}>{t(error)}</Text><Text style={styles.errorClose}>{t('Đóng')}</Text></Pressable> : null}

      <View style={styles.sectionHeading}>
        <View style={styles.sectionHeadingCopy}><MessageSquareText color={palette.accent} size={17} /><Text style={styles.sectionTitle}>{t('Tin nhắn riêng tư')}</Text><Text style={styles.sectionCount}>{messagesTotal ?? messages.length}</Text></View>
        <Text style={styles.privateLabel}>{t('CHỈ MÌNH TÔI')}</Text>
      </View>
      {loading ? <View style={styles.loadingBox}><ActivityIndicator color={palette.accent} /><Text style={styles.loadingText}>{t('Đang tải Cloud...')}</Text></View> : messages.length === 0 ? <View style={styles.emptyMessage}><MessageSquareText color={palette.muted} size={21} /><Text style={styles.emptyMessageText}>{t('Chưa có tin nhắn riêng tư.')}</Text></View> : <ScrollView style={styles.messageScroll} nestedScrollEnabled showsVerticalScrollIndicator={false}>{messages.map(message => <View key={message.id} style={styles.messageRow}><View style={styles.messageBubble}><Text style={styles.messageText}>{message.text}</Text><Text style={styles.messageTime}>{formatCloudTime(message.createdAt)}</Text></View><Pressable accessibilityLabel={`${t('Xóa tin nhắn')} ${message.text.slice(0, 30)}`} onPress={() => deleteMessage(message)} style={styles.deleteMessage}><Trash2 color={palette.muted} size={16} /></Pressable></View>)}</ScrollView>}
      {messagesHasMore ? <Pressable onPress={() => void loadMoreMessages()} disabled={loadingMoreMessages} style={styles.loadMore}>{loadingMoreMessages ? <ActivityIndicator color={palette.accent} size="small" /> : <Text style={styles.loadMoreText}>{t('Tải tin nhắn cũ hơn')}</Text>}</Pressable> : null}
      <View style={styles.composer}>
        <TextInput value={draft} onChangeText={setDraft} placeholder={t('Viết ghi chú riêng tư...')} placeholderTextColor={palette.muted} multiline maxLength={120000} editable={!sending} style={styles.input} />
        <Pressable accessibilityLabel={t('Gửi tin nhắn Cloud')} onPress={() => void sendMessage()} disabled={sending || !draft.trim()} style={[styles.send, (sending || !draft.trim()) && styles.disabled]}>{sending ? <ActivityIndicator color="#fff" size="small" /> : <Send color="#fff" size={18} />}</Pressable>
      </View>

      <View style={[styles.sectionHeading, styles.filesHeading]}>
        <View style={styles.sectionHeadingCopy}><HardDrive color={palette.accent} size={17} /><Text style={styles.sectionTitle}>{t('File của tôi')}</Text><Text style={styles.sectionCount}>{filesTotal ?? files.length}</Text></View>
        <Pressable accessibilityLabel={t('Tải file lên Cloud')} onPress={() => void pickFiles()} disabled={uploading} style={[styles.uploadButton, uploading && styles.disabled]}>{uploading ? <ActivityIndicator color="#fff" size="small" /> : <UploadCloud color="#fff" size={17} />}<Text style={styles.uploadText}>{uploading ? t('Đang tải...') : t('Tải lên')}</Text></Pressable>
      </View>
    </>
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          data={files}
          keyExtractor={item => item.id}
          renderItem={({ item }) => <CloudFileRow palette={palette} file={item} busy={busyFileId === item.id} onOpen={() => void openFile(item)} onDownload={() => void openFile(item, true)} onDelete={() => deleteFile(item)} />}
          ListHeaderComponent={header}
          ListEmptyComponent={loading ? null : <EmptyState icon={HardDrive} title={t('Chưa có file riêng tư')} description={t('Những file bạn tải lên sẽ chỉ xuất hiện trong Cloud của tài khoản này.')} />}
          ListFooterComponent={filesHasMore ? <Pressable onPress={() => void loadMoreFiles()} disabled={loadingMoreFiles} style={styles.loadMore}>{loadingMoreFiles ? <ActivityIndicator color={palette.accent} size="small" /> : <Text style={styles.loadMoreText}>{t('Tải thêm file')}</Text>}</Pressable> : null}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadCloud(true)} tintColor={palette.accent} colors={[palette.accent]} />}
          showsVerticalScrollIndicator={false}
          onEndReachedThreshold={0.65}
          onEndReached={() => { if (fileCursor && !loadingMoreFiles) void loadMoreFiles(); }}
        />
      </KeyboardAvoidingView>
      <ConfirmDialog
        visible={Boolean(deleteTarget)}
        title={deleteTarget?.kind === 'file' ? t('Xóa file riêng tư?') : t('Xóa tin nhắn riêng tư?')}
        message={deleteTarget?.kind === 'file' ? (language === 'en' ? `${deleteTarget.item.fileName} will be removed from your cloud.` : `${deleteTarget.item.fileName} sẽ bị xóa khỏi Cloud của bạn.`) : t('Tin nhắn này sẽ bị xóa khỏi Cloud của bạn.')}
        eyebrow={t('CLOUD CỦA TÔI')}
        confirmLabel={t('Xóa')}
        tone="danger"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
        busy={deleteBusy}
      />
    </SafeAreaView>
  );
}

function CloudFileRow({ palette, file, busy, onOpen, onDownload, onDelete }: { palette: ThemeColors; file: PersonalCloudFile; busy: boolean; onOpen: () => void; onDownload: () => void; onDelete: () => void }) {
  const styles = createStyles(palette);
  const Icon = fileIcon(file.mimeType);
  return <View style={styles.fileRow}><Pressable onPress={onOpen} style={({ pressed }) => [styles.fileMain, pressed && { opacity: 0.65 }]}><View style={styles.fileIcon}><Icon color={palette.accent} size={20} /></View><View style={styles.fileCopy}><Text numberOfLines={1} style={styles.fileName}>{file.fileName}</Text><Text numberOfLines={1} style={styles.fileMeta}>{formatSize(file.size)} · {file.mimeType}</Text><Text style={styles.fileTime}>{formatCloudTime(file.updatedAt || file.createdAt)}</Text></View></Pressable><View style={styles.fileActions}><Pressable accessibilityLabel={`Mở ${file.fileName}`} onPress={onOpen} disabled={busy} style={styles.fileAction}>{busy ? <ActivityIndicator color={palette.accent} size="small" /> : <FileText color={palette.accent} size={17} />}</Pressable><Pressable accessibilityLabel={`Tải xuống ${file.fileName}`} onPress={onDownload} disabled={busy} style={styles.fileAction}><Download color={palette.accent} size={17} /></Pressable><Pressable accessibilityLabel={`Xóa ${file.fileName}`} onPress={onDelete} disabled={busy} style={styles.fileAction}><Trash2 color={palette.danger} size={17} /></Pressable></View></View>;
}

function createStyles(palette: ThemeColors) {
  return StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: palette.canvas },
  list: { paddingHorizontal: 20, paddingBottom: 140 },
  header: { paddingTop: 12, paddingBottom: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerCopy: { flex: 1, minWidth: 0 },
  eyebrow: { ...typography.caption, color: palette.accentDeep, letterSpacing: 1.1 },
  title: { ...typography.display, color: palette.ink, marginTop: 2 },
  subtitle: { ...typography.caption, color: palette.inkSoft, marginTop: 3 },
  headerIcon: { width: 48, height: 48, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.line, ...shadow },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, borderRadius: 20, borderWidth: 1, borderColor: `${palette.accent}55`, backgroundColor: `${palette.accent}12` },
  heroIcon: { width: 47, height: 47, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.paper },
  heroCopy: { flex: 1 },
  heroTitle: { ...typography.bodyMedium, color: palette.ink },
  heroText: { ...typography.caption, color: palette.inkSoft, marginTop: 3 },
  error: { marginTop: 12, padding: 11, borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: `${palette.danger}12`, borderWidth: 1, borderColor: `${palette.danger}55` },
  errorText: { ...typography.caption, color: palette.danger, flex: 1 },
  errorClose: { ...typography.caption, color: palette.danger, fontFamily: 'BeVietnamPro_700Bold' },
  sectionHeading: { marginTop: 21, marginBottom: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  sectionHeadingCopy: { flexDirection: 'row', alignItems: 'center', gap: 7, minWidth: 0 },
  sectionTitle: { ...typography.title, color: palette.ink },
  sectionCount: { ...typography.caption, color: palette.muted },
  privateLabel: { ...typography.caption, color: palette.online, fontSize: 9, letterSpacing: 0.6 },
  loadingBox: { minHeight: 104, alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 17, backgroundColor: palette.paper, borderWidth: 1, borderColor: palette.line },
  loadingText: { ...typography.caption, color: palette.muted },
  emptyMessage: { minHeight: 92, alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 17, borderStyle: 'dashed', borderWidth: 1, borderColor: palette.line, backgroundColor: palette.paper },
  emptyMessageText: { ...typography.caption, color: palette.muted },
  messageScroll: { maxHeight: 330, padding: 4, borderRadius: 17, backgroundColor: `${palette.paper}7A` },
  messageRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'flex-end', gap: 6, marginBottom: 7 },
  messageBubble: { maxWidth: '88%', paddingHorizontal: 12, paddingTop: 9, paddingBottom: 6, borderRadius: 15, borderBottomRightRadius: 5, borderWidth: 1, borderColor: `${palette.accent}55`, backgroundColor: palette.accentWash },
  messageText: { ...typography.body, color: palette.ink },
  messageTime: { ...typography.caption, color: palette.muted, fontSize: 9, textAlign: 'right', marginTop: 4 },
  deleteMessage: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.paper },
  composer: { minHeight: 56, flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 9, padding: 7, borderRadius: 17, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.paper },
  input: { minHeight: 40, maxHeight: 100, flex: 1, paddingHorizontal: 9, paddingTop: 8, paddingBottom: 8, color: palette.ink, fontFamily: 'BeVietnamPro_400Regular', fontSize: 14 },
  send: { width: 39, height: 39, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.accent },
  disabled: { opacity: 0.45 },
  filesHeading: { alignItems: 'center' },
  uploadButton: { minHeight: 36, paddingHorizontal: 11, borderRadius: 11, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: palette.accent },
  uploadText: { ...typography.caption, color: '#fff', fontFamily: 'BeVietnamPro_700Bold' },
  fileRow: { minHeight: 83, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 9, padding: 11, borderRadius: 17, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.paper, ...shadow },
  fileMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  fileIcon: { width: 39, height: 39, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.accentWash },
  fileCopy: { flex: 1, minWidth: 0 },
  fileName: { ...typography.bodyMedium, color: palette.ink },
  fileMeta: { ...typography.caption, color: palette.inkSoft, fontSize: 10.5, marginTop: 2 },
  fileTime: { ...typography.caption, color: palette.muted, fontSize: 9, marginTop: 2 },
  fileActions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  fileAction: { width: 32, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  loadMore: { minHeight: 38, marginTop: 8, marginBottom: 2, borderRadius: 12, borderWidth: 1, borderColor: palette.line, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.paper },
  loadMoreText: { ...typography.caption, color: palette.accentDeep, fontFamily: 'BeVietnamPro_700Bold' },
  });
}
