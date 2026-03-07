/**
 * CookCam — Application State
 */
export const STATE = {
    // Connection
    ws: null,
    audioPlayer: null,
    micAudioContext: null,
    audioWorkletNode: null,
    micStream: null,
    videoStream: null,
    frameInterval: null,
    isConnected: false,
    isMicOn: true,
    isCameraOn: true,
    isAISpeaking: false,
    sessionToken: null,

    // Reconnect
    reconnectAttempts: 0,
    maxReconnectAttempts: 5,
    isReconnecting: false,

    // Timers
    activeTimers: {},

    // Recipe step tracking
    recipeSteps: null, // { recipe_name, steps[], current_step }

    // Ingredient checklist
    ingredientList: null, // { recipe_name, ingredients: [{name,amount,checked}] }

    // Saved recipes
    savedRecipes: [],

    // Nutritional info (latest)
    nutritionalInfo: null,

    // User preferences (persisted to localStorage)
    preferences: {
        dietary: [],
        skillLevel: 'intermediate',
        language: 'English',
        theme: 'dark',
        displayMode: 'normal',
    },
};

// Load persisted preferences
try {
    const saved = localStorage.getItem('cookcam_preferences');
    if (saved) {
        STATE.preferences = { ...STATE.preferences, ...JSON.parse(saved) };
    }
} catch (e) { /* ignore */ }

export function savePreferences() {
    try {
        localStorage.setItem('cookcam_preferences', JSON.stringify(STATE.preferences));
    } catch (e) { /* quota */ }
}
