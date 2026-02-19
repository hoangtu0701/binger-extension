# Binger

A Chrome extension that turns your favorite movie streaming site into a synchronized movie-watching experience with friends.

---

## Features

- **Synced Playback** - Play, pause, and seek together in real-time
- **Live Chat** - Real-time messaging with a toggleable AI assistant that can seek to scenes you describe
- **Video Calls** - WebRTC-based video/audio calls while watching
- **Private Rooms** - Create or join rooms with 6-digit codes (max 2 users per room)
- **Soundboard** - Sound effects and floating/pinned emoji reactions
- **6 Themes** - Burgundy, Pink, Black & White, Ocean, Volcano, Forest (applied to all components including call iframe)
- **Fullscreen Support** - Connected panel layout with smooth slide animations
- **Minimize Mode** - Collapsible overlay with smooth transitions, auto-expands for pending invites
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
| AI Chat | Grok 4.1 Fast (via OpenRouter) |
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
    content-theme.js          Theme application + sync + call iframe theme forwarding
    content-chatbox.js        Chat UI + bot mode toggle + animation optimization
    content-room.js           Room operations + speech bubble prompts
    content-invite.js         Invitation UI states + progress bar
    content-session.js        Video sync + call iframe + slide animations + theme bridge
    content-fullscreen.js     Fullscreen connected panel layout + iframe position correction
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
    call.js                   Vite-bundled WebRTC logic (IIFE format, includes themed CSS)
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
           Content Scripts  ---postMessage--->  Call Iframe
