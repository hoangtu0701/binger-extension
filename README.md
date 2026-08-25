# Binger

A Chrome extension that turns your favorite movie streaming site into a synchronized movie-watching experience with friends.

---

## Features

- **Synced Playback** - Play, pause, and seek together in real-time, with sender-tagged state so the person who clicked never gets pulled back by their own echo
- **Live Chat** - Real-time messaging with a toggleable AI assistant that can seek to scenes you describe
- **Video Calls** - Full-mesh WebRTC video/audio for the whole room while watching
- **Rooms** - Create or join rooms with 6-digit codes, up to 3 users per room
- **Room Privacy** - Host-controlled lock with a 4-digit password. Public by default, private on demand, and locking never affects anyone already inside
- **Soundboard** - Sound effects and floating/pinned emoji reactions
- **10 Themes** - Burgundy, Pink, Volcano, Ocean, Sunset, Black & White, Royal, Forest, Arctic, Midnight (applied to all components including call iframe)
- **Fullscreen Support** - Connected panel layout with smooth slide animations, and `moveBefore()` transitions that keep the call alive
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
| Video Calls | WebRTC full mesh with STUN/TURN (Google STUN, Xirsys STUN, ExpressTurn TURN) |
| AI Chat | Grok 4.3 (via OpenRouter) with structured JSON output |
| Web Search | openrouter:web_search server tool (model-decided) |
| Scene Seeking | text-embedding-3-large embeddings (via OpenAI) + SubDL subtitles (SRT/ASS/SSA) |
| API Proxies | Vercel Serverless Functions |

Two separate Firebase projects are in use: `binger-extension` for the room database and auth, and `binger-video-call` for WebRTC signaling.

---

## Architecture Overview

### Extension Structure

```
src/
  background/
    background.js             Entry point - loads all modules
    bg-firebase-init.js       Firebase SDK loading + initialization
    bg-state.js               Centralized state management (12 listener maps)
    bg-helpers.js             Shared utilities (broadcast, room ID generation)
    bg-auth.js                Authentication handlers
    bg-rooms.js               Room creation, joining, leaving (atomic transactions)
    bg-privacy.js             Room privacy, password generation and validation, host checks
    bg-chat.js                Chat message handling
    bg-users.js               User list subscriptions + join/leave notifications
    bg-invites.js             Watch Together invitation system
    bg-session.js             Synchronized playback session + buffer management
    bg-typing.js              Typing indicator sync
    bg-soundboard.js          Sound/visual/pin effects
    bg-theme.js               Theme synchronization
    bg-subtitles.js           Subtitle fetching + chunk rewriting + embedding generation
    bg-bot.js                 AI chatbot + structured response parsing + scene seeking
    bg-tab-monitor.js         Multi-tab detection
    bg-connection.js          Port management + keep-alive + cleanup on disconnect
    bg-message-router.js      Routes 52 commands to handlers

  content/
    main.js                   Entry point - initializes all modules in order
    content-helpers.js        DOM utilities, URL parsing, validation, call iframe URL builder
    content-state.js          Centralized content script state
    content-connection.js     Port connection to background + storage helpers
    content-navigation.js     Navigation handling (link interception + URL polling)
    content-overlay-dom.js    Overlay UI construction + element caching
    content-theme.js          Theme application + sync + call iframe theme forwarding
    content-privacy.js        Lock icon, lock tooltip, password editing, privacy sync
    content-chatbox.js        Chat UI + bot mode toggle + animation optimization
    content-room.js           Room operations + speech bubble prompts + password prompt
    content-invite.js         Invitation UI states + progress bar
    content-session.js        Video sync + call iframe + slide animations + theme bridge
    content-fullscreen.js     Fullscreen connected panel layout + moveBefore transitions
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
    call.html                 WebRTC call UI with one local and two remote feeds
    call.js                   Vite-bundled WebRTC logic (IIFE format, includes themed CSS)
    firebase/                 Local Firebase SDK copies (CSP-compliant)

styles/                       CSS organized by component (10 files)
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
- **Content Scripts** send theme, cam/mic state, audio mode, participant count, and fullscreen state to **Call Iframe** via `postMessage` and URL parameters

### Room Node Shape

```
rooms/{roomId}/
  host              uid of the creator, never reassigned
  theme             active theme name
  createdAt         server timestamp
  inSession         boolean
  privacy           { isPrivate, password }
  users/{uid}       { email, joinedAt }
  messages/{key}    { sender, text, timestamp, type? }
  playerState       { action, time, by? }
  bufferStatus/{uid}
  typing/{uid}
  activeInvite      { createdBy, sender, movieUrl, expiresAt, acceptedInvitees }
  readyUsers/{uid}
  lastLeaves/{uid}
  resetIframeFlag   { by, at }
  soundboard, visualboard, pins
