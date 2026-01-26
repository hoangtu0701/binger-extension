// ============================================================================
// CHROME API HELPERS
// Wrappers for Chrome extension APIs with proper error handling
// ============================================================================

/**
 * Get the currently active tab
 * @returns {Promise<chrome.tabs.Tab|null>} The active tab or null if failed
 */
export async function getActiveTab() {
    try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        return tabs[0] || null;
    } catch (error) {
        console.error("[Binger] Failed to get active tab:", error);
        return null;
    }
}

/**
 * Send a message to the background script
 * @param {object} message - The message to send
 * @returns {Promise<any>} The response from background script
 */
export async function sendToBackground(message) {
    try {
        const response = await chrome.runtime.sendMessage(message);
        return response;
    } catch (error) {
        console.error("[Binger] Failed to send message to background:", error);
        return null;
    }
}

/**
 * Send a message to a specific tab's content script
 * @param {number} tabId - The tab ID to send to
 * @param {object} message - The message to send
 * @returns {Promise<any>} The response from content script
 */
export async function sendToTab(tabId, message) {
    try {
        const response = await chrome.tabs.sendMessage(tabId, message);
        return response;
    } catch (error) {
        console.error("[Binger] Failed to send message to tab:", error);
        return null;
    }
}

/**
 * Get a value from chrome.storage.sync
 * @param {string} key - The key to retrieve
 * @returns {Promise<any>} The stored value or null
 */
export async function getStorageSync(key) {
    try {
        const data = await chrome.storage.sync.get(key);
        return data[key] ?? null;
    } catch (error) {
        console.error("[Binger] Failed to get from storage.sync:", error);
        return null;
    }
}

/**
 * Set a value in chrome.storage.sync
 * @param {string} key - The key to set
 * @param {any} value - The value to store
 * @returns {Promise<boolean>} True if successful, false otherwise
 */
export async function setStorageSync(key, value) {
    try {
        await chrome.storage.sync.set({ [key]: value });
        return true;
    } catch (error) {
        console.error("[Binger] Failed to set storage.sync:", error);
        return false;
    }
}

/**
 * Clear all chrome.storage.local data
 * @returns {Promise<boolean>} True if successful, false otherwise
 */
export async function clearStorageLocal() {
    try {
        await chrome.storage.local.clear();
        return true;
    } catch (error) {
        console.error("[Binger] Failed to clear storage.local:", error);
        return false;
    }
}

/**
 * Open a new tab with the given URL
 * @param {string} url - The URL to open
 * @returns {Promise<chrome.tabs.Tab|null>} The created tab or null if failed
 */
export async function openTab(url) {
    try {
        const tab = await chrome.tabs.create({ url });
        return tab;
    } catch (error) {
        console.error("[Binger] Failed to open tab:", error);
        return null;
    }
}

/**
 * Get the extension version from manifest
 * @returns {string} The version string
 */
export function getExtensionVersion() {
    return chrome.runtime.getManifest().version;
}

/**
 * Check if a URL is on phimbro.com
 * @param {string} url - The URL to check
 * @returns {boolean} True if on phimbro.com
 */
export function isOnPhimbro(url) {
    return url?.includes("phimbro.com") ?? false;
}