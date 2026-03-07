import { STATE } from './state.js';
import { addMessage } from './ui.js';

/**
 * Recipe history, sharing, and grocery list export
 */

export function addSavedRecipe(recipe) {
    // Avoid duplicates
    if (STATE.savedRecipes.find(r => r.id === recipe.id)) return;
    STATE.savedRecipes.push(recipe);
    try {
        localStorage.setItem('cookcam_recipes', JSON.stringify(STATE.savedRecipes));
    } catch (e) { /* quota exceeded */ }
    renderRecipeHistory();
}

export function loadRecipeHistory() {
    try {
        const saved = localStorage.getItem('cookcam_recipes');
        if (saved) STATE.savedRecipes = JSON.parse(saved);
    } catch (e) { /* corrupt data */ }

    // Also fetch from server and merge
    fetch('/api/recipes')
        .then(r => r.json())
        .then(data => {
            if (data.recipes) {
                const ids = new Set(STATE.savedRecipes.map(r => r.id));
                data.recipes.forEach(r => { if (!ids.has(r.id)) STATE.savedRecipes.push(r); });
                renderRecipeHistory();
            }
        })
        .catch(() => {});
}

export function renderRecipeHistory() {
    const container = document.getElementById('recipeHistoryList');
    if (!container) return;

    if (STATE.savedRecipes.length === 0) {
        container.innerHTML = '<div class="empty-state">No saved recipes yet. Ask CookCam to save a recipe!</div>';
        return;
    }

    container.innerHTML = STATE.savedRecipes.slice().reverse().map(r => `
        <div class="recipe-history-card" data-recipe-id="${r.id}">
            <div class="recipe-history-header">
                <span class="recipe-history-icon">🍽️</span>
                <div class="recipe-history-info">
                    <div class="recipe-history-title">${esc(r.title)}</div>
                    <div class="recipe-history-meta">
                        ${r.servings ? `👥 ${r.servings}` : ''}
                        ${r.prep_time_minutes ? ` · ⏱️ ${r.prep_time_minutes}m` : ''}
                        ${r.cook_time_minutes ? ` · 🔥 ${r.cook_time_minutes}m` : ''}
                    </div>
                </div>
            </div>
            <div class="recipe-history-actions">
                <button class="recipe-action-btn" onclick="window._viewRecipe('${r.id}')" title="View" aria-label="View recipe">📋</button>
                <button class="recipe-action-btn" onclick="window._shareRecipe('${r.id}')" title="Share" aria-label="Share recipe">📤</button>
                <button class="recipe-action-btn" onclick="window._exportGrocery('${r.id}')" title="Grocery list" aria-label="Export grocery list">🛒</button>
            </div>
        </div>
    `).join('');
}

export function renderRecipeCard(recipe) {
    const container = document.getElementById('chatMessages');
    if (!container) return;

    const card = document.createElement('div');
    card.className = 'message recipe-card';
    card.setAttribute('role', 'article');
    card.innerHTML = `
        <div class="recipe-card-header">
            <span class="recipe-card-icon">📖</span>
            <div>
                <div class="recipe-card-title">${esc(recipe.title)}</div>
                ${recipe.description ? `<div class="recipe-card-desc">${esc(recipe.description)}</div>` : ''}
            </div>
        </div>
        <div class="recipe-card-stats">
            ${recipe.servings ? `<span>👥 ${recipe.servings} servings</span>` : ''}
            ${recipe.prep_time_minutes ? `<span>⏱️ ${recipe.prep_time_minutes}m prep</span>` : ''}
            ${recipe.cook_time_minutes ? `<span>🔥 ${recipe.cook_time_minutes}m cook</span>` : ''}
        </div>
        <div class="recipe-card-section">
            <div class="recipe-card-section-title">Ingredients</div>
            <ul class="recipe-card-list">${recipe.ingredients.map(i => `<li>${esc(i)}</li>`).join('')}</ul>
        </div>
        <div class="recipe-card-section">
            <div class="recipe-card-section-title">Steps</div>
            <ol class="recipe-card-steps">${recipe.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
        </div>
        <div class="recipe-card-footer">✅ Recipe saved!</div>
    `;
    container.appendChild(card);
    container.scrollTop = container.scrollHeight;
}

export function viewRecipe(recipeId) {
    const recipe = STATE.savedRecipes.find(r => r.id === recipeId);
    if (!recipe) return;
    renderRecipeCard(recipe);
    switchToPanel('chat');
}

export function shareRecipe(recipeId) {
    const recipe = STATE.savedRecipes.find(r => r.id === recipeId);
    if (!recipe) return;
    const text = formatRecipe(recipe);

    if (navigator.share) {
        navigator.share({ title: `${recipe.title} — CookCam`, text }).catch(() => {});
    } else {
        navigator.clipboard.writeText(text)
            .then(() => addMessage('system', '📋 Recipe copied to clipboard!'))
            .catch(() => prompt('Copy this recipe:', text));
    }
}

export function exportGroceryList(recipeId) {
    const recipe = STATE.savedRecipes.find(r => r.id === recipeId);
    if (!recipe) return;

    const lines = [
        `🛒 Grocery List: ${recipe.title}`,
        '═'.repeat(30),
        ...recipe.ingredients.map(i => `☐ ${i}`),
        '',
        'Generated by CookCam 🍳',
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `grocery-${recipe.title.toLowerCase().replace(/\s+/g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    addMessage('system', `🛒 Grocery list for "${recipe.title}" downloaded!`);
}

function switchToPanel(name) {
    document.querySelectorAll('.panel-tab').forEach(t => t.classList.toggle('active', t.dataset.panel === name));
    document.querySelectorAll('.panel-content').forEach(p => p.classList.toggle('active', p.dataset.panel === name));
    // Mobile
    const mc = document.querySelector('.main-content');
    if (mc && window.innerWidth <= 900) {
        mc.classList.remove('show-video', 'show-chat', 'show-recipes', 'show-settings');
        mc.classList.add('show-chat');
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        const chatTab = document.querySelector('.tab-btn[data-tab="chat"]');
        if (chatTab) chatTab.classList.add('active');
    }
}

function formatRecipe(r) {
    let t = `🍳 ${r.title}\n`;
    if (r.description) t += `${r.description}\n`;
    t += '\n';
    if (r.servings) t += `👥 Servings: ${r.servings}\n`;
    if (r.prep_time_minutes) t += `⏱️ Prep: ${r.prep_time_minutes} min\n`;
    if (r.cook_time_minutes) t += `🔥 Cook: ${r.cook_time_minutes} min\n`;
    t += '\n📝 Ingredients:\n';
    r.ingredients.forEach(i => (t += `• ${i}\n`));
    t += '\n👨‍🍳 Steps:\n';
    r.steps.forEach((s, i) => (t += `${i + 1}. ${s}\n`));
    t += '\nMade with CookCam 🍳';
    return t;
}

function esc(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
}

window._viewRecipe = viewRecipe;
window._shareRecipe = shareRecipe;
window._exportGrocery = exportGroceryList;
