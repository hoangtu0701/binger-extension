# Binger

A Chrome extension that turns [Phimbro](https://phimbro.com) into a synchronized movie-watching experience with friends.

---

## Features

- **Synced Playback** - Play, pause, and seek together in real-time
- **Live Chat** - Group chat with an AI assistant (`@binger`) that can seek to scenes you describe
- **Video Calls** - WebRTC-based video/audio calls while watching
- **Private Rooms** - Create or join rooms with 6-digit codes
- **Soundboard** - Sound effects and floating/pinned emoji reactions
- **6 Themes** - Burgundy, Pink, Black & White, Ocean, Volcano, Forest
- **Fullscreen Support** - Overlay adapts to fullscreen mode
- **Join/Leave Notifications** - Real-time notifications when users join or leave rooms
- **Smart Animation System** - Optimized message animations using IntersectionObserver

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Extension | Chrome Extension (Manifest V3) |
| Real-time Sync | Firebase Realtime Database |
| Video Calls | WebRTC with STUN/TURN servers |
| AI Features | OpenAI Embeddings + GPT-4o-mini |
| API Proxies | Vercel Serverless Functions |

---

## Project Structure

```
src/
  background/          # Service worker modules
    background.js      # Entry point - loads all modules
    bg-firebase-init.js
    bg-state.js
    bg-auth.js
    bg-rooms.js
    bg-chat.js
    bg-users.js
    bg-invites.js
    bg-session.js
    bg-typing.js
    bg-soundboard.js
    bg-theme.js
    bg-subtitles.js
    bg-bot.js
    bg-tab-monitor.js
    bg-connection.js
    bg-message-router.js

  content/             # Content script modules
    main.js            # Entry point - initializes all modules
    content-helpers.js
    content-state.js
    content-connection.js
    content-navigation.js
    content-overlay-dom.js
    content-theme.js
    content-chatbox.js
    content-room.js
    content-invite.js
    content-session.js
    content-fullscreen.js
    content-soundboard.js
    content-message-router.js

  popup/               # Extension popup UI
    popup.html
    popup.js
    popup-auth.js
    popup-navigation.js
    popup-theme.js
    popup-helpers.js

  call_app/            # WebRTC video call application
    call.html          # Call UI with local/remote video elements
    index.js           # Bundled WebRTC logic (Vite build)
    firebase/          # Local Firebase SDK copies (CSP-safe)

styles/                # CSS organized by component
  animations.css
  buttons.css
  chatbox.css
  components.css
  fullscreen.css
  invite.css
  overlay.css
  popup.css
  session.css
  soundboard.css

api/                   # Vercel serverless functions
  openai.js            # OpenAI API proxy
  openrouter.js        # OpenRouter API proxy
  subdl.js             # SubDL subtitle API proxy
```

---

## Recent Updates

### Latest

- **Join/Leave Notifications** - Users now see notifications when others join or leave the room
- **Debounced User Events** - Prevents notification spam during rapid navigation or reconnections
- **Optimized Message Animations** - Old messages no longer re-run entrance animations on page load; uses IntersectionObserver to only animate visible messages
- **Cached Movie Keys** - Movie identification now cached using name + year for faster subtitle lookups
- **Flexible Scene Extraction** - Improved scene description parsing from AI responses
- **Seek Failure Feedback** - Users now receive clear feedback when scene seeking fails
- **Fixed Soundboard First-Click Bug** - First clicks/drags on sound/visual/pin emojis now register correctly
- **Codebase Reinforcement** - General stability improvements and error handling enhancements

---

## Architecture Highlights

### Modular Design

The extension follows a strict single-responsibility principle:

- **Background modules** (`bg-*.js`) - Each handles one domain (auth, rooms, chat, etc.)
- **Content modules** (`content-*.js`) - Separated by UI component or feature
- **Message routers** - Central dispatch for 50+ command types

### Data Flow

```
Popup <---> Background <---> Firebase
              ^
              |
              v
Content Scripts (via persistent ports)
```

### Performance Optimizations

- Debounced user state updates
- IntersectionObserver for animation control
- Cached embeddings per movie
- Preloaded audio for soundboard