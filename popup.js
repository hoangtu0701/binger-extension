

document.addEventListener("DOMContentLoaded", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const url = tabs[0]?.url || "";
        const onPhimbro = url.includes("phimbro.com");

        const mainUI = document.getElementById("mainUI");
        const notOnSite = document.getElementById("notOnSite");
        const authUI = document.getElementById("authUI");
        const signedInUI = document.getElementById("signedInUI");

        // Check if a user is on phimbro
        if (!onPhimbro) {
            notOnSite.style.display = "block";
            return;
        }

        // Ask background.js whether a user is signed in
        chrome.runtime.sendMessage({ command: "checkAuth" }, (response) => {
            const user = response?.user;

            if (user) {
            signedInUI.style.display = "block";
            } else {
            mainUI.style.display = "block";
            }
        });
    });

    const version = chrome.runtime.getManifest().version;
    const versionText = document.getElementById("versionText");
    if (versionText) versionText.textContent = `Version: v${version}`;

    // If not on phimbro, click the button to go to phimbro
    document.getElementById("goToPhimbro").addEventListener("click", () => {
        chrome.tabs.create({ url: "https://phimbro.com" });
    });



    // Handle navigation to auth UI
    document.getElementById("signupBtn").addEventListener("click", () => {
      mainUI.style.display = "none";
      authUI.style.display = "block";
      document.getElementById("authTitle").textContent = "Let’s get you on board!";
      currentMode = "signup";
    });

    document.getElementById("signinBtn").addEventListener("click", () => {
      mainUI.style.display = "none";
      authUI.style.display = "block";
      document.getElementById("authTitle").textContent = "Welcome back!";
      currentMode = "signin";
    });



    // Back button logic
    document.getElementById("backBtn").addEventListener("click", () => {
      authUI.style.display = "none";
      mainUI.style.display = "block";
      resetAuthForm();
    });



});



// Helper: clear status and inputs when going back
function resetAuthForm() {
    document.getElementById("usernameInput").value = "";
    document.getElementById("passwordInput").value = "";
    document.getElementById("authStatus").textContent = "";
    document.getElementById("authStatus").className = "auth-status";
}

// Track whether user is signing in or signing up
let currentMode = null;





// Handle signing up / in and send form information with currentMode to background.js
document.getElementById("authSubmitBtn").addEventListener("click", () => {
  const username = document.getElementById("usernameInput").value.trim();
  const password = document.getElementById("passwordInput").value.trim();
  const statusText = document.getElementById("authStatus");

  if (!username || !password) {
    statusText.textContent = "Please fill in all fields.";
    statusText.className = "auth-status error";
    return;
  }

  const message = {
    command: currentMode, // 'signup' or 'signin' and will tell background.js what to do with the information depending on singing mode
    data: {
      email: `${username}@binger.dev`, // simulate email
      password
    }
  };

    chrome.runtime.sendMessage(message, (response) => {
        if (response?.status === "success") {
            statusText.textContent = currentMode === "signup"
                ? "Successfully signed up!"
                : "Successfully logged in!";
            statusText.className = "auth-status success";

            // Show signed-in UI
            setTimeout(() => {
                authUI.style.display = "none";
                document.getElementById("signedInUI").style.display = "block";
            }, 1000); 

            // Show the main overlay
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                const tab = tabs[0];
                if (tab?.url?.includes("phimbro.com")) {
                    const username = message.data.email.split("@")[0];
                    chrome.tabs.sendMessage(tab.id, {
                    command: "showOverlay",
                    username: username
                    });
                }
            });



        } else {
        statusText.textContent = "Invalid credentials";
        statusText.className = "auth-status error";
        }
    });
});



// Handle Sign Out
document.getElementById("signOutBtn").addEventListener("click", () => {
  // Hide overlay & leave room FIRST
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (tab?.url?.includes("phimbro.com")) {
      chrome.tabs.sendMessage(tab.id, { command: "hideOverlay" }, () => {
        // AFTER room cleanup, sign out from Firebase
        chrome.runtime.sendMessage({ command: "signOut" }, () => {
          // Clear local storage and reset UI
          chrome.storage.local.clear(() => {
            console.log("[Binger] Local storage cleared on sign-out");
            document.getElementById("signedInUI").style.display = "none";
            document.getElementById("mainUI").style.display = "block";
          });
        });
      });
    } else {
      // Not on phimbro: just sign out + reset
      chrome.runtime.sendMessage({ command: "signOut" }, () => {
        chrome.storage.local.clear(() => {
          console.log("[Binger] Signed out from non-phimbro tab");
          document.getElementById("signedInUI").style.display = "none";
          document.getElementById("mainUI").style.display = "block";
        });
      });
    }
  });
});

