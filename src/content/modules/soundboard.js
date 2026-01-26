// ============================================================================
// SOUNDBOARD MODULE
// Handles sound effects, visual effects, and emoji pins during sessions
// ============================================================================

(function() {
    "use strict";

    // ========================================================================
    // CONSTANTS
    // ========================================================================

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

    // ========================================================================
    // SOUND & VISUAL DEFINITIONS
    // ========================================================================

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
        { id: "aergh", emoji: "\uD83D\uDE2B" },  // grimacing
        { id: "flute", emoji: "\uD83C\uDFB6" },  // music notes
        { id: "hmm", emoji: "\uD83E\uDD14" },    // thinking
        { id: "pipe", emoji: "\uD83D\uDD29" },   // nut and bolt
        { id: "rose", emoji: "\uD83E\uDD40" }    // wilted flower
    ];

    const VISUALS = [
        { id: "mad", emoji: "\uD83E\uDD2C" },       // angry with symbols
        { id: "poop", emoji: "\uD83D\uDCA9" },      // poop
        { id: "sadtears", emoji: "\uD83E\uDD72" },  // smiling with tear
        { id: "laugh", emoji: "\uD83E\uDD23" },     // rofl
        { id: "hammer", emoji: "\uD83D\uDD28" },    // hammer
        { id: "hearts", emoji: "\uD83E\uDD70" },    // smiling with hearts
        { id: "smile", emoji: "\uD83D\uDE00" },     // grinning
        { id: "disguise", emoji: "\uD83E\uDD78" },  // disguised face
        { id: "pleading", emoji: "\uD83E\uDD7A" },  // pleading
        { id: "shock", emoji: "\uD83E\uDEE8" }      // shaking face
    ];

    // ========================================================================
    // ANIMATION DEFINITIONS
    // ========================================================================

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

    // ========================================================================
    // STATE
    // ========================================================================

    const state = {
        soundboardEl: null,
        currentRoomId: null,
        listenerAttached: false
    };

    // Audio cache
    const audioMap = {};
    const readyAudioSet = new Set();

    // ========================================================================
    // INITIALIZATION
    // ========================================================================

    /**
     * Inject animation styles into document head
     */
    function injectAnimationStyles() {
        // Pin animations
        if (!document.getElementById("bingerPinAnimations")) {
            const style = document.createElement("style");
            style.id = "bingerPinAnimations";
            style.textContent = PIN_ANIMATION_CSS;
            document.head.appendChild(style);
        }

        // Float animations
        if (!document.getElementById("bingerFloatAnimations")) {
            const style = document.createElement("style");
            style.id = "bingerFloatAnimations";
            style.textContent = FLOAT_ANIMATION_CSS;
            document.head.appendChild(style);
        }
    }

    /**
     * Preload all audio files
     */
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

    // ========================================================================
    // AUDIO PLAYBACK
    // ========================================================================

    /**
     * Play a sound effect
     * @param {string} soundId - The sound ID to play
     */
    function playSound(soundId) {
        const audio = audioMap[soundId];
        if (audio) {
            audio.currentTime = 0;
            audio.play().catch((e) =>
                console.warn("[Binger] Failed to play sound:", soundId, e)
            );
        } else {
            console.warn("[Binger] Unknown soundId:", soundId);
        }
    }

    // ========================================================================
    // VISUAL EFFECTS
    // ========================================================================

    /**
     * Get the container element for visual effects
     * @returns {Element}
     */
    function getEffectContainer() {
        const videoRegion = document.querySelector(SELECTORS.videoRegion);
        const overlay = document.querySelector(SELECTORS.overlay);
        return videoRegion || overlay?.parentNode || document.body;
    }

    /**
     * Find visual definition by ID
     * @param {string} visualId
     * @returns {object|undefined}
     */
    function findVisualById(visualId) {
        return VISUALS.find(v => v.id === visualId);
    }

    /**
     * Find visual definition by emoji
     * @param {string} emoji
     * @returns {object|undefined}
     */
    function findVisualByEmoji(emoji) {
        return VISUALS.find(v => v.emoji === emoji);
    }

    /**
     * Trigger a floating visual effect
     * @param {string} effectId - The visual effect ID
     */
    function triggerVisualEffect(effectId) {
        const visual = findVisualById(effectId);
        const emoji = visual?.emoji || "?";

        const el = document.createElement("div");
        el.className = `visual-effect ${CSS_CLASSES.ephemeral}`;
        el.innerText = emoji;

        // Pick random animation
        const animations = ["floatDrift", "floatPop", "floatSpiral"];
        const chosen = animations[Math.floor(Math.random() * animations.length)];

        // Set drift direction for floatDrift
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

        // Auto-remove if untouched
        const despawnTimer = setTimeout(() => el.remove(), CONFIG.visualDuration);

        // Setup drag-to-pin functionality
        setupDragToPinBehavior(el, despawnTimer);
    }

    /**
     * Setup drag-to-pin behavior for visual element
     * @param {HTMLElement} el - The visual element
     * @param {number} despawnTimer - The auto-remove timer
     */
    function setupDragToPinBehavior(el, despawnTimer) {
        el.addEventListener("mousedown", (e) => {
            e.preventDefault();
            clearTimeout(despawnTimer);
            el.style.animation = "none";

            const rect = el.getBoundingClientRect();
            const offsetX = e.clientX - rect.left;
            const offsetY = e.clientY - rect.top;

            document.body.style.cursor = "crosshair";

            const move = (ev) => {
                el.style.left = `${ev.clientX - offsetX}px`;
                el.style.top = `${ev.clientY - offsetY}px`;
            };

            const up = (ev) => {
                window.removeEventListener("mousemove", move);
                window.removeEventListener("mouseup", up);
                document.body.style.cursor = "";

                // Check if dropped on video
                const video = document.querySelector(SELECTORS.video);
                if (video) {
                    const rect = video.getBoundingClientRect();
                    const isOverVideo = (
                        ev.clientX >= rect.left &&
                        ev.clientX <= rect.right &&
                        ev.clientY >= rect.top &&
                        ev.clientY <= rect.bottom
                    );

                    if (isOverVideo) {
                        const relX = (ev.clientX - rect.left) / rect.width;
                        const relY = (ev.clientY - rect.top) / rect.height;
                        const visual = findVisualByEmoji(el.innerText);

                        chrome.runtime.sendMessage({
                            command: "requestPin",
                            visualId: visual?.id,
                            relX,
                            relY
                        });
                    }
                }

                el.remove();
            };

            window.addEventListener("mousemove", move);
            window.addEventListener("mouseup", up);
        });
    }

    // ========================================================================
    // PIN EFFECTS
    // ========================================================================

    /**
     * Display a pin on the video
     * @param {object} options - Pin options
     * @param {string} options.visualId - The visual ID
     * @param {number} options.relX - Relative X position (0-1)
     * @param {number} options.relY - Relative Y position (0-1)
     */
    function displayPin({ visualId, relX, relY }) {
        const video = document.querySelector(SELECTORS.video);
        if (!video) return;

        const visual = findVisualById(visualId);
        const emoji = visual?.emoji || "?";

        // Calculate absolute position
        const rect = video.getBoundingClientRect();
        const absX = rect.left + relX * rect.width;
        const absY = rect.top + relY * rect.height;

        // Create pin element
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

        // Auto-remove after duration
        setTimeout(() => {
            pinEl.style.opacity = "0";
            setTimeout(() => pinEl.remove(), CONFIG.pinFadeTime);
        }, CONFIG.pinDuration);
    }

    // ========================================================================
    // UI CREATION
    // ========================================================================

    /**
     * Create a sound button
     * @param {object} sound - Sound definition { id, emoji }
     * @returns {HTMLButtonElement}
     */
    function createSoundButton(sound) {
        const btn = document.createElement("button");
        btn.className = CSS_CLASSES.soundBtn;
        btn.innerText = sound.emoji;
        btn.title = sound.id;
        btn.onclick = () => {
            chrome.runtime.sendMessage({
                command: "requestSoundEffect",
                soundId: sound.id
            });
        };
        return btn;
    }

    /**
     * Create a visual button
     * @param {object} visual - Visual definition { id, emoji }
     * @returns {HTMLButtonElement}
     */
    function createVisualButton(visual) {
        const btn = document.createElement("button");
        btn.className = CSS_CLASSES.visualBtn;
        btn.innerText = visual.emoji;
        btn.title = visual.id;
        btn.onclick = () => {
            chrome.runtime.sendMessage({
                command: "requestVisualEffect",
                visualId: visual.id
            });
        };
        return btn;
    }

    /**
     * Create the soundboard UI
     */
    function createSoundboardUI() {
        if (state.soundboardEl) return;

        // Create main container
        state.soundboardEl = document.createElement("div");
        state.soundboardEl.id = "bingerSoundboard";
        state.soundboardEl.className = CSS_CLASSES.soundboard;

        // Visual section
        const visualSection = document.createElement("div");
        visualSection.className = CSS_CLASSES.visualSection;
        VISUALS.forEach(visual => {
            visualSection.appendChild(createVisualButton(visual));
        });

        // Divider
        const divider = document.createElement("div");
        divider.className = CSS_CLASSES.divider;

        // Sound section
        const soundSection = document.createElement("div");
        soundSection.className = CSS_CLASSES.soundSection;
        SOUNDS.forEach(sound => {
            soundSection.appendChild(createSoundButton(sound));
        });

        // Assemble
        state.soundboardEl.appendChild(visualSection);
        state.soundboardEl.appendChild(divider);
        state.soundboardEl.appendChild(soundSection);
        document.body.appendChild(state.soundboardEl);

        // Start listeners
        startListeners();
    }

    /**
     * Destroy the soundboard UI
     */
    function destroySoundboardUI() {
        if (state.soundboardEl) {
            state.soundboardEl.remove();
            state.soundboardEl = null;
        }

        stopListeners();
    }

    // ========================================================================
    // FIREBASE LISTENERS
    // ========================================================================

    /**
     * Start Firebase listeners for soundboard events
     */
    function startListeners() {
        chrome.storage.local.get("bingerCurrentRoomId", ({ bingerCurrentRoomId }) => {
            if (!bingerCurrentRoomId) return;
            if (state.listenerAttached && state.currentRoomId === bingerCurrentRoomId) return;

            chrome.runtime.sendMessage({
                command: "startSoundboardListener",
                roomId: bingerCurrentRoomId
            });

            chrome.runtime.sendMessage({
                command: "startVisualboardListener",
                roomId: bingerCurrentRoomId
            });

            chrome.runtime.sendMessage({
                command: "startPinListener",
                roomId: bingerCurrentRoomId
            });

            state.listenerAttached = true;
            state.currentRoomId = bingerCurrentRoomId;
        });
    }

    /**
     * Stop Firebase listeners for soundboard events
     */
    function stopListeners() {
        if (state.listenerAttached && state.currentRoomId) {
            chrome.runtime.sendMessage({
                command: "stopSoundboardListener",
                roomId: state.currentRoomId
            });

            chrome.runtime.sendMessage({
                command: "stopVisualboardListener",
                roomId: state.currentRoomId
            });

            chrome.runtime.sendMessage({
                command: "stopPinListener",
                roomId: state.currentRoomId
            });

            state.listenerAttached = false;
            state.currentRoomId = null;
        }
    }

    // ========================================================================
    // MESSAGE HANDLER
    // ========================================================================

    /**
     * Handle messages from background.js
     * @param {object} msg - The message object
     */
    function handleMessage(msg) {
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

    // ========================================================================
    // INITIALIZATION
    // ========================================================================

    /**
     * Initialize the soundboard module
     */
    function init() {
        injectAnimationStyles();
        preloadAudio();
        chrome.runtime.onMessage.addListener(handleMessage);
    }

    // Run initialization
    init();

    // ========================================================================
    // EXPOSE TO WINDOW
    // ========================================================================

    window.BingerSoundboard = {
        create: createSoundboardUI,
        destroy: destroySoundboardUI,
        playSound,
        triggerVisualEffect,
        displayPin
    };

})();