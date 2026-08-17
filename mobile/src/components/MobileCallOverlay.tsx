import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Camera, CameraOff, Mic, MicOff, Phone, PhoneOff, SwitchCamera, Video } from 'lucide-react-native';
import { RTCView } from 'react-native-webrtc';
import { useCallStore } from '../store/callStore';
import { colors, shadow } from '../theme/colors';
import { typography } from '../theme/typography';
import { Avatar } from './Avatar';

function formatDuration(startedAt: number, now: number) {
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function MobileCallOverlay() {
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
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!call) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [call]);

  const status = useMemo(() => {
    if (!call) return '';
    if (call.phase === 'incoming') return `${call.audioOnly ? 'Cuộc gọi thoại' : 'Cuộc gọi video'} đến`;
    if (call.phase === 'preparing') return 'Đang mở thiết bị...';
    if (call.phase === 'calling') return 'Đang gọi...';
    if (call.phase === 'ringing') return 'Đang đổ chuông...';
    if (call.phase === 'connecting') return 'Đang kết nối...';
    if (call.phase === 'reconnecting') return 'Đang khôi phục kết nối...';
    return formatDuration(startedAt, now);
  }, [call, now, startedAt]);

  if (!call) return null;
  const remoteUrl = remoteStream?.toURL?.();
  const localUrl = localStream?.toURL?.();
  const incoming = call.phase === 'incoming';

  return (
    <View style={styles.overlay}>
      <View style={[styles.sheet, !call.audioOnly && styles.videoSheet]}>
        {!call.audioOnly && remoteUrl ? <RTCView streamURL={remoteUrl} objectFit="cover" style={styles.remoteVideo} /> : null}
        {!call.audioOnly && localUrl && cameraEnabled ? <RTCView streamURL={localUrl} mirror objectFit="cover" style={styles.localVideo} /> : null}
        <View style={styles.scrim} />
        <View style={styles.content}>
          <View style={styles.topline}><Text style={styles.callType}><Video color="#fff" size={16} /> {call.audioOnly ? 'Gọi thoại' : 'Gọi video'}</Text><Text style={styles.status}>{status}</Text></View>
          {!remoteUrl || call.audioOnly ? <View style={styles.peer}><Avatar name={call.peerName} uri={call.peerAvatar} size={92} online /><Text style={styles.peerName}>{call.peerName}</Text><Text style={styles.peerStatus}>{status}</Text></View> : <View style={styles.videoPeer}><Text style={styles.peerName}>{call.peerName}</Text></View>}
          {error ? <Pressable onPress={clearError} style={styles.error}><Text style={styles.errorText}>{error}</Text></Pressable> : null}
          {incoming ? (
            <View style={styles.controls}><CallButton icon={PhoneOff} danger label="Từ chối" onPress={reject} /><CallButton icon={call.audioOnly ? Phone : Video} accept label="Nhận" onPress={() => void accept()} /></View>
          ) : (
            <View style={styles.controls}>
              <CallButton icon={microphoneEnabled ? Mic : MicOff} disabled={!localStream} label={microphoneEnabled ? 'Tắt mic' : 'Bật mic'} onPress={toggleMicrophone} />
              {!call.audioOnly ? <CallButton icon={cameraEnabled ? Camera : CameraOff} disabled={!localStream} label={cameraEnabled ? 'Tắt cam' : 'Bật cam'} onPress={toggleCamera} /> : null}
              {!call.audioOnly ? <CallButton icon={SwitchCamera} disabled={!cameraEnabled} label="Đổi cam" onPress={switchCamera} /> : null}
              <CallButton icon={PhoneOff} danger label="Kết thúc" onPress={hangUp} />
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

function CallButton({ icon: Icon, label, onPress, danger = false, accept = false, disabled = false }: { icon: any; label: string; onPress: () => void; danger?: boolean; accept?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityLabel={label} disabled={disabled} onPress={onPress} style={[styles.button, danger && styles.dangerButton, accept && styles.acceptButton, disabled && styles.disabled]}><Icon color="#fff" size={21} /><Text style={styles.buttonLabel}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  // Incoming calls must remain actionable even when the optional PIN gate is visible.
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(7,12,16,0.72)', justifyContent: 'flex-end', zIndex: 1100 },
  sheet: { minHeight: 430, borderTopLeftRadius: 30, borderTopRightRadius: 30, overflow: 'hidden', backgroundColor: '#142027', ...shadow },
  videoSheet: { minHeight: '100%' },
  remoteVideo: { ...StyleSheet.absoluteFill },
  localVideo: { position: 'absolute', top: 58, right: 18, width: 112, height: 158, borderRadius: 18, zIndex: 2, backgroundColor: '#283840' },
  scrim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(4,10,14,0.38)' },
  content: { flex: 1, minHeight: 430, paddingHorizontal: 22, paddingTop: 21, paddingBottom: 28, justifyContent: 'space-between', zIndex: 3 },
  topline: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  callType: { ...typography.bodyMedium, color: '#fff', flexDirection: 'row', alignItems: 'center' },
  status: { ...typography.caption, color: 'rgba(255,255,255,0.75)' },
  peer: { alignItems: 'center', gap: 9 },
  peerName: { ...typography.heading, color: '#fff', textAlign: 'center' },
  peerStatus: { ...typography.body, color: 'rgba(255,255,255,0.75)' },
  videoPeer: { marginTop: 'auto', marginBottom: 20 },
  error: { backgroundColor: 'rgba(214,69,69,0.9)', borderRadius: 13, padding: 10 },
  errorText: { ...typography.caption, color: '#fff', textAlign: 'center' },
  controls: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 10 },
  button: { minWidth: 76, minHeight: 62, borderRadius: 18, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 10, backgroundColor: 'rgba(255,255,255,0.18)' },
  dangerButton: { backgroundColor: colors.danger },
  acceptButton: { backgroundColor: colors.online },
  disabled: { opacity: 0.4 },
  buttonLabel: { ...typography.caption, color: '#fff', textAlign: 'center' },
});
