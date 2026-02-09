// ============================================================================
// NAVIGATION MODULE
// Handles switching between popup views via CSS class toggling
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
 * Hide all views by removing the active class
 */
function hideAllViews() {
    elements.mainUI.classList.remove("active");
    elements.notOnSite.classList.remove("active");
    elements.authUI.classList.remove("active");
    elements.signedInUI.classList.remove("active");
}

/**
 * Show the "not on phimbro" view
 */
export function showNotOnSite() {
    hideAllViews();
    elements.notOnSite.classList.add("active");
}

/**
 * Show the main intro view (sign up / sign in buttons)
 */
export function showMainUI() {
    hideAllViews();
    elements.mainUI.classList.add("active");
}

/**
 * Show the signed-in view
 */
export function showSignedInUI() {
    hideAllViews();
    elements.signedInUI.classList.add("active");
}

/**
 * Show the auth form view
 * @param {string} mode - Either "signup" or "signin"
 * @returns {string} The mode that was set
 */
export function showAuthUI(mode) {
    hideAllViews();
    elements.authUI.classList.add("active");

    if (mode === "signup") {
        elements.authTitle.textContent = "Let's get you on board!";
    } else {
        elements.authTitle.textContent = "Welcome back!";
    }

    return mode;
}