// ============================================================================
// FULLSCREEN MODE MODULE
// Handles entering/exiting fullscreen with layout rearrangement
// ============================================================================

(function() {
    "use strict";

    // ========================================================================
    // CONSTANTS
    // ========================================================================

    const SELECTORS = {
        overlay: "#bingerOverlay",
        videoJs: ".video-js",
        videoJsFullscreen: ".video-js.vjs-fullscreen",
        callIframe: "iframe.binger-call-iframe",
        soundboard: "#bingerSoundboard",
        videoRegion: "#binger-video-region",
        fullscreenRow: "#binger-fullscreen-row",
        wrapper: "#binger-wrapper"
    };

    const LAYOUT = {
        videoHeight: "70%",
        overlayHeight: "30%",
        wrapperWidth: "660px",
        rowGap: "12px"
    };

    const CSS_CLASSES = {
        fullscreen: "fullscreen",
        callHidden: "binger-call-hidden",
        ephemeral: "binger-ephemeral",
        pinEmoji: "binger-pin-emoji"
    };

    // ========================================================================
    // STATE
    // ========================================================================

    const state = {
        // Overlay position tracking
        overlay: null,
        overlayOriginalParent: null,
        overlayNextSibling: null,

        // Call iframe tracking
        iframe: null,
        iframeOriginalParent: null,
        iframeNextSibling: null,
        iframeOriginalStyles: null,

        // Soundboard tracking
        soundboardOriginalParent: null,
        soundboardNextSibling: null,

        // Video.js tracking
        originalVJSStyles: null,
        originalVideoStyles: null,

        // Created elements
        wrapper: null,
        videoRegion: null,

        // Restore function
        restoreFn: null
    };

    // Track if fullscreen listener is attached (prevents duplicate listeners)
    let fullscreenListenerAttached = false;

    // Track if currently processing a fullscreen change (prevents race conditions)
    let isProcessingFullscreen = false;

    // ========================================================================
    // HELPER UTILITIES
    // ========================================================================

    /**
     * Check if a node is ephemeral (floating emoji, etc.)
     * @param {Node} node - The DOM node to check
     * @returns {boolean}
     */
    function isEphemeral(node) {
        return (
            node?.classList?.contains(CSS_CLASSES.ephemeral) ||
            node?.classList?.contains(CSS_CLASSES.pinEmoji)
        );
    }

    /**
     * Skip ephemeral siblings and return the next non-ephemeral sibling
     * @param {Node} sibling - Starting sibling node
     * @returns {Node|null}
     */
    function skipEphemeralSiblings(sibling) {
        let current = sibling;
        while (current && isEphemeral(current)) {
            current = current.nextSibling;
        }
        return current;
    }

    /**
     * Remove all ephemeral elements from the document
     */
    function removeAllEphemeralElements() {
        const selector = `.${CSS_CLASSES.ephemeral}, .${CSS_CLASSES.pinEmoji}`;
        document.querySelectorAll(selector).forEach(el => el.remove());
    }

    /**
     * Get the video.js container and video element
     * @returns {{vjsContainer: Element|null, video: Element|null}}
     */
    function getVideoElements() {
        const vjsContainer = document.querySelector(SELECTORS.videoJsFullscreen) ||
                            document.querySelector(SELECTORS.videoJs);
        const video = vjsContainer?.querySelector("video");
        return { vjsContainer, video };
    }

    /**
     * Extract room ID from iframe src
     * @param {HTMLIFrameElement} iframe - The call iframe
     * @returns {string|null}
     */
    function extractRoomIdFromIframe(iframe) {
        try {
            return new URL(iframe?.src).searchParams.get("roomId");
        } catch {
            console.warn("[Binger] Failed to extract roomId from iframe.");
            return null;
        }
    }

    // ========================================================================
    // IFRAME MANAGEMENT
    // ========================================================================

    /**
     * Restore camera/mic state to iframe after recreation
     * @param {HTMLIFrameElement} iframe - The new iframe
     */
    function restoreCamMicState(iframe) {
        if (!iframe || !window.BINGER?.camMicState) return;

        // Use addEventListener instead of onload to avoid overwriting other handlers
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
     * Broadcast call reset to sync with other users
     * @param {string} roomId - The room ID
     */
    function broadcastCallReset(roomId) {
        if (!roomId) return;
        BingerConnection.sendMessageAsync({
            command: "broadcastCallReset",
            roomId
        });
    }

    /**
     * Sync iframe reference with sessionMode.js
     * @param {HTMLIFrameElement} iframe - The iframe to sync
     */
    function syncIframeReference(iframe) {
        if (typeof window.bingerSetCallIframe === "function") {
            window.bingerSetCallIframe(iframe);
        }
    }

    /**
     * Create a new call iframe
     * @param {object} options - Configuration options
     * @param {string} options.roomId - The room ID
     * @param {boolean} options.isFullscreen - Whether in fullscreen mode
     * @param {boolean} options.wasHidden - Whether iframe was hidden
     * @param {string|null} options.originalStyles - Original inline styles
     * @returns {HTMLIFrameElement}
     */
    function createCallIframe(options) {
        const { roomId, isFullscreen, wasHidden, originalStyles } = options;
        const uid = BingerState.getCurrentUserUid();

        const iframe = document.createElement("iframe");
        iframe.src = chrome.runtime.getURL(`call_app/call.html?roomId=${roomId}&uid=${uid}`);
        iframe.className = "binger-call-iframe";
        iframe.allow = "camera; microphone; autoplay; fullscreen";

        if (isFullscreen) {
            iframe.classList.add(CSS_CLASSES.fullscreen);
        }

        if (wasHidden) {
            iframe.classList.add(CSS_CLASSES.callHidden);
        }

        // Restore original styles if not in fullscreen
        if (!isFullscreen && originalStyles) {
            iframe.setAttribute("style", originalStyles);
        }

        // Setup cam/mic restoration
        restoreCamMicState(iframe);

        return iframe;
    }

    /**
     * Save iframe position for later restoration
     * Only saves if not already saved (prevents overwriting during repeated calls)
     */
    function saveIframePosition() {
        state.iframe = document.querySelector(SELECTORS.callIframe);

        if (state.iframe && !state.iframeOriginalParent) {
            state.iframeOriginalParent = state.iframe.parentNode;
            state.iframeOriginalStyles = state.iframe.getAttribute("style");
            state.iframeNextSibling = skipEphemeralSiblings(state.iframe.nextSibling);
        }
    }

    /**
     * Clear saved iframe position (called after restore)
     */
    function clearIframePosition() {
        state.iframeOriginalParent = null;
        state.iframeNextSibling = null;
        state.iframeOriginalStyles = null;
    }

    /**
     * Recreate iframe in fullscreen row
     * @param {Element} fsRow - The fullscreen row element
     */
    function recreateIframeForFullscreen(fsRow) {
        if (!state.iframe) return;

        const roomId = extractRoomIdFromIframe(state.iframe);
        if (!roomId) return;

        const wasHidden = state.iframe.classList.contains(CSS_CLASSES.callHidden);

        // Tell old iframe to clean up Firebase entries before destroying it
        try {
            state.iframe.contentWindow.postMessage({ type: "cleanupCall" }, "*");
        } catch (err) {
            console.warn("[Binger] Could not send cleanup to old iframe:", err);
        }

        state.iframe.remove();

        const newIframe = createCallIframe({
            roomId,
            isFullscreen: true,
            wasHidden,
            originalStyles: null
        });

        fsRow.prepend(newIframe);
        state.iframe = newIframe;

        broadcastCallReset(roomId);
        syncIframeReference(newIframe);
    }

    /**
     * Recreate iframe in original position after exiting fullscreen
     */
    function recreateIframeForNormal() {
        if (!state.iframeOriginalParent) return;

        const roomId = extractRoomIdFromIframe(state.iframe);
        if (!roomId) return;

        const wasHidden = state.iframe?.classList.contains(CSS_CLASSES.callHidden);

        // Tell old iframe to clean up Firebase entries before destroying it
        try {
            state.iframe?.contentWindow?.postMessage({ type: "cleanupCall" }, "*");
        } catch (err) {
            console.warn("[Binger] Could not send cleanup to old iframe:", err);
        }

        state.iframe?.remove();

        const newIframe = createCallIframe({
            roomId,
            isFullscreen: false,
            wasHidden,
            originalStyles: state.iframeOriginalStyles
        });

        const insertBefore = skipEphemeralSiblings(state.iframeNextSibling);
        state.iframeOriginalParent.insertBefore(newIframe, insertBefore);
        state.iframe = newIframe;

        broadcastCallReset(roomId);
        syncIframeReference(newIframe);

        // Clear saved position after restore
        clearIframePosition();
    }

    // ========================================================================
    // SOUNDBOARD MANAGEMENT
    // ========================================================================

    /**
     * Save soundboard position for later restoration
     */
    function saveSoundboardPosition() {
        const soundboard = document.getElementById("bingerSoundboard");

        if (soundboard && !state.soundboardOriginalParent) {
            state.soundboardOriginalParent = soundboard.parentNode;
            state.soundboardNextSibling = skipEphemeralSiblings(soundboard.nextSibling);
        }
    }

    /**
     * Clear saved soundboard position (called after restore)
     */
    function clearSoundboardPosition() {
        state.soundboardOriginalParent = null;
        state.soundboardNextSibling = null;
    }

    /**
     * Move soundboard to fullscreen row
     * @param {Element} fsRow - The fullscreen row element
     */
    function moveSoundboardToFullscreen(fsRow) {
        const soundboard = document.getElementById("bingerSoundboard");
        if (!soundboard) return;

        saveSoundboardPosition();
        soundboard.classList.add(CSS_CLASSES.fullscreen);
        fsRow.appendChild(soundboard);
    }

    /**
     * Restore soundboard to original position
     */
    function restoreSoundboardPosition() {
        const soundboard = document.getElementById("bingerSoundboard");

        if (soundboard && state.soundboardOriginalParent) {
            soundboard.classList.remove(CSS_CLASSES.fullscreen);
            const insertBefore = skipEphemeralSiblings(state.soundboardNextSibling);
            state.soundboardOriginalParent.insertBefore(soundboard, insertBefore);

            // Clear saved position after restore
            clearSoundboardPosition();
        }
    }

    // ========================================================================
    // DOM CREATION
    // ========================================================================

    /**
     * Create the video region container (70% height)
     * @returns {HTMLDivElement}
     */
    function createVideoRegion() {
        const region = document.createElement("div");
        region.id = "binger-video-region";

        Object.assign(region.style, {
            height: LAYOUT.videoHeight,
            width: "100%",
            display: "flex",
            position: "relative",
            justifyContent: "center",
            alignItems: "center",
            flexDirection: "column",
            overflow: "hidden"
        });

        return region;
    }

    /**
     * Create the fullscreen row container (30% height)
     * @returns {HTMLDivElement}
     */
    function createFullscreenRow() {
        const row = document.createElement("div");
        row.id = "binger-fullscreen-row";

        Object.assign(row.style, {
            display: "flex",
            flexDirection: "row",
            width: "100%",
            height: LAYOUT.overlayHeight,
            justifyContent: "center",
            alignItems: "stretch",
            gap: LAYOUT.rowGap
        });

        return row;
    }

    /**
     * Create the overlay wrapper for fullscreen mode
     * @returns {HTMLDivElement}
     */
    function createOverlayWrapper() {
        const wrapper = document.createElement("div");
        wrapper.id = "binger-wrapper";

        Object.assign(wrapper.style, {
            height: "100%",
            width: LAYOUT.wrapperWidth,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            zIndex: "999999",
            flexShrink: "1"
        });

        return wrapper;
    }

    // ========================================================================
    // LAYOUT FUNCTIONS
    // ========================================================================

    /**
     * Setup fullscreen layout
     * @param {Element} vjsContainer - The video.js container
     * @param {Element} video - The video element
     * @param {Element} overlay - The Binger overlay
     */
    function enterFullscreenLayout(vjsContainer, video, overlay) {
        // Already patched - skip
        if (document.getElementById("binger-video-region")) {
            console.log("[Binger] Already patched - skipping");
            return;
        }

        console.log("[Binger] Entered fullscreen");

        // Save current styles
        state.originalVJSStyles = vjsContainer.getAttribute("style");
        state.originalVideoStyles = video.getAttribute("style");

        // Setup base document styles
        document.documentElement.style.height = "100%";
        document.body.style.height = "100%";

        // Configure video.js container
        Object.assign(vjsContainer.style, {
            display: "flex",
            flexDirection: "column",
            height: "100%",
            width: "100%"
        });

        // Create video region and move children
        state.videoRegion = createVideoRegion();
        [...vjsContainer.children].forEach(child => {
            if (child !== state.videoRegion && !isEphemeral(child)) {
                state.videoRegion.appendChild(child);
            }
        });
        vjsContainer.appendChild(state.videoRegion);

        // Stretch video to fill region
        Object.assign(video.style, {
            width: "100%",
            height: "100%",
            objectFit: "contain"
        });

        // Create fullscreen row
        const fsRow = createFullscreenRow();
        vjsContainer.appendChild(fsRow);

        // Save and recreate iframe
        saveIframePosition();
        recreateIframeForFullscreen(fsRow);

        // Create wrapper and move overlay
        state.wrapper = createOverlayWrapper();
        fsRow.appendChild(state.wrapper);
        state.wrapper.appendChild(overlay);
        overlay.classList.add(CSS_CLASSES.fullscreen);

        // Move soundboard
        moveSoundboardToFullscreen(fsRow);

        // Setup restore function
        state.restoreFn = () => restoreNormalLayout(vjsContainer, video, overlay);
    }

    /**
     * Restore normal layout after exiting fullscreen
     * @param {Element} vjsContainer - The video.js container
     * @param {Element} video - The video element
     * @param {Element} overlay - The Binger overlay
     */
    function restoreNormalLayout(vjsContainer, video, overlay) {
        console.log("[Binger] Restoring normal layout");

        // Move overlay back
        if (state.overlayOriginalParent) {
            const insertBefore = skipEphemeralSiblings(state.overlayNextSibling);
            state.overlayOriginalParent.insertBefore(overlay, insertBefore);
        }
        overlay.classList.remove(CSS_CLASSES.fullscreen);

        // Move soundboard back
        restoreSoundboardPosition();

        // Move video children back
        const videoRegion = document.getElementById("binger-video-region");
        if (videoRegion) {
            while (videoRegion.firstChild) {
                const child = videoRegion.firstChild;
                if (!isEphemeral(child)) {
                    vjsContainer.insertBefore(child, videoRegion);
                } else {
                    child.remove();
                }
            }
            videoRegion.remove();
        }

        // Remove fullscreen elements
        document.getElementById("binger-fullscreen-row")?.remove();
        document.getElementById("binger-wrapper")?.remove();

        // Restore video.js styles
        if (state.originalVJSStyles !== null) {
            vjsContainer.setAttribute("style", state.originalVJSStyles);
        } else {
            vjsContainer.removeAttribute("style");
        }

        if (state.originalVideoStyles !== null) {
            video.setAttribute("style", state.originalVideoStyles);
        } else {
            video.removeAttribute("style");
        }

        // Restore document styles
        document.documentElement.style.height = "";
        document.body.style.height = "";

        // Reset video.js internal elements
        vjsContainer.querySelectorAll(".vjs-tech, .vjs-poster")
            .forEach(el => el.removeAttribute("style"));

        // Trigger video.js resize if available
        if (typeof video.player === "function") {
            setTimeout(() => video.player().resize?.(), 0);
        }

        // Recreate iframe in original position
        recreateIframeForNormal();

        // Reset state
        state.wrapper = null;
        state.videoRegion = null;
        state.restoreFn = null;
        state.originalVJSStyles = null;
        state.originalVideoStyles = null;
    }

    // ========================================================================
    // FULLSCREEN EVENT HANDLER
    // ========================================================================

    /**
     * Handle fullscreen change event
     */
    function handleFullscreenChange() {
        // Prevent race conditions from rapid fullscreen toggles
        if (isProcessingFullscreen) {
            console.log("[Binger] Already processing fullscreen change - skipping");
            return;
        }

        isProcessingFullscreen = true;

        BingerConnection.sendMessage({ command: "checkAuth" })
            .then((response) => {
                // Skip if user not signed in
                if (!response?.user) {
                    console.log("[Binger] Ignoring fullscreen change (user signed out)");
                    isProcessingFullscreen = false;
                    return;
                }

                const { vjsContainer, video } = getVideoElements();

                if (!vjsContainer || !video) {
                    console.warn("[Binger] fullscreenchange: no vjsContainer or video");
                    isProcessingFullscreen = false;
                    return;
                }

                // Remove floating emojis
                removeAllEphemeralElements();

                const isFullscreen = !!document.fullscreenElement;

                try {
                    if (isFullscreen) {
                        enterFullscreenLayout(vjsContainer, video, state.overlay);
                    } else {
                        if (state.restoreFn) {
                            state.restoreFn();
                        } else {
                            // Emergency fallback
                            console.warn("[Binger] restoreFn missing - attempting manual cleanup");
                            restoreNormalLayout(vjsContainer, video, state.overlay);
                        }
                    }
                } catch (err) {
                    console.error("[Binger] Error during fullscreen transition:", err);
                }

                isProcessingFullscreen = false;
            })
            .catch((err) => {
                console.warn("[Binger] Auth check failed:", err);
                isProcessingFullscreen = false;
            });
    }

    // ========================================================================
    // PUBLIC API
    // ========================================================================

    /**
     * Attach fullscreen listener to the overlay
     * @param {string} overlaySelector - CSS selector for the overlay
     */
    function attachFullscreenListener(overlaySelector = SELECTORS.overlay) {
        // Prevent duplicate listener attachment
        if (fullscreenListenerAttached) {
            console.log("[Binger] Fullscreen listener already attached - skipping");
            return;
        }

        state.overlay = document.querySelector(overlaySelector);

        if (!state.overlay) {
            console.warn("[Binger] Overlay not found, fullscreen hook skipped");
            return;
        }

        // Save overlay's original position
        state.overlayOriginalParent = state.overlay.parentNode;
        state.overlayNextSibling = state.overlay.nextSibling;

        // Attach event listener
        document.addEventListener("fullscreenchange", handleFullscreenChange);
        fullscreenListenerAttached = true;
    }

    // ========================================================================
    // EXPOSE TO WINDOW
    // ========================================================================

    window.BingerFullscreen = {
        init: attachFullscreenListener
    };

})();