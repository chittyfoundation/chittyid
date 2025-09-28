export class RealtimeKitService {
  constructor(config) {
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
    this.sfuUrl = config.sfuUrl || 'wss://sfu.realtimekit.io';
    this.sessions = new Map();
    this.peers = new Map();
  }

  async createRoom(roomId, options = {}) {
    const room = {
      id: roomId,
      created: new Date().toISOString(),
      participants: [],
      config: {
        maxParticipants: options.maxParticipants || 10,
        enableVideo: options.enableVideo ?? true,
        enableAudio: options.enableAudio ?? true,
        recordingEnabled: options.recordingEnabled ?? false,
        streamingEnabled: options.streamingEnabled ?? false
      }
    };

    this.sessions.set(roomId, room);
    return room;
  }

  async joinRoom(roomId, userId, userMetadata = {}) {
    const room = this.sessions.get(roomId);
    if (!room) {
      throw new Error(`Room ${roomId} not found`);
    }

    if (room.participants.length >= room.config.maxParticipants) {
      throw new Error('Room is full');
    }

    const participant = {
      id: userId,
      joinedAt: new Date().toISOString(),
      metadata: userMetadata,
      tracks: {
        audio: null,
        video: null,
        screen: null
      }
    };

    room.participants.push(participant);
    this.peers.set(userId, { roomId, participant });

    return {
      room,
      participant,
      token: this.generateToken(roomId, userId)
    };
  }

  async leaveRoom(roomId, userId) {
    const room = this.sessions.get(roomId);
    if (!room) return;

    room.participants = room.participants.filter(p => p.id !== userId);
    this.peers.delete(userId);

    if (room.participants.length === 0) {
      this.sessions.delete(roomId);
    }
  }

  async publishTrack(roomId, userId, trackType, track) {
    const peer = this.peers.get(userId);
    if (!peer || peer.roomId !== roomId) {
      throw new Error('User not in room');
    }

    peer.participant.tracks[trackType] = {
      id: `${userId}-${trackType}-${Date.now()}`,
      type: trackType,
      enabled: true,
      publishedAt: new Date().toISOString()
    };

    this.broadcastToRoom(roomId, {
      type: 'track-published',
      userId,
      trackType,
      trackId: peer.participant.tracks[trackType].id
    }, userId);

    return peer.participant.tracks[trackType];
  }

  async unpublishTrack(roomId, userId, trackType) {
    const peer = this.peers.get(userId);
    if (!peer || peer.roomId !== roomId) {
      throw new Error('User not in room');
    }

    peer.participant.tracks[trackType] = null;

    this.broadcastToRoom(roomId, {
      type: 'track-unpublished',
      userId,
      trackType
    }, userId);
  }

  async muteTrack(roomId, userId, trackType, muted) {
    const peer = this.peers.get(userId);
    if (!peer || peer.roomId !== roomId) {
      throw new Error('User not in room');
    }

    if (peer.participant.tracks[trackType]) {
      peer.participant.tracks[trackType].enabled = !muted;

      this.broadcastToRoom(roomId, {
        type: 'track-muted',
        userId,
        trackType,
        muted
      }, userId);
    }
  }

  getRoomParticipants(roomId) {
    const room = this.sessions.get(roomId);
    return room ? room.participants : [];
  }

  getRoomInfo(roomId) {
    return this.sessions.get(roomId);
  }

  broadcastToRoom(roomId, message, excludeUserId = null) {
    const room = this.sessions.get(roomId);
    if (!room) return;

    room.participants.forEach(participant => {
      if (participant.id !== excludeUserId) {
        this.sendToParticipant(participant.id, message);
      }
    });
  }

  sendToParticipant(userId, message) {
    console.log(`Sending to ${userId}:`, message);
  }

  generateToken(roomId, userId) {
    const payload = {
      roomId,
      userId,
      iat: Date.now(),
      exp: Date.now() + 3600000
    };
    return btoa(JSON.stringify(payload));
  }

  validateToken(token) {
    try {
      const payload = JSON.parse(atob(token));
      if (payload.exp < Date.now()) {
        throw new Error('Token expired');
      }
      return payload;
    } catch (error) {
      throw new Error('Invalid token');
    }
  }
}

