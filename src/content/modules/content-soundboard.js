(function() {
    "use strict";

    const SELECTORS = {
        soundboard: "#bingerSoundboard",
        videoRegion: "#binger-video-region",
        overlay: "#bingerOverlay",
        video: "video"
    };

    const CSS_CLASSES = {
        soundboard: "binger-soundboard",
        fullscreen: "fullscreen",
        soundSection: "binger-sound-section",
        visualSection: "binger-visual-section",
        divider: "binger-divider",
        soundBtn: "binger-sound-btn",
        visualBtn: "binger-visual-btn",
        pinEmoji: "binger-pin-emoji",
        ephemeral: "binger-ephemeral"
    };

    const CONFIG = {
        pinDuration: 5000,
        pinFadeTime: 500,
        visualDuration: 2000,
        pinFontSize: "48px",
        visualFontSize: "48px"
    };

    const SOUND_FILES = {
        adlib: "binger_assets/soundboard/adlib.mp3",
        aergh: "binger_assets/soundboard/aergh.mp3",
        ah: "binger_assets/soundboard/ah.mp3",
        corruption: "binger_assets/soundboard/corruption.mp3",
        fart: "binger_assets/soundboard/fart.mp3",
        flute: "binger_assets/soundboard/flute.mp3",
        hmm: "binger_assets/soundboard/hmm.mp3",
        hoop1: "binger_assets/soundboard/hoop1.mp3",
        hoop2: "binger_assets/soundboard/hoop2.mp3",
        mysterious: "binger_assets/soundboard/mysterious.mp3",
        pipe: "binger_assets/soundboard/pipe.mp3",
        re: "binger_assets/soundboard/re.mp3",
        rose: "binger_assets/soundboard/rose.mp3",
        silentH: "binger_assets/soundboard/silentH.mp3",
        slap: "binger_assets/soundboard/slap.mp3"
    };

    const SOUNDS = [
        { id: "aergh", emoji: "\uD83D\uDE2B" },
        { id: "flute", emoji: "\uD83C\uDFB6" },
        { id: "hmm", emoji: "\uD83E\uDD14" },
        { id: "pipe", emoji: "\uD83D\uDD29" },
        { id: "rose", emoji: "\uD83E\uDD40" }
    ];

    const VISUALS = [
        { id: "mad", emoji: "\uD83E\uDD2C" },
        { id: "poop", emoji: "\uD83D\uDCA9" },
        { id: "sadtears", emoji: "\uD83E\uDD72" },
        { id: "laugh", emoji: "\uD83E\uDD23" },
        { id: "hammer", emoji: "\uD83D\uDD28" },
        { id: "hearts", emoji: "\uD83E\uDD70" },
        { id: "smile", emoji: "\uD83D\uDE00" },
        { id: "disguise", emoji: "\uD83E\uDD78" },
        { id: "pleading", emoji: "\uD83E\uDD7A" },
        { id: "shock", emoji: "\uD83E\uDEE8" }
    ];

    const PIN_ANIMATIONS = {
        mad: "madGlowShake 0.8s infinite",
        poop: "poopBounce 1s infinite",
        sadtears: "sadTearsDrop 1.2s infinite",
        laugh: "laughShake 0.6s infinite",
        hammer: "hammerSlam 0.8s ease-in-out infinite",
        hearts: "heartPulse 1s ease-in-out infinite",
        smile: "smilePop 0.8s ease-in-out",
        disguise: "disguiseWiggle 1s infinite",
        pleading: "pleadingTilt 2s ease-in-out infinite",
        shock: "shockTremble 0.6s infinite"
    };

    const PIN_ANIMATION_CSS = `
        @keyframes madGlowShake {
            0%, 100% { transform: translateX(0); filter: drop-shadow(0 0 0px red); }
            25% { transform: translateX(-5px) rotate(-5deg); filter: drop-shadow(0 0 8px red); }
            50% { transform: translateX(5px) rotate(5deg); filter: drop-shadow(0 0 12px orange); }
            75% { transform: translateX(-3px) rotate(-3deg); filter: drop-shadow(0 0 8px red); }
        }
        @keyframes poopBounce {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-20px); }
        }
        @keyframes sadTearsDrop {
            0% { transform: translateY(0); opacity: 1; }
            50% { transform: translateY(10px); opacity: 0.7; }
            100% { transform: translateY(20px); opacity: 0; }
        }
        @keyframes laughShake {
            0%, 100% { transform: translateX(0); }
            25% { transform: translateX(-6px) rotate(-5deg); }
            75% { transform: translateX(6px) rotate(5deg); }
        }
        @keyframes hammerSlam {
            0% { transform: rotate(0deg) translateY(0); }
            25% { transform: rotate(-90deg) translateY(-10px); }
            50% { transform: rotate(0deg) translateY(0); }
            75% { transform: rotate(-90deg) translateY(-10px); }
            100% { transform: rotate(0deg) translateY(0); }
        }
        @keyframes heartPulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.1); }
        }
        @keyframes smilePop {
            0% { transform: scale(0.8); opacity: 0.5; }
            50% { transform: scale(1.3); opacity: 1; }
            100% { transform: scale(1); opacity: 1; }
        }
        @keyframes disguiseWiggle {
            0%, 100% { transform: rotate(0deg); }
            25% { transform: rotate(5deg); }
            50% { transform: rotate(-5deg); }
            75% { transform: rotate(5deg); }
        }
        @keyframes pleadingTilt {
            0%, 100% { transform: rotate(0deg); }
            50% { transform: rotate(15deg); }
        }
        @keyframes shockTremble {
            0%, 100% { transform: translateX(0) rotate(0); }
            25% { transform: translateX(-3px) rotate(-2deg); }
            75% { transform: translateX(3px) rotate(2deg); }
        }
    `;

    const FLOAT_ANIMATION_CSS = `
        @keyframes floatDrift {
            0% { transform: translate(0, 0) scale(1); opacity: 1; }
            50% { transform: translate(var(--drift-x), -75px) scale(1.2); opacity: 0.8; }
            100% { transform: translate(calc(var(--drift-x) * 2), -150px) scale(1); opacity: 0; }
        }
        @keyframes floatPop {
            0% { transform: translateY(0) scale(0.8); opacity: 0; }
            20% { transform: translateY(-30px) scale(1.3); opacity: 1; }
            80% { transform: translateY(-120px) scale(1); opacity: 0.8; }
            100% { transform: translateY(-150px) scale(0.9); opacity: 0; }
        }
        @keyframes floatSpiral {
            0% { transform: translateY(0) rotate(0deg); opacity: 1; }
            100% { transform: translateY(-180px) rotate(360deg); opacity: 0; }
        }
    `;

    const state = {
        soundboardEl: null,
        currentRoomId: null,
        listenerAttached: false,
        initialized: false
    };

    const audioMap = {};
    const readyAudioSet = new Set();

    function injectAnimationStyles() {
        if (!document.getElementById("bingerPinAnimations")) {
            const style = document.createElement("style");
            style.id = "bingerPinAnimations";
            style.textContent = PIN_ANIMATION_CSS;
            document.head.appendChild(style);
        }

        if (!document.getElementById("bingerFloatAnimations")) {
            const style = document.createElement("style");
            style.id = "bingerFloatAnimations";
            style.textContent = FLOAT_ANIMATION_CSS;
            document.head.appendChild(style);
        }
    }

    function preloadAudio() {
        for (const [id, path] of Object.entries(SOUND_FILES)) {
            const audio = new Audio(chrome.runtime.getURL(path));
            audio.addEventListener("canplaythrough", () => {
                readyAudioSet.add(id);
            }, { once: true });
            audio.load();
            audioMap[id] = audio;
        }
    }

    function playSound(soundId) {
        if (!soundId || typeof soundId !== "string") return;

        const audio = audioMap[soundId];
        if (audio) {
            audio.currentTime = 0;
            audio.play().catch((e) =>
                console.warn("[Binger] Failed to play sound:", soundId, e)
            );
        }
    }

    function getEffectContainer() {
        const videoRegion = document.querySelector(SELECTORS.videoRegion);
        const overlay = document.querySelector(SELECTORS.overlay);
        return videoRegion || overlay?.parentNode || document.body;
    }

    function findVisualById(visualId) {
        return VISUALS.find(v => v.id === visualId);
    }

    function findVisualByEmoji(emoji) {
        return VISUALS.find(v => v.emoji === emoji);
    }

    function triggerVisualEffect(effectId) {
        if (!effectId || typeof effectId !== "string") return;

        const visual = findVisualById(effectId);
        const emoji = visual?.emoji || "?";

        const el = document.createElement("div");
        el.className = `visual-effect ${CSS_CLASSES.ephemeral}`;
        el.innerText = emoji;

        const animations = ["floatDrift", "floatPop", "floatSpiral"];
        const chosen = animations[Math.floor(Math.random() * animations.length)];

        if (chosen === "floatDrift") {
            const driftX = Math.random() > 0.5 ? "40px" : "-40px";
            el.style.setProperty("--drift-x", driftX);
        }

        Object.assign(el.style, {
            position: "absolute",
            fontSize: CONFIG.visualFontSize,
            animation: `${chosen} 2s ease-out`,
            bottom: "20px",
            left: `${Math.random() * 80 + 10}%`,
            zIndex: "2147483647",
            pointerEvents: "auto",
            cursor: "grab"
        });

        getEffectContainer().appendChild(el);

        const despawnTimer = setTimeout(() => el.remove(), CONFIG.visualDuration);

        setupDragToPinBehavior(el, despawnTimer);
    }

    function getEventCoordinates(e) {
        if (e.touches && e.touches.length > 0) {
            return {
                clientX: e.touches[0].clientX,
                clientY: e.touches[0].clientY
            };
        }
        if (e.changedTouches && e.changedTouches.length > 0) {
            return {
                clientX: e.changedTouches[0].clientX,
                clientY: e.changedTouches[0].clientY
            };
        }
        return {
            clientX: e.clientX,
            clientY: e.clientY
        };
    }

    function setupDragToPinBehavior(el, despawnTimer) {
        function handleDragStart(e) {
            e.preventDefault();
            clearTimeout(despawnTimer);
            el.style.animation = "none";

            const coords = getEventCoordinates(e);
            const rect = el.getBoundingClientRect();
            const offsetX = coords.clientX - rect.left;
            const offsetY = coords.clientY - rect.top;

            document.body.style.cursor = "crosshair";

            function handleMove(ev) {
                const moveCoords = getEventCoordinates(ev);
                el.style.left = `${moveCoords.clientX - offsetX}px`;
                el.style.top = `${moveCoords.clientY - offsetY}px`;
            }

            function handleEnd(ev) {
                window.removeEventListener("mousemove", handleMove);
                window.removeEventListener("mouseup", handleEnd);
                window.removeEventListener("touchmove", handleMove);
                window.removeEventListener("touchend", handleEnd);
                window.removeEventListener("touchcancel", handleEnd);

                document.body.style.cursor = "";

                const endCoords = getEventCoordinates(ev);

                const video = document.querySelector(SELECTORS.video);
                if (video) {
                    const videoRect = video.getBoundingClientRect();
                    const isOverVideo = (
                        endCoords.clientX >= videoRect.left &&
                        endCoords.clientX <= videoRect.right &&
                        endCoords.clientY >= videoRect.top &&
                        endCoords.clientY <= videoRect.bottom
                    );

                    if (isOverVideo) {
                        const relX = (endCoords.clientX - videoRect.left) / videoRect.width;
                        const relY = (endCoords.clientY - videoRect.top) / videoRect.height;
                        const visual = findVisualByEmoji(el.innerText);

                        BingerConnection.sendMessageAsync({
                            command: "requestPin",
                            visualId: visual?.id,
                            relX,
                            relY
                        });
                    }
                }

                el.remove();
            }

            window.addEventListener("mousemove", handleMove);
            window.addEventListener("mouseup", handleEnd);
            window.addEventListener("touchmove", handleMove, { passive: false });
            window.addEventListener("touchend", handleEnd);
            window.addEventListener("touchcancel", handleEnd);
        }

        el.addEventListener("mousedown", handleDragStart);
        el.addEventListener("touchstart", handleDragStart, { passive: false });
    }

    function displayPin({ visualId, relX, relY }) {
        const video = document.querySelector(SELECTORS.video);
        if (!video) return;

        if (!visualId || typeof visualId !== "string") return;
        if (typeof relX !== "number" || typeof relY !== "number") return;

        const clampedX = Math.max(0, Math.min(1, relX));
        const clampedY = Math.max(0, Math.min(1, relY));

        const visual = findVisualById(visualId);
        const emoji = visual?.emoji || "?";

        const rect = video.getBoundingClientRect();
        const absX = rect.left + clampedX * rect.width;
        const absY = rect.top + clampedY * rect.height;

        const pinEl = document.createElement("div");
        pinEl.className = CSS_CLASSES.pinEmoji;
        pinEl.textContent = emoji;

        const animation = PIN_ANIMATIONS[visualId] || "";

        Object.assign(pinEl.style, {
            position: "absolute",
            left: `${absX - 24}px`,
            top: `${absY - 24}px`,
            fontSize: CONFIG.pinFontSize,
            lineHeight: CONFIG.pinFontSize,
            zIndex: "2147483647",
            pointerEvents: "none",
            transition: "opacity 0.5s ease",
            animation
        });

        getEffectContainer().appendChild(pinEl);

        setTimeout(() => {
            pinEl.style.opacity = "0";
            setTimeout(() => pinEl.remove(), CONFIG.pinFadeTime);
        }, CONFIG.pinDuration);
    }

    function createSoundButton(sound) {
        const btn = document.createElement("button");
        btn.className = CSS_CLASSES.soundBtn;
        btn.innerText = sound.emoji;
        btn.title = sound.id;
        btn.onclick = () => {
            BingerConnection.sendMessageAsync({
                command: "requestSoundEffect",
                soundId: sound.id
            });
        };
        return btn;
    }

    function createVisualButton(visual) {
        const btn = document.createElement("button");
        btn.className = CSS_CLASSES.visualBtn;
        btn.innerText = visual.emoji;
        btn.title = visual.id;
        btn.onclick = () => {
            BingerConnection.sendMessageAsync({
                command: "requestVisualEffect",
                visualId: visual.id
            });
        };
        return btn;
    }

    function createSoundboardUI() {
        if (state.soundboardEl) return;

        state.soundboardEl = document.createElement("div");
        state.soundboardEl.id = "bingerSoundboard";
        state.soundboardEl.className = CSS_CLASSES.soundboard;

        const visualSection = document.createElement("div");
        visualSection.className = CSS_CLASSES.visualSection;
        VISUALS.forEach(visual => {
            visualSection.appendChild(createVisualButton(visual));
        });

        const divider = document.createElement("div");
        divider.className = CSS_CLASSES.divider;

        const soundSection = document.createElement("div");
        soundSection.className = CSS_CLASSES.soundSection;
        SOUNDS.forEach(sound => {
            soundSection.appendChild(createSoundButton(sound));
        });

        state.soundboardEl.appendChild(visualSection);
        state.soundboardEl.appendChild(divider);
        state.soundboardEl.appendChild(soundSection);
        document.body.appendChild(state.soundboardEl);

        startListeners();
    }

    function destroySoundboardUI() {
        if (state.soundboardEl) {
            state.soundboardEl.remove();
            state.soundboardEl = null;
        }

        stopListeners();
    }

    function startListeners() {
        chrome.storage.local.get("bingerCurrentRoomId", (result) => {
            if (chrome.runtime.lastError) {
                console.warn("[Binger] Storage error in startListeners:", chrome.runtime.lastError.message);
                return;
            }

            const bingerCurrentRoomId = result?.bingerCurrentRoomId;
            if (!bingerCurrentRoomId) return;
            if (state.listenerAttached && state.currentRoomId === bingerCurrentRoomId) return;

            BingerConnection.sendMessageAsync({
                command: "startSoundboardListener",
                roomId: bingerCurrentRoomId
            });

            BingerConnection.sendMessageAsync({
                command: "startVisualboardListener",
                roomId: bingerCurrentRoomId
            });

            BingerConnection.sendMessageAsync({
                command: "startPinListener",
                roomId: bingerCurrentRoomId
            });

            state.listenerAttached = true;
            state.currentRoomId = bingerCurrentRoomId;
        });
    }

    function stopListeners() {
        if (state.listenerAttached && state.currentRoomId) {
            BingerConnection.sendMessageAsync({
                command: "stopSoundboardListener",
                roomId: state.currentRoomId
            });

            BingerConnection.sendMessageAsync({
                command: "stopVisualboardListener",
                roomId: state.currentRoomId
            });

            BingerConnection.sendMessageAsync({
                command: "stopPinListener",
                roomId: state.currentRoomId
            });

            state.listenerAttached = false;
            state.currentRoomId = null;
        }
    }

    function handleMessage(msg) {
        if (!msg || typeof msg !== "object") return;

        switch (msg.command) {
            case "toggleSoundboard":
                if (msg.inSession) {
                    createSoundboardUI();
                } else {
                    destroySoundboardUI();
                }
                break;

            case "playSoundEffect":
                playSound(msg.soundId);
                break;

            case "playVisualEffect":
                triggerVisualEffect(msg.visualId);
                break;

            case "updatePin":
                if (msg.visualId && msg.timestamp) {
                    displayPin({
                        visualId: msg.visualId,
                        relX: msg.relX,
                        relY: msg.relY
                    });
                }
                break;
        }
    }

    function init() {
        if (state.initialized) return;

        injectAnimationStyles();
        preloadAudio();
        chrome.runtime.onMessage.addListener(handleMessage);

        state.initialized = true;
    }

    window.BingerSoundboard = {
        init,
        create: createSoundboardUI,
        destroy: destroySoundboardUI,
        playSound,
        triggerVisualEffect,
        displayPin
    };

})();