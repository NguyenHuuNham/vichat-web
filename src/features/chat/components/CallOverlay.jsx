import React, { useCallback, useEffect, useRef, useState } from 'react';

import { tinodeClient, normalizeTinodeMediaUrl } from '../services/tinodeClient';
import {
  CALL_SIGNAL_EVENTS,
  formatCallDuration,
  isAnsweredElsewhereSignal,
  normalizeCallCandidate,
  normalizeCallDescription,
} from '../services/callSignaling';

const CALL_SETUP_TIMEOUT_MS = 40000;
const CALL_DISCONNECT_TIMEOUT_MS = 10000;

function mediaErrorMessage(error) {
  if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') {
    return 'Cần cho phép trình duyệt sử dụng micro và camera để bắt đầu cuộc gọi.';
  }
  if (error?.name === 'NotFoundError') return 'Không tìm thấy micro hoặc camera phù hợp.';
  if (error?.name === 'NotReadableError') return 'Micro hoặc camera đang được ứng dụng khác sử dụng.';
  return error?.message || 'Không thể khởi tạo cuộc gọi WebRTC.';
}

function stopStream(stream) {
  stream?.getTracks?.().forEach(track => {
    track.enabled = false;
    track.stop();
  });
}

function CallAvatar({ src, name }) {
  const [failed, setFailed] = useState(false);
  const [resolvedSrc, setResolvedSrc] = useState('');
  const [mediaVersion, setMediaVersion] = useState(() => tinodeClient.getMediaVersion(src));
  const initials = String(name || 'VC')
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map(part => part[0])
    .join('')
    .toUpperCase();

  useEffect(() => {
    const normalizedSource = normalizeTinodeMediaUrl(src);
    return tinodeClient.onEvent(event => {
      if (event.type === 'media-invalidated' && event.url === normalizedSource) {
        setMediaVersion(tinodeClient.getMediaVersion(src));
      }
    });
  }, [src]);

  useEffect(() => {
    let active = true;
    setFailed(false);
    setResolvedSrc('');
    if (!src) return () => { active = false; };
    tinodeClient.resolveAvatarUrl(src)
      .then(url => {
        if (active) setResolvedSrc(url || '');
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => { active = false; };
  }, [src, mediaVersion]);

  if (!resolvedSrc || failed) return <span className="call-avatar-fallback">{initials || 'VC'}</span>;
  return <img src={resolvedSrc} alt={name || 'Người tham gia'} onError={() => setFailed(true)} />;
}

export default function CallOverlay({ call, onClose, onError }) {
  const [phase, setPhase] = useState(call.direction === 'incoming' ? 'incoming' : 'preparing');
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(!call.audioOnly);
  const [remoteVideoAvailable, setRemoteVideoAvailable] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [audioOutputSupported, setAudioOutputSupported] = useState(false);
  const [audioOutputDevices, setAudioOutputDevices] = useState([]);
  const [audioOutputId, setAudioOutputId] = useState('default');
  const [remoteAudioBlocked, setRemoteAudioBlocked] = useState(false);

  const localMediaRef = useRef(null);
  const remoteMediaRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const sequenceRef = useRef(Number(call.seq) || 0);
  const remoteCandidatesRef = useRef([]);
  const tracksAttachedRef = useRef(false);
  const startedRef = useRef(false);
  const offerStartedRef = useRef(false);
  const answerStartedRef = useRef(false);
  const remoteAnswerSetRef = useRef(false);
  const acceptingRef = useRef(false);
  const endingRef = useRef(false);
  const mountedRef = useRef(true);
  const lifecycleRef = useRef(0);
  const setupTimerRef = useRef(null);
  const disconnectTimerRef = useRef(null);
  const durationTimerRef = useRef(null);
  const connectedAtRef = useRef(0);
  const remotePlayRequestedRef = useRef(false);

  const clearTimers = useCallback(() => {
    clearTimeout(setupTimerRef.current);
    clearTimeout(disconnectTimerRef.current);
    clearInterval(durationTimerRef.current);
    setupTimerRef.current = null;
    disconnectTimerRef.current = null;
    durationTimerRef.current = null;
  }, []);

  const cleanupMedia = useCallback(() => {
    clearTimers();
    const pc = peerConnectionRef.current;
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pc.oniceconnectionstatechange = null;
      pc.close();
    }
    peerConnectionRef.current = null;
    stopStream(localStreamRef.current);
    stopStream(remoteStreamRef.current);
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    remoteCandidatesRef.current = [];
    tracksAttachedRef.current = false;
    remotePlayRequestedRef.current = false;
    if (localMediaRef.current) localMediaRef.current.srcObject = null;
    if (remoteMediaRef.current) remoteMediaRef.current.srcObject = null;
  }, [clearTimers]);

  const closeCall = useCallback(({ notifyRemote = true, reason = '' } = {}) => {
    if (endingRef.current) return;
    endingRef.current = true;
    const seq = sequenceRef.current;
    if (notifyRemote && seq) {
      tinodeClient.sendCallSignal(call.topic, seq, CALL_SIGNAL_EVENTS.HANG_UP).catch(() => {});
    }
    cleanupMedia();
    onClose(reason);
  }, [call.topic, cleanupMedia, onClose]);

  const failCall = useCallback((error, notifyRemote = Boolean(sequenceRef.current)) => {
    if (endingRef.current) return;
    onError(mediaErrorMessage(error));
    closeCall({ notifyRemote, reason: 'error' });
  }, [closeCall, onError]);

  const playRemoteMedia = useCallback(async () => {
    const media = remoteMediaRef.current;
    if (!media?.play) return false;
    try {
      await media.play();
      if (mountedRef.current && !endingRef.current) setRemoteAudioBlocked(false);
      return true;
    } catch (error) {
      if (['AbortError', 'NotAllowedError'].includes(error?.name)) {
        if (remotePlayRequestedRef.current && mountedRef.current && !endingRef.current) setRemoteAudioBlocked(true);
        return false;
      }
      onError(error?.message || 'Không thể phát âm thanh cuộc gọi.');
      return false;
    }
  }, [onError]);

  const refreshAudioOutputs = useCallback(async () => {
    const media = remoteMediaRef.current;
    const supported = typeof media?.setSinkId === 'function';
    if (!mountedRef.current || endingRef.current) return;
    setAudioOutputSupported(supported);
    if (!supported || typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
      setAudioOutputDevices([]);
      return;
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      if (!mountedRef.current || endingRef.current) return;
      setAudioOutputDevices(devices.filter(device => device.kind === 'audiooutput' && device.deviceId));
    } catch {
      if (mountedRef.current && !endingRef.current) setAudioOutputDevices([]);
    }
  }, []);

  const changeAudioOutput = useCallback(async event => {
    const deviceId = event.target.value || 'default';
    const media = remoteMediaRef.current;
    if (!media || typeof media.setSinkId !== 'function') {
      remotePlayRequestedRef.current = true;
      await playRemoteMedia();
      return;
    }
    try {
      await media.setSinkId(deviceId);
      setAudioOutputId(deviceId);
      remotePlayRequestedRef.current = true;
      await playRemoteMedia();
    } catch (error) {
      onError(error?.message || 'Không thể chuyển sang thiết bị loa đã chọn.');
    }
  }, [onError, playRemoteMedia]);

  useEffect(() => {
    void refreshAudioOutputs();
    const mediaDevices = typeof navigator === 'undefined' ? null : navigator.mediaDevices;
    const handleDeviceChange = () => { void refreshAudioOutputs(); };
    mediaDevices?.addEventListener?.('devicechange', handleDeviceChange);
    return () => mediaDevices?.removeEventListener?.('devicechange', handleDeviceChange);
  }, [refreshAudioOutputs]);

  const getLocalMedia = useCallback(async () => {
    if (localStreamRef.current) return localStreamRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: call.audioOnly ? false : {
        facingMode: 'user',
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    });
    if (!mountedRef.current || endingRef.current) {
      stopStream(stream);
      throw new Error('Cuộc gọi đã kết thúc.');
    }
    localStreamRef.current = stream;
    if (localMediaRef.current) {
      localMediaRef.current.srcObject = stream;
      const playback = localMediaRef.current.play?.();
      playback?.catch?.(() => {});
    }
    setMicrophoneEnabled(stream.getAudioTracks()[0]?.enabled !== false);
    setCameraEnabled(Boolean(stream.getVideoTracks()[0]?.enabled));
    void refreshAudioOutputs();
    return stream;
  }, [call.audioOnly, refreshAudioOutputs]);

  const drainRemoteCandidates = useCallback(async () => {
    const pc = peerConnectionRef.current;
    if (!pc?.remoteDescription) return;
    const candidates = remoteCandidatesRef.current.splice(0);
    for (const candidate of candidates) {
      await pc.addIceCandidate(candidate).catch(error => {
        if (candidate.candidate) onError(error?.message || 'Không thể thêm ICE candidate.');
      });
    }
  }, [onError]);

  const markConnected = useCallback(() => {
    clearTimeout(setupTimerRef.current);
    clearTimeout(disconnectTimerRef.current);
    setupTimerRef.current = null;
    disconnectTimerRef.current = null;
    if (!connectedAtRef.current) connectedAtRef.current = Date.now();
    if (mountedRef.current && !endingRef.current) setPhase('connected');
    if (!durationTimerRef.current) {
      durationTimerRef.current = setInterval(() => {
        if (mountedRef.current && !endingRef.current) {
          setElapsedMs(Date.now() - connectedAtRef.current);
        }
      }, 1000);
    }
  }, []);

  const createPeerConnection = useCallback(() => {
    if (peerConnectionRef.current) return peerConnectionRef.current;
    const pc = new RTCPeerConnection({ iceServers: tinodeClient.getCallIceServers() });
    pc.onicecandidate = event => {
      if (!event.candidate || !sequenceRef.current) return;
      tinodeClient.sendCallSignal(
        call.topic,
        sequenceRef.current,
        CALL_SIGNAL_EVENTS.ICE_CANDIDATE,
        event.candidate.toJSON(),
      ).catch(error => onError(error?.message || 'Không thể gửi ICE candidate.'));
    };
    pc.ontrack = event => {
      const eventStream = event.streams?.[0];
      let stream = remoteStreamRef.current || eventStream;
      if (!stream && typeof globalThis.MediaStream === 'function') {
        stream = new globalThis.MediaStream();
      }
      if (!stream) return;

      const addTrack = track => {
        const currentTracks = stream.getTracks?.() || [];
        if (!track || currentTracks.some(existing => existing.id === track.id)) return;
        try { stream.addTrack?.(track); } catch { /* stream may be read-only in older browsers */ }
      };
      if (eventStream && stream !== eventStream) (eventStream.getTracks?.() || []).forEach(addTrack);
      addTrack(event.track);
      remoteStreamRef.current = stream;
      if (remoteMediaRef.current && remoteMediaRef.current.srcObject !== stream) {
        remoteMediaRef.current.srcObject = stream;
      }
      const updateRemoteVideo = () => {
        if (!mountedRef.current || endingRef.current) return;
        setRemoteVideoAvailable((stream.getVideoTracks?.() || []).some(track => (
          track.readyState === 'live' && !track.muted
        )));
      };
      (stream.getVideoTracks?.() || []).forEach(track => {
        track.onmute = updateRemoteVideo;
        track.onunmute = updateRemoteVideo;
        track.onended = updateRemoteVideo;
      });
      updateRemoteVideo();
      void playRemoteMedia();
    };
    const handleConnectionState = () => {
      const connectionState = pc.connectionState;
      const iceState = pc.iceConnectionState;
      if (['connected', 'completed'].includes(connectionState) || ['connected', 'completed'].includes(iceState)) {
        markConnected();
      } else if (connectionState === 'disconnected' || iceState === 'disconnected') {
        if (mountedRef.current && !endingRef.current) setPhase('reconnecting');
        clearTimeout(disconnectTimerRef.current);
        disconnectTimerRef.current = setTimeout(() => {
          closeCall({ notifyRemote: true, reason: 'disconnected' });
        }, CALL_DISCONNECT_TIMEOUT_MS);
      } else if (['failed', 'closed'].includes(connectionState) || ['failed', 'closed'].includes(iceState)) {
        const failed = connectionState === 'failed' || iceState === 'failed';
        closeCall({ notifyRemote: failed, reason: failed ? 'failed' : 'closed' });
      }
    };
    pc.onconnectionstatechange = handleConnectionState;
    pc.oniceconnectionstatechange = handleConnectionState;
    peerConnectionRef.current = pc;
    return pc;
  }, [call.topic, closeCall, markConnected, onError, playRemoteMedia]);

  const attachLocalTracks = useCallback((pc, stream) => {
    if (tracksAttachedRef.current) return;
    stream.getTracks().forEach(track => pc.addTrack(track, stream));
    tracksAttachedRef.current = true;
  }, []);

  const handleAccepted = useCallback(async () => {
    if (call.direction !== 'outgoing' || endingRef.current || offerStartedRef.current) return;
    offerStartedRef.current = true;
    try {
      setPhase('connecting');
      const stream = await getLocalMedia();
      const pc = createPeerConnection();
      attachLocalTracks(pc, stream);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await tinodeClient.sendCallSignal(
        call.topic,
        sequenceRef.current,
        CALL_SIGNAL_EVENTS.OFFER,
        pc.localDescription.toJSON(),
      );
    } catch (error) {
      failCall(error);
    }
  }, [attachLocalTracks, call.direction, call.topic, createPeerConnection, failCall, getLocalMedia]);

  const handleOffer = useCallback(async payload => {
    if (call.direction !== 'incoming' || endingRef.current || answerStartedRef.current) return;
    answerStartedRef.current = true;
    try {
      setPhase('connecting');
      const stream = await getLocalMedia();
      const pc = createPeerConnection();
      const offer = normalizeCallDescription(payload, 'offer');
      if (!offer) throw new Error('SDP cuộc gọi đến không hợp lệ.');
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      attachLocalTracks(pc, stream);
      await drainRemoteCandidates();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await tinodeClient.sendCallSignal(
        call.topic,
        sequenceRef.current,
        CALL_SIGNAL_EVENTS.ANSWER,
        pc.localDescription.toJSON(),
      );
    } catch (error) {
      failCall(error);
    }
  }, [attachLocalTracks, call.direction, call.topic, createPeerConnection, drainRemoteCandidates, failCall, getLocalMedia]);

  const handleAnswer = useCallback(async payload => {
    const pc = peerConnectionRef.current;
    if (call.direction !== 'outgoing' || !pc || endingRef.current || remoteAnswerSetRef.current) return;
    remoteAnswerSetRef.current = true;
    try {
      const answer = normalizeCallDescription(payload, 'answer');
      if (!answer) throw new Error('SDP trả lời cuộc gọi không hợp lệ.');
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
      await drainRemoteCandidates();
    } catch (error) {
      failCall(error);
    }
  }, [call.direction, drainRemoteCandidates, failCall]);

  const handleCandidate = useCallback(async payload => {
    if (!payload || endingRef.current) return;
    try {
      const candidatePayload = normalizeCallCandidate(payload);
      if (!candidatePayload) throw new Error('ICE candidate không hợp lệ.');
      const candidate = new RTCIceCandidate(candidatePayload);
      const pc = peerConnectionRef.current;
      if (!pc?.remoteDescription) {
        remoteCandidatesRef.current.push(candidate);
        return;
      }
      await pc.addIceCandidate(candidate).catch(error => {
        if (candidate.candidate) onError(error?.message || 'Không thể thêm ICE candidate.');
      });
    } catch (error) {
      onError(error?.message || 'ICE candidate không hợp lệ.');
    }
  }, [onError]);

  useEffect(() => tinodeClient.onEvent(event => {
    if (event.type !== 'call-signal' || event.topic !== call.topic) return;
    if (event.seq && sequenceRef.current && Number(event.seq) !== sequenceRef.current) return;
    if (!sequenceRef.current && event.seq) sequenceRef.current = Number(event.seq);
    if (isAnsweredElsewhereSignal(event, call.direction, tinodeClient.currentUserId)) {
      closeCall({ notifyRemote: false, reason: 'answered-elsewhere' });
      return;
    }
    if (event.event === CALL_SIGNAL_EVENTS.RINGING && call.direction === 'outgoing') {
      setPhase('ringing');
    } else if (event.event === CALL_SIGNAL_EVENTS.ACCEPT) {
      handleAccepted();
    } else if (event.event === CALL_SIGNAL_EVENTS.OFFER) {
      handleOffer(event.payload);
    } else if (event.event === CALL_SIGNAL_EVENTS.ANSWER) {
      handleAnswer(event.payload);
    } else if (event.event === CALL_SIGNAL_EVENTS.ICE_CANDIDATE) {
      handleCandidate(event.payload);
    } else if (event.event === CALL_SIGNAL_EVENTS.HANG_UP) {
      closeCall({ notifyRemote: false, reason: 'remote' });
    }
  }), [call.direction, call.topic, closeCall, handleAccepted, handleAnswer, handleCandidate, handleOffer]);

  useEffect(() => {
    mountedRef.current = true;
    if (startedRef.current) return undefined;
    startedRef.current = true;
    setupTimerRef.current = setTimeout(() => {
      closeCall({ notifyRemote: true, reason: 'timeout' });
    }, CALL_SETUP_TIMEOUT_MS);

    if (call.direction === 'incoming') {
      tinodeClient.sendCallSignal(call.topic, sequenceRef.current, CALL_SIGNAL_EVENTS.RINGING).catch(failCall);
      return undefined;
    }

    remotePlayRequestedRef.current = true;
    getLocalMedia()
      .then(() => tinodeClient.startCall(call.topic, call.audioOnly))
      .then(result => {
        sequenceRef.current = result.seq;
        if (mountedRef.current && !endingRef.current) {
          setPhase(previous => ['preparing', 'calling'].includes(previous) ? 'calling' : previous);
        }
      })
      .catch(error => failCall(error, false));
    return undefined;
  }, [call.audioOnly, call.direction, call.topic, closeCall, failCall, getLocalMedia]);

  const finalizeUnmount = useCallback(lifecycle => {
    if (lifecycleRef.current !== lifecycle) return;
    if (!endingRef.current && sequenceRef.current) {
      tinodeClient.sendCallSignal(call.topic, sequenceRef.current, CALL_SIGNAL_EVENTS.HANG_UP).catch(() => {});
    }
    cleanupMedia();
  }, [call.topic, cleanupMedia]);

  useEffect(() => {
    const lifecycle = ++lifecycleRef.current;
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      queueMicrotask(() => finalizeUnmount(lifecycle));
    };
  }, [finalizeUnmount]);

  const acceptIncomingCall = async () => {
    if (acceptingRef.current || endingRef.current) return;
    acceptingRef.current = true;
    try {
      setPhase('preparing');
      remotePlayRequestedRef.current = true;
      await getLocalMedia();
      await tinodeClient.sendCallSignal(call.topic, sequenceRef.current, CALL_SIGNAL_EVENTS.ACCEPT);
      setPhase('connecting');
    } catch (error) {
      failCall(error);
    }
  };

  const toggleMicrophone = () => {
    const track = localStreamRef.current?.getAudioTracks?.()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMicrophoneEnabled(track.enabled);
  };

  const toggleCamera = () => {
    const track = localStreamRef.current?.getVideoTracks?.()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setCameraEnabled(track.enabled);
  };

  const statusLabel = phase === 'incoming'
    ? `${call.audioOnly ? 'Cuộc gọi thoại' : 'Cuộc gọi video'} đến`
    : phase === 'preparing' ? 'Đang mở thiết bị...'
      : phase === 'calling' ? 'Đang gọi...'
        : phase === 'ringing' ? 'Đang đổ chuông...'
          : phase === 'connecting' ? 'Đang kết nối...'
            : phase === 'reconnecting' ? 'Đang khôi phục kết nối...'
              : formatCallDuration(elapsedMs);
  const showActiveControls = !['incoming', 'preparing'].includes(phase) || call.direction === 'outgoing';

  return (
    <div className="call-overlay" role="dialog" aria-modal="true" aria-label={call.audioOnly ? 'Cuộc gọi thoại' : 'Cuộc gọi video'}>
      <section className={`call-shell ${call.audioOnly ? 'audio-only' : 'video-call'}`}>
        <div className="call-remote-stage">
          <video
            ref={remoteMediaRef}
            className={remoteVideoAvailable && !call.audioOnly ? 'visible' : ''}
            autoPlay
            playsInline
            onLoadedMetadata={() => { void playRemoteMedia(); }}
            onCanPlay={() => { void playRemoteMedia(); }}
          />
          {remoteAudioBlocked && (
            <button
              type="button"
              className="call-audio-unlock"
              onClick={() => {
                remotePlayRequestedRef.current = true;
                void playRemoteMedia();
              }}
            >
              <i className="fa-solid fa-volume-high"></i>
              Bật âm thanh
            </button>
          )}
          {(!remoteVideoAvailable || call.audioOnly) && (
            <div className="call-peer-card">
              <div className="call-peer-avatar"><CallAvatar src={call.peerAvatar} name={call.peerName} /></div>
              <h2>{call.peerName || 'Người dùng'}</h2>
              <p>{statusLabel}</p>
            </div>
          )}
        </div>

        {!call.audioOnly && (
          <div className={`call-local-preview ${cameraEnabled ? '' : 'camera-off'}`}>
            <video ref={localMediaRef} autoPlay muted playsInline />
            {!cameraEnabled && <i className="fa-solid fa-video-slash"></i>}
            <span>Bạn</span>
          </div>
        )}

        <div className="call-topline">
          <span><i className={`fa-solid ${call.audioOnly ? 'fa-phone' : 'fa-video'}`}></i>{call.audioOnly ? 'Gọi thoại' : 'Gọi video'}</span>
          {phase === 'connected' && <time>{formatCallDuration(elapsedMs)}</time>}
        </div>

        <div className="call-controls">
          {phase === 'incoming' ? (
            <>
              <button type="button" className="call-control danger" onClick={() => closeCall({ notifyRemote: true, reason: 'declined' })} aria-label="Từ chối cuộc gọi">
                <i className="fa-solid fa-phone-slash"></i>
              </button>
              <button type="button" className="call-control accept" onClick={acceptIncomingCall} aria-label="Nhận cuộc gọi">
                <i className={`fa-solid ${call.audioOnly ? 'fa-phone' : 'fa-video'}`}></i>
              </button>
            </>
          ) : (
            <>
              {showActiveControls && (
                <label
                  className={`call-output-control ${audioOutputSupported ? '' : 'unsupported'}`}
                  title={audioOutputSupported ? 'Chọn loa ngoài' : 'Trình duyệt đang dùng loa mặc định'}
                >
                  <i className="fa-solid fa-volume-high"></i>
                  <select
                    value={audioOutputId}
                    onChange={changeAudioOutput}
                    disabled={!audioOutputSupported}
                    aria-label="Chọn loa ngoài"
                  >
                    <option value="default">Loa mặc định</option>
                    {audioOutputDevices
                      .filter(device => device.deviceId !== 'default')
                      .map((device, index) => (
                        <option key={device.deviceId} value={device.deviceId}>
                          {device.label || `Thiết bị loa ${index + 1}`}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              <button type="button" className={`call-control ${microphoneEnabled ? '' : 'disabled'}`} onClick={toggleMicrophone} disabled={!showActiveControls} aria-label={microphoneEnabled ? 'Tắt micro' : 'Bật micro'}>
                <i className={`fa-solid ${microphoneEnabled ? 'fa-microphone' : 'fa-microphone-slash'}`}></i>
              </button>
              {!call.audioOnly && (
                <button type="button" className={`call-control ${cameraEnabled ? '' : 'disabled'}`} onClick={toggleCamera} disabled={!showActiveControls} aria-label={cameraEnabled ? 'Tắt camera' : 'Bật camera'}>
                  <i className={`fa-solid ${cameraEnabled ? 'fa-video' : 'fa-video-slash'}`}></i>
                </button>
              )}
              <button type="button" className="call-control danger" onClick={() => closeCall({ notifyRemote: true, reason: 'local' })} aria-label="Kết thúc cuộc gọi">
                <i className="fa-solid fa-phone-slash"></i>
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
