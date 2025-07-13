// sessionMode.js



window.inSessionMode = function (context) {
    const { chrome } = context;
    const currentUserId = context.currentUser?.uid;

    // Add visual in-session styling + Hide some buttons too
    const overlay = document.getElementById("bingerOverlay");
    if (overlay) {
        overlay.classList.add("in-session");
    }

    // Enable the camera button while in-session
    const { cameraToggleBtn } = context;
    if (cameraToggleBtn) cameraToggleBtn.disabled = false;

    // Start movie syncing across users
    chrome.storage.local.get("bingerCurrentRoomId", ({ bingerCurrentRoomId }) => {
        if (!bingerCurrentRoomId) {
            return;
        }
        startPlayerSync(bingerCurrentRoomId, currentUserId);
    });



    // Add more in-session features
};





window.outSessionMode = function (context) {
    const { chrome } = context;

    // Remove in-session styling + Show some buttons back
    const overlay = document.getElementById("bingerOverlay");
    if (overlay) {
        overlay.classList.remove("in-session");
    }

    // Return camera button to normal (disabled)
    const { cameraToggleBtn } = context;    
    if (cameraToggleBtn) cameraToggleBtn.disabled = true;

    // Stop movie syncing
    if (typeof stopPlayerSync === "function") stopPlayerSync();


    
    // Add more off-session undos
};








let stopPlayerSync = null;
let lastBufferStatus = null;
let lastBufferTimeout = null;