```

### Module Load Order

Background modules must load in this order due to dependencies:

```
firebase-init > state > helpers > tab-monitor > connection > auth > rooms >
privacy > chat > users > invites > session > typing > soundboard > theme >
subtitles > bot > message-router
```

Content scripts load in manifest order and initialize through `main.js`:

```
helpers > state > connection > navigation > overlay-dom > theme > privacy >
chatbox > room > invite > message-router > session > fullscreen > soundboard > main
```

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
- All 10 themes apply to every overlay element
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
| Divider | 1px vertical separator between badge and lock |
| Room Lock | Animated lock icon with hover tooltip. Host-only click target. Hidden when not in a room |
| Host Tag | Uppercase "HOST" pill badge, rounded left corners, positioned to the left of the host avatar and tucked under the circle via negative margin |
| Avatar Circles | 24px opaque circles with single-letter uppercase initials, fully solid backgrounds (no transparency), `font-size: 10px !important` for fullscreen safety |
| User Count | Right-aligned `n/3` counter |
| Empty State | Dashed `?` placeholder circles, reduced right padding to push them flush right |

Background scripts broadcast structured `{ name, isHost }` objects instead of pre-formatted strings, enabling content-side rendering of avatars with proper host badge placement.

Avatar hover tooltips fade in smoothly (0.2s opacity + 4px upward slide). Usernames truncated at 15 characters with ellipsis. In-chat message avatars carry the same tooltip, positioned with `position: fixed` and `getBoundingClientRect` on hover so it escapes the chat log's overflow clipping.

### Room System

| Action | Behavior |
|--------|----------|
| Create Room | Generates unique 6-digit code via atomic Firebase transaction, public with a password pre-generated |
| Join Room | Inline bubble input validates code, checks privacy, prompts for a password if private, joins if the room exists and has space (max 3) |
| Leave Room | Removes user from Firebase, cancels any active invite, deletes room if empty |
| Rejoin | Allowed within 60 seconds of disconnection (page reload, navigation), with no password prompt |

An inline three-dot loader covers the overlay on Create, Join, and Leave, and clears immediately on a failed password rather than hanging.

---

## Room Privacy

Every room is created **public**, with a randomly generated 4-digit password already stored and ready. The password is only surfaced or enforced once the room is set to private.

### The Lock

A lock icon sits in the chat info strip, immediately right of the divider next to the room code. It animates between locked and unlocked states: the shackle swings, the body fills, and the pin scales in.

- Everyone in the room sees the lock and its tooltip
- Only the **host** can click it or edit the password. The host is whoever created the room and is never reassigned
- Public state reads "Room is public" with the password field collapsed
- Private state reads "Room password" and shows the 4 digits
- Non-hosts can select and copy the password but cannot edit it

### Password Editing

| Action | Result |
|--------|--------|
| Click the password | Focuses the field and pins the tooltip open even when the pointer leaves |
| Enter | Saves and closes |
| Escape | Reverts and closes |
| Click outside | Saves and closes |
| Click the lock while editing | Saves the password, flips privacy, and keeps the tooltip open |

Input is restricted to digits and capped at 4 characters.

### Joining a Private Room

After the room code is entered and validated, the same join bubble collapses and reopens as a password field. A wrong password empties the field, shakes it in place, and fades a red ring, with no text explaining why. An invalid room code and a full room produce the same shake, so nothing about the room is leaked.

The password is validated in the background **before any leave or join side effect runs**, so a failed attempt can never evict you from the room you are currently in.

### Effect of a Change

Toggling privacy or changing the password **never** affects anyone already in the room. Nobody is kicked and no session is interrupted. The change propagates instantly to every client through a `rooms/{id}/privacy` listener.

### Security Posture

The password lives in Firebase and is read by the client. This stops someone who guessed a room code. It is not real security against a determined attacker, and that trade-off is deliberate.

### Implementation Notes

`position: fixed` tooltips are broken by any ancestor that sets `backdrop-filter`, `transform`, `filter`, `perspective`, `contain`, or `will-change`, because that ancestor becomes the containing block. `positionTip` walks the ancestor chain via `findFixedContainer` and converts coordinates to be relative to whichever element it finds. In fullscreen the tooltip is re-parented to `document.fullscreenElement`, since a fullscreen element only paints its own subtree.

---

## Chat

- Real-time messaging via Firebase Realtime Database
- Typing indicators with 1.2-second timeout and cached UID for performance
- Messages persist in the room node
- Disabled until user joins a room
- Default "Chat log will appear here" text centered in the chatlog when disabled
- Bot mode toggle for AI queries (see Binger Bot section)
- Send button disabled when input is empty, re-enabled on typing, re-disabled after successful send
- Own messages right-aligned, other users' messages left-aligned, both with dynamic fit-content width (max 90%)
- Three distinct message color tones per theme: other users, own, and Binger Bot (all within the same palette)
- Bot reply messages styled with italic text and distinct avatar color; bordered on Black & White, Ocean, Volcano, Forest, Midnight, Sunset, Arctic, and Royal themes
- Smart message grouping: consecutive same-sender messages within 2 minutes share one timestamp (above first message) and one avatar (below last message, left-side only). A different sender or a gap over 2 minutes breaks the group. System notifications also break grouping.
- Message avatars carry a hover tooltip with the sender's name, which is what tells two users with the same initial apart
- Typing and seeking indicators always appear at the bottom of the chat log, re-sinking below new messages and notifications as they arrive, retaining their relative order
- A newcomer sees the entire chat history, because the message listener uses `child_added` with no `limitToLast` and Firebase replays every existing child on attach

### Bot Query Indicator

Bot query messages display a 16px glowing borderless "B" circle badge. Positioned at top-right for left-side messages and top-left for right-side own messages. Uses `overflow: hidden` with extra padding on the badge side to keep it visible while containing theme animations (e.g. Forest leaves). Themed per all 10 color schemes with gradient backgrounds and matching glow colors. Font-size locked with `!important` for fullscreen safety.

### Message Animation System

| Message Type | Animation Behavior |
|--------------|-------------------|
| Old (out of view) | No animations rendered |
| Old (in view) | Idle animations only (theme-specific) |
| New (real-time) | Entrance + idle animations + particle spawning |

Uses IntersectionObserver on the chat log to toggle the `.paused` class, preventing animation recalculation on messages outside the viewport. Particle spawning uses activation timestamp comparison (not a timer) to distinguish old messages from real-time ones, ensuring effects always play on new messages regardless of arrival timing. Stale particles are removed instantly on theme switch to prevent a static emoji flash.

---

## Watch Together

### Prerequisites

1. User is signed in
2. Room has at least 2 participants
3. User is on a `/watch/` page

Two users can start a session without waiting for a third. `hasEnoughUsers()` returns `currentUsersInRoom.length >= 2`, which means "enough people present to do something together" rather than "the room is full".

### Invitation Flow

| Stage | Inviter | Invitee |
|-------|---------|---------|
| Idle | "Watch Together" button enabled | Same |
| Pending | "Cancel" button (red), tooltip hidden | "Accept/Decline" with tooltip "Click to Accept. Hold to Decline", long-press to decline |
| Accepted | Waiting for the others | Grayed out, waiting |
| Session | Navigates to movie, enters session mode | Same |

`checkAllAccepted` recomputes the required accepters against the live user list on every write, so **every** non-inviter in the room must accept before the session starts. That is 1 acceptance in a 2-person room and 2 in a 3-person room, with no code change needed. A single decline vetoes the invite for everyone, and the bot message names the decliner.

A user joining while an invite is pending is folded into it automatically and gets the same Accept / Decline prompt.

If a user leaves the room in any way that produces a "left the room" notification, the active invite is cancelled for everyone remaining. This prevents someone accepting on the assumption that a third person is still coming. A page refresh or navigation does not trigger this, because the leave notification is suppressed when the user returns within the debounce window.

### Session Mode

- All users navigate to the same movie URL
- Video playback is synchronized (play, pause, seek)
- Buffer detection pauses everyone until all users are ready
- Overlay shows only Leave Room + Camera Toggle
- Soundboard becomes available
- Session ends if any user leaves, reloads, or navigates away

A third user joining a **public** room mid-session ends that session, because the join path reloads the page and the reload flags `inSession` false. This is deliberate. Room privacy is the mechanism for preventing an interruption.

### Bottom Button Tooltips

The Invite and Camera buttons each have a hover tooltip that only appears when the button is disabled, explaining why it is unavailable:

| Button | Tooltip Text | Visible When |
|--------|-------------|--------------|
| Invite | "Play a movie with 2 in the room to invite" | Disabled (prerequisites not met) |
| Camera | "Camera will be enabled in-session" | Disabled (not in session) |
| Invite (invitee) | "Click to Accept. Hold to Decline" | Accept/Decline state |

Tooltips are hidden when: button is enabled, overlay is minimized, in session mode, or during inviter/accepted invite states. Styled per all 10 themes. Font size reduced to 10px in fullscreen mode.

---

## Video Sync

### Player State Synchronization

- Play/pause events pushed to Firebase with timestamp
- Seek events synced with current time position
- 300ms debounce on play/pause prevents echo loops
- Every write carries a `by: uid` field, and the content-side handler returns early on `msg.data.by === userId`, so a client never applies its own echo. Without this, a Firebase round trip over 1 second while playing would seek the originator **backward** to its position at click time.
- The `lastStateSent` / `lastStateTimestamp` debounce refresh inside the message handler is the real echo guard, not the `suppress` flag. `video.pause()` fires its event asynchronously, after `suppress` is already false.
- The session-start seek-to-0 push is deliberately **not** tagged, because it must be applied by everyone including the sender to counteract phimbro's auto-resume
- Auto-resume protection: while playback is locked, foreign seeks (phimbro's saved-checkpoint auto-resume) are snapped back to the room's last synced position, guaranteeing every session starts at 0:00 for everyone

### Buffer Handling

- Users report buffering status to Firebase under `bufferStatus/{uid}`
- When any user buffers, all users pause with click blockers
- Resume requires every reported status to be "ready", so it scales to any room size unchanged
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
  call.html           Flat .call-stage holding one local feed, two remote feeds, and controls
  call.js             Vite-bundled WebRTC logic (IIFE format, includes themed CSS)
  firebase/           Local Firebase SDK copies (CSP-safe)
```

