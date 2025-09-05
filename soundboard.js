// soundboard.js



let soundboardEl = null;
let currentRoomId = null;
let listenerAttached = false;

// Pin animations
const pinAnimations = `
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
  0%   { transform: translateY(0); opacity: 1; }
  50%  { transform: translateY(10px); opacity: 0.7; }
  100% { transform: translateY(20px); opacity: 0; }
}

@keyframes laughShake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-6px) rotate(-5deg); }
  75% { transform: translateX(6px) rotate(5deg); }
}

@keyframes hammerSlam {
  0%   { transform: rotate(0deg) translateY(0); }
  25%  { transform: rotate(-90deg) translateY(-10px); }
  50%  { transform: rotate(0deg) translateY(0); }
  75%  { transform: rotate(-90deg) translateY(-10px); }
  100% { transform: rotate(0deg) translateY(0); }
}

@keyframes heartPulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.1); }
}

@keyframes smilePop {
  0%   { transform: scale(0.8); opacity: 0.5; }
  50%  { transform: scale(1.3); opacity: 1; }
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

if (!document.getElementById("bingerPinAnimations")) {
    const style = document.createElement("style");
    style.id = "bingerPinAnimations";
    style.textContent = pinAnimations;
    document.head.appendChild(style);
}

const pinAnimationMap = {
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

// Preload audio immediately when file is loaded
const audioMap = {};
const readyAudioSet = new Set();

const soundFiles = {
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

for (const [id, path] of Object.entries(soundFiles)) {
    const audio = new Audio(chrome.runtime.getURL(path));
    audio.addEventListener("canplaythrough", () => {
        readyAudioSet.add(id);
    }, { once: true });
    audio.load(); 
    audioMap[id] = audio;
}

const sounds = [
    { id: "aergh", emoji: "😫" },
    { id: "flute", emoji: "🎶" },
    { id: "hmm", emoji: "🤔" },
    { id: "pipe", emoji: "🔩" },
    { id: "rose", emoji: "🥀" },
];

const visuals = [
    { id: "mad", emoji: "🤬" },
    { id: "poop", emoji: "💩" },
    { id: "sadtears", emoji: "🥲" },
    { id: "laugh", emoji: "🤣" },
    { id: "hammer", emoji: "🔨" },
    { id: "hearts", emoji: "🥰" },
    { id: "smile", emoji: "😀" },
    { id: "disguise", emoji: "🥸" },
    { id: "pleading", emoji: "🥺" },
    { id: "shock", emoji: "🫨" }
];

function createSoundboardUI() {
    if (soundboardEl) return;

    // Create main container
    soundboardEl = document.createElement("div");
    soundboardEl.id = "bingerSoundboard";
    soundboardEl.className = "binger-soundboard";

    // --- Sound section ---
    const soundSection = document.createElement("div");
    soundSection.className = "binger-sound-section";
    for (const { id, emoji } of sounds) {
        const btn = document.createElement("button");
        btn.className = "binger-sound-btn";
        btn.innerText = emoji;
        btn.title = id;
        btn.onclick = () => {
            chrome.runtime.sendMessage({
                command: "requestSoundEffect",
                soundId: id
            });
        };
        soundSection.appendChild(btn);
    }

    // --- Visual section ---
    const visualSection = document.createElement("div");
    visualSection.className = "binger-visual-section";
    for (const { id, emoji } of visuals) {
        const btn = document.createElement("button");
        btn.className = "binger-visual-btn";
        btn.innerText = emoji;
        btn.title = id;
        btn.onclick = () => {
            chrome.runtime.sendMessage({ 
                command: "requestVisualEffect", 
                visualId: id 
            });
        };
        visualSection.appendChild(btn);
    }

    soundboardEl.appendChild(visualSection);
    const divider = document.createElement("div");
    divider.className = "binger-divider";
    soundboardEl.appendChild(divider);
    soundboardEl.appendChild(soundSection);
    document.body.appendChild(soundboardEl);

    // Start the listeners
    chrome.storage.local.get("bingerCurrentRoomId", ({ bingerCurrentRoomId }) => {
        if (!bingerCurrentRoomId) return;
        if (listenerAttached && currentRoomId === bingerCurrentRoomId) return;

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

        listenerAttached = true;
        currentRoomId = bingerCurrentRoomId;
    });
}

function destroySoundboardUI() {
    if (soundboardEl) {
        soundboardEl.remove();
        soundboardEl = null;
    }

    // Remove the listeners
    if (listenerAttached && currentRoomId) {
        chrome.runtime.sendMessage({
            command: "stopSoundboardListener",
            roomId: currentRoomId
        });
        chrome.runtime.sendMessage({ 
            command: "stopVisualboardListener", 
            roomId: currentRoomId 
        });

        chrome.runtime.sendMessage({ 
            command: "stopPinListener", 
            roomId: currentRoomId 
        });

        listenerAttached = false;
        currentRoomId = null;
    }

}

chrome.runtime.onMessage.addListener((msg) => {
    if (msg.command === "toggleSoundboard") {
        msg.inSession ? createSoundboardUI() : destroySoundboardUI();
    }

    if (msg.command === "playSoundEffect") {
        const audio = audioMap[msg.soundId];
        if (audio) {
            audio.currentTime = 0;
            audio.play().catch((e) =>
                console.warn("[Binger] Failed to play sound:", msg.soundId, e)
            );
        } else {
            console.warn("[Binger] Unknown soundId:", msg.soundId);
        }
    }

    if (msg.command === "playVisualEffect") {
        triggerVisualEffect(msg.visualId);
    }

    if (msg.command === "updatePin") {
        const { visualId, timestamp, relX, relY } = msg;
        if (!visualId || !timestamp) return;

        const vis = visuals.find(v => v.id === visualId);
        const symbol = vis ? vis.emoji : "❓";

        const video = document.querySelector("video");
        if (!video) return;
        const rect = video.getBoundingClientRect();
        const absX = rect.left + relX * rect.width;
        const absY = rect.top + relY * rect.height;

        const pinEl = document.createElement("div");
        pinEl.className = "binger-pin-emoji";
        pinEl.textContent = symbol;

        const animation = pinAnimationMap[visualId] || "";

        Object.assign(pinEl.style, {
            position: "absolute",
            left: `${absX - 24}px`,
            top: `${absY - 24}px`,
            fontSize: "48px",
            lineHeight: "48px",
            zIndex: 2147483647,
            pointerEvents: "none",
            transition: "opacity 0.5s ease",
            animation: animation
        });

        const videoRegion = document.getElementById("binger-video-region");
        const overlay = document.getElementById("bingerOverlay");
        const container = videoRegion || overlay?.parentNode || document.body;
        container.appendChild(pinEl);

        setTimeout(() => {
            pinEl.style.opacity = "0";
            setTimeout(() => pinEl.remove(), 500);
        }, 5000);
    }
});

function triggerVisualEffect(effectId) {

    if (!document.getElementById("bingerFloatAnimations")) {
        const style = document.createElement("style");
        style.id = "bingerFloatAnimations";
        style.textContent = `
            @keyframes floatDrift {
                0%   { transform: translate(0, 0) scale(1); opacity: 1; }
                50%  { transform: translate(var(--drift-x), -75px) scale(1.2); opacity: 0.8; }
                100% { transform: translate(calc(var(--drift-x) * 2), -150px) scale(1); opacity: 0; }
            }
            @keyframes floatPop {
                0%   { transform: translateY(0) scale(0.8); opacity: 0; }
                20%  { transform: translateY(-30px) scale(1.3); opacity: 1; }
                80%  { transform: translateY(-120px) scale(1); opacity: 0.8; }
                100% { transform: translateY(-150px) scale(0.9); opacity: 0; }
            }
            @keyframes floatSpiral {
                0%   { transform: translateY(0) rotate(0deg); opacity: 1; }
                100% { transform: translateY(-180px) rotate(360deg); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }

    const el = document.createElement("div");
    el.className = "visual-effect binger-ephemeral";
    el.innerText = visuals.find((v) => v.id === effectId)?.emoji || "❓";

    // Pick a random animation
    const animations = ["floatDrift", "floatPop", "floatSpiral"];
    const chosen = animations[Math.floor(Math.random() * animations.length)];

    // For drift, assign a random horizontal direction
    if (chosen === "floatDrift") {
        const driftX = Math.random() > 0.5 ? "40px" : "-40px";
        el.style.setProperty("--drift-x", driftX);
    }

    Object.assign(el.style, {
        position: "absolute",
        fontSize: "48px",
        animation: `${chosen} 2s ease-out`,
        bottom: "20px",
        left: `${Math.random() * 80 + 10}%`,
        zIndex: 2147483647,
        pointerEvents: "auto", 
        cursor: "grab"
    });

    const videoRegion = document.getElementById("binger-video-region");
    const overlay = document.getElementById("bingerOverlay");
    const container = videoRegion || overlay?.parentNode || document.body;
    container.appendChild(el);

    // Auto-remove if untouched
    const despawnTimer = setTimeout(() => el.remove(), 2000);

    // Grab logic
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
            el.style.top  = `${ev.clientY - offsetY}px`;
        };

        const up = (ev) => {
            window.removeEventListener("mousemove", move);
            window.removeEventListener("mouseup", up);

            document.body.style.cursor = "";

            const video = document.querySelector("video");
            if (video) {
                const rect = video.getBoundingClientRect();

                if (
                    ev.clientX >= rect.left &&
                    ev.clientX <= rect.right &&
                    ev.clientY >= rect.top &&
                    ev.clientY <= rect.bottom
                ) {
                    const relX = (ev.clientX - rect.left) / rect.width;
                    const relY = (ev.clientY - rect.top) / rect.height;

                    chrome.runtime.sendMessage({
                        command: "requestPin",
                        visualId: visuals.find(v => v.emoji === el.innerText)?.id,
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