```

- **Popup** communicates with **Background** via `chrome.runtime.sendMessage`
- **Content Scripts** communicate with **Background** via persistent ports
- **Background** syncs all data through **Firebase Realtime Database**
- **Background** broadcasts updates to all connected content script ports via `broadcastToTabs`
- **Content Scripts** send theme, cam/mic state, and audio mode to **Call Iframe** via `postMessage` and URL parameters

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
- Popup auto-navigates to signed-in screen after success, then auto-closes after ~2 seconds. Any click on the signed-in view (Sign Out, theme dots, or empty space) cancels the auto-close.

---

## Overlay

### General Behavior

- Appears automatically when signed in on phimbro.com
- Persists across page reloads and SPA navigation
- Displays current user info and room status
- All 6 themes apply to every overlay element
- A drag bar indicator below the header signals the toggle affordance, themed per color scheme.
- `overscroll-behavior: contain` prevents scroll chaining to the host page
- Clicking the header banner toggles minimized mode (header + chatbox only). State persists via `chrome.storage.local`. Fullscreen always shows standard layout; exiting restores previous mode. Pending invites auto-expand the minimized overlay to show action buttons.

### Username Display

Compact pill badge centered below the header showing a status dot and the username. Styled per theme with matching dot and text colors.

### Info Strip

The chat header uses a horizontal info strip layout:

| Element | Description |
|---------|-------------|
| Room Badge | Monospace 6-digit room code (JetBrains Mono), shows `------` when not in a room |
| Divider | 1px vertical separator between badge and avatars |
| Host Tag | Uppercase "HOST" pill badge, rounded left corners, positioned to the left of the host avatar and tucked under the circle via negative margin |
| Avatar Circles | 24px opaque circles with single-letter uppercase initials, fully solid backgrounds (no transparency), `font-size: 10px !important` for fullscreen safety |
| User Count | Right-aligned `n/2` counter |
| Empty State | Dashed `?` placeholder circles, reduced right padding to push them flush right |

Background scripts broadcast structured `{ name, isHost }` objects instead of pre-formatted strings, enabling content-side rendering of avatars with proper host badge placement.

Avatar hover tooltips fade in smoothly (0.2s opacity + 4px upward slide). Usernames truncated at 15 characters with ellipsis.

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
- Default "Chat log will appear here" text centered in the chatlog when disabled
- Bot mode toggle for AI queries (see Binger Bot section)
- Send button disabled when input is empty, re-enabled on typing, re-disabled after successful send
- Own messages right-aligned, other user's messages left-aligned, both with dynamic fit-content width (max 90%)
- Three distinct message color tones per theme: other user, own, and Binger Bot (all within the same palette)
- Bot reply messages styled with italic text and distinct avatar color; bordered on Black & White, Ocean, Volcano, and Forest themes
- Smart message grouping: consecutive same-sender messages within 2 minutes share one timestamp (above first message) and one avatar (below last message, left-side only). A different sender or a gap over 2 minutes breaks the group. System notifications also break grouping.
- Typing and seeking indicators always appear at the bottom of the chat log, re-sinking below new messages and notifications as they arrive, retaining their relative order

### Bot Query Indicator

Bot query messages display a 16px glowing borderless "B" circle badge. Positioned at top-right for left-side messages and top-left for right-side own messages. Uses `overflow: hidden` with extra padding on the badge side to keep it visible while containing theme animations (e.g. Forest leaves). Themed per all 6 color schemes with gradient backgrounds and matching glow colors. Font-size locked with `!important` for fullscreen safety.

### Message Animation System

| Message Type | Animation Behavior |
|--------------|-------------------|
| Old (out of view) | No animations rendered |
| Old (in view) | Idle animations only (theme-specific) |
| New (real-time) | Entrance + idle animations + forest leaf spawning |

Uses IntersectionObserver on the chat log to toggle `.paused` class, preventing animation recalculation on messages outside the viewport. Forest leaf spawning uses activation timestamp comparison (not a timer) to distinguish old messages from real-time ones, ensuring leaves always play on new messages regardless of arrival timing. Stale leaf elements are removed instantly on theme switch to prevent static emoji flash.

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
| Pending | "Cancel" button (red), tooltip hidden | "Accept/Decline" with tooltip "Click to Accept. Hold to Decline", long-press to decline |
| Accepted | Waiting for other user | Grayed out, waiting |
| Session | Navigates to movie, enters session mode | Same |

### Session Mode

- All users navigate to the same movie URL
- Video playback is synchronized (play, pause, seek)
- Buffer detection pauses all users until everyone is ready
- Overlay shows only Leave Room + Camera Toggle
- Soundboard becomes available
- Session ends if any user leaves, reloads, or navigates away

### Bottom Button Tooltips

The Invite and Camera buttons each have a hover tooltip that only appears when the button is disabled, explaining why it is unavailable:

| Button | Tooltip Text | Visible When |
|--------|-------------|--------------|
| Invite | "Play a movie with 2 in the room to invite" | Disabled (prerequisites not met) |
| Camera | "Camera will be enabled in-session" | Disabled (not in session) |
| Invite (invitee) | "Click to Accept. Hold to Decline" | Accept/Decline state |

Tooltips are hidden when: button is enabled, overlay is minimized, in session mode, or during inviter/accepted invite states. Styled per all 6 themes. Font size reduced to 10px in fullscreen mode.

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
  call.js             Vite-bundled WebRTC logic (IIFE format, includes themed CSS)
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

### Iframe Reset Flow

The call iframe is destroyed and recreated whenever either user toggles fullscreen or switches audio mode. This guarantees a fresh `getUserMedia` call with the correct audio constraints.

1. Extension sends `cleanupCall` to old iframe via postMessage
2. Old iframe removes its Firebase user entry and signals
3. Old iframe sends `cleanupDone` confirmation
4. Extension destroys old iframe, creates new one with same `roomId`, `uid`, and current `audioMode` baked into the URL
5. New iframe clears remaining signals, registers with same UID key
6. New iframe reads `audioMode` from URL params and sets it before `getUserMedia` runs
7. New iframe determines offerer role (stable - UIDs never change) and starts signaling
8. Extension sends current theme and cam/mic state to new iframe via postMessage

When User A triggers a reset, the extension also writes a `resetIframeFlag` to Firebase. User B's listener detects the flag (ignoring flags written by themselves), triggering their own iframe reset. Both users reconnect with fresh WebRTC connections.

### Call Iframe Theming

The call iframe supports all 6 Binger themes via CSS custom properties:

| Variable | Controls |
|----------|----------|
| `--call-bg` | Body background (matched to soundboard darkness) |
| `--call-video-bg` | Camera feed box background |
| `--call-video-border` | Camera feed border color |
| `--call-btn-bg` | Mic/Cam button background |
| `--call-btn-color` | Mic/Cam button text color |
| `--call-btn-hover` | Button hover background |
| `--call-overlay-bg` | Loading/reconnecting overlay background |
| `--call-spinner-border` | Spinner circle color |

Theme is sent via `postMessage` at three points: iframe creation, iframe reset (fullscreen toggle, audio mode switch, or partner's reset), and live theme changes (user or partner switches theme mid-session).

### Parent-Iframe Communication

| Message | Direction | Purpose |
|---------|-----------|---------|
| `setTheme` | Parent to Iframe | Apply theme colors |
| `restoreCamMic` | Parent to Iframe | Restore cam/mic state after recreation |
| `updateCamMic` | Iframe to Parent | Report cam/mic toggle changes |
| `restoreAudioMode` | Parent to Iframe | Restore speaker/headphone mode after recreation |
| `updateAudioMode` | Iframe to Parent | Report audio mode toggle changes |
| `triggerCallReset` | Iframe to Parent | Request iframe recall after audio mode switch |
| `network-warning` | Iframe to Parent | Notify connection failure |
| `cleanupCall` | Parent to Iframe | Clean up Firebase entries before destruction |
| `cleanupDone` | Iframe to Parent | Confirm cleanup complete |

### Audio Mode

A third button in the call controls toggles between Speaker and Headphone modes. Switching triggers an immediate iframe recall for both users, ensuring the correct audio constraints are applied via a fresh `getUserMedia` call rather than the unreliable `applyConstraints()` on an existing track.

| Mode | echoCancellation | noiseSuppression | autoGainControl |
|------|-----------------|-----------------|-----------------|
| Speaker | true | false | true |
| Headphones | false | false | false |

Speaker mode filters out background noise and echo to prevent the other person from hearing the movie. Headphone mode disables all processing for the cleanest movie audio. `voiceIsolation` is always false in both modes.

The button shows a hover tooltip with a dynamic title ("Speaker Mode" or "Headphones Mode") and a description per mode. Tooltip uses theme-reactive colors via CSS variables and `backdrop-filter: blur(12px)`.

Audio mode is passed as a URL parameter (`audioMode`) on every iframe creation, guaranteeing the correct constraints are set before `getUserMedia` runs. This eliminates the race condition where `restoreAudioMode` postMessages could arrive after the audio track was already created with default constraints. The mode also persists across all recall triggers (fullscreen toggles, audio mode switches, partner's resets) via `window.BINGER.audioMode` on the parent side. Default mode is Speaker.

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
- Bot query messages display a glowing "B" circle badge on the top-right corner of the message bubble
- Bot replies display with italic styling and a distinct avatar color per theme (separate from user avatars)
- Invite accepted/declined/cancelled notifications render as bot-styled messages

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
| Purpose | Classify whether the query needs live web search. Aware that the downstream bot (Binger) handles casual chat, movie questions, and scene seeking without web search. |
| Input | User prompt + last 10 chat messages for context |
| Output | YES or NO |
| Temperature | 0 |
| Max tokens | 3 |

Replies YES if the question involves a specific movie/series and needs current factual info (cast, plot, ratings, release dates, reviews). Replies NO for casual chat, greetings, jokes, scene-seeking, or general knowledge.

**Step 2 - Main Response:**

| Condition | Model | Features |
|-----------|-------|----------|
| Web search needed | `x-ai/grok-4.1-fast:online` via OpenRouter | Native xAI web + X search |
| No web search | `x-ai/grok-4.1-fast` via OpenRouter | Offline response |

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
4. Rewrite chunks with `x-ai/grok-4.1-fast` into concise descriptions
5. Generate embeddings with `text-embedding-3-large`
6. Cache embeddings per movie (keyed by name + year)
7. Embed user's scene description
8. Find best match via cosine similarity (with timing bias if fraction provided)
9. Seek video via Firebase (in session) or direct tab lookup (solo)

**Typing Indicators:**

- "Binger Bot is typing..." during response generation
- "Binger Bot is seeking..." with randomized seeking messages during scene search
- Uses per-query Firebase children (`typing/BINGER_BOT/{queryId}`) instead of a single boolean, so concurrent queries from both users keep the indicator alive until all responses are delivered
- Same pattern for seek indicator (`typing/BINGER_BOT_SEEK/{seekId}`)
- All typing/seeking indicators automatically sink to the bottom of the chat log as new messages and notifications arrive

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
| Pink | Pink (own), green (other), magenta (bot) |
| Black & White | Animated star field |
| Ocean | Blue gradient, sand textures |
| Volcano | Red/orange with lava effects |
| Forest | Green with floating leaves |

- Theme saved to `chrome.storage.sync`
- Host's theme applied to room on creation
- Theme changes broadcast to all room members in real-time
- Theme propagated to call iframe via `postMessage` on change, creation, and reset

---

## Fullscreen Mode

### Layout

- Video region takes 70% height
- Bottom row (30%) contains: Call Iframe + Overlay + Soundboard (left to right)
- Zero-gap connected panel layout - components snap together with shared borders
- Overlay wrapper uses `fit-content` width to hug overlay exactly

### Connected Panel Design

In fullscreen during a session, the three bottom-row components connect as a single visual block:

| Component | Border Radius |
|-----------|--------------|
| Call Iframe (when visible) | Rounded left, sharp right |
| Overlay (iframe visible) | All sharp (sandwiched) |
| Overlay (iframe hidden) | Rounded left, sharp right |
| Soundboard | Sharp left, rounded right |

Connecting-side borders are removed between adjacent components to eliminate double-border seams. The overlay's border-radius transitions smoothly (0.35s) when the iframe toggles.

### Call Iframe Slide Animation

| Mode | Show Animation | Hide Animation |
|------|---------------|---------------|
| Fullscreen | `max-width` expands from 0 to natural size + opacity fade-in | `max-width` collapses to 0 + opacity fade-out |
| Non-fullscreen | `translateX` slides in from right + opacity fade-in | `translateX` slides out to right + opacity fade-out |

Both animations use `cubic-bezier(0.4, 0, 0.2, 1)` over 0.35 seconds. The fullscreen row uses `justify-content: center`, so the overlay + soundboard chunk naturally re-centers as the iframe expands or collapses.

A `binger-call-initial` CSS class applies `display: none` on iframe creation to prevent flash before first toggle. Removed on first show with a forced reflow (`void offsetHeight`) to enable the CSS transition.

### Call Iframe Positioning

- **Normal mode:** `position: fixed`, calculated relative to overlay left edge, resize listener for monitor changes
- **Fullscreen mode:** `position: static` inside flex container, no manual positioning needed
- **Fullscreen exit:** `requestAnimationFrame` recalculates iframe `left` position after layout reflow to prevent stale position offset

### Cleanup on Toggle

- Ephemeral elements (floating emojis, pins) removed
- Call iframe recreated with pre-cleanup, preserved cam/mic state, audio mode, and theme forwarding
- Soundboard repositioned without size change

---

## Navigation Handling

- Intercepts `pushState` / `replaceState` for SPA navigation
- Forces page reload to re-initialize extension state
- Exception: `/search` pages don't trigger reload
- URL polling fallback (500ms) for edge cases
- Handles back/forward via `popstate` and bfcache via `pageshow`

---

## Warning Banners

Both warning banners use a consistent glassmorphism design with themed variants for all 6 color schemes, slide-in animations from the top, and CSS-only styling (no inline styles).

### Multi-Tab Warning

- Monitors overlay visibility across phimbro tabs
- Shows themed banner when overlay active in multiple tabs
- Prevents duplicate room connections
- Structure: icon + text, non-interactive (`pointer-events: none`)
- Slides down from top center via `multiTabSlideIn` animation

### Network Warning

- Triggered by the call iframe via `postMessage` when WebRTC connection fails
- Shows themed banner with title, description, and dismissible close button
- Structure: icon + content (title + description) + close button
- Slides down from top center via `networkWarningSlideIn` animation
- Dismissed on click or automatically removed when the session ends

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
| Scroll containment | `overscroll-behavior: contain` on overlay and chatlog prevents scroll bleed to host page |
| CSS-driven animations | Iframe slide in/out uses pure CSS transitions (no JS animation loops) |
| Theme switch cleanup | Stale forest leaf DOM elements removed instantly on theme change |
| Typing indicator sink | Typing bubbles re-appended to chat log bottom on every message and notification render |
| Minimize persistence | chrome.storage.local preserves minimized state across navigations and restarts |

---

## Error Handling

| Scenario | Handling |
|----------|----------|
| Buffer sync deadlock | 4-layer prevention (stale clear, empty guard, dedup reset, safety-net interval) |
| Scene seek failure | Feedback message posted to chat |
| Network warning | Themed dismissible banner with slide-in animation |
| Room full | Error message, join prevented |
| Auth failure | Error displayed in popup form |
| Firebase disconnect | Auto-reconnection via SDK |
| Iframe reset | Pre-cleanup prevents ghost users and stale signals, audio mode baked into URL to avoid constraint race conditions, theme and cam/mic re-sent on reload |
| Monitor switch | Resize listener repositions call iframe |
| Fullscreen exit iframe drift | requestAnimationFrame recalculates position after layout reflow |
| Bot mode across navigation | Persisted to chrome.storage.local, restored on rejoin |
| Empty message send | Send button disabled when input is empty, re-enabled on typing |