### Full Mesh

Every participant holds a direct connection to every other participant. With N users that is N*(N-1)/2 connections: 1 connection for 2 users, 3 for 3 users, with each client owning N-1 `RTCPeerConnection` objects. Mesh is the standard approach for 2 to 4 participants when avoiding a media server.

`state.peers` is a `Map` keyed by remote uid. Each record owns its own peer connection, `MediaStream`, slot index, polite flag, pending ICE candidate buffer, retry counters, and timers.

### ICE Server Configuration

| Type | Servers |
|------|---------|
| STUN | Google (stun.l.google.com and stun1 through stun3), Xirsys (hk-turn1.xirsys.com) |
| TURN | ExpressTurn relay (free.expressturn.com:3478) |

STUN is free and unmetered. TURN relay is the only metered path and typically carries 15 to 20 percent of consumer traffic.

### Connection Flow

1. Each user registers under `calls/{roomId}/users/{uid}` with their name and current cam/mic state, plus an `onDisconnect().remove()` safety net
2. Roster listeners on that node drive everything: `child_added` opens a connection, `child_removed` closes one, `child_changed` updates mic and camera badges
3. Offerer selection is pairwise: `polite = state.userId > uid`, so the lexicographically smaller uid offers and the larger answers. UIDs never change, so the role is stable across rebuilds.
4. Signals are pushed to `calls/{roomId}/signals` with an explicit `to` field. The listener filters on `msg.to === state.userId` and deletes each message immediately after consuming it.
5. Perfect Negotiation handles offer collisions. A collision is detected via `peer.makingOffer || pc.signalingState !== "stable"`. The impolite peer ignores a colliding offer, the polite peer accepts it through implicit rollback.
6. ICE candidates buffer in `peer.pendingCandidates` until the remote description is set, then flush

