/* main.js */

const inSessionMode = window.inSessionMode;
const outSessionMode = window.outSessionMode;
const attachFullscreenListener = window.attachFullscreenListener;
const port = chrome.runtime.connect({ name: "binger-connection" });
function keepAlive() {
  if (port) {
    port.postMessage({ type: "ping" });
    setTimeout(keepAlive, 15000);
  }
}
keepAlive();

// ── Fullscreen hook helper ───────────────────────────────
function ensureFullscreenHook() {
  if (window.__bingerFullscreenHooked) return;   // prevent double-attaching
  window.__bingerFullscreenHooked = true;
  attachFullscreenListener("#bingerOverlay");
}



// Check and clear the reload flag
chrome.storage.local.get("bingerIsReloading", ({ bingerIsReloading }) => {
  if (bingerIsReloading) {
    console.log("[Binger] Clearing reload flag to prevent loop");
    chrome.storage.local.remove("bingerIsReloading");
  }
});

// Check if user successfully navigated to the shared movielink so that they can send a userReady to background.js to check and set room inSession to true
chrome.storage.local.get(["pendingMovieUrl", "bingerCurrentRoomId"], ({ pendingMovieUrl, bingerCurrentRoomId }) => {
  if (!pendingMovieUrl || !bingerCurrentRoomId) return;

  if (window.location.href === pendingMovieUrl) {
    console.log("[Binger] Arrived at correct movie page, sending userReady");

    chrome.runtime.sendMessage({
      command: "userReady",
      roomId: bingerCurrentRoomId
    }, (response) => {
      console.log("[Binger] userReady confirmed:", response);
      chrome.storage.local.remove("pendingMovieUrl"); // clean it up
    });
  }
});



// Force the page and overlay to reload whenever navigating across the page

// 1. Patch pushState + replaceState + popstate + pageshow
(function patchHistoryNavigationToReload() {
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  function triggerReloadIfUrlChanges(originalFn) {
    return function (...args) {
      const prevUrl = location.href;
      const result = originalFn.apply(this, args);
      const newUrl = location.href;

      // Skip reloads entirely if we're staying on the search page
      if (next.pathname === "/search") return result;

      if (prevUrl !== newUrl && newUrl.startsWith(location.origin)) {
        console.log("[Binger] push/replaceState → URL changed → forcing reload");
        chrome.storage.local.set({ bingerIsReloading: true }, () => {
          location.reload();
        });
      }

      return result;
    };
  }

  history.pushState = triggerReloadIfUrlChanges(originalPushState);
  history.replaceState = triggerReloadIfUrlChanges(originalReplaceState);

  window.addEventListener("popstate", () => {
    if (location.pathname === "/search") return;
    console.log("[Binger] popstate → forcing reload");
    chrome.storage.local.set({ bingerIsReloading: true }, () => {
      location.reload();
    });
  });

  window.addEventListener("pageshow", (event) => {
    // pageshow with persisted=true means a back-forward cache restore
    if (event.persisted) {
      console.log("[Binger] pageshow (bfcache) → forcing reload");


      // Tell the background to re-broadcast the user list
      chrome.storage.local.get("bingerCurrentRoomId", ({ bingerCurrentRoomId: roomId }) => {
        if (roomId) {
          chrome.runtime.sendMessage({ command: "refreshUserList", roomId });
        }
      });


      chrome.storage.local.set({ bingerIsReloading: true }, () => {
        location.reload();
      });

    }
  });



})();


// 2. Intercept in-page <a href> clicks
(function interceptInPageLinkClicksToForceReload() {
  document.addEventListener("click", (e) => {
    const anchor = e.target.closest("a");
    if (!anchor) return;

    const href = anchor.href;
    const current = location.href;

    if (
      href &&
      href.startsWith(location.origin) &&
      href !== current
    ) {
      console.log("[Binger] link click → URL changed → forcing reload");
      e.preventDefault();
      // mark as reload so cleanup is skipped
      chrome.storage.local.set({ bingerIsReloading: true }, () => {
        location.href = href;
      });

    }
  });
})();

// 3. Fallback polling in case router does something weird
(function monitorUrlPollFallback() {
  let lastUrl = location.href;

  setInterval(() => {
    if (location.href !== lastUrl && location.href.startsWith(location.origin) && location.pathname !== "/search") {
      console.log("[Binger] Fallback detected URL change → reloading...");
      // mark as reload so cleanup is skipped
      chrome.storage.local.set({ bingerIsReloading: true }, () => {
        location.reload();
      });
      
    }
    lastUrl = location.href;
  }, 500); // 0.5s polling interval
})();



// The Overlay

const overlay = document.createElement("div");
overlay.id = "bingerOverlay";

// Layout container for fullscreen split
const layoutContainer = document.createElement("div");
layoutContainer.id = "bingerLayoutContainer";
overlay.appendChild(layoutContainer);

// LEFT PANE — stacked vertically
const leftPane = document.createElement("div");
leftPane.id = "bingerLeftPane";

// Header
const headerText = document.createElement("div");
headerText.className = "bingerHeader";
headerText.textContent = "Active Binger Overlay";
leftPane.appendChild(headerText);

// Username
const usernameEl = document.createElement("div");
usernameEl.id = "bingerUsername";
usernameEl.textContent = "Signed in as: (loading...)";
leftPane.appendChild(usernameEl);

