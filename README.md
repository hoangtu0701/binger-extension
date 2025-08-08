# 🍿 Binger Extension

Binger is a Chrome extension that turns **Phimbro** into the ultimate synced movie night experience.

It lets you and your friends **watch movies together in perfect sync**, chat live, share reactions, and even start video calls — all inside the Phimbro player.

---

## 🎯 What It Does

- 🕐 **Perfectly synced playback** — pause, play, and seek together
- 💬 **Real-time group chat** — share thoughts while you watch
- 🔐 **Private room system** — create or join using 6-digit room codes
- 🧠 **Auto-sync on page reload and fullscreen**
- 📞 **Video call integration**
- 🧪 **Experimental features** like soundboards, mood-based overlays, and more coming soon!

---

## 📁 Project Structure

```
binger-extension/
├── manifest.json           # Chrome extension metadata
├── background.js           # Handles auth, room logic, and sync backend
├── main.js                 # Injected overlay UI and syncing logic
├── popup.html              # Extension popup interface
├── popup.js / popup.css    # Popup UI logic and styling
├── sessionMode.js          # Handles session syncing, call iframe, etc.
├── fullscreenMode.js       # Handles fullscreen repositioning
├── soundboard.js           # Handles soundboard
├── call.html               # Embedded video call app
├── assets/                 # Icons, images, and emoji
```

---