function startPlayerSync(roomId, userId){

  // Force everyone to seek to time 0 on first join
  chrome.runtime.sendMessage({
    command: "syncPlayerState",
    roomId,
    action: "seek",
    time: 0
  });

  waitForVideo((video) => {

    let lastStateSent = null;          // either "play" or "pause"
    let lastStateTimestamp = 0;        // Date.now()
    const PLAY_PAUSE_DEBOUNCE = 300;   // ms delay to block echo storms

    // Playing is locked by default
    let playLockActive = true;                 
    const originalPlay = video.play.bind(video);

    // Video playing has a condition - only play if playing is unlocked
    video.play = () => {
      if (playLockActive) {
        return Promise.resolve();
      }
      return originalPlay();
    };

    // Block spacebar resume
    const keyBlocker = (e) => {
      if (!playLockActive) return;

      if (e.key === " ") {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    window.addEventListener("keydown", keyBlocker, true);




    // Mouse blockers (one per element)
    const blockers = [];

    function addClickBlocker(target) {
        const rect = target.getBoundingClientRect();
        const blocker = document.createElement("div");
        blocker.className = "bingerClickBlocker";
        blocker.style.cssText = `
          position: fixed;
          top: ${rect.top}px;
          left: ${rect.left}px;
          width: ${rect.width}px;
          height: ${rect.height}px;
          z-index: 999999;
          background: rgba(0,0,0,0);
          cursor: not-allowed;
        `;
        document.body.appendChild(blocker);
        blockers.push(blocker);
    }

    function applyClickBlockers() {
        blockers.forEach(el => el.remove());
        blockers.length = 0;
        const targets = [
          document.querySelector("video.vjs-tech")
        ];
        targets.forEach(el => {
          if (el) addClickBlocker(el);
        });
    }

    function removeClickBlockers() {
        blockers.forEach(el => el.remove());
        blockers.length = 0;
    }

    // Initial blockers
    applyClickBlockers();






    function unlockPlaybackControls() {
        playLockActive = false;
        window.removeEventListener("keydown", keyBlocker, true);
        removeClickBlockers();
    }
    
    function reportBufferStatus(status) {
        // No change
        if (status === lastBufferStatus) return;

        if (lastBufferTimeout) clearTimeout(lastBufferTimeout);
        lastBufferTimeout = setTimeout(() => {
          lastBufferStatus = status;
          chrome.runtime.sendMessage({
            command: "reportBufferStatus",
            roomId,
            userId,
            status,
          });
        }, 200); // Wait 200ms before actually reporting to ensure no rapid triggers
    }

    // Ask background.js to start listening to Firebase for Player and Buffer Status
    chrome.runtime.sendMessage({ command: "startPlayerListener", roomId });
    chrome.runtime.sendMessage({ command: "startBufferStatusListener", roomId });

    // Push local events
    let suppress = false;
    const push = (action) => {
      if (suppress) return;

      const now = Date.now();
      if (
        action === lastStateSent &&
        now - lastStateTimestamp < PLAY_PAUSE_DEBOUNCE
      ) {
        return; // Ignore rapid redundant events
      }
      lastStateSent = action;
      lastStateTimestamp = now;

      chrome.runtime.sendMessage({
        command: "syncPlayerState",
        roomId,
        action,
        time: video.currentTime
      });
    };

    const onPlay = () => push("play");
    const onPause = () => push("pause");
    const onSeeked = () => push("seek");
    const onSeeking = () => push("seek");

    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("seeking", onSeeking);

    // Listen to buffer status report
    video.addEventListener("waiting", () => {
      reportBufferStatus("buffering");
    });

    video.addEventListener("canplay", () => {
      reportBufferStatus("ready");
    });

    video.addEventListener("seeking", () => {
      // Only treat as buffering if video is paused (not already playing)
      if (video.paused) {
        reportBufferStatus("buffering");
      }
    });



    // Handle messages FROM background.js --> apply to video
    const msgHandler = (msg) => {

        /* ---------- RESUME PLAY ----------- */
        if (msg.command === "resumePlay" && msg.roomId === roomId) {
            unlockPlaybackControls();
            return;
        }

        /* ---------- REBLOCK PLAY ----------- */
        if (msg.command === "blockPlay" && msg.roomId === roomId) {
            playLockActive = true;
            applyClickBlockers();
            window.addEventListener("keydown", keyBlocker, true);

            // Force pause video
            if (!video.paused) {
                suppress = true;
                video.pause();
                suppress = false;
            }

            return;
        }

        /* ---------- NORMAL STATE UPDATES -- */
        if (msg.command !== "playerStateUpdated" || msg.roomId !== roomId) return;

        const { action, time } = msg.data;

        suppress = true;

        if (Math.abs(video.currentTime - time) > 1) video.currentTime = time;
        if (action === "play")  video.play().catch(() => {});
        if (action === "pause") video.pause();
        // Sync guard to avoid false-suppression
        if (action === "play" || action === "pause") {
          lastStateSent = action;
          lastStateTimestamp = Date.now();
        }

        suppress = false;
    };


    chrome.runtime.onMessage.addListener(msgHandler);

    stopPlayerSync = () => {
        // Remove sync-related video event listeners
        video.removeEventListener("play", onPlay);
        video.removeEventListener("pause", onPause);
        video.removeEventListener("seeked", onSeeked);
        video.removeEventListener("seeking", onSeeking);

        // Remove keyboard blocker
        window.removeEventListener("keydown", keyBlocker, true);

        // Remove Firebase message listener
        chrome.runtime.onMessage.removeListener(msgHandler);

        // Stop Firebase listeners
        chrome.runtime.sendMessage({ command: "stopPlayerListener", roomId });
        chrome.runtime.sendMessage({ command: "stopBufferStatusListener", roomId });

        // Remove the click blockers
        removeClickBlockers();

        // Restore original video.play function
        video.play = originalPlay;

        // Reset lock flag just in case (optional safety)
        playLockActive = true;

        stopPlayerSync = null;
    };


    // Initial state
    reportBufferStatus("ready");
  });
}

function waitForVideo(callback) {
  const attempt = () => {
    const video = document.querySelector("video.vjs-tech") || document.querySelector("video");
    if (video) {
      callback(video);
    } else {
      setTimeout(attempt, 500);
    }
  };
  attempt();
}


