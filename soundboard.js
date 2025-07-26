// soundboard.js



let soundboardEl = null;
let currentRoomId = null;
let listenerAttached = false;



// Preload audio immediately when file is loaded
const audioMap = {};
const readyAudioSet = new Set();

const soundFiles = {
  fart: "binger_assets/soundboard/fart.mp3",
  pipe: "binger_assets/soundboard/pipe.mp3",
  rose: "binger_assets/soundboard/rose.mp3"
};

for (const [id, path] of Object.entries(soundFiles)) {
  const audio = new Audio(chrome.runtime.getURL(path));
  audio.addEventListener("canplaythrough", () => {
    readyAudioSet.add(id);
  }, { once: true });
  audio.load(); 
  audioMap[id] = audio;
}



function createSoundboardUI() {
    if (soundboardEl) return;

    // Create main container
    soundboardEl = document.createElement("div");
    soundboardEl.id = "bingerSoundboard";
    soundboardEl.className = "binger-soundboard";

    // Create buttons
    const sounds = [
        { id: "fart", emoji: "💨" },
        { id: "pipe", emoji: "🔩" },
        { id: "rose", emoji: "🥀" },

        // Mock - To change
        { id: "drum", emoji: "🥁" },
        { id: "fire", emoji: "🔥" },
        { id: "laugh", emoji: "😂" },
        { id: "clap", emoji: "👏" },
        { id: "boo", emoji: "👎" },
        { id: "yay", emoji: "👍" },
        { id: "bell", emoji: "🔔" },
        { id: "ghost", emoji: "👻" },
        { id: "heart", emoji: "❤️" },
        { id: "bell", emoji: "🔔" },
        { id: "ghost", emoji: "👻" },
        { id: "heart", emoji: "❤️" },
    ];

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
        soundboardEl.appendChild(btn);
    }

    document.body.appendChild(soundboardEl);

    // Start the listener to audio
    chrome.storage.local.get("bingerCurrentRoomId", ({ bingerCurrentRoomId }) => {
        if (!bingerCurrentRoomId) return;
        if (listenerAttached && currentRoomId === bingerCurrentRoomId) return;

        chrome.runtime.sendMessage({
            command: "startSoundboardListener",
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

    // Remove the listener to audio
    if (listenerAttached && currentRoomId) {
        chrome.runtime.sendMessage({
            command: "stopSoundboardListener",
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
});
