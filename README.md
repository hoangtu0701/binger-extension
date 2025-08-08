# 🍿 Binger Extension

Binger is a Chrome extension that turns **Phimbro** into the ultimate synced movie night experience.

It lets you and your friends **watch movies together in perfect sync**, chat live, share reactions, and even start video calls — all inside the Phimbro player.

---

## 🎯 What It Does

- 🕐 **Perfectly synced playback** — pause, play, and seek together
- 💬 **Real-time group chat** — share thoughts while you watch
- 🔐 **Private room system** — create or join using 6-digit room codes
- 🧠 **Auto-sync on page reload and fullscreen**
- 📞 **Optional video call integration**
- 🧪 **Experimental features** like mood-based overlays, soundboards, and session invites

---

## 🛠 How to Use

1. Clone or download this repo.
2. Go to `chrome://extensions/`
3. Enable **Developer mode**
4. Click **Load unpacked** and select this folder.
5. Head to `phimbro.com`, sign in, and click the **Binger** overlay.

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
├── call.html               # Embedded video call app (optional)
├── assets/                 # Icons, images, and emoji
```

---

## 🔐 License

This project is licensed under **CC BY-NC-ND 4.0**.  
You can use it, share it, and run it — but **you can’t resell, modify, or rebrand it**.

Author: **Tung Hoang (hoangtu0701)**  
License: [LICENSE_Binger_TungHoang.txt](LICENSE_Binger_TungHoang.txt)

---

## 🚀 Status

Actively maintained — feedback, features, and PRs are welcome.
