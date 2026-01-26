import { 
    getActiveTab, 
    isOnPhimbro, 
    getExtensionVersion,
    openTab 
} from "./utils/chrome-helpers.js";
import { 
    initNavigation, 
    showNotOnSite, 
    showMainUI, 
    showSignedInUI, 
    showAuthUI 
} from "./modules/navigation.js";
import { initTheme, setupThemeButtons } from "./modules/theme.js";
import { 
    initAuth, 
    setAuthMode, 
    resetAuthForm, 
    handleAuthSubmit,
    handleAuthKeydown,
    handleSignOut,
    checkAuthStatus 
} from "./modules/auth.js";

// INITIALIZATION

/**
 * Set version text on all version elements
 */
function setVersionText() {
    const version = getExtensionVersion();
    document.querySelectorAll(".versionText").forEach((el) => {
        el.textContent = `Version: v${version}`;
    });
}

/**
 * Determine and show the correct initial view
 */
async function initializeView() {
    const tab = await getActiveTab();
    const url = tab?.url || "";
    
    // Not on phimbro - show redirect screen
    if (!isOnPhimbro(url)) {
        showNotOnSite();
        return;
    }
    
    // On phimbro - check auth status
    const user = await checkAuthStatus();
    
    if (user) {
        showSignedInUI();
    } else {
        showMainUI();
    }
}

/**
 * Setup all event listeners
 */
function setupEventListeners() {
    // Go to phimbro button
    document.getElementById("goToPhimbro").addEventListener("click", () => {
        openTab("https://phimbro.com");
    });
    
    // Sign up button
    document.getElementById("signupBtn").addEventListener("click", () => {
        setAuthMode("signup");
        showAuthUI("signup");
    });
    
    // Sign in button
    document.getElementById("signinBtn").addEventListener("click", () => {
        setAuthMode("signin");
        showAuthUI("signin");
    });
    
    // Back button (auth form)
    document.getElementById("backBtn").addEventListener("click", () => {
        showMainUI();
        resetAuthForm();
    });
    
    // Auth submit button
    document.getElementById("authSubmitBtn").addEventListener("click", handleAuthSubmit);

    // Enter key submits auth form
    document.getElementById("usernameInput").addEventListener("keydown", handleAuthKeydown);
    document.getElementById("passwordInput").addEventListener("keydown", handleAuthKeydown);
    
    // Sign out button
    document.getElementById("signOutBtn").addEventListener("click", handleSignOut);
    
    // Theme buttons (handled by theme module)
    setupThemeButtons();
}

/**
 * Main initialization function
 */
async function init() {
    // Initialize all modules
    initNavigation();
    initAuth();
    await initTheme();
    
    // Set version text
    setVersionText();
    
    // Setup event listeners
    setupEventListeners();
    
    // Show correct initial view
    await initializeView();
}

// START

document.addEventListener("DOMContentLoaded", init);