Signals are never bulk-cleared while a call is running. A blanket `signals.remove()` is harmless at 2 users but destructive at 3, because completing one handshake would wipe the signals for the two still negotiating. On init, `clearOwnStaleSignals` removes only messages addressed to this user.

### Failure Handling

Retries are per-peer and give-up is global. Each peer carries its own `iceRestartCount` and `triedRelayOnly`, so one flaky peer cannot burn the budget another peer needs.

| Stage | Behavior |
|-------|----------|
| Connection timeout | 30 seconds |
| Disconnected timeout | 10 seconds before treating a drop as a failure |
| ICE restart | Up to 2 per peer |
| Relay-only fallback | One attempt per peer with `iceTransportPolicy: "relay"` |
| Final failure | All slots show "Connection failed", and a network probe decides whether to raise the network warning banner |

Failure is all-or-nothing by design: any peer exhausting its retries ends the call for everyone.

### Layout

`call.html` is a flat `.call-stage` containing `.feed` wrappers plus `.controls`, so CSS alone produces every layout with no DOM branching.

| Mode | 2 participants | 3 participants |
|------|----------------|----------------|
| Normal | Iframe 700x280, two feeds side by side | Iframe 587x333, two remotes stacked left, local spanning both rows, buttons in a fixed 56px column |
| Fullscreen | Aspect ratio 5/2, max-width 1000px | Width `calc(84vh - 16px)`, max-width 1400px, two remotes side by side, local top right, buttons in a row beneath |

