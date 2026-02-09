// ============================================================================
// AUTH MODULE
// Handles user authentication (signup, signin, signout)
// ============================================================================

import { 
    sendToBackground, 
    sendToTab, 
    getActiveTab, 
    clearStorageLocal,
    isOnPhimbro 
} from "../utils/popup-helpers.js";
import { showSignedInUI, showMainUI } from "./popup-navigation.js";

// Minimum password length requirement
const MIN_PASSWORD_LENGTH = 6;

// Firebase error code to user-friendly message mapping
const AUTH_ERROR_MESSAGES = {
    // Signup errors
    "auth/email-already-in-use": "Username already taken.",
    "auth/invalid-email": "Invalid username format.",
    
    // General errors
    "auth/too-many-requests": "Too many attempts. Try again later.",
    "auth/network-request-failed": "Network error. Check your connection.",
    "auth/internal-error": "Something went wrong. Try again."
};

// DOM element references
let elements = {
    usernameInput: null,
    passwordInput: null,
    authStatus: null,
    authSubmitBtn: null
};

// Current auth mode: "signup" or "signin"
let currentMode = null;

/**
 * Initialize auth module by caching DOM elements
 */
export function initAuth() {
    elements.usernameInput = document.getElementById("usernameInput");
    elements.passwordInput = document.getElementById("passwordInput");
    elements.authStatus = document.getElementById("authStatus");
    elements.authSubmitBtn = document.getElementById("authSubmitBtn");
}

/**
 * Set the current auth mode
 * @param {string} mode - Either "signup" or "signin"
 */
export function setAuthMode(mode) {
    currentMode = mode;
}

/**
 * Get the current auth mode
 * @returns {string|null} Current mode or null
 */
export function getAuthMode() {
    return currentMode;
}

/**
 * Handle keydown events in auth form
 * Submits form when Enter key is pressed
 * @param {KeyboardEvent} event - The keyboard event
 */
export function handleAuthKeydown(event) {
    if (event.key === "Enter") {
        event.preventDefault();
        handleAuthSubmit();
    }
}

/**
 * Reset the auth form to initial state
 */
export function resetAuthForm() {
    elements.usernameInput.value = "";
    elements.passwordInput.value = "";
    elements.authStatus.textContent = "";
    elements.authStatus.className = "auth-status-msg";
}

/**
 * Display a status message in the auth form
 * @param {string} message - The message to display
 * @param {boolean} isError - True for error styling, false for success
 */
function showStatus(message, isError = false) {
    elements.authStatus.textContent = message;
    elements.authStatus.className = isError ? "auth-status-msg error" : "auth-status-msg success";
}

/**
 * Set loading state on submit button
 * @param {boolean} isLoading - True to show loading, false to reset
 */
function setLoading(isLoading) {
    elements.authSubmitBtn.disabled = isLoading;
    elements.authSubmitBtn.textContent = isLoading ? "Please wait..." : "Submit";
}

/**
 * Validate auth form inputs
 * @param {string} username - The username value
 * @param {string} password - The password value
 * @returns {string|null} Error message or null if valid
 */
function validateInputs(username, password) {
    if (!username || !password) {
        return "Please fill in all fields.";
    }
    
    if (password.length < MIN_PASSWORD_LENGTH) {
        return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    
    return null;
}

/**
 * Handle auth form submission (signup or signin)
 */
export async function handleAuthSubmit() {
    const username = elements.usernameInput.value.trim();
    const password = elements.passwordInput.value.trim();
    
    // Validate inputs
    const validationError = validateInputs(username, password);
    if (validationError) {
        showStatus(validationError, true);
        return;
    }
    
    // Show loading state
    setLoading(true);
    
    // Send auth request to background
    const response = await sendToBackground({
        command: currentMode,
        data: {
            email: `${username}@binger.dev`,
            password
        }
    });
    
    // Reset loading state
    setLoading(false);
    
    // Handle response
    if (response?.status === "success") {
        const successMessage = currentMode === "signup" 
            ? "Successfully signed up!" 
            : "Successfully logged in!";
        showStatus(successMessage, false);
        
        // Show overlay on phimbro tab
        const tab = await getActiveTab();
        if (tab && isOnPhimbro(tab.url)) {
            await sendToTab(tab.id, {
                command: "showOverlay",
                username: username
            });
        }
        
        // Transition to signed-in UI after brief delay
        setTimeout(() => {
            resetAuthForm();
            showSignedInUI();
        }, 1000);
    } else {
        const errorMessage = AUTH_ERROR_MESSAGES[response?.code] || "Something went wrong. Try again.";
        showStatus(errorMessage, true);
    }
}

/**
 * Handle sign out
 */
export async function handleSignOut() {
    const tab = await getActiveTab();
    
    // If on phimbro, hide overlay first (triggers room cleanup)
    if (tab && isOnPhimbro(tab.url)) {
        await sendToTab(tab.id, { command: "hideOverlay" });
    }
    
    // Sign out from Firebase via background
    await sendToBackground({ command: "signOut" });
    
    // Clear local storage
    await clearStorageLocal();
    
    // Return to main UI
    showMainUI();
}

/**
 * Check if user is already authenticated
 * @returns {Promise<object|null>} User object if signed in, null otherwise
 */
export async function checkAuthStatus() {
    const response = await sendToBackground({ command: "checkAuth" });
    return response?.user || null;
}