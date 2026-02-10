import { 
    getActiveTab, 
    isOnPhimbro, 
    getExtensionVersion,
    openTab 
} from "./utils/popup-helpers.js";
import { 
    initNavigation, 
    showNotOnSite, 
    showMainUI, 
    showSignedInUI, 
    showAuthUI 
} from "./modules/popup-navigation.js";
import { initTheme, setupThemeButtons } from "./modules/popup-theme.js";
import { 
    initAuth, 
    setAuthMode, 
    resetAuthForm, 
    handleAuthSubmit,
    handleAuthKeydown,
    handleSignOut,
    checkAuthStatus 
} from "./modules/popup-auth.js";

function setVersionText() {
    const version = getExtensionVersion();
    document.querySelectorAll(".versionText").forEach((el) => {
        el.textContent = `Version: v${version}`;
    });
}

async function initializeView() {
    const tab = await getActiveTab();
    const url = tab?.url || "";
    
    if (!isOnPhimbro(url)) {
        showNotOnSite();
        return;
    }
    
    const user = await checkAuthStatus();
    
    if (user) {
        showSignedInUI();
    } else {
        showMainUI();
    }
}

function setupEventListeners() {
    document.getElementById("goToPhimbro").addEventListener("click", () => {
        openTab("https://phimbro.com");
    });
    
    document.getElementById("signupBtn").addEventListener("click", () => {
        setAuthMode("signup");
        showAuthUI("signup");
    });
    
    document.getElementById("signinBtn").addEventListener("click", () => {
        setAuthMode("signin");
        showAuthUI("signin");
    });
    
    document.getElementById("backBtn").addEventListener("click", () => {
        showMainUI();
        resetAuthForm();
    });
    
    document.getElementById("authSubmitBtn").addEventListener("click", handleAuthSubmit);
    document.getElementById("usernameInput").addEventListener("keydown", handleAuthKeydown);
    document.getElementById("passwordInput").addEventListener("keydown", handleAuthKeydown);
    document.getElementById("signOutBtn").addEventListener("click", handleSignOut);
    
    setupThemeButtons();
}

async function init() {
    initNavigation();
    initAuth();
    await initTheme();
    setVersionText();
    setupEventListeners();
    await initializeView();
}

document.addEventListener("DOMContentLoaded", init);