Two-person layouts are untouched by the three-person rules. Everything new is scoped under `body.participants-3` and `.binger-call-wide`.

The parent tells the call app the participant count two ways: a `users=` URL parameter so the first paint is already correct, and a `setUserCount` postMessage for live updates. `updateParticipantClass` uses `Math.max(peers + 1, expectedUsers)` so a call that opened as 3-person stays 3-person even if a peer momentarily drops off the roster during a rebuild.

### Controls and Feed Chrome

- Controls are SVG icons only. The strike-through animates via `stroke-dasharray` and `stroke-dashoffset`
- Speaker and headphones are two separate SVGs toggled by class
- `updateMicButton` and `updateCamButton` use `classList.toggle`, never `innerHTML`, because an `innerHTML` write would wipe the tooltip children on every toggle
- Control tooltips are `position: fixed`, JS-positioned on `mouseenter`, clamped to the viewport, and flipped below the button when there is no room above
- Each feed carries a mic badge with a muted state, and a placeholder bubble with the participant's initial when their camera is off
- The local feed carries a "You" badge, offset to clear the mic badge
- When `getUserMedia` fails, the local feed shows the placeholder plus a "Camera and mic unavailable" caption instead of a black rectangle, and the client drops to receive-only via `addTransceiver` recvonly

### Iframe Reset Flow

The call iframe is destroyed and recreated on an audio mode switch, and on a fullscreen toggle in browsers without `moveBefore()`. This guarantees a fresh `getUserMedia` call with the correct audio constraints.

1. Extension sends `cleanupCall` to the old iframe via postMessage
2. Old iframe closes every peer connection, removes its Firebase user entry, and deletes the room node if it was the last one out
3. Extension destroys the old iframe and creates a new one with the same `roomId` and `uid`, plus the current `audioMode` and participant count baked into the URL
4. New iframe clears only its own stale signals and registers under the same UID key
5. New iframe reads `audioMode` from URL params and sets it before `getUserMedia` runs
6. Offerer roles resolve identically, since they derive from UIDs
7. Extension sends the current theme, cam/mic state, and fullscreen state to the new iframe

When one user triggers a reset, the extension also writes a `resetIframeFlag` to Firebase. Other users' listeners detect the flag (ignoring flags they wrote themselves) and reset their own iframe.

### Fullscreen Transitions

Reparenting an iframe with `appendChild` or `insertBefore` destroys and reloads it. That is spec behavior, not a browser quirk, and it used to tear down the call on every fullscreen toggle.

`Element.moveBefore()` moves a node without disconnecting it, preserving iframe state, media, scroll position, and focus. Support: Chrome 133, Edge 133, Firefox 144. It is feature-detected via `canMoveElements()`, and the old recreate path is retained as a live fallback.

Degradation is per-user, not per-room. A client with `moveBefore` keeps its connections alive. A client without rebuilds, and the others renegotiate only that leg through the roster listener.

One caveat worth keeping: `moveBefore` preserving everything cuts both ways. The old destroy was implicitly resetting state nobody knew was being reset, including making `#bingerOverlay`'s height transition eligible to run for the first time. A `binger-fs-transition-lock` class suppresses transitions across the move, applied before it with a forced reflow and removed on the next animation frame.

### Call Iframe Positioning

- **Normal mode:** `position: fixed`, anchored with `right` computed as `window.innerWidth - overlayRect.left + 20`. Because the overlay is `position: fixed; right: 20px`, that expression is a constant and does not depend on viewport width, so the iframe stays glued to the overlay even if the position is never recalculated. An earlier `left`-based anchor stranded the iframe off-screen when a window moved between monitors, because that does not reliably fire a resize event.
- **Fullscreen mode:** `position: static` inside the flex row, with both `left` and `right` unset

