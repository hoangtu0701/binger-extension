import { 
    sendToBackground, 
    sendToTab, 
    getActiveTab, 
    clearStorageLocal,
    isOnPhimbro 
} from "../utils/popup-helpers.js";
import { showSignedInUI, showMainUI } from "./popup-navigation.js";

const MIN_PASSWORD_LENGTH = 6;

const AUTH_ERROR_MESSAGES = {
    "auth/email-already-in-use": "Username already taken.",
    "auth/invalid-email": "Invalid username format.",
    "auth/too-many-requests": "Too many attempts. Try again later.",
    "auth/network-request-failed": "Network error. Check your connection.",
    "auth/internal-error": "Something went wrong. Try again."
};

let elements = {
    usernameInput: null,
    passwordInput: null,
    authStatus: null,
    authSubmitBtn: null
};

let currentMode = null;
let autoCloseTimer = null;

export function initAuth() {
    elements.usernameInput = document.getElementById("usernameInput");
    elements.passwordInput = document.getElementById("passwordInput");
    elements.authStatus = document.getElementById("authStatus");
    elements.authSubmitBtn = document.getElementById("authSubmitBtn");
}

export function setAuthMode(mode) {
    currentMode = mode;
}

export function getAuthMode() {
    return currentMode;
}

export function handleAuthKeydown(event) {
    if (event.key === "Enter") {
        event.preventDefault();
        handleAuthSubmit();
    }
}

export function resetAuthForm() {
    elements.usernameInput.value = "";
    elements.passwordInput.value = "";
    elements.authStatus.textContent = "";
    elements.authStatus.className = "auth-status-msg";
}

function showStatus(message, isError = false) {
    elements.authStatus.textContent = message;
    elements.authStatus.className = isError ? "auth-status-msg error" : "auth-status-msg success";
}

function setLoading(isLoading) {
    elements.authSubmitBtn.disabled = isLoading;
    elements.authSubmitBtn.textContent = isLoading ? "Please wait..." : "Submit";
}

function validateInputs(username, password) {
    if (!username || !password) {
        return "Please fill in all fields.";
    }
    
    if (password.length < MIN_PASSWORD_LENGTH) {
        return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    
    return null;
}

export async function handleAuthSubmit() {
    const username = elements.usernameInput.value.trim();
    const password = elements.passwordInput.value.trim();
    
    const validationError = validateInputs(username, password);
    if (validationError) {
        showStatus(validationError, true);
        return;
    }
    
    setLoading(true);
    
    const response = await sendToBackground({
        command: currentMode,
        data: {
            email: `${username}@binger.dev`,
            password
        }
    });
    
    setLoading(false);
    
    if (response?.status === "success") {
        const successMessage = currentMode === "signup" 
            ? "Successfully signed up!" 
            : "Successfully logged in!";
        showStatus(successMessage, false);
        
        const tab = await getActiveTab();
        if (tab && isOnPhimbro(tab.url)) {
            await sendToTab(tab.id, {
                command: "showOverlay",
                username: username
            });
        }
        
        setTimeout(() => {
            resetAuthForm();
            showSignedInUI();
            autoCloseTimer = setTimeout(() => window.close(), 1500);
            const signedInView = document.getElementById("signedInUI");
            if (signedInView) {
                signedInView.addEventListener("click", cancelAutoClose, { once: true });
            }
        }, 700);
    } else {
        const errorMessage = AUTH_ERROR_MESSAGES[response?.code] || "Something went wrong. Try again.";
        showStatus(errorMessage, true);
    }
}

function cancelAutoClose() {
    if (autoCloseTimer) {
        clearTimeout(autoCloseTimer);
        autoCloseTimer = null;
    }
}

export async function handleSignOut() {
    cancelAutoClose();

    const tab = await getActiveTab();
    
    if (tab && isOnPhimbro(tab.url)) {
        await sendToTab(tab.id, { command: "hideOverlay" });
    }
    
    await sendToBackground({ command: "signOut" });
    await clearStorageLocal();
    showMainUI();
}

export async function checkAuthStatus() {
    const response = await sendToBackground({ command: "checkAuth" });
    return response?.user || null;
}