import { create } from 'zustand';
import type { MediaStream, RTCIceCandidate as RTCIceCandidateType, RTCPeerConnection as RTCPeerConnectionType } from 'react-native-webrtc';
import { tinodeClient, CALL_SIGNAL_EVENTS } from '../services/tinodeClient';
import type { MobileCallSignalEvent } from '../services/tinodeClient';

export type MobileCallPhase = 'incoming' | 'preparing' | 'calling' | 'ringing' | 'connecting' | 'connected' | 'reconnecting';

export interface MobileCallPeer {
  name?: string;
  avatar?: string;
}

export interface MobileCall {
  id: string;
  topic: string;
  seq: number;
  direction: 'incoming' | 'outgoing';
  audioOnly: boolean;
  peerName: string;
  peerAvatar: string;
  phase: MobileCallPhase;
}

interface CallState {
  call: MobileCall | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  microphoneEnabled: boolean;
  cameraEnabled: boolean;
  error: string;
  startCall: (topic: string, audioOnly: boolean, peer?: MobileCallPeer) => Promise<void>;
  handleInvite: (event: { topic: string; seq: number; from: string; audioOnly: boolean }, peer?: MobileCallPeer) => void;
  handleSignal: (event: MobileCallSignalEvent) => void;
  accept: () => Promise<void>;
  reject: () => void;
  hangUp: () => void;
  toggleMicrophone: () => void;
  toggleCamera: () => void;
  switchCamera: () => void;
  clearError: () => void;
}

let peerConnection: RTCPeerConnectionType | null = null;
let localStream: MediaStream | null = null;
let remoteCandidates: RTCIceCandidateType[] = [];
let tracksAttached = false;
let offerStarted = false;
let answerStarted = false;
let remoteAnswerSet = false;
let setupTimer: ReturnType<typeof setTimeout> | null = null;
let disconnectTimer: ReturnType<typeof setTimeout> | null = null;
let durationTimer: ReturnType<typeof setInterval> | null = null;
let webrtcModule: typeof import('react-native-webrtc') | null = null;

function getWebRtc() {
  if (!webrtcModule) webrtcModule = require('react-native-webrtc');
  return webrtcModule as typeof import('react-native-webrtc');
}

function clearTimers() {
  if (setupTimer) clearTimeout(setupTimer);
  if (disconnectTimer) clearTimeout(disconnectTimer);
  if (durationTimer) clearInterval(durationTimer);
  setupTimer = null;
  disconnectTimer = null;
  durationTimer = null;
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks?.().forEach(track => track.stop());
  stream?.release?.();
}

function displayPeer(peer?: MobileCallPeer) {
  return {
    peerName: String(peer?.name || 'Người dùng'),
    peerAvatar: String(peer?.avatar || ''),
  };
}