### Call Iframe Theming

The call iframe supports all 10 Binger themes via CSS custom properties:

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

Theme is sent via `postMessage` at three points: iframe creation, iframe reset, and live theme changes.

### Parent-Iframe Communication

| Message | Direction | Purpose |
|---------|-----------|---------|
| `setTheme` | Parent to Iframe | Apply theme colors |
| `setUserCount` | Parent to Iframe | Update participant count and layout |
| `setFullscreen` | Parent to Iframe | Tell the call app it is in fullscreen, which it cannot otherwise detect since the class lives on the iframe element |
| `restoreCamMic` | Parent to Iframe | Restore cam/mic state after recreation |
| `updateCamMic` | Iframe to Parent | Report cam/mic toggle changes |
| `restoreAudioMode` | Parent to Iframe | Restore speaker/headphone mode after recreation |
| `updateAudioMode` | Iframe to Parent | Report audio mode toggle changes |
| `triggerCallReset` | Iframe to Parent | Request iframe recall after audio mode switch |
| `network-warning` | Iframe to Parent | Notify connection failure |
| `cleanupCall` | Parent to Iframe | Clean up Firebase entries before destruction |
| `cleanupDone` | Iframe to Parent | Confirm cleanup complete |

### Audio Mode

A third button in the call controls toggles between Speaker and Headphone modes. Switching triggers an immediate iframe recall for everyone, ensuring the correct audio constraints are applied via a fresh `getUserMedia` call rather than the unreliable `applyConstraints()` on an existing track.

| Mode | echoCancellation | noiseSuppression | autoGainControl |
|------|-----------------|-----------------|-----------------|
| Speaker | true | false | true |
| Headphones | false | false | false |

Speaker mode filters out background noise and echo to prevent other people hearing the movie. Headphone mode disables all processing for the cleanest movie audio. `voiceIsolation` is always false in both modes.

The button shows a hover tooltip with a dynamic title ("Speaker Mode" or "Headphones Mode") and a description per mode.

Audio mode is passed as a URL parameter (`audioMode`) on every iframe creation, guaranteeing the correct constraints are set before `getUserMedia` runs. This eliminates the race condition where `restoreAudioMode` postMessages could arrive after the audio track was already created with default constraints. Audio mode is per-client and is not synced across the room. Default mode is Speaker.

### Room Cleanup

- Each user entry has `onDisconnect().remove()` as a safety net
- Explicit cleanup cancels `onDisconnect` and removes the entry immediately
- Signals addressed to this user are cleared on init; other users' in-flight signals are never touched
- The call room node is only deleted when the last user leaves

---

## Binger Bot

### Activation

Bot mode is activated via a toggle button ("B") in the chat input bar. When active:

- The button glows with theme-matched colors
- The input placeholder changes to "Ask Binger..."
- All messages sent are routed to the bot
- Bot query messages display a glowing "B" circle badge on the corner of the message bubble
- Bot replies display with italic styling and a distinct avatar color per theme
- Invite accepted/declined/cancelled notifications render as bot-styled messages

Bot mode state persists across page navigation via `chrome.storage.local` and resets when leaving a room.

### Context Sources

| Page Type | Context Extracted |
|-----------|-------------------|
| `/watch/` | Title, Year, Current Minute |
| `/title/` | Title, Year |
| Other | None |

Every query also carries the full room user list, whether a session is active, and the last 10 chat messages.

### Response Generation

One call to `x-ai/grok-4.3` via OpenRouter, with the `openrouter:web_search` server tool attached. The model decides for itself when a question needs a live search, so there is no separate routing call.

| Property | Value |
|----------|-------|
| Model | `x-ai/grok-4.3` |
| Temperature | 0.9 while watching a film, 1.2 otherwise |
| Max tokens | 250 |
| Reasoning | Disabled |
| Response format | Strict JSON schema |
| Response style | 1 to 3 natural sentences, casual tone |

The response schema has three fields:

| Field | Meaning |
|-------|---------|
| `reply` | What the bot says out loud in chat |
| `seek` | A rephrased scene description, or null. Only set when a scene is requested and a film is playing |
| `fraction` | 0 to 20 positional hint, or null. Only set when the user indicated timing such as "near the end" |

Citations, markdown, and em dashes are stripped from `reply` before it is posted to chat.

### Scene Seeking

Triggered when the structured response contains a non-null `seek` field.

