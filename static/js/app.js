import { STATE } from './state.js';
import { AudioPlayer, startMicrophone } from './audio.js';
import { startWebcam, startVideoCapture } from './video.js';
import { addMessage, updateUI, renderStepTracker, renderIngredientChecklist, renderNutritionalInfo, initPanelTabs, switchPanel } from './ui.js';
import { createTimer, clearAllTimers } from './timers.js';
import { addSavedRecipe, loadRecipeHistory, renderRecipeCard, renderRecipeHistory } from './recipes.js';
import { renderPreferencesPanel, toggleTheme, applyTheme, applyDisplayMode } from './preferences.js';

/**
 * WebSocket Connection — with init message and tool_ui handling
 */
function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = `${protocol}://${window.location.host}/ws`;

    STATE.ws = new WebSocket(wsUrl);

    STATE.ws.onopen = () => {
        console.log('[CookCam] WebSocket connected');
        STATE.reconnectAttempts = 0;
        STATE.isReconnecting = false;

        // Send init message with user preferences
        STATE.ws.send(JSON.stringify({
            type: 'init',
            preferences: STATE.preferences,
        }));
    };

    STATE.ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            switch (data.type) {
                case 'session_token':
                    STATE.sessionToken = data.token;
                    break;
                case 'status':
                    if (data.status === 'connected') {
                        STATE.isConnected = true;
                        updateUI();
                        addMessage('system', '🔗 Connected to CookCam AI — say hello!');
                    }
                    break;
                case 'audio':
                    STATE.audioPlayer.play(data.data);
                    break;
                case 'text':
                    addMessage('ai', data.text);
                    break;
                case 'interrupted':
                    STATE.audioPlayer.clear();
                    addMessage('system', '⏸️ AI interrupted — listening...');
                    break;
                case 'tool_ui':
                    handleToolUI(data);
                    break;
                case 'error':
                    addMessage('system', '❌ Error: ' + data.message);
                    break;
            }
        } catch (err) {
            console.error('[CookCam] Parse error:', err);
        }
    };

    STATE.ws.onclose = () => {
        const wasConnected = STATE.isConnected;
        STATE.isConnected = false;
        updateUI();
        if (wasConnected) {
            addMessage('system', '🔌 Disconnected');
            attemptReconnect();
        }
    };

    STATE.ws.onerror = (err) => {
        console.error('[CookCam] WebSocket error:', err);
    };
}

/**
 * Handle tool_ui messages from backend (Gemini function-call results)
 */
function handleToolUI(data) {
    const { tool, data: payload } = data;

    switch (tool) {
        case 'set_timer':
            createTimer(payload.id, payload.label, payload.duration_seconds);
            addMessage('system', `⏲️ Timer set: ${payload.label} (${formatDuration(payload.duration_seconds)})`);
            break;

        case 'save_recipe':
            addSavedRecipe(payload);
            renderRecipeCard(payload);
            addMessage('system', `📖 Recipe saved: ${payload.title}`);
            break;

        case 'set_recipe_steps':
            STATE.recipeSteps = {
                recipe_name: payload.recipe_name,
                steps: payload.steps,
                current_step: payload.current_step || 0,
            };
            renderStepTracker();
            addMessage('system', `📋 Recipe tracker: ${payload.recipe_name} (${payload.steps.length} steps)`);
            break;

        case 'update_current_step':
            if (STATE.recipeSteps) {
                STATE.recipeSteps.current_step = payload.step_index;
                renderStepTracker();
            }
            break;

        case 'generate_ingredient_list':
            STATE.ingredientList = {
                recipe_name: payload.recipe_name,
                ingredients: payload.ingredients.map(i => ({ ...i, checked: false })),
            };
            renderIngredientChecklist();
            addMessage('system', `✅ Ingredient checklist: ${payload.recipe_name} (${payload.ingredients.length} items)`);
            break;

        case 'nutritional_info':
            STATE.nutritionalInfo = payload;
            renderNutritionalInfo(payload);
            break;

        default:
            console.warn('[CookCam] Unknown tool_ui:', tool);
    }
}

/**
 * Auto-Reconnect with exponential backoff
 */
function attemptReconnect() {
    if (STATE.reconnectAttempts >= STATE.maxReconnectAttempts) {
        addMessage('system', '❌ Connection lost. Please refresh the page.');
        return;
    }

    STATE.reconnectAttempts++;
    STATE.isReconnecting = true;
    updateUI();

    const delay = Math.min(1000 * Math.pow(2, STATE.reconnectAttempts), 30000);
    addMessage('system', `🔄 Reconnecting in ${Math.round(delay / 1000)}s... (${STATE.reconnectAttempts}/${STATE.maxReconnectAttempts})`);

    setTimeout(() => {
        if (!STATE.isConnected) {
            connectWebSocket();
        }
    }, delay);
}

/**
 * Session Lifecycle
 */
