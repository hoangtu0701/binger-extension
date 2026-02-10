(function() {
    "use strict";

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
        rowGap: "0px"
    };

    const CSS_CLASSES = {
        fullscreen: "fullscreen",
        callHidden: "binger-call-hidden",
        ephemeral: "binger-ephemeral",
        pinEmoji: "binger-pin-emoji"
    };

    const state = {
        overlay: null,
        overlayOriginalParent: null,
        overlayNextSibling: null,

        iframe: null,
        iframeOriginalParent: null,
        iframeNextSibling: null,
        iframeOriginalStyles: null,

        soundboardOriginalParent: null,
        soundboardNextSibling: null,

        originalVJSStyles: null,
        originalVideoStyles: null,

        wrapper: null,
        videoRegion: null,

        restoreFn: null
    };

    let fullscreenListenerAttached = false;
    let isProcessingFullscreen = false;

    function isEphemeral(node) {
        return (
            node?.classList?.contains(CSS_CLASSES.ephemeral) ||
            node?.classList?.contains(CSS_CLASSES.pinEmoji)
        );
    }

    function skipEphemeralSiblings(sibling) {
        let current = sibling;
        while (current && isEphemeral(current)) {
            current = current.nextSibling;
        }
        return current;
    }

    function removeAllEphemeralElements() {
        const selector = `.${CSS_CLASSES.ephemeral}, .${CSS_CLASSES.pinEmoji}`;
        document.querySelectorAll(selector).forEach(el => el.remove());
    }

    function getVideoElements() {
        const vjsContainer = document.querySelector(SELECTORS.videoJsFullscreen) ||
                            document.querySelector(SELECTORS.videoJs);
        const video = vjsContainer?.querySelector("video");
        return { vjsContainer, video };
    }

    function extractRoomIdFromIframe(iframe) {
        try {
            return new URL(iframe?.src).searchParams.get("roomId");
        } catch {
            console.warn("[Binger] Failed to extract roomId from iframe.");
            return null;
        }
    }

    function restoreCamMicState(iframe) {
        if (!iframe || !window.BINGER?.camMicState) return;

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

    function broadcastCallReset(roomId) {
        if (!roomId) return;
        BingerConnection.sendMessageAsync({
            command: "broadcastCallReset",
            roomId
        });
    }

    function syncIframeReference(iframe) {
        if (typeof window.bingerSetCallIframe === "function") {
            window.bingerSetCallIframe(iframe);
        }
    }

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

        if (!isFullscreen && originalStyles) {
            iframe.setAttribute("style", originalStyles);
        }

        restoreCamMicState(iframe);

        return iframe;
    }

    function saveIframePosition() {
        state.iframe = document.querySelector(SELECTORS.callIframe);

        if (state.iframe && !state.iframeOriginalParent) {
            state.iframeOriginalParent = state.iframe.parentNode;
            state.iframeOriginalStyles = state.iframe.getAttribute("style");
            state.iframeNextSibling = skipEphemeralSiblings(state.iframe.nextSibling);
        }
    }

    function clearIframePosition() {
        state.iframeOriginalParent = null;
        state.iframeNextSibling = null;
        state.iframeOriginalStyles = null;
    }

    function recreateIframeForFullscreen(fsRow) {
        if (!state.iframe) return;

        const roomId = extractRoomIdFromIframe(state.iframe);
        if (!roomId) return;

        const wasHidden = state.iframe.classList.contains(CSS_CLASSES.callHidden);

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

    function recreateIframeForNormal() {
        if (!state.iframeOriginalParent) return;

        const roomId = extractRoomIdFromIframe(state.iframe);
        if (!roomId) return;

        const wasHidden = state.iframe?.classList.contains(CSS_CLASSES.callHidden);

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

        clearIframePosition();
    }

    function saveSoundboardPosition() {
        const soundboard = document.getElementById("bingerSoundboard");

        if (soundboard && !state.soundboardOriginalParent) {
            state.soundboardOriginalParent = soundboard.parentNode;
            state.soundboardNextSibling = skipEphemeralSiblings(soundboard.nextSibling);
        }
    }

    function clearSoundboardPosition() {
        state.soundboardOriginalParent = null;
        state.soundboardNextSibling = null;
    }

    function moveSoundboardToFullscreen(fsRow) {
        const soundboard = document.getElementById("bingerSoundboard");
        if (!soundboard) return;

        saveSoundboardPosition();
        soundboard.classList.add(CSS_CLASSES.fullscreen);
        fsRow.appendChild(soundboard);
    }

    function restoreSoundboardPosition() {
        const soundboard = document.getElementById("bingerSoundboard");

        if (soundboard && state.soundboardOriginalParent) {
            soundboard.classList.remove(CSS_CLASSES.fullscreen);
            const insertBefore = skipEphemeralSiblings(state.soundboardNextSibling);
            state.soundboardOriginalParent.insertBefore(soundboard, insertBefore);
            clearSoundboardPosition();
        }
    }

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

    function createOverlayWrapper() {
        const wrapper = document.createElement("div");
        wrapper.id = "binger-wrapper";

        Object.assign(wrapper.style, {
            height: "100%",
            width: "fit-content",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            zIndex: "999999",
            flexShrink: "1"
        });

        return wrapper;
    }

    function enterFullscreenLayout(vjsContainer, video, overlay) {
        if (document.getElementById("binger-video-region")) return;

        state.originalVJSStyles = vjsContainer.getAttribute("style");
        state.originalVideoStyles = video.getAttribute("style");

        document.documentElement.style.height = "100%";
        document.body.style.height = "100%";

        Object.assign(vjsContainer.style, {
            display: "flex",
            flexDirection: "column",
            height: "100%",
            width: "100%"
        });

        state.videoRegion = createVideoRegion();
        [...vjsContainer.children].forEach(child => {
            if (child !== state.videoRegion && !isEphemeral(child)) {
                state.videoRegion.appendChild(child);
            }
        });
        vjsContainer.appendChild(state.videoRegion);

        Object.assign(video.style, {
            width: "100%",
            height: "100%",
            objectFit: "contain"
        });

        const fsRow = createFullscreenRow();
        vjsContainer.appendChild(fsRow);

        saveIframePosition();
        recreateIframeForFullscreen(fsRow);

        state.wrapper = createOverlayWrapper();
        fsRow.appendChild(state.wrapper);
        state.wrapper.appendChild(overlay);
        overlay.classList.add(CSS_CLASSES.fullscreen);

        moveSoundboardToFullscreen(fsRow);

        const iframeEl = fsRow.querySelector("iframe.binger-call-iframe");
        if (iframeEl && !iframeEl.classList.contains(CSS_CLASSES.callHidden)) {
            fsRow.classList.add("binger-call-visible");
        }

        state.restoreFn = () => restoreNormalLayout(vjsContainer, video, overlay);
    }

    function restoreNormalLayout(vjsContainer, video, overlay) {
        if (state.overlayOriginalParent) {
            const insertBefore = skipEphemeralSiblings(state.overlayNextSibling);
            state.overlayOriginalParent.insertBefore(overlay, insertBefore);
        }
        overlay.classList.remove(CSS_CLASSES.fullscreen);

        restoreSoundboardPosition();

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

        document.getElementById("binger-fullscreen-row")?.remove();
        document.getElementById("binger-wrapper")?.remove();

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

        document.documentElement.style.height = "";
        document.body.style.height = "";

        vjsContainer.querySelectorAll(".vjs-tech, .vjs-poster")
            .forEach(el => el.removeAttribute("style"));

        if (typeof video.player === "function") {
            setTimeout(() => video.player().resize?.(), 0);
        }

        recreateIframeForNormal();

        state.wrapper = null;
        state.videoRegion = null;
        state.restoreFn = null;
        state.originalVJSStyles = null;
        state.originalVideoStyles = null;
    }

    function handleFullscreenChange() {
        if (isProcessingFullscreen) return;

        isProcessingFullscreen = true;

        BingerConnection.sendMessage({ command: "checkAuth" })
            .then((response) => {
                if (!response?.user) {
                    isProcessingFullscreen = false;
                    return;
                }

                const { vjsContainer, video } = getVideoElements();

                if (!vjsContainer || !video) {
                    console.warn("[Binger] fullscreenchange: no vjsContainer or video");
                    isProcessingFullscreen = false;
                    return;
                }

                removeAllEphemeralElements();

                const isFullscreen = !!document.fullscreenElement;

                try {
                    if (isFullscreen) {
                        enterFullscreenLayout(vjsContainer, video, state.overlay);
                    } else {
                        if (state.restoreFn) {
                            state.restoreFn();
                        } else {
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

    function attachFullscreenListener(overlaySelector = SELECTORS.overlay) {
        if (fullscreenListenerAttached) return;

        state.overlay = document.querySelector(overlaySelector);

        if (!state.overlay) {
            console.warn("[Binger] Overlay not found, fullscreen hook skipped");
            return;
        }

        state.overlayOriginalParent = state.overlay.parentNode;
        state.overlayNextSibling = state.overlay.nextSibling;

        document.addEventListener("fullscreenchange", handleFullscreenChange);
        fullscreenListenerAttached = true;
    }

    window.BingerFullscreen = {
        init: attachFullscreenListener
    };

})();