1. Read the scene description from `seek` and the optional timing from `fraction`
2. Fetch subtitles from the SubDL API, filtered by year, preferring BluRay releases, falling back from `.srt` to `.ass` or `.ssa`
3. Group subtitles into 60-second chunks
4. Rewrite each chunk with `x-ai/grok-4.3` into a concise description of what happens
5. Generate embeddings for every chunk with `text-embedding-3-large`
6. Cache the embeddings for that movie, keyed by name and year
7. Embed the user's scene description
8. Score by cosine similarity. If a fraction was given, the search narrows to a window around that position first
9. Blend the top match with any adjacent high scorers, then subtract 8 seconds of lead-in
10. Seek via Firebase `playerState` in a session, or via a direct tab lookup when solo

**Typing Indicators:**

- "Binger Bot is typing..." during response generation
- "Binger Bot is seeking..." with randomized seeking messages during scene search
- Uses per-query Firebase children (`typing/BINGER_BOT/{queryId}`) instead of a single boolean, so concurrent queries from several users keep the indicator alive until all responses are delivered
- Same pattern for the seek indicator (`typing/BINGER_BOT_SEEK/{seekId}`)
- All typing and seeking indicators automatically sink to the bottom of the chat log as new messages and notifications arrive

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

- All effects broadcast to the whole room via Firebase
- Sounds play instantly with preloaded audio
- Visual effects float for 2 seconds then auto-remove
- Pins display for 5 seconds with fade-out

---

## Themes

| Theme | Primary Colors | Signature |
|-------|----------------|-----------|
| Burgundy | Dark red, warm white | Ambient glow |
| Pink | Pink (own), green (other), magenta (bot) | Sakura drift texture |
| Volcano | Red/orange with lava effects | Animated lava bar under header |
| Ocean | Blue gradient, sand textures | Bioluminescent pulse |
| Sunset | Amber and dusk violet | Hazy horizon sun with light rays |
| Black & White | Animated star field | 12-layer parallax starfield |
| Royal | Deep violet and antique gold | Velvet weave, vignette, gold sheen, recessed frame |
| Forest | Green with floating leaves | Emoji leaf particles per new message |
| Arctic | Deep slate and pale ice | Dendritic frost crystals grow per new message |
| Midnight | Warm brown, moonlight gold | Candle glow, hover fire with embers, smoke per new message |

- Theme saved to `chrome.storage.sync`
- Host's theme applied to the room on creation
- Theme changes broadcast to all room members in real-time
- Theme propagated to the call iframe via `postMessage` on change, creation, and reset
- Popup selector is a 2x5 grid; warm reds spaced apart so adjacent dots stay distinguishable

Two conventions worth keeping when adding a theme. Borders read best as the accent hue pulled down in saturation and mid-darkened, not the pure hue at low alpha, because a desaturated mid-tone reads as a material edge while a pure hue at low alpha reads as a smeared glow. And popup theme dots should keep both gradient stops within a narrow lightness range of a single hue, since a high-contrast two-hue gradient at 135 degrees produces a visible diagonal seam.

---

## Particle System

Three themes spawn real DOM particles per new message via `spawnLeaves()` in `content-theme.js`, dispatched by active theme. Only genuinely-new messages trigger them (`timestamp >= activationTimestamp`).

| Theme | Particles | Behavior |
|-------|-----------|----------|
| Forest | 4-8 emoji leaves | Drift and rotate outward, removed after 10s |
| Midnight | 5-8 smoke puffs | Turbulence-warped, curved wind-biased paths, dissipate and self-remove |
| Arctic | 7-12 frost crystals | Grow inward from random perimeter points, persist for the session |

Realism comes from `feTurbulence` plus `feDisplacementMap` warping each particle's silhouette. Twelve filter variants are injected once into the DOM by `ensureFogFilters()`: six low-frequency for smoke (soft billows) and six high-frequency for frost (fine crystalline detail). Every particle picks a variant at random.

Each particle randomizes size, position, drift vector, rotation, duration, delay, opacity, and blur, so no two messages produce the same effect. Smoke additionally derives a per-message `wind` bias that all its puffs deviate from, giving each message a prevailing direction.

Only `transform` and `opacity` are animated. `will-change` is cleared once growth completes, and the existing `.paused` IntersectionObserver rule freezes offscreen particles.

---

## Fullscreen Mode

### Layout

