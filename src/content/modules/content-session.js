// ============================================================================
// SESSION MODE MODULE
// Handles watch session - video sync, call iframe, playback controls
// ============================================================================

(function() {
    "use strict";

    // ========================================================================
    // CONSTANTS
    // ========================================================================

    const SELECTORS = {
        overlay: "#bingerOverlay",
        video: "video.vjs-tech",
        videoFallback: "video",
        fullscreenRow: "#binger-fullscreen-row",
        networkWarning: "#bingerNetworkWarning"
    };

    const CSS_CLASSES = {
        inSession: "in-session",
        callIframe: "binger-call-iframe",
        callHidden: "binger-call-hidden",
        fullscreen: "fullscreen",
        camActive: "binger-cam-active",
        clickBlocker: "bingerClickBlocker"
    };

    const CONFIG = {
        iframeWidth: 700,
        iframeMargin: 8,
        playPauseDebounce: 300,
        bufferReportDelay: 200,
        videoWaitInterval: 500,
        videoWaitMaxAttempts: 20,
        deadlockEscapeMs: 5000
    };

    // ========================================================================
    // STATE
    // ========================================================================

    const state = {
        // Session active flag
        sessionActive: false,

        // Player sync
        stopPlayerSync: null,
        lastBufferStatus: null,
        lastBufferTimeout: null,

        // Call iframe
        callIframe: null,
        callIframeVisible: false,

        // Event listeners
        networkWarningListener: null,
        camMicMessageListener: null,

        // Click blockers
        clickBlockers: [],

        // Resize handler for monitor switching
        resizeHandler: null
    };

    // ========================================================================
    // CAM/MIC STATE (GLOBAL)
    // ========================================================================

    window.BINGER = window.BINGER || {};
    window.BINGER.camMicState = {
        camOn: false,
        micOn: false,

        set({ camOn, micOn }) {
            if (typeof camOn === "boolean") this.camOn = camOn;
            if (typeof micOn === "boolean") this.micOn = micOn;
        },

        reset() {
            this.camOn = false;
            this.micOn = false;
        }
    };

    // Global setter for iframe reference (used by fullscreen.js)
    window.bingerSetCallIframe = (ref) => {
        state.callIframe = ref;
    };

    // ========================================================================
    // UI HELPERS
    // ========================================================================

    /**
     * Show network warning banner
     */
    function showNetworkWarningBanner() {
        // Avoid duplicates
        if (document.querySelector(SELECTORS.networkWarning)) return;

        const banner = document.createElement("div");
        banner.id = "bingerNetworkWarning";
        banner.innerHTML = `
            <strong>Someone in the room may be on a network that blocks video calls.</strong>
            Try switching connections for a smoother experience.
            <span id="bingerBannerClose">X</span>
        `;

        Object.assign(banner.style, {
            background: "#ffcc00",
            color: "#000",
            padding: "20px 16px 16px 16px",
            margin: "0 auto",
            maxWidth: "800px",
            borderRadius: "10px",
            fontWeight: "500",
            fontSize: "1rem",
            textAlign: "center",
            boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
            position: "fixed",
            top: "20px",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: "999999"
        });

        document.body.appendChild(banner);

        // Style close button
        const closeBtn = document.getElementById("bingerBannerClose");
        if (closeBtn) {
            Object.assign(closeBtn.style, {
                position: "absolute",
                top: "6px",
                right: "10px",
                fontSize: "14px",
                color: "#000",
                cursor: "pointer",
                fontWeight: "bold"
            });

            closeBtn.onclick = () => banner.remove();
        }
    }

    /**
     * Add in-session styling to overlay
     */
    function addSessionStyling() {
        const overlay = document.querySelector(SELECTORS.overlay);
        if (overlay) {
            overlay.classList.add(CSS_CLASSES.inSession);
        }
    }

    /**
     * Remove in-session styling from overlay
     */
    function removeSessionStyling() {
        const overlay = document.querySelector(SELECTORS.overlay);
        if (overlay) {
            overlay.classList.remove(CSS_CLASSES.inSession);
        }
    }

    // ========================================================================
    // CALL IFRAME MANAGEMENT
    // ========================================================================

    /**
     * Calculate iframe left position based on overlay
     * @returns {number}
     */
    function calculateIframeLeftPosition() {
        const overlay = document.querySelector(SELECTORS.overlay);
        if (!overlay) return 0;

        const overlayRect = overlay.getBoundingClientRect();
        return overlayRect.left - CONFIG.iframeWidth - CONFIG.iframeMargin;
    }

    /**
     * Update iframe left position to stay aligned with overlay
     * Called on window resize (e.g. moving tab between monitors)
     */
    function updateIframePosition() {
        if (!state.callIframe) return;
        if (state.callIframe.classList.contains(CSS_CLASSES.fullscreen)) return;

        state.callIframe.style.left = `${calculateIframeLeftPosition()}px`;
    }

    /**
     * Start listening for window resize to reposition iframe
     */
    function startResizeListener() {
        stopResizeListener();
        state.resizeHandler = () => updateIframePosition();
        window.addEventListener("resize", state.resizeHandler);
    }

    /**
     * Stop listening for window resize
     */
    function stopResizeListener() {
        if (state.resizeHandler) {
            window.removeEventListener("resize", state.resizeHandler);
            state.resizeHandler = null;
        }
    }

    /**
     * Restore cam/mic state to iframe
     * Uses addEventListener to avoid overwriting other handlers
     * @param {HTMLIFrameElement} iframe
     */
    function restoreCamMicToIframe(iframe) {
        if (!iframe) return;

        iframe.addEventListener("load", () => {
            const { camOn, micOn } = window.BINGER.camMicState;
            try {
                iframe.contentWindow.postMessage(
                    { type: "restoreCamMic", camOn, micOn },
                    "*"
                );
            } catch (err) {
                console.warn("[Binger] Failed to restore cam/mic state:", err);
            }
        }, { once: true });
    }

    /**
     * Create call iframe
     * @param {string} roomId
     * @returns {HTMLIFrameElement}
     */
    function createCallIframe(roomId) {
        const uid = BingerState.getCurrentUserUid();
        const iframe = document.createElement("iframe");
        iframe.className = `${CSS_CLASSES.callIframe} ${CSS_CLASSES.callHidden}`;
        iframe.allow = "camera; microphone; autoplay; fullscreen";
        iframe.src = chrome.runtime.getURL(`call_app/call.html?roomId=${roomId}&uid=${uid}`);
        iframe.style.left = `${calculateIframeLeftPosition()}px`;

        restoreCamMicToIframe(iframe);

        return iframe;
    }

    /**
     * Initialize call iframe for session
     * @param {string} roomId
     */
    function initializeCallIframe(roomId) {
        if (state.callIframe) return;

        state.callIframe = createCallIframe(roomId);
        document.body.appendChild(state.callIframe);
        state.callIframeVisible = false;

        window.bingerSetCallIframe(state.callIframe);
    }

    /**
     * Toggle call iframe visibility
     * @returns {boolean} New visibility state
     */
    function toggleCallIframeVisibility() {
        if (!state.callIframe) return false;

        state.callIframeVisible = !state.callIframeVisible;

        if (state.callIframeVisible) {
            state.callIframe.classList.remove(CSS_CLASSES.callHidden);
        } else {
            state.callIframe.classList.add(CSS_CLASSES.callHidden);
        }

        return state.callIframeVisible;
    }

    /**
     * Destroy call iframe
     */
    function destroyCallIframe() {
        if (state.callIframe) {
            state.callIframe.remove();
            state.callIframe = null;
            state.callIframeVisible = false;
        }
    }

    /**
     * Reset call iframe (called when other user toggles fullscreen)
     * Sends cleanup message to old iframe before destroying it, so it can
     * remove its Firebase entries synchronously (no ghost users).
     * @param {Function} sendResponse - Response callback
     */
    function resetCallIframe(sendResponse) {
        if (!state.callIframe) return;

        // Extract current state with error handling
        let roomId;
        try {
            roomId = new URL(state.callIframe.src).searchParams.get("roomId");
        } catch (err) {
            console.error("[Binger] Failed to parse iframe src:", err);
            if (sendResponse) sendResponse({ ack: false, error: "Invalid iframe src" });
            return;
        }

        if (!roomId) {
            console.error("[Binger] No roomId found in iframe src");
            if (sendResponse) sendResponse({ ack: false, error: "No roomId" });
            return;
        }

        const wasHidden = state.callIframe.classList.contains(CSS_CLASSES.callHidden);
        const wasFullscreen = state.callIframe.classList.contains(CSS_CLASSES.fullscreen);
        const oldStyle = state.callIframe.getAttribute("style");

        // Tell old iframe to clean up Firebase entries before we destroy it
        try {
            state.callIframe.contentWindow.postMessage({ type: "cleanupCall" }, "*");
        } catch (err) {
            console.warn("[Binger] Could not send cleanup to old iframe:", err);
        }

        // Remove old iframe
        state.callIframe.remove();

        // Build new URL with UID for stable identity
        const uid = BingerState.getCurrentUserUid();
        const callUrl = chrome.runtime.getURL(`call_app/call.html?roomId=${roomId}&uid=${uid}`);

        // Create fresh iframe
        const fresh = document.createElement("iframe");
        fresh.src = callUrl;
        fresh.className = CSS_CLASSES.callIframe;
        fresh.allow = "camera; microphone; autoplay; fullscreen";

        if (wasHidden) fresh.classList.add(CSS_CLASSES.callHidden);
        if (wasFullscreen) fresh.classList.add(CSS_CLASSES.fullscreen);

        restoreCamMicToIframe(fresh);

        // Insert in correct location
        const fullscreenRow = document.querySelector(SELECTORS.fullscreenRow);
        if (wasFullscreen && fullscreenRow) {
            fullscreenRow.prepend(fresh);
        } else {
            if (oldStyle) {
                fresh.setAttribute("style", oldStyle);
            } else {
                fresh.style.left = `${calculateIframeLeftPosition()}px`;
            }
            document.body.appendChild(fresh);
        }

        // Update state
        state.callIframe = fresh;
        state.callIframeVisible = !wasHidden;
        window.bingerSetCallIframe(fresh);

        if (sendResponse) sendResponse({ ack: true });
    }

    // ========================================================================
    // CAMERA BUTTON
    // ========================================================================

    /**
     * Setup camera toggle button
     * @param {HTMLElement} cameraToggleBtn
     */
    function setupCameraButton(cameraToggleBtn) {
        if (!cameraToggleBtn) return;

        cameraToggleBtn.disabled = false;
        cameraToggleBtn.onclick = () => {
            const isVisible = toggleCallIframeVisibility();
            if (isVisible) {
                cameraToggleBtn.classList.add(CSS_CLASSES.camActive);
            } else {
                cameraToggleBtn.classList.remove(CSS_CLASSES.camActive);
            }
        };
    }

    /**
     * Reset camera button to disabled state
     * @param {HTMLElement} cameraToggleBtn
     */
    function resetCameraButton(cameraToggleBtn) {
        if (!cameraToggleBtn) return;

        cameraToggleBtn.disabled = true;
        cameraToggleBtn.onclick = null;
        cameraToggleBtn.classList.remove(CSS_CLASSES.camActive);
    }

    // ========================================================================
    // EVENT LISTENERS
    // ========================================================================

    /**
     * Setup cam/mic state listener
     */
    function setupCamMicListener() {
        // Remove existing listener first
        removeCamMicListener();

        state.camMicMessageListener = (event) => {
            const { type, camOn, micOn } = event.data || {};
            if (type === "updateCamMic") {
                window.BINGER.camMicState.set({ camOn, micOn });
            }
        };
        window.addEventListener("message", state.camMicMessageListener);
    }

    /**
     * Remove cam/mic state listener
     */
    function removeCamMicListener() {
        if (state.camMicMessageListener) {
            window.removeEventListener("message", state.camMicMessageListener);
            state.camMicMessageListener = null;
        }
    }

    /**
     * Setup network warning listener
     */
    function setupNetworkWarningListener() {
        // Remove existing listener first
        removeNetworkWarningListener();

        state.networkWarningListener = (event) => {
            if (event.data?.type === "network-warning") {
                showNetworkWarningBanner();
            }
        };
        window.addEventListener("message", state.networkWarningListener);
    }

    /**
     * Remove network warning listener
     */
    function removeNetworkWarningListener() {
        if (state.networkWarningListener) {
            window.removeEventListener("message", state.networkWarningListener);
            state.networkWarningListener = null;
        }
    }

    // ========================================================================
    // CLICK BLOCKERS
    // ========================================================================

    /**
     * Add click blocker over an element
     * @param {Element} target
     */
    function addClickBlocker(target) {
        const rect = target.getBoundingClientRect();
        const blocker = document.createElement("div");
        blocker.className = CSS_CLASSES.clickBlocker;

        Object.assign(blocker.style, {
            position: "fixed",
            top: `${rect.top}px`,
            left: `${rect.left}px`,
            width: `${rect.width}px`,
            height: `${rect.height}px`,
            zIndex: "999999",
            background: "rgba(0,0,0,0)",
            cursor: "not-allowed"
        });

        const container = document.fullscreenElement || document.body;
        container.appendChild(blocker);
        state.clickBlockers.push(blocker);
    }

    /**
     * Apply click blockers to video elements
     */
    function applyClickBlockers() {
        removeClickBlockers();

        const targets = [
            document.querySelector(SELECTORS.video),
            document.querySelector("#binger-video-region video")
        ];

        targets.forEach(el => {
            if (el) addClickBlocker(el);
        });
    }

    /**
     * Remove all click blockers
     */
    function removeClickBlockers() {
        state.clickBlockers.forEach(el => el.remove());
        state.clickBlockers.length = 0;
    }

    // ========================================================================
    // VIDEO UTILITIES
    // ========================================================================

    /**
     * Wait for video element to be available
     * @param {Function} callback - Called with video element when found
     * @param {Function} onTimeout - Called if video not found after max attempts
     */
    function waitForVideo(callback, onTimeout = null) {
        let attempts = 0;

        const attempt = () => {
            attempts++;
            const video = document.querySelector(SELECTORS.video) ||
                         document.querySelector(SELECTORS.videoFallback);

            if (video) {
                callback(video);
            } else if (attempts < CONFIG.videoWaitMaxAttempts) {
                setTimeout(attempt, CONFIG.videoWaitInterval);
            } else {
                console.warn("[Binger] Video element not found after max attempts");
                if (typeof onTimeout === "function") {
                    onTimeout();
                }
            }
        };
        attempt();
    }

    // ========================================================================
    // PLAYER SYNC
    // ========================================================================

    /**
     * Report buffer status to Firebase
     * @param {string} roomId
     * @param {string} userId
     * @param {string} status
     */
    function reportBufferStatus(roomId, userId, status) {
        if (status === state.lastBufferStatus) return;

        if (state.lastBufferTimeout) {
            clearTimeout(state.lastBufferTimeout);
        }

        state.lastBufferTimeout = setTimeout(() => {
            state.lastBufferStatus = status;
            BingerConnection.sendMessageAsync({
                command: "reportBufferStatus",
                roomId,
                userId,
                status
            });
        }, CONFIG.bufferReportDelay);
    }

    /**
     * Start player synchronization
     * @param {string} roomId
     * @param {string} userId
     */
    function startPlayerSync(roomId, userId) {
        // Reset buffer tracking so the first "ready" report is never deduplicated
        state.lastBufferStatus = null;
        if (state.lastBufferTimeout) {
            clearTimeout(state.lastBufferTimeout);
            state.lastBufferTimeout = null;
        }

        // Reset cam/mic state
        window.BINGER.camMicState.reset();

        // Force initial seek to time 0
        BingerConnection.sendMessageAsync({
            command: "syncPlayerState",
            roomId,
            action: "seek",
            time: 0
        });

        // Start iframe reset listener
        BingerConnection.sendMessageAsync({
            command: "startResetIframeListener",
            roomId
        });

        waitForVideo((video) => {
            // Debounce state
            let lastStateSent = null;
            let lastStateTimestamp = 0;

            // Play lock (prevents playback until all users ready)
            let playLockActive = true;
            const originalPlay = video.play.bind(video);

            video.play = () => {
                if (playLockActive) {
                    return Promise.resolve();
                }
                return originalPlay();
            };

            // Keyboard blocker
            const keyBlocker = (e) => {
                if (!playLockActive) return;

                const activeEl = document.activeElement;
                const isTyping = activeEl && (
                    activeEl.tagName === "INPUT" ||
                    activeEl.tagName === "TEXTAREA" ||
                    activeEl.isContentEditable
                );

                if (isTyping) return;

                if (e.key === " ") {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                }
            };

            window.addEventListener("keydown", keyBlocker, true);
            applyClickBlockers();

            // Unlock controls helper
            function unlockPlaybackControls() {
                playLockActive = false;
                window.removeEventListener("keydown", keyBlocker, true);
                removeClickBlockers();
            }

            // Safety-net: periodically check if we are stuck in a deadlock. If playback is locked but the video is paused and fully loaded, force re-report "ready" to break out. Uses setInterval so it keeps retrying until the lock resolves (or session ends).
            const deadlockEscapeId = setInterval(() => {
                if (!playLockActive) return;
                if (video.paused && video.readyState >= 3) {
                    state.lastBufferStatus = null;
                    reportBufferStatus(roomId, userId, "ready");
                }
            }, CONFIG.deadlockEscapeMs);

            // Start Firebase listeners
            BingerConnection.sendMessageAsync({ command: "startPlayerListener", roomId });
            BingerConnection.sendMessageAsync({ command: "startBufferStatusListener", roomId });

            // Suppress flag to prevent echo
            let suppress = false;

            // Push state to Firebase
            const push = (action) => {
                if (suppress) return;

                const now = Date.now();
                if (action === lastStateSent && now - lastStateTimestamp < CONFIG.playPauseDebounce) {
                    return;
                }

                lastStateSent = action;
                lastStateTimestamp = now;

                BingerConnection.sendMessageAsync({
                    command: "syncPlayerState",
                    roomId,
                    action,
                    time: video.currentTime
                });
            };

            // Video event handlers
            const onPlay = () => push("play");
            const onPause = () => push("pause");
            const onSeeked = () => push("seek");
            const onSeeking = () => push("seek");
            const onBuffering = () => reportBufferStatus(roomId, userId, "buffering");
            const onCanPlay = () => reportBufferStatus(roomId, userId, "ready");
            const onSeekedCheckReady = () => {
                // After a seek completes, wait briefly then check if video has enough data. readyState >= 3 (HAVE_FUTURE_DATA) means playback can resume.
                setTimeout(() => {
                    if (video.readyState >= 3) {
                        reportBufferStatus(roomId, userId, "ready");
                    }
                }, CONFIG.bufferReportDelay);
            };

            // Attach video event listeners
            video.addEventListener("play", onPlay);
            video.addEventListener("pause", onPause);
            video.addEventListener("seeked", onSeeked);
            video.addEventListener("seeking", onSeeking);
            video.addEventListener("waiting", onBuffering);
            video.addEventListener("canplay", onCanPlay);
            video.addEventListener("seeked", onSeekedCheckReady);

            // Message handler for background.js commands
            const msgHandler = (msg) => {
                // Reset call iframe
                if (msg.command === "resetCallIframe") {
                    resetCallIframe();
                    return true;
                }

                // Resume play
                if (msg.command === "resumePlay" && msg.roomId === roomId) {
                    unlockPlaybackControls();
                    return;
                }

                // Block play
                if (msg.command === "blockPlay" && msg.roomId === roomId) {
                    playLockActive = true;
                    applyClickBlockers();
                    window.addEventListener("keydown", keyBlocker, true);

                    if (!video.paused) {
                        suppress = true;
                        video.pause();
                        suppress = false;
                    }
                    return;
                }

                // Player state update
                if (msg.command !== "playerStateUpdated" || msg.roomId !== roomId) return;

                const { action, time } = msg.data || {};
                if (!action) return;

                suppress = true;

                if (typeof time === "number" && Math.abs(video.currentTime - time) > 1) {
                    video.currentTime = time;
                }
                if (action === "play") video.play().catch(() => {});
                if (action === "pause") video.pause();

                if (action === "play" || action === "pause") {
                    lastStateSent = action;
                    lastStateTimestamp = Date.now();
                }

                suppress = false;
            };

            chrome.runtime.onMessage.addListener(msgHandler);

            // Cleanup function
            state.stopPlayerSync = () => {
                window.BINGER.camMicState.reset();

                // Stop deadlock escape interval
                clearInterval(deadlockEscapeId);

                // Remove video listeners
                video.removeEventListener("play", onPlay);
                video.removeEventListener("pause", onPause);
                video.removeEventListener("seeked", onSeeked);
                video.removeEventListener("seeking", onSeeking);
                video.removeEventListener("waiting", onBuffering);
                video.removeEventListener("canplay", onCanPlay);
                video.removeEventListener("seeked", onSeekedCheckReady);

                // Remove keyboard blocker
                window.removeEventListener("keydown", keyBlocker, true);

                // Remove message listener
                chrome.runtime.onMessage.removeListener(msgHandler);

                // Stop Firebase listeners
                BingerConnection.sendMessageAsync({ command: "stopPlayerListener", roomId });
                BingerConnection.sendMessageAsync({ command: "stopBufferStatusListener", roomId });
                BingerConnection.sendMessageAsync({ command: "stopResetIframeListener", roomId });

                // Remove click blockers
                removeClickBlockers();

                // Restore original play function
                video.play = originalPlay;
                playLockActive = true;

                // Clear buffer timeout
                if (state.lastBufferTimeout) {
                    clearTimeout(state.lastBufferTimeout);
                    state.lastBufferTimeout = null;
                }
                state.lastBufferStatus = null;

                state.stopPlayerSync = null;
            };

            // Report initial ready state
            reportBufferStatus(roomId, userId, "ready");

        }, () => {
            // onTimeout - video not found
            console.error("[Binger] Could not start player sync - video not found");
        });
    }

    // ========================================================================
    // PUBLIC API
    // ========================================================================

    /**
     * Enter session mode
     * @param {object} context - Context from message-router
     */
    function inSessionMode(context) {
        // Prevent duplicate session activation
        if (state.sessionActive) {
            console.log("[Binger] Already in session mode - skipping");
            return;
        }

        const { chrome: chromeRef, cameraToggleBtn, currentUser } = context;
        const currentUserId = currentUser?.uid;

        // Mark session as active
        state.sessionActive = true;

        // Setup listeners
        setupCamMicListener();
        setupNetworkWarningListener();

        // Add visual styling
        addSessionStyling();

        // Get room ID and initialize
        chromeRef.storage.local.get("bingerCurrentRoomId", (result) => {
            // Check for storage errors
            if (chromeRef.runtime.lastError) {
                console.error("[Binger] Storage error:", chromeRef.runtime.lastError.message);
                state.sessionActive = false;
                return;
            }

            const bingerCurrentRoomId = result?.bingerCurrentRoomId;
            if (!bingerCurrentRoomId) {
                console.warn("[Binger] No room ID found for session");
                state.sessionActive = false;
                return;
            }

            // Initialize call iframe
            initializeCallIframe(bingerCurrentRoomId);

            // Listen for monitor/window changes to keep iframe aligned
            startResizeListener();

            // Setup camera button
            setupCameraButton(cameraToggleBtn);

            // Start player sync
            startPlayerSync(bingerCurrentRoomId, currentUserId);

            // Show soundboard
            BingerConnection.sendMessageAsync({
                command: "toggleSoundboard",
                inSession: true
            });
        });
    }

    /**
     * Exit session mode
     * @param {object} context - Context from message-router
     */
    function outSessionMode(context) {
        // Check if actually in session
        if (!state.sessionActive) {
            console.log("[Binger] Not in session mode - skipping outSessionMode");
            return;
        }

        const { cameraToggleBtn } = context;

        // Reset camera button
        resetCameraButton(cameraToggleBtn);

        // Remove listeners
        removeCamMicListener();
        removeNetworkWarningListener();

        // Remove visual styling
        removeSessionStyling();

        // Destroy call iframe
        destroyCallIframe();

        // Stop listening for monitor/window changes
        stopResizeListener();

        // Hide soundboard
        BingerConnection.sendMessageAsync({
            command: "toggleSoundboard",
            inSession: false
        });

        // Stop player sync
        if (typeof state.stopPlayerSync === "function") {
            state.stopPlayerSync();
        }

        // Remove network warning banner if present
        const banner = document.querySelector(SELECTORS.networkWarning);
        if (banner) banner.remove();

        // Mark session as inactive
        state.sessionActive = false;
    }

    // ========================================================================
    // EXPOSE TO WINDOW
    // ========================================================================

    window.BingerSession = {
        inSessionMode,
        outSessionMode
    };

})();