export class RealtimeKitClient {
  constructor(config) {
    this.config = config;
    this.ws = null;
    this.pc = null;
    this.localStream = null;
    this.remoteStreams = new Map();
    this.callbacks = new Map();
  }

  async connect(roomId, token) {
    this.ws = new WebSocket(`${this.config.sfuUrl}/rooms/${roomId}?token=${token}`);

    this.ws.onopen = () => {
      console.log('Connected to RealtimeKit SFU');
      this.emit('connected');
    };

    this.ws.onmessage = async (event) => {
      const message = JSON.parse(event.data);
      await this.handleMessage(message);
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      this.emit('error', error);
    };

    this.ws.onclose = () => {
      console.log('Disconnected from RealtimeKit SFU');
      this.emit('disconnected');
      this.cleanup();
    };

    await this.setupPeerConnection();
  }

  async setupPeerConnection() {
    this.pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.send({
          type: 'ice-candidate',
          candidate: event.candidate
        });
      }
    };

    this.pc.ontrack = (event) => {
      const [stream] = event.streams;
      const userId = event.track.id.split('-')[0];
      this.remoteStreams.set(userId, stream);
      this.emit('track-added', { userId, stream, track: event.track });
    };
  }

  async publishLocalStream(constraints = { video: true, audio: true }) {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);

      this.localStream.getTracks().forEach(track => {
        this.pc.addTrack(track, this.localStream);
      });

      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);

      this.send({
        type: 'offer',
        sdp: offer
      });

      return this.localStream;
    } catch (error) {
      console.error('Failed to publish local stream:', error);
      throw error;
    }
  }

  async unpublishLocalStream() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        track.stop();
        const sender = this.pc.getSenders().find(s => s.track === track);
        if (sender) {
          this.pc.removeTrack(sender);
        }
      });
      this.localStream = null;
    }
  }

  muteTrack(trackType) {
    if (this.localStream) {
      const tracks = trackType === 'audio'
        ? this.localStream.getAudioTracks()
        : this.localStream.getVideoTracks();

      tracks.forEach(track => {
        track.enabled = false;
      });

      this.send({
        type: 'track-muted',
        trackType,
        muted: true
      });
    }
  }

  unmuteTrack(trackType) {
    if (this.localStream) {
      const tracks = trackType === 'audio'
        ? this.localStream.getAudioTracks()
        : this.localStream.getVideoTracks();

      tracks.forEach(track => {
        track.enabled = true;
      });

      this.send({
        type: 'track-muted',
        trackType,
        muted: false
      });
    }
  }

  async handleMessage(message) {
    switch (message.type) {
      case 'answer':
        await this.pc.setRemoteDescription(new RTCSessionDescription(message.sdp));
        break;

      case 'ice-candidate':
        await this.pc.addIceCandidate(new RTCIceCandidate(message.candidate));
        break;

      case 'participant-joined':
        this.emit('participant-joined', message);
        break;

      case 'participant-left':
        this.remoteStreams.delete(message.userId);
        this.emit('participant-left', message);
        break;

      case 'track-published':
      case 'track-unpublished':
      case 'track-muted':
        this.emit(message.type, message);
        break;
    }
  }

  send(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  on(event, callback) {
    if (!this.callbacks.has(event)) {
      this.callbacks.set(event, []);
    }
    this.callbacks.get(event).push(callback);
  }

  emit(event, data) {
    const callbacks = this.callbacks.get(event) || [];
    callbacks.forEach(callback => callback(data));
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
    }
    this.cleanup();
  }

  cleanup() {
    this.unpublishLocalStream();
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    this.remoteStreams.clear();
  }
}

export default {
  RealtimeKitService,
  RealtimeKitClient
};