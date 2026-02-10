(function() {
    "use strict";

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

    const state = {
        sessionActive: false,
        stopPlayerSync: null,
        lastBufferStatus: null,
        lastBufferTimeout: null,
        callIframe: null,
        callIframeVisible: false,
        networkWarningListener: null,
        camMicMessageListener: null,
        clickBlockers: [],
        resizeHandler: null
    };

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

    window.bingerSetCallIframe = (ref) => {
        state.callIframe = ref;
    };

    function showNetworkWarningBanner() {
        if (document.querySelector(SELECTORS.networkWarning)) return;

        const banner = document.createElement("div");
        banner.id = "bingerNetworkWarning";

        const icon = document.createElement("div");
        icon.className = "network-warning-icon";
        icon.textContent = "!";

        const content = document.createElement("div");
        content.className = "network-warning-content";

        const title = document.createElement("div");
        title.className = "network-warning-title";
        title.textContent = "Someone in the room may be on a network that blocks video calls.";

        const desc = document.createElement("div");
        desc.className = "network-warning-desc";
        desc.textContent = "Try switching connections for a smoother experience.";

        content.appendChild(title);
        content.appendChild(desc);

        const closeBtn = document.createElement("button");
        closeBtn.className = "network-warning-close";
        closeBtn.textContent = "X";
        closeBtn.onclick = () => banner.remove();

        banner.appendChild(icon);
        banner.appendChild(content);
        banner.appendChild(closeBtn);
        document.body.appendChild(banner);
    }

    function addSessionStyling() {
        const overlay = document.querySelector(SELECTORS.overlay);
        if (overlay) {
            overlay.classList.add(CSS_CLASSES.inSession);
        }
    }

    function removeSessionStyling() {
        const overlay = document.querySelector(SELECTORS.overlay);
        if (overlay) {
            overlay.classList.remove(CSS_CLASSES.inSession);
        }
    }

    function calculateIframeLeftPosition() {
        const overlay = document.querySelector(SELECTORS.overlay);
        if (!overlay) return 0;

        const overlayRect = overlay.getBoundingClientRect();
        return overlayRect.left - CONFIG.iframeWidth - CONFIG.iframeMargin;
    }

    function updateIframePosition() {
        if (!state.callIframe) return;
        if (state.callIframe.classList.contains(CSS_CLASSES.fullscreen)) return;

        state.callIframe.style.left = `${calculateIframeLeftPosition()}px`;
    }

    function startResizeListener() {
        stopResizeListener();
        state.resizeHandler = () => updateIframePosition();
        window.addEventListener("resize", state.resizeHandler);
    }

    function stopResizeListener() {
        if (state.resizeHandler) {
            window.removeEventListener("resize", state.resizeHandler);
            state.resizeHandler = null;
        }
    }

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

    function sendThemeToIframe(iframe) {
        if (!iframe) return;

        iframe.addEventListener("load", () => {
            try {
                const themeClass = [...document.body.classList].find(c => c.startsWith("theme-"));
                const theme = themeClass ? themeClass.replace("theme-", "") : "burgundy";
                iframe.contentWindow.postMessage({ type: "setTheme", theme }, "*");
            } catch {}
        }, { once: true });
    }

    function sendThemeToCallIframe(theme) {
        if (!state.callIframe) return;
        try {
            state.callIframe.contentWindow.postMessage({ type: "setTheme", theme }, "*");
        } catch {}
    }

    function createCallIframe(roomId) {
        const uid = BingerState.getCurrentUserUid();
        const iframe = document.createElement("iframe");
        iframe.className = `${CSS_CLASSES.callIframe} ${CSS_CLASSES.callHidden} binger-call-initial`;
        iframe.allow = "camera; microphone; autoplay; fullscreen";
        iframe.src = chrome.runtime.getURL(`call_app/call.html?roomId=${roomId}&uid=${uid}`);
        iframe.style.left = `${calculateIframeLeftPosition()}px`;

        restoreCamMicToIframe(iframe);
        sendThemeToIframe(iframe);

        return iframe;
    }

    function initializeCallIframe(roomId) {
        if (state.callIframe) return;

        state.callIframe = createCallIframe(roomId);
        document.body.appendChild(state.callIframe);
        state.callIframeVisible = false;

        window.bingerSetCallIframe(state.callIframe);
    }

    function toggleCallIframeVisibility() {
        if (!state.callIframe) return false;

        state.callIframeVisible = !state.callIframeVisible;

        const isFullscreen = state.callIframe.classList.contains(CSS_CLASSES.fullscreen);
        const fsRow = document.querySelector(SELECTORS.fullscreenRow);

        if (state.callIframeVisible) {
            state.callIframe.classList.remove("binger-call-initial");
            void state.callIframe.offsetHeight;
            state.callIframe.classList.remove(CSS_CLASSES.callHidden);
        } else {
            state.callIframe.classList.add(CSS_CLASSES.callHidden);
        }

        if (isFullscreen && fsRow) {
            if (state.callIframeVisible) {
                fsRow.classList.add("binger-call-visible");
            } else {
                fsRow.classList.remove("binger-call-visible");
            }
        }

        return state.callIframeVisible;
    }

    function destroyCallIframe() {
        if (state.callIframe) {
            state.callIframe.remove();
            state.callIframe = null;
            state.callIframeVisible = false;
        }
    }

    function resetCallIframe(sendResponse) {
        if (!state.callIframe) return;

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

        try {
            state.callIframe.contentWindow.postMessage({ type: "cleanupCall" }, "*");
        } catch (err) {
            console.warn("[Binger] Could not send cleanup to old iframe:", err);
        }

        state.callIframe.remove();

        const uid = BingerState.getCurrentUserUid();
        const callUrl = chrome.runtime.getURL(`call_app/call.html?roomId=${roomId}&uid=${uid}`);

        const fresh = document.createElement("iframe");
        fresh.src = callUrl;
        fresh.className = CSS_CLASSES.callIframe;
        fresh.allow = "camera; microphone; autoplay; fullscreen";

        if (wasHidden) fresh.classList.add(CSS_CLASSES.callHidden);
        if (wasFullscreen) fresh.classList.add(CSS_CLASSES.fullscreen);

        restoreCamMicToIframe(fresh);
        sendThemeToIframe(fresh);

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

        state.callIframe = fresh;
        state.callIframeVisible = !wasHidden;
        window.bingerSetCallIframe(fresh);

        if (sendResponse) sendResponse({ ack: true });
    }

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

    function resetCameraButton(cameraToggleBtn) {
        if (!cameraToggleBtn) return;

        cameraToggleBtn.disabled = true;
        cameraToggleBtn.onclick = null;
        cameraToggleBtn.classList.remove(CSS_CLASSES.camActive);
    }

    function setupCamMicListener() {
        removeCamMicListener();

        state.camMicMessageListener = (event) => {
            const { type, camOn, micOn } = event.data || {};
            if (type === "updateCamMic") {
                window.BINGER.camMicState.set({ camOn, micOn });
            }
        };
        window.addEventListener("message", state.camMicMessageListener);
    }

    function removeCamMicListener() {
        if (state.camMicMessageListener) {
            window.removeEventListener("message", state.camMicMessageListener);
            state.camMicMessageListener = null;
        }
    }

    function setupNetworkWarningListener() {
        removeNetworkWarningListener();

        state.networkWarningListener = (event) => {
            if (event.data?.type === "network-warning") {
                showNetworkWarningBanner();
            }
        };
        window.addEventListener("message", state.networkWarningListener);
    }

    function removeNetworkWarningListener() {
        if (state.networkWarningListener) {
            window.removeEventListener("message", state.networkWarningListener);
            state.networkWarningListener = null;
        }
    }

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

    function removeClickBlockers() {
        state.clickBlockers.forEach(el => el.remove());
        state.clickBlockers.length = 0;
    }

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

    function startPlayerSync(roomId, userId) {
        state.lastBufferStatus = null;
        if (state.lastBufferTimeout) {
            clearTimeout(state.lastBufferTimeout);
            state.lastBufferTimeout = null;
        }

        window.BINGER.camMicState.reset();

        BingerConnection.sendMessageAsync({
            command: "syncPlayerState",
            roomId,
            action: "seek",
            time: 0
        });

        BingerConnection.sendMessageAsync({
            command: "startResetIframeListener",
            roomId
        });

        waitForVideo((video) => {
            let lastStateSent = null;
            let lastStateTimestamp = 0;

            let playLockActive = true;
            const originalPlay = video.play.bind(video);

            video.play = () => {
                if (playLockActive) {
                    return Promise.resolve();
                }
                return originalPlay();
            };

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

            function unlockPlaybackControls() {
                playLockActive = false;
                window.removeEventListener("keydown", keyBlocker, true);
                removeClickBlockers();
            }

            // Re-report ready if stuck in deadlock (paused + loaded but play-locked)
            const deadlockEscapeId = setInterval(() => {
                if (!playLockActive) return;
                if (video.paused && video.readyState >= 3) {
                    state.lastBufferStatus = null;
                    reportBufferStatus(roomId, userId, "ready");
                }
            }, CONFIG.deadlockEscapeMs);

            BingerConnection.sendMessageAsync({ command: "startPlayerListener", roomId });
            BingerConnection.sendMessageAsync({ command: "startBufferStatusListener", roomId });

            let suppress = false;

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

            const onPlay = () => push("play");
            const onPause = () => push("pause");
            const onSeeked = () => push("seek");
            const onSeeking = () => push("seek");
            const onBuffering = () => reportBufferStatus(roomId, userId, "buffering");
            const onCanPlay = () => reportBufferStatus(roomId, userId, "ready");
            const onSeekedCheckReady = () => {
                setTimeout(() => {
                    if (video.readyState >= 3) {
                        reportBufferStatus(roomId, userId, "ready");
                    }
                }, CONFIG.bufferReportDelay);
            };

            video.addEventListener("play", onPlay);
            video.addEventListener("pause", onPause);
            video.addEventListener("seeked", onSeeked);
            video.addEventListener("seeking", onSeeking);
            video.addEventListener("waiting", onBuffering);
            video.addEventListener("canplay", onCanPlay);
            video.addEventListener("seeked", onSeekedCheckReady);

            const msgHandler = (msg) => {
                if (msg.command === "resetCallIframe") {
                    resetCallIframe();
                    return true;
                }

                if (msg.command === "resumePlay" && msg.roomId === roomId) {
                    unlockPlaybackControls();
                    return;
                }

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

            state.stopPlayerSync = () => {
                window.BINGER.camMicState.reset();

                clearInterval(deadlockEscapeId);

                video.removeEventListener("play", onPlay);
                video.removeEventListener("pause", onPause);
                video.removeEventListener("seeked", onSeeked);
                video.removeEventListener("seeking", onSeeking);
                video.removeEventListener("waiting", onBuffering);
                video.removeEventListener("canplay", onCanPlay);
                video.removeEventListener("seeked", onSeekedCheckReady);

                window.removeEventListener("keydown", keyBlocker, true);

                chrome.runtime.onMessage.removeListener(msgHandler);

                BingerConnection.sendMessageAsync({ command: "stopPlayerListener", roomId });
                BingerConnection.sendMessageAsync({ command: "stopBufferStatusListener", roomId });
                BingerConnection.sendMessageAsync({ command: "stopResetIframeListener", roomId });

                removeClickBlockers();

                video.play = originalPlay;
                playLockActive = true;

                if (state.lastBufferTimeout) {
                    clearTimeout(state.lastBufferTimeout);
                    state.lastBufferTimeout = null;
                }
                state.lastBufferStatus = null;

                state.stopPlayerSync = null;
            };

            reportBufferStatus(roomId, userId, "ready");

        }, () => {
            console.error("[Binger] Could not start player sync - video not found");
        });
    }

    function inSessionMode(context) {
        if (state.sessionActive) return;

        const { chrome: chromeRef, cameraToggleBtn, currentUser } = context;
        const currentUserId = currentUser?.uid;

        state.sessionActive = true;

        setupCamMicListener();
        setupNetworkWarningListener();
        addSessionStyling();

        chromeRef.storage.local.get("bingerCurrentRoomId", (result) => {
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

            initializeCallIframe(bingerCurrentRoomId);
            startResizeListener();
            setupCameraButton(cameraToggleBtn);
            startPlayerSync(bingerCurrentRoomId, currentUserId);

            BingerConnection.sendMessageAsync({
                command: "toggleSoundboard",
                inSession: true
            });
        });
    }

    function outSessionMode(context) {
        if (!state.sessionActive) return;

        const { cameraToggleBtn } = context;

        resetCameraButton(cameraToggleBtn);
        removeCamMicListener();
        removeNetworkWarningListener();
        removeSessionStyling();
        destroyCallIframe();
        stopResizeListener();

        BingerConnection.sendMessageAsync({
            command: "toggleSoundboard",
            inSession: false
        });

        if (typeof state.stopPlayerSync === "function") {
            state.stopPlayerSync();
        }

        const banner = document.querySelector(SELECTORS.networkWarning);
        if (banner) banner.remove();

        state.sessionActive = false;
    }

    window.BingerSession = {
        inSessionMode,
        outSessionMode,
        sendThemeToCallIframe
    };

})();