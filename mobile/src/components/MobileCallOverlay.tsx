import { useEffect, useMemo, useState, type ComponentType } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AlertCircle,
  Camera,
  CameraOff,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  SwitchCamera,
  Video,
} from 'lucide-react-native';
import type { RTCVideoViewProps } from 'react-native-webrtc';
import { useCallStore } from '../store/callStore';
import { ThemeColors, shadow } from '../theme/colors';
import { typography } from '../theme/typography';
import { Avatar } from './Avatar';
import { useThemePalette } from '../theme/useThemePalette';
import { useI18n } from '../store/languageStore';

let CachedRTCView: ComponentType<RTCVideoViewProps> | null = null;
function getRTCView(): ComponentType<RTCVideoViewProps> | null {
  if (!CachedRTCView) {
    try {
      const webrtc = require('react-native-webrtc');
      CachedRTCView = webrtc.RTCView || null;
    } catch {
      CachedRTCView = null;
    }
  }
  return CachedRTCView;
}

function formatDuration(startedAt: number, now: number) {
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function MobileCallOverlay() {
  const palette = useThemePalette();
  const insets = useSafeAreaInsets();
  const styles = createStyles(palette, insets);
  const { t } = useI18n();

  const call = useCallStore(state => state.call);
  const localStream = useCallStore(state => state.localStream);
  const remoteStream = useCallStore(state => state.remoteStream);
  const microphoneEnabled = useCallStore(state => state.microphoneEnabled);
  const cameraEnabled = useCallStore(state => state.cameraEnabled);
  const error = useCallStore(state => state.error);
  const accept = useCallStore(state => state.accept);
  const reject = useCallStore(state => state.reject);
  const hangUp = useCallStore(state => state.hangUp);
  const toggleMicrophone = useCallStore(state => state.toggleMicrophone);
  const toggleCamera = useCallStore(state => state.toggleCamera);
  const switchCamera = useCallStore(state => state.switchCamera);
  const clearError = useCallStore(state => state.clearError);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!call) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [call]);

  const status = useMemo(() => {
    if (!call) return '';
    if (call.phase === 'incoming') return `${call.audioOnly ? t('Cuộc gọi thoại') : t('Cuộc gọi video')} ${t('đến')}`;
    if (call.phase === 'preparing') return t('Đang mở thiết bị...');
    if (call.phase === 'calling') return t('Đang gọi...');
    if (call.phase === 'ringing') return t('Đang đổ chuông...');
    if (call.phase === 'connecting') return t('Đang kết nối...');
    if (call.phase === 'reconnecting') return t('Đang khôi phục kết nối...');
    return call.connectedAt ? formatDuration(call.connectedAt, now) : '00:00';
  }, [call, now, t]);

  if (!call) return null;

  const RTCViewComponent = getRTCView() as ComponentType<RTCVideoViewProps> | null;
  const remoteUrl = remoteStream?.toURL?.();
  const localUrl = localStream?.toURL?.();
  const incoming = call.phase === 'incoming';
  const isVideo = !call.audioOnly;
  const hasRemoteVideo = Boolean(isVideo && remoteUrl && RTCViewComponent);
  const hasLocalVideo = Boolean(isVideo && localUrl && cameraEnabled && RTCViewComponent);

  return (
    <View style={styles.overlay}>
      <View style={[styles.sheet, isVideo && styles.videoSheet]}>
        {/* Remote Video in Full Screen if available */}
        {hasRemoteVideo && RTCViewComponent ? (
          <RTCViewComponent
            streamURL={remoteUrl!}
            objectFit="cover"
            zOrder={0}
            style={styles.remoteVideo}
          />
        ) : null}

        {/* When video call is active but remote is not yet available, show local preview full screen */}
        {!hasRemoteVideo && hasLocalVideo && RTCViewComponent ? (
          <RTCViewComponent
            streamURL={localUrl!}
            mirror
            objectFit="cover"
            zOrder={0}
            style={styles.remoteVideo}
          />
        ) : null}

        {/* Picture-in-picture local preview when remote video is connected */}
        {hasRemoteVideo && hasLocalVideo && RTCViewComponent ? (
          <View style={styles.localVideoContainer}>
            <RTCViewComponent
              streamURL={localUrl!}
              mirror
              objectFit="cover"
              zOrder={1}
              style={styles.localVideo}
            />
          </View>
        ) : null}

        {/* Video Scrim Gradient */}
        {isVideo ? <View style={styles.videoScrim} /> : <View style={styles.scrim} />}

        {/* Overlay Content */}
        <View style={styles.content}>
          {/* Top Bar with Safe Area */}
          <View style={styles.topline}>
            <View style={styles.callTypeBadge}>
              {call.audioOnly ? <Phone color="#fff" size={15} /> : <Video color="#fff" size={15} />}
              <Text style={styles.callTypeText} numberOfLines={1}>
                {hasRemoteVideo ? (call.peerName || t('Gọi video')) : (call.audioOnly ? t('Gọi thoại') : t('Gọi video'))}
              </Text>
            </View>
            <View style={styles.statusBadge}>
              <Text style={styles.statusText}>{status}</Text>
            </View>
          </View>

          {/* Main User Card */}
          {(!hasRemoteVideo || call.audioOnly) ? (
            <View style={[styles.peer, isVideo && styles.videoPeerCard]}>
              <Avatar
                name={call.peerName}
                uri={call.peerAvatar}
                size={isVideo ? 84 : 96}
                rounded
                online
              />
              <Text style={styles.peerName} numberOfLines={1}>{call.peerName}</Text>
              <Text style={styles.peerStatus}>{status}</Text>
            </View>
          ) : null}

          {/* Error Banner */}
          {error ? (
            <Pressable onPress={clearError} style={styles.error}>
              <AlertCircle color="#fff" size={16} />
              <Text style={styles.errorText}>{error}</Text>
            </Pressable>
          ) : null}

          {/* Control Buttons */}
          {incoming ? (
            <View style={styles.incomingControls}>
              <CallButton
                palette={palette}
                t={t}
                icon={PhoneOff}
                danger
                label="Từ chối"
                onPress={reject}
              />
              <CallButton
                palette={palette}
                t={t}
                icon={call.audioOnly ? Phone : Video}
                accept
                label="Trả lời"
                onPress={() => void accept()}
              />
            </View>
          ) : (
            <View style={styles.controlsRow}>
              <CallButton
                palette={palette}
                t={t}
                icon={microphoneEnabled ? Mic : MicOff}
                active={!microphoneEnabled}
                label={microphoneEnabled ? 'Tắt mic' : 'Bật mic'}
                onPress={toggleMicrophone}
              />
              {isVideo ? (
                <CallButton
                  palette={palette}
                  t={t}
                  icon={cameraEnabled ? Camera : CameraOff}
                  active={!cameraEnabled}
                  label={cameraEnabled ? 'Tắt cam' : 'Bật cam'}
                  onPress={toggleCamera}
                />
              ) : null}
              {isVideo ? (
                <CallButton
                  palette={palette}
                  t={t}
                  icon={SwitchCamera}
                  disabled={!cameraEnabled}
                  label="Đổi cam"
                  onPress={switchCamera}
                />
              ) : null}
              <CallButton
                palette={palette}
                t={t}
                icon={PhoneOff}
                danger
                label="Kết thúc"
                onPress={hangUp}
              />
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

function CallButton({
  palette,
  t,
  icon: Icon,
  label,
  onPress,
  danger = false,
  accept = false,
  active = false,
  disabled = false,
}: {
  palette: ThemeColors;
  t: (value: string) => string;
  icon: any;
  label: string;
  onPress: () => void;
  danger?: boolean;
  accept?: boolean;
  active?: boolean;
  disabled?: boolean;
}) {
  const styles = createButtonStyles(palette);
  return (
    <View style={styles.wrapper}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t(label)}
        disabled={disabled}
        onPress={onPress}
        style={[
          styles.button,
          danger && styles.dangerButton,
          accept && styles.acceptButton,
          active && styles.activeButton,
          disabled && styles.disabled,
        ]}
      >
        <Icon color="#fff" size={22} />
      </Pressable>
      <Text style={styles.buttonLabel} numberOfLines={1}>{t(label)}</Text>
    </View>
  );
}

function createButtonStyles(palette: ThemeColors) {
  return StyleSheet.create({
    wrapper: {
      alignItems: 'center',
      gap: 6,
      minWidth: 64,
    },
    button: {
      width: 58,
      height: 58,
      borderRadius: 29,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.18)',
    },
    dangerButton: {
      backgroundColor: '#E53935',
    },
    acceptButton: {
      backgroundColor: '#2E7D32',
    },
    activeButton: {
      backgroundColor: 'rgba(239,83,80,0.45)',
    },
    disabled: {
      opacity: 0.35,
    },
    buttonLabel: {
      ...typography.caption,
      color: 'rgba(255,255,255,0.85)',
      fontSize: 11,
      textAlign: 'center',
    },
  });
}

function createStyles(palette: ThemeColors, insets: { top: number; bottom: number }) {
  const topPadding = Math.max(insets.top + 8, 20);
  const bottomPadding = Math.max(insets.bottom + 16, 24);

  return StyleSheet.create({
    overlay: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      backgroundColor: 'rgba(5,9,14,0.78)',
      justifyContent: 'flex-end',
      zIndex: 1100,
    },
    sheet: {
      minHeight: 460,
      borderTopLeftRadius: 32,
      borderTopRightRadius: 32,
      overflow: 'hidden',
      backgroundColor: '#111B21',
      ...shadow,
    },
    videoSheet: {
      flex: 1,
      minHeight: '100%',
      height: '100%',
      borderTopLeftRadius: 0,
      borderTopRightRadius: 0,
      backgroundColor: '#070D12',
    },
    remoteVideo: {
      ...StyleSheet.absoluteFill,
    },
    localVideoContainer: {
      position: 'absolute',
      top: topPadding + 44,
      right: 18,
      width: 110,
      height: 156,
      borderRadius: 16,
      overflow: 'hidden',
      zIndex: 10,
      borderWidth: 2,
      borderColor: 'rgba(255,255,255,0.3)',
      backgroundColor: '#1A2730',
      ...shadow,
    },
    localVideo: {
      width: '100%',
      height: '100%',
    },
    scrim: {
      ...StyleSheet.absoluteFill,
      backgroundColor: 'rgba(5,10,16,0.32)',
    },
    videoScrim: {
      ...StyleSheet.absoluteFill,
      backgroundColor: 'rgba(0,0,0,0.38)',
    },
    content: {
      flex: 1,
      paddingHorizontal: 20,
      paddingTop: topPadding,
      paddingBottom: bottomPadding,
      justifyContent: 'space-between',
      zIndex: 15,
    },
    topline: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    callTypeBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 20,
      backgroundColor: 'rgba(0,0,0,0.45)',
      maxWidth: '65%',
    },
    callTypeText: {
      ...typography.bodyMedium,
      color: '#fff',
      fontSize: 13,
      fontWeight: '600',
      flexShrink: 1,
    },
    statusBadge: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 20,
      backgroundColor: 'rgba(0,0,0,0.32)',
    },
    statusText: {
      ...typography.caption,
      color: 'rgba(255,255,255,0.85)',
      fontSize: 12,
    },
    peer: {
      alignItems: 'center',
      gap: 10,
      paddingVertical: 20,
    },
    videoPeerCard: {
      backgroundColor: 'rgba(10,16,24,0.55)',
      borderRadius: 24,
      paddingHorizontal: 28,
      paddingVertical: 20,
      alignSelf: 'center',
      maxWidth: '85%',
    },
    peerName: {
      ...typography.heading,
      color: '#fff',
      fontSize: 22,
      fontWeight: '700',
      textAlign: 'center',
    },
    peerStatus: {
      ...typography.body,
      color: 'rgba(255,255,255,0.78)',
      fontSize: 14,
      textAlign: 'center',
    },
    error: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: 'rgba(229,57,53,0.92)',
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 10,
      marginHorizontal: 12,
    },
    errorText: {
      ...typography.caption,
      color: '#fff',
      fontSize: 12,
      textAlign: 'center',
      flexShrink: 1,
    },
    incomingControls: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      alignItems: 'center',
      paddingHorizontal: 30,
    },
    controlsRow: {
      flexDirection: 'row',
      justifyContent: 'space-evenly',
      alignItems: 'center',
      paddingHorizontal: 10,
    },
  });
}
