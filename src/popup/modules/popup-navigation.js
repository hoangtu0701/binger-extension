// ============================================================================
// NAVIGATION MODULE
// Handles switching between popup views
// ============================================================================

// DOM element references (cached for performance)
let elements = {
    mainUI: null,
    notOnSite: null,
    authUI: null,
    signedInUI: null,
    authTitle: null
};

/**
 * Initialize navigation by caching DOM elements
 * Must be called after DOMContentLoaded
 */
export function initNavigation() {
    elements.mainUI = document.getElementById("mainUI");
    elements.notOnSite = document.getElementById("notOnSite");
    elements.authUI = document.getElementById("authUI");
    elements.signedInUI = document.getElementById("signedInUI");
    elements.authTitle = document.getElementById("authTitle");
}

/**
 * Hide all views
 */
function hideAllViews() {
    elements.mainUI.style.display = "none";
    elements.notOnSite.style.display = "none";
    elements.authUI.style.display = "none";
    elements.signedInUI.style.display = "none";
}

/**
 * Show the "not on phimbro" view
 */
export function showNotOnSite() {
    hideAllViews();
    elements.notOnSite.style.display = "block";
}

/**
 * Show the main intro view (sign up / sign in buttons)
 */
export function showMainUI() {
    hideAllViews();
    elements.mainUI.style.display = "block";
}

/**
 * Show the signed-in view
 */
export function showSignedInUI() {
    hideAllViews();
    elements.signedInUI.style.display = "block";
}

/**
 * Show the auth form view
 * @param {string} mode - Either "signup" or "signin"
 * @returns {string} The mode that was set
 */
export function showAuthUI(mode) {
    hideAllViews();
    elements.authUI.style.display = "block";
    
    if (mode === "signup") {
        elements.authTitle.textContent = "Let's get you on board!";
    } else {
        elements.authTitle.textContent = "Welcome back!";
    }
    
    return mode;
}