async function startSession() {
    try {
        addMessage('system', '🔌 Initializing Session...');

        // Show skeleton loading
        const skeleton = document.getElementById('videoSkeleton');
        if (skeleton) skeleton.style.display = 'flex';

        STATE.audioPlayer = new AudioPlayer();
        STATE.audioPlayer.onSpeakingChange = (speaking) => {
            STATE.isAISpeaking = speaking;
            updateUI();
        };
        await STATE.audioPlayer.resume();

        // Try to start devices — continue even if they're unavailable
        const hasCamera = await startWebcam();
        const hasMic = await startMicrophone();

        if (!hasCamera && !hasMic) {
            addMessage('system', '⚠️ No camera or microphone detected — running in text-only mode. Use the chat input below to talk to CookCam.');
        } else if (!hasCamera) {
            addMessage('system', '⚠️ No camera detected — voice-only mode. You can also type in the chat.');
        } else if (!hasMic) {
            addMessage('system', '⚠️ No microphone detected — camera + text mode. Type messages in the chat.');
        }

        connectWebSocket();

        if (hasCamera) {
            startVideoCapture();
        }

        // Hide skeleton
        if (skeleton) skeleton.style.display = 'none';
    } catch (error) {
        addMessage('system', '❌ Failed: ' + error.message);
        const skeleton = document.getElementById('videoSkeleton');
        if (skeleton) skeleton.style.display = 'none';
    }
}

function stopSession() {
    if (STATE.ws) STATE.ws.close();
    if (STATE.frameInterval) clearInterval(STATE.frameInterval);
    if (STATE.videoStream) STATE.videoStream.getTracks().forEach(t => t.stop());
    if (STATE.micStream) STATE.micStream.getTracks().forEach(t => t.stop());
    if (STATE.micAudioContext) STATE.micAudioContext.close();
    if (STATE.audioPlayer) STATE.audioPlayer.close();

    STATE.isConnected = false;
    STATE.isAISpeaking = false;
    STATE.isReconnecting = false;
    STATE.reconnectAttempts = STATE.maxReconnectAttempts; // prevent auto-reconnect
    STATE.videoStream = null;

    document.getElementById('webcam').srcObject = null;
    document.getElementById('videoPlaceholder').classList.remove('hidden');
    document.getElementById('cameraBadge').style.display = 'none';

    // Clear step tracker
    STATE.recipeSteps = null;
    renderStepTracker();

    clearAllTimers();
    updateUI();
    addMessage('system', '👋 Session ended.');
}

function toggleMic() {
    STATE.isMicOn = !STATE.isMicOn;
    if (STATE.micStream) {
        STATE.micStream.getAudioTracks().forEach(track => (track.enabled = STATE.isMicOn));
    }
    updateUI();
}

function toggleCamera() {
    STATE.isCameraOn = !STATE.isCameraOn;
    if (STATE.videoStream) {
        STATE.videoStream.getVideoTracks().forEach(track => (track.enabled = STATE.isCameraOn));
    }
    updateUI();
}

/**
 * Text Chat — send typed messages
 */
function sendTextMessage() {
    const input = document.getElementById('chatInput');
    if (!input) return;
    const text = input.value.trim();
    if (!text || !STATE.isConnected || !STATE.ws) return;

    addMessage('user', text);
    STATE.ws.send(JSON.stringify({ type: 'text_message', text }));
    input.value = '';
}

/**
 * Utilities
 */
function formatDuration(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/**
 * Initialize
 */
document.addEventListener('DOMContentLoaded', () => {
    // Session controls
    document.getElementById('btnStart').addEventListener('click', startSession);
    document.getElementById('btnStop').addEventListener('click', stopSession);
    document.getElementById('btnMic').addEventListener('click', toggleMic);
    document.getElementById('btnCamera').addEventListener('click', toggleCamera);

    // Theme toggle
    const btnTheme = document.getElementById('btnTheme');
    if (btnTheme) btnTheme.addEventListener('click', toggleTheme);

    // Text chat input
    const chatInput = document.getElementById('chatInput');
    const chatSendBtn = document.getElementById('chatSendBtn');
    if (chatInput) {
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendTextMessage();
            }
        });
    }
    if (chatSendBtn) chatSendBtn.addEventListener('click', sendTextMessage);

    // Panel tabs (desktop side panel)
    initPanelTabs();

    // Mobile tab switching
    const mainContent = document.querySelector('.main-content');
    const tabBtns = document.querySelectorAll('.tab-btn');
    if (mainContent) mainContent.classList.add('show-video');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            mainContent.classList.remove('show-video', 'show-chat', 'show-recipes', 'show-settings');

            if (tab === 'video') {
                mainContent.classList.add('show-video');
            } else if (tab === 'recipes') {
                mainContent.classList.add('show-chat');
                switchPanel('recipes');
            } else if (tab === 'settings') {
                mainContent.classList.add('show-chat');
                switchPanel('settings');
            } else {
                mainContent.classList.add('show-chat');
                switchPanel('chat');
            }
        });
    });

    // Apply saved theme & display mode
    applyTheme();
    applyDisplayMode();

    // Render preferences panel
    renderPreferencesPanel();

    // Load recipe history
    loadRecipeHistory();
    renderRecipeHistory();

    // Register service worker for PWA
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/static/sw.js').catch(() => {});
    }

    updateUI();
});
