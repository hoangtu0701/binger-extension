let elements = {
    mainUI: null,
    notOnSite: null,
    authUI: null,
    signedInUI: null,
    authTitle: null
};

export function initNavigation() {
    elements.mainUI = document.getElementById("mainUI");
    elements.notOnSite = document.getElementById("notOnSite");
    elements.authUI = document.getElementById("authUI");
    elements.signedInUI = document.getElementById("signedInUI");
    elements.authTitle = document.getElementById("authTitle");
}

function hideAllViews() {
    elements.mainUI.classList.remove("active");
    elements.notOnSite.classList.remove("active");
    elements.authUI.classList.remove("active");
    elements.signedInUI.classList.remove("active");
}

export function showNotOnSite() {
    hideAllViews();
    elements.notOnSite.classList.add("active");
}

export function showMainUI() {
    hideAllViews();
    elements.mainUI.classList.add("active");
}

export function showSignedInUI() {
    hideAllViews();
    elements.signedInUI.classList.add("active");
}

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