// Room buttons
const buttonWrapper = document.createElement("div");
buttonWrapper.id = "bingerButtonWrapper";

const createRoomBtn = document.createElement("button");
createRoomBtn.id = "bingerCreateRoom";
createRoomBtn.textContent = "Create Room";

const joinRoomBtn = document.createElement("button");
joinRoomBtn.id = "bingerJoinRoom";
joinRoomBtn.textContent = "Join Room";

const leaveRoomBtn = document.createElement("button");
leaveRoomBtn.id = "bingerLeaveRoom";
leaveRoomBtn.textContent = "Leave Room";
leaveRoomBtn.disabled = true;

buttonWrapper.appendChild(createRoomBtn);
buttonWrapper.appendChild(joinRoomBtn);
buttonWrapper.appendChild(leaveRoomBtn);
leftPane.appendChild(buttonWrapper);

// RIGHT PANE — chat + bottom buttons
const rightPane = document.createElement("div");
rightPane.id = "bingerRightPane";

// Chat wrapper
const chatWrapper = document.createElement("div");
chatWrapper.id = "bingerChatWrapper";
chatWrapper.classList.add("disabled"); // initially grayed out

chatWrapper.innerHTML = `
  <div id="bingerChatRoomHeader">
    <div id="bingerRoomId">(No Room)</div>
    <div id="bingerUserList">(Users: -)</div>
  </div>
  <div id="bingerChatLog">(Chat log will appear here)</div>
  <div id="bingerChatInputBar">
    <input type="text" id="bingerChatInput" placeholder="Type a message..." disabled />
    <button id="bingerSendBtn" disabled>Send</button>
  </div>
`;
rightPane.appendChild(chatWrapper);

// Bottom buttons
const watchTogetherBtn = document.createElement("button");
watchTogetherBtn.id = "watchTogetherBtn";
watchTogetherBtn.disabled = true;
watchTogetherBtn.innerHTML = `<img src="${chrome.runtime.getURL("binge.png")}" alt="Watch Together" class="bottom-icon" />`;

const cameraToggleBtn = document.createElement("button");
cameraToggleBtn.id = "cameraToggleBtn";
cameraToggleBtn.disabled = true;
cameraToggleBtn.innerHTML = `<img src="${chrome.runtime.getURL("cam.png")}" alt="Camera Toggle" class="bottom-icon" />`;

const bottomBtnBar = document.createElement("div");
bottomBtnBar.id = "bingerBottomButtons";
bottomBtnBar.appendChild(watchTogetherBtn);
bottomBtnBar.appendChild(cameraToggleBtn);

// Assemble layout
layoutContainer.appendChild(leftPane);
layoutContainer.appendChild(rightPane);
layoutContainer.appendChild(bottomBtnBar);

// Final insert
overlay.style.display = "none";
overlay.style.zIndex = '2147483647';
document.body.appendChild(overlay);



// Save global references
let currentUser = null;
let currentUsersInRoom = [];



// Only attach fullscreen logic if on phimbro.com/watch
if (
  window.location.hostname === "phimbro.com" &&
  window.location.pathname.startsWith("/watch")
) {
  ensureFullscreenHook();                          
}








// Check to see if Watch Together button should be enabled
function checkWatchTogetherEligibility() {
  const isSignedIn = !!currentUser;
  const isInWatchPage = window.location.href.startsWith("https://phimbro.com/watch");
  const enoughPeople = currentUsersInRoom.length >= 2;

  const shouldEnable = isSignedIn && isInWatchPage && enoughPeople;

  watchTogetherBtn.disabled = !shouldEnable;
}



