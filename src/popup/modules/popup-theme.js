import { setStorageSync, getStorageSync } from "../utils/popup-helpers.js";

const THEMES = ["burgundy", "pink", "blackwhite", "ocean", "volcano", "forest"];
const DEFAULT_THEME = "burgundy";

export async function initTheme() {
    const currentTheme = await getStorageSync("theme");
    
    if (!currentTheme) {
        await setStorageSync("theme", DEFAULT_THEME);
    }
}

export async function setTheme(themeName) {
    if (!THEMES.includes(themeName)) {
        return false;
    }
    
    const success = await setStorageSync("theme", themeName);
    return success;
}

export async function getTheme() {
    const theme = await getStorageSync("theme");
    return theme || DEFAULT_THEME;
}

export function setupThemeButtons() {
    THEMES.forEach((themeName) => {
        const buttonId = `${themeName}ThemeBtn`;
        const button = document.getElementById(buttonId);
        
        if (button) {
            button.addEventListener("click", () => setTheme(themeName));
        }
    });
}