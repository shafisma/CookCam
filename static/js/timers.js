import { STATE } from './state.js';

/**
 * Timer management — countdown timers with audio alerts
 */
const TIMER_INTERVALS = {};

export function createTimer(id, label, durationSeconds) {
    const timer = {
        id,
        label,
        totalSeconds: durationSeconds,
        remainingSeconds: durationSeconds,
        isRunning: true,
        isComplete: false,
    };

    STATE.activeTimers[id] = timer;
    renderTimers();

    TIMER_INTERVALS[id] = setInterval(() => {
        timer.remainingSeconds--;
        if (timer.remainingSeconds <= 0) {
            timer.remainingSeconds = 0;
            timer.isRunning = false;
            timer.isComplete = true;
            clearInterval(TIMER_INTERVALS[id]);
            delete TIMER_INTERVALS[id];
            playTimerAlarm();
        }
        renderTimers();
    }, 1000);
}

export function dismissTimer(id) {
    if (TIMER_INTERVALS[id]) {
        clearInterval(TIMER_INTERVALS[id]);
        delete TIMER_INTERVALS[id];
    }
    delete STATE.activeTimers[id];
    renderTimers();
}

export function clearAllTimers() {
    Object.keys(TIMER_INTERVALS).forEach(id => {
        clearInterval(TIMER_INTERVALS[id]);
    });
    Object.keys(STATE.activeTimers).forEach(id => delete STATE.activeTimers[id]);
    renderTimers();
}

export function renderTimers() {
    const container = document.getElementById('timersContainer');
    if (!container) return;

    const timers = Object.values(STATE.activeTimers);
    if (timers.length === 0) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'flex';
    container.innerHTML = timers.map(t => {
        const mins = Math.floor(t.remainingSeconds / 60);
        const secs = t.remainingSeconds % 60;
        const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;
        const pct = ((t.totalSeconds - t.remainingSeconds) / t.totalSeconds) * 100;

        return `
            <div class="timer-card ${t.isComplete ? 'timer-complete' : ''}" data-timer-id="${t.id}">
                <div class="timer-info">
                    <span class="timer-icon">${t.isComplete ? '🔔' : '⏲️'}</span>
                    <span class="timer-label">${escapeHtml(t.label)}</span>
                </div>
                <div class="timer-display">
                    <div class="timer-progress-bar">
                        <div class="timer-progress-fill" style="width:${pct}%"></div>
                    </div>
                    <span class="timer-time ${t.isComplete ? 'timer-done' : ''}">${t.isComplete ? 'DONE!' : timeStr}</span>
                </div>
                <button class="timer-dismiss" onclick="window._dismissTimer('${t.id}')" aria-label="Dismiss timer ${escapeHtml(t.label)}">&times;</button>
            </div>`;
    }).join('');
}

function playTimerAlarm() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        for (let i = 0; i < 3; i++) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = 880;
            osc.type = 'sine';
            gain.gain.value = 0.3;
            const t = ctx.currentTime + i * 0.4;
            osc.start(t);
            osc.stop(t + 0.2);
            gain.gain.setValueAtTime(0.3, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
        }
    } catch (e) {
        console.warn('Could not play timer alarm:', e);
    }
}

function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
}

window._dismissTimer = dismissTimer;