export const useCallStore = create<CallState>((set, get) => {
  const clearCall = () => {
    clearTimers();
    peerConnection?.close?.();
    peerConnection = null;
    stopStream(localStream);
    localStream = null;
    remoteCandidates = [];
    tracksAttached = false;
    offerStarted = false;
    answerStarted = false;
    remoteAnswerSet = false;
    set({ call: null, localStream: null, remoteStream: null, microphoneEnabled: true, cameraEnabled: false });
  };

  const closeCall = (notifyRemote = true) => {
    const call = get().call;
    if (notifyRemote && call?.seq) {
      void tinodeClient.sendCallSignal(call.topic, call.seq, CALL_SIGNAL_EVENTS.HANG_UP).catch(() => {});
    }
    clearCall();
  };

  const failCall = (error: unknown, notifyRemote = true) => {
    set({ error: error instanceof Error ? error.message : 'Cuộc gọi không thể kết nối.' });
    closeCall(notifyRemote);
  };

  const getLocalMedia = async (call: MobileCall) => {
    if (localStream) return localStream;
    const media = getWebRtc().mediaDevices;
    const stream = await media.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: call.audioOnly ? false : { facingMode: 'user', width: 1280, height: 720 },
    } as any);
    localStream = stream;
    set({
      localStream: stream,
      microphoneEnabled: stream.getAudioTracks()[0]?.enabled !== false,
      cameraEnabled: Boolean(stream.getVideoTracks()[0]?.enabled),
    });
    return stream;
  };

  const drainCandidates = async () => {
    const connection = peerConnection;
    if (!connection?.remoteDescription) return;
    const pending = remoteCandidates.splice(0);
    for (const candidate of pending) await connection.addIceCandidate(candidate).catch(() => {});
  };

  const markConnected = () => {
    clearTimeout(disconnectTimer || undefined);
    disconnectTimer = null;
    set(state => state.call ? { call: { ...state.call, phase: 'connected' } } : state);
  };

  const createPeer = () => {
    if (peerConnection) return peerConnection;
    const PeerConnection = getWebRtc().RTCPeerConnection;
    const connection = new PeerConnection({ iceServers: tinodeClient.getCallIceServers() as any });
    (connection as any).onicecandidate = (event: any) => {
      const call = get().call;
      if (!event?.candidate || !call?.seq) return;
      void tinodeClient.sendCallSignal(call.topic, call.seq, CALL_SIGNAL_EVENTS.ICE_CANDIDATE, event.candidate.toJSON?.() || event.candidate).catch(error => failCall(error));
    };
    (connection as any).ontrack = (event: any) => {
      const stream = event?.streams?.[0];
      if (stream) set({ remoteStream: stream });
    };
    const connectionStateChanged = () => {
      const state = connection.connectionState || connection.iceConnectionState;
      if (state === 'connected' || connection.iceConnectionState === 'connected' || connection.iceConnectionState === 'completed') markConnected();
      else if (state === 'disconnected') {
        set(previous => previous.call ? { call: { ...previous.call, phase: 'reconnecting' } } : previous);
        if (!disconnectTimer) disconnectTimer = setTimeout(() => closeCall(true), 10000);
      } else if (state === 'failed' || state === 'closed') closeCall(state === 'failed');
    };
    (connection as any).onconnectionstatechange = connectionStateChanged;
    (connection as any).oniceconnectionstatechange = connectionStateChanged;
    peerConnection = connection;
    return connection;
  };

  const attachTracks = (connection: RTCPeerConnectionType, stream: MediaStream) => {
    if (tracksAttached) return;
    stream.getTracks().forEach(track => connection.addTrack(track, stream));
    tracksAttached = true;
  };

  const createOffer = async () => {
    const call = get().call;
    if (!call || call.direction !== 'outgoing' || offerStarted) return;
    offerStarted = true;
    try {
      set({ call: { ...call, phase: 'connecting' } });
      const stream = await getLocalMedia(call);
      const connection = createPeer();
      attachTracks(connection, stream);
      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      await tinodeClient.sendCallSignal(call.topic, call.seq, CALL_SIGNAL_EVENTS.OFFER, connection.localDescription?.toJSON?.() || offer);
    } catch (error) {
      failCall(error);
    }
  };

  const handleOffer = async (payload: any) => {
    const call = get().call;
    if (!call || call.direction !== 'incoming' || answerStarted) return;
    answerStarted = true;
    try {
      set({ call: { ...call, phase: 'connecting' } });
      const stream = await getLocalMedia(call);
      const connection = createPeer();
      await connection.setRemoteDescription(new (getWebRtc().RTCSessionDescription)(payload));
      attachTracks(connection, stream);
      await drainCandidates();
      const answer = await connection.createAnswer();
      await connection.setLocalDescription(answer);
      await tinodeClient.sendCallSignal(call.topic, call.seq, CALL_SIGNAL_EVENTS.ANSWER, connection.localDescription?.toJSON?.() || answer);
    } catch (error) {
      failCall(error);
    }
  };

  const handleAnswer = async (payload: any) => {
    if (remoteAnswerSet || !peerConnection) return;
    remoteAnswerSet = true;
    try {
      const connection = peerConnection;
      if (!connection) return;
      await connection.setRemoteDescription(new (getWebRtc().RTCSessionDescription)(payload));
      await drainCandidates();
    } catch (error) {
      failCall(error);
    }
  };

  const handleCandidate = async (payload: any) => {
    if (!payload) return;
    const candidate = new (getWebRtc().RTCIceCandidate)(payload);
    const connection = peerConnection;
    if (!connection?.remoteDescription) {
      remoteCandidates.push(candidate);
      return;
    }
    await connection.addIceCandidate(candidate).catch(error => failCall(error));
  };

  const startTimeout = () => {
    clearTimeout(setupTimer || undefined);
    setupTimer = setTimeout(() => closeCall(true), 40000);
  };

  return {
    call: null,
    localStream: null,
    remoteStream: null,
    microphoneEnabled: true,
    cameraEnabled: false,
    error: '',

    async startCall(topic, audioOnly, peer) {
      if (get().call) return;
      const capability = tinodeClient.getCallCapability(topic, { isGroup: false, isChatbot: false });
      if (!capability.available) throw new Error(capability.reason);
      const call: MobileCall = {
        id: `${topic}:outgoing:${Date.now()}`,
        topic,
        seq: 0,
        direction: 'outgoing',
        audioOnly: Boolean(audioOnly),
        ...displayPeer(peer),
        phase: 'preparing',
      };
      set({ call, error: '' });
      startTimeout();
      try {
        await getLocalMedia(call);
        const result = await tinodeClient.startCall(topic, audioOnly);
        set(state => state.call ? { call: { ...state.call, seq: result.seq, phase: 'calling' } } : state);
      } catch (error) {
        failCall(error, false);
        throw error;
      }
    },

    handleInvite(event, peer) {
      if (!event.seq) return;
      if (get().call) {
        void tinodeClient.sendCallSignal(event.topic, event.seq, CALL_SIGNAL_EVENTS.HANG_UP).catch(() => {});
        return;
      }
      const call: MobileCall = {
        id: `${event.topic}:${event.seq}`,
        topic: event.topic,
        seq: event.seq,
        direction: 'incoming',
        audioOnly: Boolean(event.audioOnly),
        ...displayPeer(peer),
        phase: 'incoming',
      };
      set({ call, error: '' });
      startTimeout();
      void tinodeClient.sendCallSignal(event.topic, event.seq, CALL_SIGNAL_EVENTS.RINGING).catch(error => failCall(error));
    },

    handleSignal(event) {
      const call = get().call;
      if (!call || event.topic !== call.topic || (call.seq && event.seq && call.seq !== event.seq)) return;
      if (event.viaMe && event.from === tinodeClient.currentUserId && event.event === CALL_SIGNAL_EVENTS.ACCEPT && call.direction === 'incoming') {
        closeCall(false);
        return;
      }
      if (event.event === CALL_SIGNAL_EVENTS.RINGING && call.direction === 'outgoing') {
        set({ call: { ...call, phase: 'ringing' } });
      } else if (event.event === CALL_SIGNAL_EVENTS.ACCEPT && call.direction === 'outgoing') {
        void createOffer();
      } else if (event.event === CALL_SIGNAL_EVENTS.OFFER) {
        void handleOffer(event.payload);
      } else if (event.event === CALL_SIGNAL_EVENTS.ANSWER) {
        void handleAnswer(event.payload);
      } else if (event.event === CALL_SIGNAL_EVENTS.ICE_CANDIDATE) {
        void handleCandidate(event.payload);
      } else if (event.event === CALL_SIGNAL_EVENTS.HANG_UP) {
        closeCall(false);
      }
    },

    async accept() {
      const call = get().call;
      if (!call || call.direction !== 'incoming') return;
      try {
        set({ call: { ...call, phase: 'preparing' }, error: '' });
        await getLocalMedia(call);
        await tinodeClient.sendCallSignal(call.topic, call.seq, CALL_SIGNAL_EVENTS.ACCEPT);
        set(state => state.call ? { call: { ...state.call, phase: 'connecting' } } : state);
      } catch (error) {
        failCall(error);
      }
    },

    reject() { closeCall(true); },
    hangUp() { closeCall(true); },

    toggleMicrophone() {
      const track = localStream?.getAudioTracks?.()[0];
      if (!track) return;
      track.enabled = !track.enabled;
      set({ microphoneEnabled: track.enabled });
    },

    toggleCamera() {
      const track = localStream?.getVideoTracks?.()[0];
      if (!track) return;
      track.enabled = !track.enabled;
      set({ cameraEnabled: track.enabled });
    },

    switchCamera() {
      localStream?.getVideoTracks?.()[0]?._switchCamera?.();
    },

    clearError() { set({ error: '' }); },
  };
});

export function routeMobileCallEvent(event: MobileCallSignalEvent | { type: 'call-invite'; topic: string; seq: number; from: string; audioOnly: boolean }, peer?: MobileCallPeer) {
  if (event.type === 'call-invite') useCallStore.getState().handleInvite(event, peer);
  else useCallStore.getState().handleSignal(event);
}
