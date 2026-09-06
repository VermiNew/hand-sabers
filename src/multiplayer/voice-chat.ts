import type { RoomSnapshot, VoiceSignal } from './protocol.ts';

interface VoiceChatOptions {
  getCurrentPlayerId(): string;
  sendSignal(targetPlayerId: string, signal: VoiceSignal): boolean;
  onStateChange(state: 'off' | 'starting' | 'on' | 'error'): void;
  onSpeakingChange(playerId: string, speaking: boolean): void;
}

interface PeerState {
  connection: RTCPeerConnection;
  makingOffer: boolean;
  ignoreOffer: boolean;
  polite: boolean;
}

interface SpeakingMonitor {
  stream: MediaStream;
  source: MediaStreamAudioSourceNode;
  animationFrame: number;
  speaking: boolean;
}

export interface VoiceChatController {
  enable(): Promise<void>;
  disable(): void;
  handleSignal(fromPlayerId: string, signal: VoiceSignal): Promise<void>;
  setRoom(snapshot: RoomSnapshot | null): void;
  isEnabled(): boolean;
}

export function createVoiceChat({
  getCurrentPlayerId,
  sendSignal,
  onStateChange,
  onSpeakingChange,
}: VoiceChatOptions): VoiceChatController {
  const peers = new Map<string, PeerState>();
  const remoteAudio = new Map<string, HTMLAudioElement>();
  const speakingMonitors = new Map<string, SpeakingMonitor>();
  let roomPlayers = new Set<string>();
  let localStream: MediaStream | null = null;
  let enabled = false;
  let starting = false;
  let enableGeneration = 0;
  let audioContext: AudioContext | null = null;

  const stopSpeakingMonitor = (playerId: string) => {
    const monitor = speakingMonitors.get(playerId);
    if (!monitor) return;
    cancelAnimationFrame(monitor.animationFrame);
    monitor.source.disconnect();
    if (monitor.speaking) onSpeakingChange(playerId, false);
    speakingMonitors.delete(playerId);
  };

  const monitorSpeaking = (playerId: string, stream: MediaStream) => {
    const existing = speakingMonitors.get(playerId);
    if (existing?.stream === stream) return;
    stopSpeakingMonitor(playerId);
    if (!audioContext) return;
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.35;
    source.connect(analyser);
    const levels = new Uint8Array(analyser.fftSize);
    let lastActiveAt = Number.NEGATIVE_INFINITY;
    const monitor: SpeakingMonitor = { stream, source, animationFrame: 0, speaking: false };
    const sample = () => {
      analyser.getByteTimeDomainData(levels);
      let energy = 0;
      for (const level of levels) {
        const centered = (level - 128) / 128;
        energy += centered * centered;
      }
      const now = performance.now();
      if (Math.sqrt(energy / levels.length) >= 0.025) lastActiveAt = now;
      const speaking = now - lastActiveAt < 180;
      if (speaking !== monitor.speaking) {
        monitor.speaking = speaking;
        onSpeakingChange(playerId, speaking);
      }
      monitor.animationFrame = requestAnimationFrame(sample);
    };
    speakingMonitors.set(playerId, monitor);
    sample();
  };

  const closePeer = (playerId: string) => {
    const peer = peers.get(playerId);
    if (peer) {
      peer.connection.onicecandidate = null;
      peer.connection.onnegotiationneeded = null;
      peer.connection.ontrack = null;
      peer.connection.onconnectionstatechange = null;
      peer.connection.close();
      peers.delete(playerId);
    }
    const audio = remoteAudio.get(playerId);
    if (audio) {
      audio.pause();
      audio.srcObject = null;
      audio.remove();
      remoteAudio.delete(playerId);
    }
    stopSpeakingMonitor(playerId);
  };

  const sendDescription = (playerId: string, description: RTCSessionDescription | null): void => {
    if (!description?.type || !description.sdp) return;
    if (description.type !== 'offer' && description.type !== 'answer') return;
    sendSignal(playerId, { type: description.type, sdp: description.sdp });
  };

  const attachRemoteAudio = (playerId: string, stream: MediaStream): void => {
    let audio = remoteAudio.get(playerId);
    if (!audio) {
      audio = document.createElement('audio');
      audio.autoplay = true;
      audio.setAttribute('playsinline', '');
      audio.hidden = true;
      audio.dataset['voicePlayerId'] = playerId;
      document.body.append(audio);
      remoteAudio.set(playerId, audio);
    }
    if (audio.srcObject !== stream) audio.srcObject = stream;
    monitorSpeaking(playerId, stream);
    void audio.play().catch(() => undefined);
  };

  const ensurePeer = (playerId: string): PeerState | null => {
    const selfId = getCurrentPlayerId();
    if (!enabled || !localStream || !selfId || playerId === selfId || !roomPlayers.has(playerId)) return null;
    const existing = peers.get(playerId);
    if (existing) return existing;

    const connection = new RTCPeerConnection({ iceServers: [] });
    const peer: PeerState = {
      connection,
      makingOffer: false,
      ignoreOffer: false,
      polite: selfId.localeCompare(playerId) > 0,
    };
    peers.set(playerId, peer);
    for (const track of localStream.getAudioTracks()) connection.addTrack(track, localStream);

    connection.onicecandidate = event => {
      if (!event.candidate) return;
      sendSignal(playerId, {
        type: 'ice',
        candidate: event.candidate.candidate,
        sdpMid: event.candidate.sdpMid,
        sdpMLineIndex: event.candidate.sdpMLineIndex,
      });
    };
    connection.ontrack = event => {
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      attachRemoteAudio(playerId, stream);
    };
    connection.onnegotiationneeded = async () => {
      try {
        peer.makingOffer = true;
        await connection.setLocalDescription();
        sendDescription(playerId, connection.localDescription);
      } catch (error) {
        console.error('[multiplayer:voice-negotiation]', error);
      } finally {
        peer.makingOffer = false;
      }
    };
    connection.onconnectionstatechange = () => {
      if (connection.connectionState === 'failed' || connection.connectionState === 'closed') closePeer(playerId);
    };
    return peer;
  };

  const disable = (): void => {
    enableGeneration++;
    starting = false;
    enabled = false;
    for (const playerId of [...peers.keys()]) closePeer(playerId);
    for (const track of localStream?.getTracks() ?? []) track.stop();
    localStream = null;
    for (const playerId of [...speakingMonitors.keys()]) stopSpeakingMonitor(playerId);
    if (audioContext) void audioContext.close().catch(() => undefined);
    audioContext = null;
    onStateChange('off');
  };

  return {
    async enable(): Promise<void> {
      if (enabled || starting) return;
      const generation = ++enableGeneration;
      starting = true;
      onStateChange('starting');
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
        if (generation !== enableGeneration) {
          for (const track of stream.getTracks()) track.stop();
          return;
        }
        localStream = stream;
        audioContext = new AudioContext();
        await audioContext.resume();
        starting = false;
        enabled = true;
        onStateChange('on');
        const selfId = getCurrentPlayerId();
        if (selfId) monitorSpeaking(selfId, stream);
        for (const playerId of roomPlayers) {
          if (playerId !== selfId) ensurePeer(playerId);
        }
      } catch (error) {
        if (generation !== enableGeneration) return;
        console.error('[multiplayer:voice-microphone]', error);
        for (const track of localStream?.getTracks() ?? []) track.stop();
        localStream = null;
        if (audioContext) void audioContext.close().catch(() => undefined);
        audioContext = null;
        starting = false;
        enabled = false;
        onStateChange('error');
        throw error;
      }
    },

    disable,

    async handleSignal(fromPlayerId: string, signal: VoiceSignal): Promise<void> {
      const peer = ensurePeer(fromPlayerId);
      if (!peer) return;
      const { connection } = peer;
      try {
        if (signal.type === 'ice') {
          try {
            await connection.addIceCandidate({
              candidate: signal.candidate,
              sdpMid: signal.sdpMid,
              sdpMLineIndex: signal.sdpMLineIndex,
            });
          } catch (error) {
            if (!peer.ignoreOffer) throw error;
          }
          return;
        }

        const offerCollision = signal.type === 'offer'
          && (peer.makingOffer || connection.signalingState !== 'stable');
        peer.ignoreOffer = !peer.polite && offerCollision;
        if (peer.ignoreOffer) return;
        await connection.setRemoteDescription({ type: signal.type, sdp: signal.sdp });
        if (signal.type === 'offer') {
          await connection.setLocalDescription();
          sendDescription(fromPlayerId, connection.localDescription);
        }
      } catch (error) {
        console.error('[multiplayer:voice-signal]', error);
      }
    },

    setRoom(snapshot: RoomSnapshot | null): void {
      const selfId = getCurrentPlayerId();
      roomPlayers = new Set(snapshot?.players.map(player => player.id) ?? []);
      for (const playerId of [...peers.keys()]) {
        if (!roomPlayers.has(playerId)) closePeer(playerId);
      }
      if (!snapshot) {
        disable();
        return;
      }
      if (enabled) {
        for (const playerId of roomPlayers) {
          if (playerId !== selfId) ensurePeer(playerId);
        }
      }
    },

    isEnabled(): boolean {
      return enabled;
    },
  };
}
