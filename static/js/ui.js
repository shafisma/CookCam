import { STATE } from './state.js';

/* ─── Chat Messages ──────────────────────────────────────────────────── */

export function addMessage(type, text) {
    const container = document.getElementById('chatMessages');
    if (!container) return;
    const msg = document.createElement('div');
    msg.className = `message message-${type}`;
    msg.setAttribute('role', 'log');
    msg.textContent = text;
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;

    while (container.children.length > 200) {
        container.removeChild(container.firstChild);
    }
}

/* ─── Main UI Update ─────────────────────────────────────────────────── */

export function updateUI() {
    // Connection status
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    if (statusDot) statusDot.className = `status-dot ${STATE.isConnected ? 'connected' : ''}`;
    if (statusText) statusText.textContent = STATE.isConnected ? 'Connected' : 'Disconnected';

    // Buttons
    const btnStart = document.getElementById('btnStart');
    const btnStop = document.getElementById('btnStop');
    const btnMic = document.getElementById('btnMic');
    const btnCamera = document.getElementById('btnCamera');
    const divider1 = document.getElementById('divider1');
    const divider2 = document.getElementById('divider2');

    if (btnStart) {
        btnStart.disabled = STATE.isConnected;
        btnStart.style.display = STATE.isConnected ? 'none' : 'flex';
    }
    if (btnStop) {
        btnStop.disabled = !STATE.isConnected;
        btnStop.style.display = STATE.isConnected ? 'flex' : 'none';
    }
    if (btnMic) {
        btnMic.disabled = !STATE.isConnected;
        btnMic.classList.toggle('active', STATE.isMicOn && STATE.isConnected);
    }
    if (btnCamera) {
        btnCamera.disabled = !STATE.isConnected;
        btnCamera.classList.toggle('active', STATE.isCameraOn && STATE.isConnected);
    }
    if (divider1) divider1.style.display = STATE.isConnected ? 'block' : 'none';
    if (divider2) divider2.style.display = STATE.isConnected ? 'block' : 'none';

    // Video container glow
    const videoContainer = document.getElementById('videoContainer');
    if (videoContainer) videoContainer.classList.toggle('ai-speaking', STATE.isAISpeaking);

    // AI status pill
    const aiStatus = document.getElementById('aiStatus');
    const aiStatusText = document.getElementById('aiStatusText');
    if (aiStatus && aiStatusText) {
        if (STATE.isConnected) {
            aiStatus.classList.add('visible');
            if (STATE.isAISpeaking) {
                aiStatus.className = 'ai-status visible speaking';
                aiStatusText.textContent = '🔊 AI Speaking...';
            } else {
                aiStatus.className = 'ai-status visible listening';
                aiStatusText.textContent = '👂 Listening...';
            }
        } else {
            aiStatus.classList.remove('visible');
        }
    }

    // Sound wave
    const soundWave = document.getElementById('soundWave');
    if (soundWave) soundWave.classList.toggle('active', STATE.isAISpeaking);

    // Loading overlay
    const loading = document.getElementById('loadingOverlay');
    if (loading) loading.style.display = STATE.isReconnecting ? 'flex' : 'none';

    // Skeleton
    const skeleton = document.getElementById('videoSkeleton');
    const placeholder = document.getElementById('videoPlaceholder');
    if (skeleton && placeholder) {
        if (STATE.isReconnecting) {
            skeleton.style.display = 'flex';
            placeholder.classList.add('hidden');
        } else if (!STATE.isConnected && !STATE.videoStream) {
            skeleton.style.display = 'none';
        }
    }

    // Chat input
    const chatInput = document.getElementById('chatInput');
    const chatSendBtn = document.getElementById('chatSendBtn');
    if (chatInput) chatInput.disabled = !STATE.isConnected;
    if (chatSendBtn) chatSendBtn.disabled = !STATE.isConnected;
}

/* ─── Step Tracker ───────────────────────────────────────────────────── */

