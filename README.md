# Binger

A Chrome extension that turns [Phimbro](https://phimbro.com) into a synchronized movie-watching experience with friends.

---

## Features

- **Synced Playback** - Play, pause, and seek together in real-time
- **Live Chat** - Real-time messaging with a toggleable AI assistant that can seek to scenes you describe
- **Video Calls** - WebRTC-based video/audio calls while watching
- **Private Rooms** - Create or join rooms with 6-digit codes (max 2 users)
- **Soundboard** - Sound effects and floating/pinned emoji reactions
- **6 Themes** - Burgundy, Pink, Black & White, Ocean, Volcano, Forest
- **Fullscreen Support** - Overlay adapts to fullscreen mode with repositioned call iframe
- **Join/Leave Notifications** - Real-time debounced notifications when users join or leave rooms
- **Smart Animation System** - IntersectionObserver-based animation optimization for chat messages

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Extension | Chrome Extension Manifest V3 |
| Real-time Sync | Firebase Realtime Database |
| Auth | Firebase Authentication |
| Video Calls | WebRTC with STUN/TURN (Google, ExpressTurn, Xirsys) |
| AI Chat | Gemini 2.5 Flash Lite + Grok 4.1 Fast (via OpenRouter) |
| Scene Seeking | text-embedding-3-large embeddings (via OpenAI) + SubDL subtitles |
| Decision Routing | Llama 3.2 3B Instruct (via OpenRouter) |
| API Proxies | Vercel Serverless Functions |

---

## Architecture Overview

### Extension Structure

```
src/
  background/
    background.js             Entry point - loads all modules
    bg-firebase-init.js       Firebase SDK loading + initialization
    bg-state.js               Centralized state management (11 listener maps)
    bg-helpers.js             Shared utilities (broadcast, room ID generation)
    bg-auth.js                Authentication handlers
    bg-rooms.js               Room creation, joining, leaving (atomic transactions)
    bg-chat.js                Chat message handling
    bg-users.js               User list subscriptions + join/leave notifications
    bg-invites.js             Watch Together invitation system
    bg-session.js             Synchronized playback session + buffer management
    bg-typing.js              Typing indicator sync
    bg-soundboard.js          Sound/visual/pin effects
    bg-theme.js               Theme synchronization
    bg-subtitles.js           Subtitle fetching + chunk rewriting + embedding generation
    bg-bot.js                 AI chatbot + web search routing + scene seeking
    bg-tab-monitor.js         Multi-tab detection
    bg-connection.js          Port management + keep-alive + cleanup on disconnect
    bg-message-router.js      Routes 50+ commands to handlers

  content/
    main.js                   Entry point - initializes all modules in order
    content-helpers.js        DOM utilities, URL parsing, validation
    content-state.js          Centralized content script state
    content-connection.js     Port connection to background + storage helpers
    content-navigation.js     SPA navigation handling (history patches + polling)
    content-overlay-dom.js    Overlay UI construction + element caching
    content-theme.js          Theme application + sync
    content-chatbox.js        Chat UI + bot mode toggle + animation optimization
    content-room.js           Room operations + speech bubble prompts
    content-invite.js         Invitation UI states + progress bar
    content-session.js        Video sync + call iframe + deadlock prevention
    content-fullscreen.js     Fullscreen layout management
    content-soundboard.js     Soundboard UI + effects
    content-message-router.js Routes background messages to content handlers

  popup/
    popup.html                Popup UI structure
    popup.js                  Entry point
    popup-auth.js             Authentication form handling
    popup-navigation.js       View transitions
    popup-theme.js            Theme selection
    popup-helpers.js          Chrome API wrappers

  call_app/
    call.html                 WebRTC call UI with local/remote video elements
    index.js                  Vite-bundled WebRTC logic (IIFE format)
    firebase/                 Local Firebase SDK copies (CSP-compliant)

styles/                       CSS organized by component (9 files)
api/                          Vercel serverless functions (3 proxies)
```

### Data Flow

```
Popup  <--->  Background  <--->  Firebase Realtime Database
                  ^
                  |  (persistent ports)
                  v
           Content Scripts
```

- **Popup** communicates with **Background** via `chrome.runtime.sendMessage`
- **Content Scripts** communicate with **Background** via persistent ports
- **Background** syncs all data through **Firebase Realtime Database**
- **Background** broadcasts updates to all connected content script ports via `broadcastToTabs`

### Module Load Order

Background modules must load in this order due to dependencies:

```
firebase-init > state > helpers > tab-monitor > connection > auth > rooms >
chat > users > invites > session > typing > soundboard > theme > subtitles >
bot > message-router
```

Content scripts follow a similar ordered initialization through `main.js`.

---

## Popup

### Views

| View | Condition | Actions |
|------|-----------|---------|
| Not On Site | URL is not phimbro.com | "Go to phimbro.com" button |
| Main UI | On phimbro, not signed in | Sign Up / Sign In buttons |
| Auth Form | User clicked auth button | Username + password form |
| Signed In | Authenticated | Sign Out button + theme selector |

### Authentication

- **Sign Up** creates a Firebase user with `{username}@binger.dev` email
- **Sign In** authenticates an existing user
- **Sign Out** signs out, clears storage, and hides the overlay
- Popup auto-navigates to signed-in screen after success, then auto-closes after 2 seconds

---

## Overlay

### General Behavior

- Appears automatically when signed in on phimbro.com
- Persists across page reloads and SPA navigation
- Displays current user info and room status
- All 6 themes apply to every overlay element

### Room System

| Action | Behavior |
|--------|----------|
| Create Room | Generates unique 6-digit code via atomic Firebase transaction |
| Join Room | Inline bubble input validates code, joins if room exists and has space (max 2) |
| Leave Room | Removes user from Firebase, deletes room if empty |
| Rejoin | Allowed within 60 seconds of disconnection (page reload, navigation) |

### Chat

- Real-time messaging via Firebase Realtime Database
- Typing indicators with 1.2-second timeout and cached UID for performance
- Messages persist in the room node
- Disabled until user joins a room
- Bot mode toggle for AI queries (see Binger Bot section)
- Messages tagged as bot queries or bot replies display visual indicators

### Message Animation System

| Message Type | Animation Behavior |
|--------------|-------------------|
| Old (out of view) | No animations rendered |
| Old (in view) | Idle animations only (theme-specific) |
| New (real-time) | Entrance + idle animations |

Uses IntersectionObserver on the chat log to toggle `.paused` class, preventing animation recalculation on messages outside the viewport.

---

## Watch Together

### Prerequisites

1. User is signed in
2. Room has 2 participants
3. User is on a `/watch/` page

### Invitation Flow

| Stage | Inviter | Invitee |
|-------|---------|---------|
| Idle | "Watch Together" button enabled | Same |
| Pending | "Cancel" button (red) | "Accept/Decline" with long-press to decline |
| Accepted | Waiting for other user | Grayed out, waiting |
| Session | Navigates to movie, enters session mode | Same |

### Session Mode

- All users navigate to the same movie URL
- Video playback is synchronized (play, pause, seek)
- Buffer detection pauses all users until everyone is ready
- Overlay shows only Leave Room + Camera Toggle
- Soundboard becomes available
- Session ends if any user leaves, reloads, or navigates away

---

## Video Sync

### Player State Synchronization

- Play/pause events pushed to Firebase with timestamp
- Seek events synced with current time position
- 300ms debounce on play/pause prevents echo loops
- Suppress flag prevents reacting to self-initiated events

### Buffer Handling

- Users report buffering status to Firebase
- When any user buffers, all users pause with click blockers
- 300ms delay before resume to ensure stability
- Stale bufferStatus data cleared on session start
- Empty bufferStatus objects guarded against (cannot trigger false resume)
- Buffer deduplication state reset at session start

### Deadlock Prevention

| Layer | Location | What It Prevents |
|-------|----------|-----------------|
| Stale data clear | bg-session.js | Old "buffering" entries from previous session blocking new session |
| Empty data guard | bg-session.js | `Array.every()` returning true on empty object, falsely triggering resume |
| Dedup reset | content-session.js | First "ready" report silently dropped because `lastBufferStatus` was already "ready" |
| Safety-net interval | content-session.js | Any edge case - every 8s, if video is paused/loaded but controls locked, force re-reports "ready" |

The safety-net interval has zero performance impact during normal playback (exits immediately when `playLockActive` is false) and is cleaned up when the session ends.

### Seeked Readiness Check

After a seek completes, a single delayed check verifies `readyState >= 3` (HAVE_FUTURE_DATA) before reporting ready.

---

## Video Call

### Architecture

The video call runs in an isolated iframe for CSP compliance and clean separation:

```
call_app/
  call.html           HTML shell with local/remote video elements
  index.js            Vite-bundled WebRTC logic (IIFE format)
  firebase/           Local Firebase SDK copies (CSP-safe)
```

### ICE Server Configuration

| Type | Server |
|------|--------|
| STUN | Google (stun.l.google.com) |
| TURN | ExpressTurn relay |
| TURN | Xirsys (UDP/TCP/TLS) |

### Connection Flow

1. Both users join call room via Firebase using Binger UID as key
2. First user (alphabetically by UID) creates offer
3. Second user receives offer, creates answer
4. ICE candidates exchanged via Firebase
5. Connected - signaling data cleaned up

### Iframe Reset Flow (Fullscreen Toggle)

1. Extension sends `cleanupCall` to old iframe via postMessage
2. Old iframe removes its Firebase user entry and signals
3. Old iframe sends `cleanupDone` confirmation
4. Extension destroys old iframe, creates new one with same `roomId` and `uid`
5. New iframe clears remaining signals, registers with same UID key
6. New iframe determines offerer role (stable - UIDs never change) and starts signaling

### Parent-Iframe Communication

| Message | Direction | Purpose |
|---------|-----------|---------|
| `restoreCamMic` | Parent to Iframe | Restore cam/mic state after recreation |
| `updateCamMic` | Iframe to Parent | Report cam/mic toggle changes |
| `network-warning` | Iframe to Parent | Notify connection failure |
| `cleanupCall` | Parent to Iframe | Clean up Firebase entries before destruction |
| `cleanupDone` | Iframe to Parent | Confirm cleanup complete |

### Room Cleanup

- Each user entry has `onDisconnect().remove()` as safety net
- Explicit cleanup cancels `onDisconnect` and removes entry immediately
- Signals node cleared during cleanup and new iframe initialization
- Room node only deleted when last user leaves

---

## Binger Bot

### Activation

Bot mode is activated via a toggle button ("B") in the chat input bar. When active:

- The button glows with theme-matched colors
- The input placeholder changes to "Ask Binger..."
- All messages sent are routed to the bot
- Messages display a visual indicator (colored left border + "@B" badge) so both users can distinguish bot queries from normal chat
- Bot replies also display the "@B" badge with italic styling

Bot mode state persists across page navigation via `chrome.storage.local` and resets when leaving a room.

### Context Sources

| Page Type | Context Extracted |
|-----------|-------------------|
| `/watch/` | Title, Year, Current Minute |
| `/movie/` or `/tv/` | Title, Year |
| Other | None |

### Response Generation - Two-Call Decision Pipeline

Every bot query goes through a routing system that minimizes cost:

**Step 1 - Decision Call (invisible to user):**

| Property | Value |
|----------|-------|
| Model | `meta-llama/llama-3.2-3b-instruct` via OpenRouter |
| Purpose | Classify whether the query needs live web search |
| Input | User prompt + last 10 chat messages for context |
| Output | YES or NO |
| Temperature | 0 |
| Max tokens | 3 |

Replies YES if the question involves a specific movie/series and needs current factual info (cast, plot, ratings, release dates, reviews). Replies NO for casual chat, greetings, jokes, scene-seeking, or general knowledge.

**Step 2 - Main Response:**

| Condition | Model | Features |
|-----------|-------|----------|
| Web search needed | `x-ai/grok-4.1-fast:online` via OpenRouter | Native xAI web + X search |
| No web search | `google/gemini-2.5-flash-lite` via OpenRouter | Fast, cheap offline response |

| Property | Value |
|----------|-------|
| Temperature | 0.75 (in session) / 0.85 (outside session) |
| Max tokens | 80 |
| Reasoning | Disabled |
| Response style | 2-3 concise sentences, casual tone |

Web search citations are stripped from responses before posting to chat.

### Scene Seeking

Triggered when the bot reply contains `Seeking to the scene where...`

1. Extract scene description and optional timing fraction
2. Fetch subtitles from SubDL API (filters by year, prefers BluRay sources)
3. Group subtitles into 60-second chunks
4. Rewrite chunks with `google/gemini-2.5-flash-lite` into concise descriptions
5. Generate embeddings with `text-embedding-3-large`
6. Cache embeddings per movie (keyed by name + year)
7. Embed user's scene description
8. Find best match via cosine similarity (with timing bias if fraction provided)
9. Seek video via Firebase (in session) or direct tab lookup (solo)

**Typing Indicators:**

- "Binger Bot is typing..." during response generation
- "Binger Bot is seeking..." with randomized messages during scene search

---

## Soundboard

### Components

| Section | Function |
|---------|----------|
| Sound Buttons | Play synced audio effects (5 sounds) |
| Visual Buttons | Spawn floating emoji effects (10 visuals) |
| Pin Mode | Click video to place emoji at exact position |

**Sounds:** aergh, flute, hmm, pipe, rose

**Visuals:** mad, poop, sadtears, laugh, hammer, hearts, smile, disguise, pleading, shock

### Pin Animations

| Emoji | Animation |
|-------|-----------|
| mad | Glow + shake |
| poop | Bounce |
| sadtears | Drip downward |
| laugh | Wiggle shake |
| hammer | Slam down 90 degrees |
| hearts | Gentle pulse |
| smile | Pop once |
| disguise | Wiggle |
| pleading | Slow 15-degree tilt |
| shock | Tremble |

### Sync

- All effects broadcast to room via Firebase
- Sounds play instantly with preloaded audio
- Visual effects float for 2 seconds then auto-remove
- Pins display for 5 seconds with fade-out

---

## Themes

| Theme | Primary Colors |
|-------|----------------|
| Burgundy | Dark red, warm white |
| Pink | Pink, green accents |
| Black & White | Animated star field |
| Ocean | Blue gradient, sand textures |
| Volcano | Red/orange with lava effects |
| Forest | Green with floating leaves |

- Theme saved to `chrome.storage.sync`
- Host's theme applied to room on creation
- Theme changes broadcast to all room members in real-time

---

## Fullscreen Mode

### Layout

- Video region takes 70% height
- Bottom row (30%) contains: Overlay + Call Iframe + Soundboard
- Flex layout with 12px gaps, overlay fixed at 660px width

### Call Iframe Positioning

- **Normal mode:** `position: fixed`, calculated relative to overlay left edge, resize listener for monitor changes
- **Fullscreen mode:** `position: static` inside flex container, no manual positioning needed

### Cleanup on Toggle

- Ephemeral elements (floating emojis, pins) removed
- Call iframe recreated with pre-cleanup and preserved cam/mic state
- Soundboard repositioned without size change

---

## Navigation Handling

- Intercepts `pushState` / `replaceState` for SPA navigation
- Forces page reload to re-initialize extension state
- Exception: `/search` pages don't trigger reload
- URL polling fallback (500ms) for edge cases
- Handles back/forward via `popstate` and bfcache via `pageshow`

---

## Multi-Tab Handling

- Monitors overlay visibility across phimbro tabs
- Shows warning banner when overlay active in multiple tabs
- Prevents duplicate room connections

---

## Performance

| Optimization | Implementation |
|-------------|----------------|
| Animation control | IntersectionObserver pauses off-screen message animations |
| Debounced events | User join/leave, typing indicators, play/pause sync |
| Embedding cache | Movie embeddings cached by name + year |
| Audio preloading | Soundboard audio files loaded at init |
| Typing UID cache | UID cached after first auth check to skip repeated lookups |
| Async parallelization | Promise.all for batch subtitle/embedding operations |
| Bot mode persistence | chrome.storage.local preserves toggle across navigation |

---

## Error Handling

| Scenario | Handling |
|----------|----------|
| Buffer sync deadlock | 4-layer prevention (stale clear, empty guard, dedup reset, safety-net interval) |
| Scene seek failure | Feedback message posted to chat |
| Network warning | Visual banner in call iframe |
| Room full | Error message, join prevented |
| Auth failure | Error displayed in popup form |
| Firebase disconnect | Auto-reconnection via SDK |
| Iframe reset | Pre-cleanup prevents ghost users and stale signals |
| Monitor switch | Resize listener repositions call iframe |
| Bot mode across navigation | Persisted to chrome.storage.local, restored on rejoin |