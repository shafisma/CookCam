import { STATE, savePreferences } from './state.js';

/**
 * User Preferences — dietary, skill level, language, display mode
 */

const DIETARY_OPTIONS = [
    { id: 'vegetarian', label: '🥬 Vegetarian' },
    { id: 'vegan',      label: '🌱 Vegan' },
    { id: 'gluten-free',label: '🌾 Gluten-Free' },
    { id: 'dairy-free', label: '🥛 Dairy-Free' },
    { id: 'nut-free',   label: '🥜 Nut-Free' },
    { id: 'halal',      label: '☪️ Halal' },
    { id: 'kosher',     label: '✡️ Kosher' },
    { id: 'keto',       label: '🥑 Keto' },
    { id: 'low-sodium', label: '🧂 Low Sodium' },
];

const SKILL_LEVELS = [
    { id: 'beginner',     label: '🌱 Beginner',     desc: 'Detailed instructions & tips' },
    { id: 'intermediate', label: '👨‍🍳 Intermediate', desc: 'Balanced guidance' },
    { id: 'advanced',     label: '⭐ Advanced',      desc: 'Concise, expert-level' },
];

const LANGUAGES = [
    'English','Spanish','French','German','Italian','Portuguese',
    'Japanese','Korean','Chinese','Hindi','Arabic','Thai',
    'Vietnamese','Turkish','Russian','Dutch',
];

export function renderPreferencesPanel() {
    const el = document.getElementById('preferencesPanel');
    if (!el) return;

    el.innerHTML = `
        <div class="prefs-section">
            <h3 class="prefs-title">🍽️ Dietary Restrictions</h3>
            <div class="prefs-chip-grid" role="group" aria-label="Dietary restrictions">
                ${DIETARY_OPTIONS.map(d => `
                    <button class="prefs-chip ${STATE.preferences.dietary.includes(d.id) ? 'active' : ''}"
                            data-id="${d.id}" aria-pressed="${STATE.preferences.dietary.includes(d.id)}"
                            onclick="window._toggleDietary('${d.id}')">${d.label}</button>
                `).join('')}
            </div>
        </div>
        <div class="prefs-section">
            <h3 class="prefs-title">📊 Skill Level</h3>
            <div class="prefs-option-grid" role="radiogroup" aria-label="Skill level">
                ${SKILL_LEVELS.map(s => `
                    <button class="prefs-option ${STATE.preferences.skillLevel === s.id ? 'active' : ''}"
                            aria-pressed="${STATE.preferences.skillLevel === s.id}"
                            onclick="window._setSkill('${s.id}')">
                        <span class="prefs-option-label">${s.label}</span>
                        <span class="prefs-option-desc">${s.desc}</span>
                    </button>
                `).join('')}
            </div>
        </div>
        <div class="prefs-section">
            <h3 class="prefs-title">🌍 Language</h3>
            <select class="prefs-select" id="langSelect" aria-label="Language" onchange="window._setLang(this.value)">
                ${LANGUAGES.map(l => `<option value="${l}" ${STATE.preferences.language === l ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
        </div>
        <div class="prefs-section">
            <h3 class="prefs-title">🖥️ Display Mode</h3>
            <div class="prefs-option-grid" role="radiogroup" aria-label="Display mode">
                <button class="prefs-option ${STATE.preferences.displayMode === 'normal' ? 'active' : ''}"
                        onclick="window._setDisplay('normal')" aria-pressed="${STATE.preferences.displayMode === 'normal'}">
                    <span class="prefs-option-label">📱 Normal</span>
                    <span class="prefs-option-desc">Standard interface</span>
                </button>
                <button class="prefs-option ${STATE.preferences.displayMode === 'kitchen' ? 'active' : ''}"
                        onclick="window._setDisplay('kitchen')" aria-pressed="${STATE.preferences.displayMode === 'kitchen'}">
                    <span class="prefs-option-label">🍳 Kitchen Display</span>
                    <span class="prefs-option-desc">Large text, hands-free</span>
                </button>
            </div>
        </div>
        <div class="prefs-note">
            ⓘ Preferences apply on next session start.
        </div>
    `;
}

function toggleDietary(id) {
    const idx = STATE.preferences.dietary.indexOf(id);
    if (idx > -1) STATE.preferences.dietary.splice(idx, 1);
    else STATE.preferences.dietary.push(id);
    savePreferences();
    renderPreferencesPanel();
}

function setSkillLevel(level) {
    STATE.preferences.skillLevel = level;
    savePreferences();
    renderPreferencesPanel();
}

function setLanguage(lang) {
    STATE.preferences.language = lang;
    savePreferences();
}

function setDisplayMode(mode) {
    STATE.preferences.displayMode = mode;
    savePreferences();
    document.body.classList.toggle('kitchen-mode', mode === 'kitchen');
    renderPreferencesPanel();
}

export function toggleTheme() {
    STATE.preferences.theme = STATE.preferences.theme === 'dark' ? 'light' : 'dark';
    savePreferences();
    applyTheme();
}

export function applyTheme() {
    document.documentElement.setAttribute('data-theme', STATE.preferences.theme);
    const btn = document.getElementById('btnTheme');
    if (btn) btn.textContent = STATE.preferences.theme === 'dark' ? '🌙' : '☀️';
}

export function applyDisplayMode() {
    document.body.classList.toggle('kitchen-mode', STATE.preferences.displayMode === 'kitchen');
}

window._toggleDietary = toggleDietary;
window._setSkill = setSkillLevel;
window._setLang = setLanguage;
window._setDisplay = setDisplayMode;
