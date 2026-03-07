/**
 * AudioWorklet Processor for CookCam
 * Captures microphone audio, downsamples to 16kHz, converts to Int16 PCM
 */
class PCMProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.buffer = [];
        // Accumulate ~100ms of audio before sending
        // At 48kHz source: 4800 samples → ~1600 samples at 16kHz
        this.targetSamples = Math.floor(sampleRate * 0.1);
    }

    process(inputs) {
        const input = inputs[0];
        if (!input || input.length === 0) return true;

        const channelData = input[0]; // Mono channel
        if (!channelData) return true;

        // Accumulate samples
        for (let i = 0; i < channelData.length; i++) {
            this.buffer.push(channelData[i]);
        }

        // When we have enough samples, downsample and send
        if (this.buffer.length >= this.targetSamples) {
            const ratio = sampleRate / 16000;
            const outputLength = Math.floor(this.buffer.length / ratio);
            const int16 = new Int16Array(outputLength);

            for (let i = 0; i < outputLength; i++) {
                const srcIdx = Math.min(
                    Math.floor(i * ratio),
                    this.buffer.length - 1
                );
                const sample = Math.max(-1, Math.min(1, this.buffer[srcIdx]));
                int16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
            }

            this.port.postMessage(
                { type: 'audio', data: int16.buffer },
                [int16.buffer]
            );

            this.buffer = [];
        }

        return true;
    }
}

registerProcessor('pcm-processor', PCMProcessor);
