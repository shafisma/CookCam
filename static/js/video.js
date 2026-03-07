import { STATE } from './state.js';

/**
 * Webcam setup — returns true if camera started, false if unavailable
 */
export async function startWebcam() {
    try {
        const video = document.getElementById('webcam');
        STATE.videoStream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 768 },
                height: { ideal: 768 },
                facingMode: 'environment',
            },
            audio: false,
        });
        video.srcObject = STATE.videoStream;
        await video.play();

        document.getElementById('videoPlaceholder').classList.add('hidden');
        document.getElementById('cameraBadge').style.display = 'flex';
        return true;
    } catch (err) {
        console.warn('[CookCam] Camera not available:', err.message);
        STATE.videoStream = null;
        STATE.isCameraOn = false;
        return false;
    }
}

/**
 * Start video frame capture loop
 */
export function startVideoCapture() {
    const video = document.getElementById('webcam');
    const canvas = document.getElementById('captureCanvas');
    const ctx = canvas.getContext('2d');

    canvas.width = 768;
    canvas.height = 768;

    STATE.frameInterval = setInterval(() => {
        if (!STATE.isConnected || !STATE.isCameraOn) return;
        if (video.readyState < 2) return;

        const vw = video.videoWidth;
        const vh = video.videoHeight;
        const size = Math.min(vw, vh);
        const sx = (vw - size) / 2;
        const sy = (vh - size) / 2;

        ctx.drawImage(video, sx, sy, size, size, 0, 0, 768, 768);
        const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.6);
        const base64 = jpegDataUrl.split(',')[1];

        if (STATE.ws && STATE.ws.readyState === WebSocket.OPEN) {
            STATE.ws.send(JSON.stringify({ type: 'video', data: base64 }));
        }
    }, 1000);
}
