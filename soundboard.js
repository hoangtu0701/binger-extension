// soundboard.js



let soundboardEl = null;
let currentRoomId = null;
let listenerAttached = false;

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
    { id: "adlib", emoji: "🎤" },
    { id: "aergh", emoji: "😫" },
    { id: "ah", emoji: "😮" },
    { id: "corruption", emoji: "💸" },
    { id: "fart", emoji: "💨" },
    { id: "flute", emoji: "🎶" },
    { id: "hmm", emoji: "🤔" },
    { id: "hoop1", emoji: "🏀" },
    { id: "hoop2", emoji: "⛹️" },
    { id: "mysterious", emoji: "🕵️" },
    { id: "pipe", emoji: "🔩" },
    { id: "re", emoji: "🫠" },
    { id: "rose", emoji: "🥀" },
    { id: "silentH", emoji: "😶" },
    { id: "slap", emoji: "🖐️" }
];

const visuals = [
    { id: "heart", emoji: "❤️" },
    { id: "clap", emoji: "👏" },
    { id: "fire", emoji: "🔥" },
    { id: "sparkle", emoji: "✨" },
    { id: "star", emoji: "⭐" }
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

    soundboardEl.appendChild(soundSection);
    const divider = document.createElement("div");
    divider.className = "binger-divider";
    soundboardEl.appendChild(divider);
    soundboardEl.appendChild(visualSection);
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
});

function triggerVisualEffect(effectId) {

    if (!document.getElementById("bingerFloatUpKeyframes")) {
        const style = document.createElement("style");
        style.id = "bingerFloatUpKeyframes";
        style.textContent = `
            @keyframes floatUp {
                from { transform: translateY(0); opacity: 1; }
                to   { transform: translateY(-150px); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }

    const el = document.createElement("div");
    el.className = "visual-effect binger-ephemeral";
    el.innerText = visuals.find((v) => v.id === effectId)?.emoji || "❓";

    Object.assign(el.style, {
        position: "absolute",
        fontSize: "48px",
        animation: "floatUp 2s ease-out",
        bottom: "20px",
        left: `${Math.random() * 80 + 10}%`,
        zIndex: 2147483647,
        pointerEvents: "none",
    });

    const videoRegion = document.getElementById("binger-video-region");
    const overlay = document.getElementById("bingerOverlay");
    const container = videoRegion || overlay?.parentNode || document.body;
    container.appendChild(el);

    setTimeout(() => el.remove(), 2000);
}