export function renderStepTracker() {
    const el = document.getElementById('stepTracker');
    if (!el) return;
    const s = STATE.recipeSteps;

    if (!s || !s.steps || s.steps.length === 0) {
        el.style.display = 'none';
        return;
    }

    el.style.display = 'block';
    const title = document.getElementById('stepTrackerTitle');
    const progress = document.getElementById('stepTrackerProgress');
    const content = document.getElementById('stepTrackerContent');

    if (title) title.textContent = s.recipe_name;
    if (progress) progress.textContent = `Step ${s.current_step + 1} / ${s.steps.length}`;

    if (content) {
        content.innerHTML = s.steps.map((step, i) => {
            let cls = 'step-item';
            if (i < s.current_step) cls += ' step-done';
            else if (i === s.current_step) cls += ' step-active';
            return `<div class="${cls}">
                <span class="step-number">${i + 1}</span>
                <span class="step-text">${esc(step)}</span>
            </div>`;
        }).join('');
    }
}

/* ─── Ingredient Checklist ───────────────────────────────────────────── */

export function renderIngredientChecklist() {
    const el = document.getElementById('checklistContent');
    if (!el) return;
    const list = STATE.ingredientList;

    if (!list || !list.ingredients || list.ingredients.length === 0) {
        el.innerHTML = '<div class="empty-state">No ingredient list yet. Ask CookCam to suggest a recipe!</div>';
        return;
    }

    el.innerHTML = `
        <div class="checklist-recipe-name">${esc(list.recipe_name)}</div>
        <div class="checklist-items">
            ${list.ingredients.map((ing, i) => `
                <label class="checklist-item ${ing.checked ? 'checked' : ''}" data-idx="${i}">
                    <input type="checkbox" ${ing.checked ? 'checked' : ''} onchange="window._toggleIngredient(${i})" aria-label="${ing.name}">
                    <span class="checklist-amount">${esc(ing.amount)}</span>
                    <span class="checklist-name">${esc(ing.name)}</span>
                </label>
            `).join('')}
        </div>
    `;

    // Switch to checklist panel
    switchPanel('checklist');
}

/* ─── Nutritional Info ───────────────────────────────────────────────── */

export function renderNutritionalInfo(data) {
    const container = document.getElementById('chatMessages');
    if (!container || !data) return;

    const card = document.createElement('div');
    card.className = 'message nutrition-card';
    card.setAttribute('role', 'article');
    card.innerHTML = `
        <div class="nutrition-header">
            <span>🥗</span>
            <strong>${esc(data.dish_name)}</strong>
            ${data.servings ? `<span class="nutrition-servings">(per serving, ${data.servings} servings)</span>` : ''}
        </div>
        <div class="nutrition-grid">
            <div class="nutrition-item"><span class="nutrition-val">${data.calories}</span><span class="nutrition-label">Calories</span></div>
            <div class="nutrition-item"><span class="nutrition-val">${data.protein}g</span><span class="nutrition-label">Protein</span></div>
            <div class="nutrition-item"><span class="nutrition-val">${data.carbs}g</span><span class="nutrition-label">Carbs</span></div>
            <div class="nutrition-item"><span class="nutrition-val">${data.fat}g</span><span class="nutrition-label">Fat</span></div>
            ${data.fiber ? `<div class="nutrition-item"><span class="nutrition-val">${data.fiber}g</span><span class="nutrition-label">Fiber</span></div>` : ''}
        </div>
        <div class="nutrition-note">⚠️ Estimates only — actual values may vary.</div>
    `;
    container.appendChild(card);
    container.scrollTop = container.scrollHeight;
}

/* ─── Panel Switching ────────────────────────────────────────────────── */

export function switchPanel(name) {
    document.querySelectorAll('.panel-tab').forEach(t => t.classList.toggle('active', t.dataset.panel === name));
    document.querySelectorAll('.panel-content').forEach(p => p.classList.toggle('active', p.dataset.panel === name));
}

export function initPanelTabs() {
    document.querySelectorAll('.panel-tab').forEach(tab => {
        tab.addEventListener('click', () => switchPanel(tab.dataset.panel));
    });
}

/* ─── Helpers ────────────────────────────────────────────────────────── */

function esc(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
}

window._toggleIngredient = function (idx) {
    if (STATE.ingredientList && STATE.ingredientList.ingredients[idx] !== undefined) {
        STATE.ingredientList.ingredients[idx].checked = !STATE.ingredientList.ingredients[idx].checked;
        renderIngredientChecklist();
    }
};
