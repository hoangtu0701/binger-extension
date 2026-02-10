export async function getActiveTab() {
    try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        return tabs[0] || null;
    } catch {
        return null;
    }
}

export async function sendToBackground(message) {
    try {
        const response = await chrome.runtime.sendMessage(message);
        return response;
    } catch {
        return null;
    }
}

export async function sendToTab(tabId, message) {
    try {
        const response = await chrome.tabs.sendMessage(tabId, message);
        return response;
    } catch {
        return null;
    }
}

export async function getStorageSync(key) {
    try {
        const data = await chrome.storage.sync.get(key);
        return data[key] ?? null;
    } catch {
        return null;
    }
}

export async function setStorageSync(key, value) {
    try {
        await chrome.storage.sync.set({ [key]: value });
        return true;
    } catch {
        return false;
    }
}

export async function clearStorageLocal() {
    try {
        await chrome.storage.local.clear();
        return true;
    } catch {
        return false;
    }
}

export async function openTab(url) {
    try {
        const tab = await chrome.tabs.create({ url });
        return tab;
    } catch {
        return null;
    }
}

export function getExtensionVersion() {
    return chrome.runtime.getManifest().version;
}

export function isOnPhimbro(url) {
    return url?.includes("phimbro.com") ?? false;
}