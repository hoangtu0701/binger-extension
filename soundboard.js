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



function createSoundboardUI() {
    if (soundboardEl) return;

    // Create main container
    soundboardEl = document.createElement("div");
    soundboardEl.id = "bingerSoundboard";
    soundboardEl.className = "binger-soundboard";

    // Create buttons
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