- Video region takes 70% height
- Bottom row (30%) contains: Call Iframe + Overlay + Soundboard (left to right)
- Zero-gap connected panel layout - components snap together with shared borders
- Overlay wrapper uses `fit-content` width to hug the overlay exactly

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

Both animations use `cubic-bezier(0.4, 0, 0.2, 1)` over 0.35 seconds. The fullscreen row uses `justify-content: center`, so the overlay and soundboard chunk naturally re-centers as the iframe expands or collapses.

A `binger-call-initial` CSS class applies `display: none` on iframe creation to prevent a flash before the first toggle. It is removed on first show with a forced reflow (`void offsetHeight`) to enable the CSS transition.

### Cleanup on Toggle

- Ephemeral elements (floating emojis, pins) removed
- Call iframe moved with `moveBefore()` where supported, otherwise recreated with pre-cleanup, preserved cam/mic state, audio mode, and theme forwarding
- Soundboard repositioned without size change

Chat scroll position is preserved on entering fullscreen. On exit it is only partially preserved, because the chat log becomes substantially taller and the browser legitimately clamps `scrollTop`. `saveChatScroll` and `restoreChatScroll` remain in place as the path for browsers without `moveBefore`.

---

## Navigation Handling

- Intercepts same-origin link clicks site-wide to set the reload flag before navigating (plain left clicks only; modifier clicks, `target="_blank"`, downloads, hash-only anchors, and clicks already handled by the site pass through untouched)
- Forces a page reload to re-initialize extension state on any SPA-style URL change, detected via URL polling (500ms)
- Exception: `/search` pages do not trigger a reload (search is the site's one remaining SPA surface)
- Handles bfcache restores via `pageshow` as a defensive fallback

---

## Warning Banners

Both warning banners use a consistent glassmorphism design with themed variants for all 10 color schemes, slide-in animations from the top, and CSS-only styling (no inline styles).

### Multi-Tab Warning

- Monitors overlay visibility across phimbro tabs
- Shows a themed banner when the overlay is active in multiple tabs
- Prevents duplicate room connections
- Structure: icon + text, non-interactive (`pointer-events: none`)
- Slides down from top center via `multiTabSlideIn`

### Network Warning

- Triggered by the call iframe via `postMessage` when a WebRTC connection fails and a probe confirms the network is restricted
- Shows a themed banner with title, description, and dismissible close button
- Slides down from top center via `networkWarningSlideIn`
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
| Theme switch cleanup | Stale `.leaf`, `.binger-fog`, and `.binger-frost` particles removed instantly on theme change |
| One-shot particle effects | Midnight smoke and Arctic frost animate once per message then stop |
| SVG filter reuse | Twelve shared `feTurbulence` filter defs injected once, referenced by every particle |
| Typing indicator sink | Typing bubbles re-appended to chat log bottom on every message and notification render |
| Minimize persistence | chrome.storage.local preserves minimized state across navigations and restarts |
| Iframe preservation | `moveBefore()` keeps the call alive through fullscreen toggles instead of rebuilding every peer connection |
| First-paint layout | Participant count baked into the call URL so a 3-person call never opens in the 2-person layout and reflows |
| Per-message signal cleanup | Each WebRTC signal is deleted as it is consumed, so the signals node never accumulates |

---

## Error Handling

| Scenario | Handling |
|----------|----------|
| Buffer sync deadlock | 4-layer prevention (stale clear, empty guard, dedup reset, safety-net interval) |
| Scene seek failure | Feedback message posted to chat |
| Network warning | Themed dismissible banner, raised only after a restricted-network probe |
| Room full | Join bubble shakes, no reason disclosed |
| Wrong room password | Join bubble empties and shakes, and you stay in the room you were already in |
| Invalid room code | Same shake as room full and wrong password, so nothing about the room leaks |
| Auth failure | Error displayed in the popup form |
| Firebase disconnect | Auto-reconnection via SDK |
| Peer connection failure | Per-peer ICE restarts, then a relay-only retry, then a single global give-up |
| Iframe reset | Pre-cleanup prevents ghost users and stale signals, audio mode baked into the URL to avoid constraint race conditions, theme and cam/mic re-sent on reload |
| Monitor switch | Iframe anchored with `right` relative to the overlay, so it cannot strand itself off-screen |
| Camera or mic unavailable | Local feed shows a placeholder and caption, and the client drops to receive-only |
| Bot mode across navigation | Persisted to chrome.storage.local, restored on rejoin |
| Empty message send | Send button disabled when input is empty, re-enabled on typing |