// Binge button on-click function
function handleDefaultBingeClick() {
  console.log("[Binger] Watch Together clicked");

  // Get the current movie page URL
  const movieUrl = window.location.href;

  // Get the current room ID and user
  chrome.storage.local.get("bingerCurrentRoomId", ({ bingerCurrentRoomId: roomId }) => {
    if (!roomId) return alert("You're not in a room!");

    chrome.runtime.sendMessage({ command: "checkAuth" }, (response) => {
      if (!response?.user) return alert("Not signed in.");

      // Grab the current user info
      const sender = response.user.email.split("@")[0];
      const senderUid = response.user.uid;

      // Extract the movie code (e.g. 58191)
      let movieCode = "";
      const parts = movieUrl.split("/watch/");
      if (parts.length === 2) {
        movieCode = parts[1].split(/[?#]/)[0];
      }

      // Construct chat message with movie URL
      const inviteMessage = {
        sender,
        timestamp: Date.now(),
        text: `${sender} invited you to watch movie ${movieCode} together!`,
        type: "invite",
        movieUrl
      };

      // Construct Firebase inviteData with movieUrl
      const inviteData = {
        createdBy: senderUid,
        sender,
        movieUrl,
        timestamp: Date.now(),
        accepted: {}
      };

      // Send message and store invite in Firebase
      chrome.runtime.sendMessage({
        command: "sendInviteAndBroadcast",
        roomId,
        inviteData,
        chatMessage: inviteMessage
      }, (res) => {
        if (res?.status === "success") {
          console.log("[Binger] Invite sent and stored");
          chrome.runtime.sendMessage({
            command: "subscribeToActiveInvite",
            roomId
          });

        } else {
          alert("Failed to send invite: " + (res?.error || "Unknown error"));
        }
      });
    });
  });
}

watchTogetherBtn.onclick = handleDefaultBingeClick;



// Boolean tracker for messages subscription
let isChatSubscribed = false;
let progressBar;



// Enables the chatbox when user joins a room
function activateChatbox(roomId) {
  const chatWrapper = document.getElementById("bingerChatWrapper");
  const chatInput = document.getElementById("bingerChatInput");
  const sendBtn = document.getElementById("bingerSendBtn");
  const roomDisplay = document.getElementById("bingerRoomId");
  const userListDisplay = document.getElementById("bingerUserList");
  const chatLog = document.getElementById("bingerChatLog");
  const leaveRoomBtn = document.getElementById("bingerLeaveRoom");

  // Binger mention pill (created once)
  const inputBar = document.getElementById("bingerChatInputBar");
  let mentionPill = document.getElementById("bingerMentionPill");
  if (!mentionPill && inputBar && chatInput) {
    mentionPill = document.createElement("span");
    mentionPill.id = "bingerMentionPill";
    mentionPill.textContent = "@binger";
    Object.assign(mentionPill.style, {
      display: "none",
      alignSelf: "center",
      padding: "2px 8px",
      marginRight: "6px",
      borderRadius: "9999px",
      fontSize: "12px",
      fontWeight: "600",
      fontFamily: "Figtree, system-ui, sans-serif",
      background: "#ffe58f",
      color: "#7a4d00",
      border: "1px solid #ffd666",
      whiteSpace: "nowrap"
    });
    inputBar.insertBefore(mentionPill, chatInput);
  }

  if (!chatWrapper || !chatInput || !sendBtn || !roomDisplay || !userListDisplay || !chatLog) return;

  // Enable UI
  
  chatWrapper.classList.remove("disabled");
  chatInput.disabled = false;
  sendBtn.disabled = false;
  leaveRoomBtn.disabled = false; 

  // Show current room ID
  roomDisplay.textContent = `Room: ${roomId}`;

  // Clear chat + user list
  chatLog.innerHTML = "";
  userListDisplay.textContent = "Users: (loading...)";

  chrome.runtime.sendMessage({ command: "subscribeToUsers", roomId });

  // Message Sending functionality
  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendBtn.click();
    }
  });

  let typingTimeout;
  chatInput.addEventListener("input", () => {
    // Show pill only when input starts with exactly "@binger" or "@binger "
    const pill = document.getElementById("bingerMentionPill");
    if (pill) pill.style.display = /^@binger/.test(chatInput.value) ? "inline-flex" : "none";

    chrome.runtime.sendMessage({ command: "checkAuth" }, (res) => {
      if (!res?.user) return;
      const uid = res.user.uid;

      // Tell background user is typing
      chrome.runtime.sendMessage({
        command: "iAmTyping",
        roomId,
        uid
      });

      if (typingTimeout) clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => {
        chrome.runtime.sendMessage({
          command: "iStoppedTyping",
          roomId,
          uid
        });
      }, 1200);
    });
  });

  // Helper to scrape movie/series info
  function scrapeMovieContext() {
    const url = location.href;
    if (
      !url.includes("/watch/") &&
      !url.includes("/movie/") &&
      !url.includes("/tv/")
    ) {
      return null;
    }

    // Default values
    let title = "Unknown";
    let year = "Unknown";
    let minutes = 0;
    const isWatching = url.includes("/watch/");

    if (url.includes("/watch/")) {
      // On /watch/ 
      const subtitleElem = document.querySelector("h2[class^='subtitle']");
      if (subtitleElem) {
        const rawText = subtitleElem.childNodes[0]?.textContent?.trim() || "";
        title = rawText.replace(/["]/g, "").trim();

        const yearElem = subtitleElem.querySelector("a[href*='/year/']");
        if (yearElem) {
          year = yearElem.textContent.trim();
        }
      }

      // Minutes
      const video = document.querySelector("video");
      if (video) {
        minutes = Math.floor(video.currentTime / 60);
      }
    } else if (url.includes("/movie/") || url.includes("/tv/")) {
      // On /movie/ or /tv/ 
      const titleElem = document.querySelector("h1[class^='title']");
      if (titleElem) {
        title = titleElem.textContent.trim();
      }

      const subtitleElem = document.querySelector("h2[class^='subtitle']");
      if (subtitleElem) {
        const yearElem = subtitleElem.querySelector("a[href*='/year/']");
        if (yearElem) {
          year = yearElem.textContent.trim();
        }
      }
    }

    // Fallback - if title is still unknown, try whichever h1/h2 exists
    if (title === "Unknown") {
      const fallback = document.querySelector("h1, h2");
      if (fallback) title = fallback.textContent.trim();
    }

    return { title, year, minutes, isWatching };
  }

  sendBtn.addEventListener("click", () => {
    const messageText = chatInput.value.trim();
    if (!messageText) return;

    // Intercept @binger queries
    if (messageText.startsWith("@binger")) {
      const question = messageText.replace("@binger", "").trim();
      const movieContext = scrapeMovieContext();

      // Fire-and-forget - Background will post the reply to Firebase
      chrome.runtime.sendMessage({ command: "botQuery", prompt: question, movieContext }, () => {
        // No-op
      });
    }

    // Get current user info
    chrome.runtime.sendMessage({ command: "checkAuth" }, (response) => {
      if (!response?.user) return alert("Not signed in.");

      const msgData = {
        sender: response.user.email.split("@")[0],
        text: messageText,
        timestamp: Date.now()
      };

      chrome.runtime.sendMessage({
        command: "post",
        path: `rooms/${roomId}/messages`,
        data: msgData
      }, (res) => {
        if (res?.status === "success") {
          console.log("[Binger] Message sent:", msgData);
          chatInput.value = "";
          const pill = document.getElementById("bingerMentionPill");
          if (pill) pill.style.display = "none";
        } else {
          console.error("[Binger] Failed to send message:", res?.error);
        }
      });

      // Immediately clear typing state
      const uid = response.user.uid;
      chrome.runtime.sendMessage({
        command: "iStoppedTyping",
        roomId,
        uid
      });

    });
  });



  // Subscribe to messages
  if (!isChatSubscribed) {
    chrome.runtime.sendMessage({ command: "subscribeToMessages", roomId });
    isChatSubscribed = true;
  }

  // Subscribe to users typing
  chrome.runtime.sendMessage({ command: "subscribeToTyping", roomId });

  

}



// Deactivate the chatbot when user signs out
function deactivateChatbox() {
  const chatWrapper = document.getElementById("bingerChatWrapper");
  const chatInput = document.getElementById("bingerChatInput");
  const sendBtn = document.getElementById("bingerSendBtn");
  const roomDisplay = document.getElementById("bingerRoomId");
  const userListDisplay = document.getElementById("bingerUserList");
  const chatLog = document.getElementById("bingerChatLog");
  const leaveRoomBtn = document.getElementById("bingerLeaveRoom");

  if (!chatWrapper || !chatInput || !sendBtn || !roomDisplay || !userListDisplay || !chatLog) return;


  // Get current roomId to unsubscribe
  chrome.storage.local.get("bingerCurrentRoomId", (result) => {
    const roomId = result.bingerCurrentRoomId;
    if (roomId) {
      chrome.runtime.sendMessage({ command: "unsubscribeFromUsers", roomId });
      chrome.runtime.sendMessage({ command: "unsubscribeFromMessages", roomId });
      chrome.runtime.sendMessage({ command: "unsubscribeFromTyping", roomId });
    }
  });

  // Disable everything
  chatWrapper.classList.add("disabled");
  chatInput.disabled = true;
  sendBtn.disabled = true;
  leaveRoomBtn.disabled = true;
  roomDisplay.textContent = "(No Room)";
  userListDisplay.textContent = "(Users: -)";
  chatLog.innerHTML = "(Chat log will appear here)";
}








// Helper function to leave room and clean up everything
function leaveRoomAndCleanup(callback = () => {}) {
  chrome.storage.local.get("bingerCurrentRoomId", (result) => {
    const roomId = result.bingerCurrentRoomId;
    console.log("[Binger] leaveRoomAndCleanup called — roomId =", roomId);

    if (!roomId) return callback();

    chrome.runtime.sendMessage({ command: "leaveRoom", roomId }, () => {
      chrome.runtime.sendMessage({ command: "unsubscribeFromUsers", roomId }, () => {
        chrome.runtime.sendMessage({ command: "unsubscribeFromMessages", roomId }, () => {
          chrome.runtime.sendMessage({ command: "unsubscribeFromTyping", roomId });
          chrome.storage.local.remove("bingerCurrentRoomId", () => {
            console.log("[Binger] Cleaned up room on exit.");
            callback();
          });
        });
      });

    });
  });
}




// (Every time page loads) Trigger or Hide overlay by asking background.js if the user is signed in + Extract username + Retain current room ID
chrome.runtime.sendMessage({ command: "checkAuth" }, (response) => {
  if (response?.user) {

    currentUser = response.user; 
    checkWatchTogetherEligibility();

    const overlay = document.getElementById("bingerOverlay");
    if (overlay) overlay.style.display = "block";

    // extract username from email and use for bingerUsername
    const username = response.user.email.split("@")[0]; 
    const usernameEl = document.getElementById("bingerUsername");
    if (usernameEl) {
      usernameEl.textContent = `Signed in as: ${username}`;
    }

    // Retain current room ID unless signed out and attempt to get user back in previously joined room
    chrome.storage.local.get("bingerCurrentRoomId", (result) => {
      if (result.bingerCurrentRoomId) {
        const roomId = result.bingerCurrentRoomId;
        console.log(`[Binger] Attempting to rejoin active room: ${roomId}`);

        chrome.runtime.sendMessage({
          command: "rejoinIfRecentlyKicked",
          roomId
        }, (res) => {
          if (res?.status === "rejoined") {
            console.log("[Binger] Rejoined room successfully after reload");
            activateChatbox(roomId);
            checkWatchTogetherEligibility(); 
            // Start active invite listener for this room
            chrome.runtime.sendMessage({
              command: "subscribeToActiveInvite",
              roomId
            });
            // Start In Session listener for this room
            chrome.runtime.sendMessage({
              command: "startInSessionListener",
              roomId
            });

          } else {
            console.log("[Binger] Could not rejoin room. Cleaning up...");
            chrome.storage.local.remove("bingerCurrentRoomId", () => {
              deactivateChatbox();
            });
          }
        });

      } else {
        deactivateChatbox(); 
      }
    });


  } else {
    console.log("[Binger] User not signed in — overlay remains hidden.");
  }
});








// Trigger or Hide overlay depending on popup signing in/out (one time)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.command === "showOverlay") {
    const overlayEl = document.getElementById("bingerOverlay");
    if (overlayEl) overlayEl.style.display = "block";

    if (msg.username) {
      const usernameEl = document.getElementById("bingerUsername");
      if (usernameEl) {
        usernameEl.textContent = `Signed in as: ${msg.username}`;
      }
    }

  } else if (msg.command === "hideOverlay") {
        const overlayEl = document.getElementById("bingerOverlay");
        if (overlayEl) overlayEl.style.display = "none";

        // Remove the yellow multi-tab banner if it exists
        const banner = document.getElementById("bingerMultiTabWarning");
        if (banner) banner.remove();

        leaveRoomAndCleanup(() => {
            deactivateChatbox();
            sendResponse();
        });
        return true;
  }

  // Update the user list
  else if (msg.command === "updateUserList") {
    currentUsersInRoom = msg.users;
    checkWatchTogetherEligibility(); 

    const userListDisplay = document.getElementById("bingerUserList");
    if (userListDisplay) {
      userListDisplay.textContent = `Users: ${msg.users.join(", ")}`;
    }
  }



  // Handle incoming chat messages (including Binge session invites)
  if (msg.command === "newChatMessage") {
    const chatLog = document.getElementById("bingerChatLog");

    if (chatLog) {
      const { sender, text, timestamp, type, movieUrl } = msg.message;

      // Extract movie code when available
      let movieCode = "";
      if (movieUrl && movieUrl.includes("/watch/")) {
        const parts = movieUrl.split("/watch/");
        if (parts.length === 2) {
          movieCode = parts[1].split(/[?#]/)[0]; // cleans trailing params/hash
        }
      }

      const time = new Date(timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit"
      });

      const messageEl = document.createElement("div");



      // Check if this is an invite-type message
      if (type === "invite" && movieUrl) {
        // Check if current user is the sender
        chrome.runtime.sendMessage({ command: "checkAuth" }, (res) => {
          const currentUid = res?.user?.uid;

          if (!currentUid) return;

          const isSender = res.user.email.split("@")[0] === sender;

          if (isSender) {
            // Render confirmation text for sender
            messageEl.innerHTML = `<em>Your invite to watch movie <strong>${movieCode}</strong> was sent at ${time}.</em>`;
            messageEl.classList.add("binger-chat-message", "invite-message");
          } else {
            // Render clickable link for others
            messageEl.innerHTML = `
              <strong>${sender}</strong> [${time}]: 
              <a href="${movieUrl}" class="watch-invite-link" data-url="${movieUrl}" data-sender="${sender}" target="_self">
                ${sender} invited you to watch movie <strong>${movieCode}</strong> together 🎬
              </a>
            `;
            messageEl.classList.add("binger-chat-message", "invite-message");
          }

          chatLog.appendChild(messageEl);
          chatLog.scrollTop = chatLog.scrollHeight;
        });
      }




      // Default rendering for normal messages
      else {
        messageEl.className = "bingerChatMsg";
        messageEl.innerHTML = `<strong>${sender}</strong> [${time}]: ${text}`;
        chatLog.appendChild(messageEl);
        chatLog.scrollTop = chatLog.scrollHeight;
      }
    }
  }


  if (msg.command === "activeInviteUpdated") {

    const invite = msg.invite;

    if (invite) {
      console.log("[Binger] Active invite received:", invite);

      const isSender = invite.createdBy === currentUser?.uid;

      if (isSender) {

        // Inviter
        watchTogetherBtn.disabled = false;
        watchTogetherBtn.innerText = "❌ Cancel Invite";
        watchTogetherBtn.classList.add("binge-inviter-active");
        watchTogetherBtn.onclick = () => {
          chrome.storage.local.get("bingerCurrentRoomId", ({ bingerCurrentRoomId }) => {

            if (!bingerCurrentRoomId) return;

            chrome.runtime.sendMessage({
              command: "cancelActiveInvite",
              roomId: bingerCurrentRoomId
            }, (res) => {
              if (res?.status === "success") {
                console.log("[Binger] Invite cancelled — now posting chat message");

                // Now send cancellation message to chat
                chrome.runtime.sendMessage({ command: "checkAuth" }, (authRes) => {
                  if (!authRes?.user) return;

                  const sender = authRes.user.email.split("@")[0];
                  const movieUrl = window.location.href;

                  // Try to extract movie code
                  let movieCode = "";
                  const parts = movieUrl.split("/watch/");
                  if (parts.length === 2) {
                    movieCode = parts[1].split(/[?#]/)[0];
                  }

                  const msg = {
                    sender,
                    timestamp: Date.now(),
                    text: `❌ ${sender} canceled the invite to watch movie ${movieCode}.`
                  };

                  chrome.runtime.sendMessage({
                    command: "post",
                    path: `rooms/${bingerCurrentRoomId}/messages`,
                    data: msg
                  }, (result) => {
                    if (result?.status !== "success") {
                      console.error("[Binger] Failed to post cancel message:", result?.error);
                    }
                  });
                });
              } else {
                alert("Failed to cancel invite: " + res?.error);
              }
            });


          });
        };
      } else {
          // --- INVITEE VIEW ---
          const uid = currentUser?.uid;
          const hasAccepted = invite?.acceptedInvitees && invite.acceptedInvitees[uid];

          if (hasAccepted) {
            watchTogetherBtn.classList.remove("binge-invitee-active");
            watchTogetherBtn.classList.add("binge-invitee-accepted");
            // Already accepted — show accepted state and exit early
            watchTogetherBtn.innerText = "✅ Accepted";
            watchTogetherBtn.disabled = true;

            // Remove any lingering listeners
            watchTogetherBtn.onclick = null;
            watchTogetherBtn.onmousedown = null;
            watchTogetherBtn.onmouseup = null;
            watchTogetherBtn.onmouseleave = null;
            return;
          }

          // --- Fresh invitee — render Accept / Decline ---
          watchTogetherBtn.innerText = "🎬 Accept / Decline";
          watchTogetherBtn.disabled = false;
          watchTogetherBtn.classList.remove("binge-invitee-accepted");
          watchTogetherBtn.classList.add("binge-invitee-active");

          // Remove old listeners
          watchTogetherBtn.onclick = null;
          watchTogetherBtn.onmousedown = null;
          watchTogetherBtn.onmouseup = null;
          watchTogetherBtn.onmouseleave = null;

          // Inject progress bar
          progressBar = document.createElement("div");
          progressBar.style.height = "4px";
          progressBar.style.width = "0%";
          progressBar.style.backgroundColor = "yellow";
          progressBar.style.transition = "width 0.8s linear";
          watchTogetherBtn.appendChild(progressBar);

          let pressStartTime = null;

          watchTogetherBtn.onmousedown = () => {
            pressStartTime = Date.now();
            progressBar.style.width = "100%";
          };

          watchTogetherBtn.onmouseup = () => {
            progressBar.style.width = "0%";

            const duration = Date.now() - pressStartTime;
            pressStartTime = null;

            if (duration >= 800) {
              // Decline
              handleDeclineInvite();
            } else {
              // Accept
              watchTogetherBtn.innerText = "✅ Accepted";
              watchTogetherBtn.disabled = true;
              watchTogetherBtn.style.backgroundColor = "gray";

              chrome.runtime.sendMessage({ command: "checkAuth" }, (authRes) => {
                if (!authRes?.user) return;

                const sender = authRes.user.email.split("@")[0];
                const uid = authRes.user.uid;
                const movieUrl = invite.movieUrl || window.location.href;

                let movieCode = "";
                const parts = movieUrl.split("/watch/");
                if (parts.length === 2) {
                  movieCode = parts[1].split(/[?#]/)[0];
                }

                chrome.storage.local.get("bingerCurrentRoomId", ({ bingerCurrentRoomId }) => {
                  if (!bingerCurrentRoomId) return;

                  const msg = {
                    sender,
                    timestamp: Date.now(),
                    text: `✅ ${sender} accepted the invite to watch movie ${movieCode}.`
                  };

                  // Chat message
                  chrome.runtime.sendMessage({
                    command: "post",
                    path: `rooms/${bingerCurrentRoomId}/messages`,
                    data: msg
                  });

                  // Mark acceptedInvitees
                  chrome.runtime.sendMessage({
                    command: "post",
                    path: `rooms/${bingerCurrentRoomId}/activeInvite/acceptedInvitees/${uid}`,
                    data: true
                  });
                });
              });
            }
          };

          watchTogetherBtn.onmouseleave = () => {
            progressBar.style.width = "0%";
            pressStartTime = null;
          };


        }
      } else {  // No active invite

          console.log("[Binger] No active invite — maybe reload once to reset state");

          // Remove lingering progress bar if it exists
          const progressBar = watchTogetherBtn.querySelector("div");
          if (progressBar) progressBar.remove();

          // Clear any invitee event handlers or timers
          watchTogetherBtn.onmousedown = null;
          watchTogetherBtn.onmouseup = null;
          watchTogetherBtn.onmouseleave = null;

          // Reset to original Binge button state
          watchTogetherBtn.innerHTML = `<img src="${chrome.runtime.getURL("binge.png")}" alt="Watch Together" class="bottom-icon" />`;
          watchTogetherBtn.disabled = true; // will be re-enabled by eligibility check
          watchTogetherBtn.style.backgroundColor = "";
          watchTogetherBtn.style.color = "";
          watchTogetherBtn.style.border = "";

          // Remove all other styling
          watchTogetherBtn.classList.remove("binge-invitee-active");
          watchTogetherBtn.classList.remove("binge-inviter-active");
          watchTogetherBtn.classList.remove("binge-invitee-accepted");

          // Restore default function when clicking on the Binge button
          watchTogetherBtn.onclick = handleDefaultBingeClick;

          // re-enable if eligible
          checkWatchTogetherEligibility(); 
        }

  }

  // Handle session start (everyone accepted)
  if (msg.command === "startSession") {
   
    const movieUrl = msg.movieUrl;
    // Navigate to movie URL and trigger the check on top of main.js to see if successfully navigated
    chrome.storage.local.set({ pendingMovieUrl: movieUrl }, () => {
      console.log("[Binger] ⏳ Stored pendingMovieUrl, navigating...");
      chrome.storage.local.set({ bingerIsReloading: true }, () => {
        window.location.href = movieUrl;
      });
    });


    // Attach inSession listener
    chrome.storage.local.get("bingerCurrentRoomId", ({ bingerCurrentRoomId: roomId }) => {
      if (!roomId) {
        console.error("[Binger] No room ID found, cannot attach inSession listener.");
        return;
      }

      chrome.runtime.sendMessage({ command: "startInSessionListener", roomId }, (response) => {
        if (response?.status === "attached") {
          console.log("[Binger] Listener attached successfully");
        } else {
          console.warn("[Binger] Listener may not have attached correctly:", response);
        }
      });
    });
  }

  
  if (msg.command === "inSessionUpdated") {
    const { isInSession } = msg;
    
    const context = {
      chrome,
      watchTogetherBtn,
      cameraToggleBtn,
      createRoomBtn,
      joinRoomBtn,
      currentUser,
      checkWatchTogetherEligibility
    };

    if (isInSession === true) {
      console.log("[Binger] Session started — activating session UI");
      inSessionMode(context);
    } else {
      console.log("[Binger] Session ended — restoring normal UI");
      outSessionMode(context);
    }
  }

  if (msg.command === "isOverlayShown") {
    const overlayEl = document.getElementById("bingerOverlay");
    const isVisible = overlayEl && overlayEl.style.display !== "none";
    sendResponse({ overlay: isVisible });
    return true;
  }

  if (msg.command === "showMultiTabWarning") {
    if (!document.getElementById("bingerMultiTabWarning")) {
      const warning = document.createElement("div");
      warning.id = "bingerMultiTabWarning";
      warning.textContent = "⚠️ Multiple Phimbro tabs open — please close the others to avoid sync issues.";
      Object.assign(warning.style, {
        position: "fixed",
        top: "0px",
        left: "50%",
        transform: "translateX(-50%)",
        backgroundColor: "#fff3cd",
        color: "#856404",
        padding: "12px 20px",
        fontSize: "16px",
        fontWeight: "600",
        border: "1px solid #ffeeba",
        borderRadius: "0 0 12px 12px",
        zIndex: "9999999",
        fontFamily: "Figtree",
        boxShadow: "0 4px 10px rgba(0,0,0,0.1)",
        pointerEvents: "none"
      });
      document.body.appendChild(warning);
    }
  }

  if (msg.command === "hideMultiTabWarning") {
    const existing = document.getElementById("bingerMultiTabWarning");
    if (existing) existing.remove();
  }

  if (msg.command === "typingStatusUpdated") {
    const { users } = msg;
    const chatLog = document.getElementById("bingerChatLog");
    if (!chatLog) return;

    const incomingUids = new Set(users.map(u => u.uid));

    document.querySelectorAll(".bingerTypingBubble").forEach(el => {
      const uid = el.id.replace("typing-", "");
      if (!incomingUids.has(uid)) {
        el.classList.add("fade-out");
        setTimeout(() => el.remove(), 300); 
      }
    });

    users.forEach(({ uid, username }) => {
      if (currentUser?.uid === uid) return;

      const existing = document.getElementById(`typing-${uid}`);
      if (!existing) {
        const bubble = document.createElement("div");
        bubble.className = "bingerTypingBubble";
        bubble.id = `typing-${uid}`;

        if (uid === "BINGER_BOT_SEEK") {
          const variants = [
            `${username} is seeking...`,
            `${username} is moving to the scene...`,
            `${username} is finding the moment...`,
            `${username} is scrubbing the timeline...`,
            `${username} is skipping the boring parts...`,
            `${username} is teleporting to the scene...`,
            `${username} is spinning the film wheel...`,
            `${username} is loading up the drama...`,
            `${username} is shuffling scenes...`
          ];
          const randomMsg = variants[Math.floor(Math.random() * variants.length)];
          bubble.textContent = randomMsg;
        } else {
          bubble.textContent = `${username} is typing...`;
        }

        if (document.getElementById("bingerOverlay")?.classList.contains("in-session")) {
          bubble.classList.add("session-mode");
        }

        chatLog.appendChild(bubble);
        chatLog.scrollTop = chatLog.scrollHeight;
      }
    });
  }

});



// Helper Invitee declining function
function handleDeclineInvite() {
  chrome.runtime.sendMessage({ command: "checkAuth" }, (authRes) => {
    if (!authRes?.user) return;

    const sender = authRes.user.email.split("@")[0];
    const movieUrl = window.location.href;

    // Extract movie code
    let movieCode = "";
    const parts = movieUrl.split("/watch/");
    if (parts.length === 2) {
      movieCode = parts[1].split(/[?#]/)[0];
    }

    chrome.storage.local.get("bingerCurrentRoomId", ({ bingerCurrentRoomId }) => {
      if (!bingerCurrentRoomId) return;

      const msg = {
        sender,
        timestamp: Date.now(),
        text: `❌ ${sender} declined the invite to watch movie ${movieCode}.`
      };

      // Send chat message
      chrome.runtime.sendMessage({
        command: "post",
        path: `rooms/${bingerCurrentRoomId}/messages`,
        data: msg
      }, (postRes) => {
        if (postRes?.status !== "success") {
          console.error("[Binger] Failed to post decline message:", postRes?.error);
          return;
        }

        // Delete invite from Firebase
        chrome.runtime.sendMessage({
          command: "cancelActiveInvite",
          roomId: bingerCurrentRoomId
        }, (cancelRes) => {
          if (cancelRes?.status !== "success") {
            console.error("[Binger] Failed to cancel invite:", cancelRes?.error);
          }
        });
      });
    });
  });
}



// Handle room creation & Store the room ID locally
createRoomBtn.addEventListener("click", () => {
  // Leave old room if exists
  chrome.storage.local.get("bingerCurrentRoomId", (result) => {
    const oldRoomId = result.bingerCurrentRoomId;

    const leaveOldRoom = oldRoomId
      ? new Promise((resolve) => {
          chrome.runtime.sendMessage({ command: "leaveRoom", roomId: oldRoomId }, () => {
            chrome.runtime.sendMessage({ command: "unsubscribeFromUsers", roomId: oldRoomId }, () => {
              chrome.runtime.sendMessage({ command: "unsubscribeFromMessages", roomId: oldRoomId }, () => {
                chrome.runtime.sendMessage({ command: "unsubscribeFromTyping", roomId: oldRoomId });
                chrome.storage.local.remove("bingerCurrentRoomId", resolve);
              });
            });
          });
        })
      : Promise.resolve();

    // Create new room and join it
    leaveOldRoom.then(() => {
      chrome.runtime.sendMessage({ command: "createRoom" }, (response) => {
        if (response?.status === "success") {
          const roomId = response.roomId;
          console.log(`[Binger] Room created: ${roomId}`);

          chrome.runtime.sendMessage({ command: "joinRoom", roomId }, (joinResponse) => {
            if (joinResponse?.status === "success") {
              chrome.storage.local.set({ 
                bingerCurrentRoomId: roomId,
                bingerSwitchingFromRoom: oldRoomId }, () => {
                console.log(`[Binger] Room ID ${roomId} saved to storage`);
                chrome.storage.local.set({ bingerIsReloading: true }, () => {
                  location.reload();
                });

              });
            } else {
              alert("Failed to join new room: " + (joinResponse?.error || "Unknown error"));
            }
          });
        } else {
          console.error("[Binger] Failed to create room:", response?.error);
        }
      });
    });
  });
});





// Handle room joining & Store the room ID locally
joinRoomBtn.addEventListener("click", () => {
  const newRoomId = prompt("Enter 6-digit room code:");

  if (newRoomId === null) return; // user hit Cancel
  
  if (!/^\d{6}$/.test(newRoomId)) {
    alert("Please enter a valid 6-digit room code.");
    return;
  }


  // Check if already in another room → leave it
  chrome.storage.local.get("bingerCurrentRoomId", (result) => {
    const oldRoomId = result.bingerCurrentRoomId;

    const leaveOldRoom = oldRoomId
      ? new Promise((resolve) => {
          chrome.runtime.sendMessage({ command: "leaveRoom", roomId: oldRoomId }, () => {
            chrome.runtime.sendMessage({ command: "unsubscribeFromUsers", roomId: oldRoomId }, () => {
              chrome.storage.local.remove("bingerCurrentRoomId", resolve);
            });
          });
        })
      : Promise.resolve();

    // Now join the new room
    leaveOldRoom.then(() => {
      chrome.runtime.sendMessage({ command: "joinRoom", roomId: newRoomId }, (response) => {
        if (response?.status === "success") {
          chrome.storage.local.set({
            bingerIsReloading: true,
            bingerCurrentRoomId: newRoomId,
            bingerSwitchingFromRoom: oldRoomId
          }, () => {
            console.log(`[Binger] Joined room: ${newRoomId} — reloading`);
            chrome.storage.local.set({ bingerIsReloading: true }, () => {
              location.reload();
            });

          });

        } else {
          alert(`Failed to join room: ${response?.error}`);
        }
      });
    });
  });
});

// Handle leaving the room
leaveRoomBtn.addEventListener("click", () => {

  chrome.storage.local.get("bingerCurrentRoomId", (result) => {
    const roomId = result.bingerCurrentRoomId;
    if (!roomId) return;

    chrome.runtime.sendMessage({ command: "leaveRoom", roomId }, (response) => {
      if (response?.status === "success") {
        chrome.runtime.sendMessage({ command: "unsubscribeFromUsers", roomId });
        chrome.runtime.sendMessage({ command: "unsubscribeFromMessages", roomId });
        chrome.runtime.sendMessage({ command: "unsubscribeFromTyping", roomId });
        chrome.storage.local.remove("bingerCurrentRoomId", () => {
            console.log(`[Binger] Left room: ${roomId}`);
            deactivateChatbox();

        });
        chrome.storage.local.set({ bingerIsReloading: true }, () => {
          location.reload();
        });

      } else {
        alert("Failed to leave room: " + (response?.error || "Unknown error"));
      }
    });
  });
});







