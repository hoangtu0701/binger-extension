// ============================================================================
// THEME MODULE
// Handles theme selection and persistence
// ============================================================================

import { setStorageSync, getStorageSync } from "../utils/chrome-helpers.js";

// All available themes
const THEMES = ["burgundy", "pink", "blackwhite", "ocean", "volcano", "forest"];

// Default theme if none is set
const DEFAULT_THEME = "burgundy";

/**
 * Initialize theme system
 * Sets default theme if none exists
 */
export async function initTheme() {
    const currentTheme = await getStorageSync("theme");
    
    if (!currentTheme) {
        await setStorageSync("theme", DEFAULT_THEME);
    }
}

/**
 * Set the active theme
 * @param {string} themeName - The theme to activate
 * @returns {Promise<boolean>} True if successful
 */
export async function setTheme(themeName) {
    if (!THEMES.includes(themeName)) {
        console.error("[Binger] Invalid theme:", themeName);
        return false;
    }
    
    const success = await setStorageSync("theme", themeName);
    return success;
}

/**
 * Get the current theme
 * @returns {Promise<string>} The current theme name
 */
export async function getTheme() {
    const theme = await getStorageSync("theme");
    return theme || DEFAULT_THEME;
}

/**
 * Setup click handlers for all theme buttons
 * Expects buttons with IDs in format: "{themeName}ThemeBtn"
 */
export function setupThemeButtons() {
    THEMES.forEach((themeName) => {
        const buttonId = `${themeName}ThemeBtn`;
        const button = document.getElementById(buttonId);
        
        if (button) {
            button.addEventListener("click", () => setTheme(themeName));
        }
    });
}