import { STATE } from './state.js';

/**
 * Audio Player (24kHz PCM Playback)
 */
export class AudioPlayer {
    constructor() {
        this.context = new (window.AudioContext || window.webkitAudioContext)({
            sampleRate: 24000,
        });
        this.nextStartTime = 0;
        this.sources = [];
        this.gainNode = this.context.createGain();
        this.gainNode.connect(this.context.destination);
        this.onSpeakingChange = null;
    }

    async resume() {
        if (this.context.state === 'suspended') {
            await this.context.resume();
        }
    }

    play(base64Data) {
        try {
            const raw = atob(base64Data);
            const bytes = new Uint8Array(raw.length);
            for (let i = 0; i < raw.length; i++) {
                bytes[i] = raw.charCodeAt(i);
            }
            const int16 = new Int16Array(bytes.buffer);
            const float32 = new Float32Array(int16.length);
            for (let i = 0; i < int16.length; i++) {
                float32[i] = int16[i] / 32768.0;
            }

            const buffer = this.context.createBuffer(1, float32.length, 24000);
            buffer.getChannelData(0).set(float32);

            const source = this.context.createBufferSource();
            source.buffer = buffer;
            source.connect(this.gainNode);

            const now = this.context.currentTime;
            const startTime = Math.max(now + 0.005, this.nextStartTime);
            source.start(startTime);
            this.nextStartTime = startTime + buffer.duration;

            this.sources.push(source);

            if (this.onSpeakingChange && !STATE.isAISpeaking) {
                this.onSpeakingChange(true);
            }

            source.onended = () => {
                const idx = this.sources.indexOf(source);
                if (idx > -1) this.sources.splice(idx, 1);
                if (this.sources.length === 0 && this.onSpeakingChange) {
                    this.onSpeakingChange(false);
                }
            };
        } catch (err) {
            console.error('Audio playback error:', err);
        }
    }

    clear() {
        this.sources.forEach((s) => {
            try { s.stop(); } catch (e) {}
        });
        this.sources = [];
        this.nextStartTime = this.context.currentTime;
        if (this.onSpeakingChange) {
            this.onSpeakingChange(false);
        }
    }

    async close() {
        this.clear();
        if (this.context.state !== 'closed') {
            await this.context.close();
        }
    }
}

/**
 * Microphone setup — returns true if mic started, false if unavailable
 */
export async function startMicrophone() {
    try {
        STATE.micStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
            },
        });

        STATE.micAudioContext = new (window.AudioContext || window.webkitAudioContext)();
        await STATE.micAudioContext.audioWorklet.addModule('/static/audio-processor.js');

        const source = STATE.micAudioContext.createMediaStreamSource(STATE.micStream);
        STATE.audioWorkletNode = new AudioWorkletNode(STATE.micAudioContext, 'pcm-processor');

        STATE.audioWorkletNode.port.onmessage = (event) => {
            if (!STATE.isConnected || !STATE.isMicOn) return;
            if (event.data.type === 'audio') {
                const pcmBuffer = new Uint8Array(event.data.data);
                if (STATE.ws && STATE.ws.readyState === WebSocket.OPEN) {
                    STATE.ws.send(pcmBuffer);
                }
            }
        };

        source.connect(STATE.audioWorkletNode);
        const silentGain = STATE.micAudioContext.createGain();
        silentGain.gain.value = 0;
        STATE.audioWorkletNode.connect(silentGain);
        silentGain.connect(STATE.micAudioContext.destination);
        return true;
    } catch (err) {
        console.warn('[CookCam] Microphone not available:', err.message);
        STATE.micStream = null;
        STATE.isMicOn = false;
        return false;
    }
}
