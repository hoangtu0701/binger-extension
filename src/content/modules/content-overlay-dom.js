// ============================================================================
// OVERLAY DOM MODULE
// Creates and manages the Binger overlay DOM structure
// ============================================================================

(function() {
    "use strict";

    // ========================================================================
    // STATE
    // ========================================================================

    // Cached element references
    let elements = null;

    // Track if overlay has been initialized (prevents duplicate creation)
    let overlayInitialized = false;

    // ========================================================================
    // DOM CREATION
    // ========================================================================

    /**
     * Create the left pane (header, username, room buttons)
     * @returns {HTMLElement}
     */
    function createLeftPane() {
        const leftPane = document.createElement("div");
        leftPane.id = "bingerLeftPane";

        // Header
        const headerText = document.createElement("div");
        headerText.className = "bingerHeader";
        headerText.textContent = "Active Binger Overlay";
        leftPane.appendChild(headerText);

        // Username display
        const usernameEl = document.createElement("div");
        usernameEl.id = "bingerUsername";
        usernameEl.textContent = "Signed in as: (loading...)";
        leftPane.appendChild(usernameEl);

        // Button wrapper
        const buttonWrapper = document.createElement("div");
        buttonWrapper.id = "bingerButtonWrapper";

        // Create Room button
        const createRoomBtn = document.createElement("button");
        createRoomBtn.id = "bingerCreateRoom";
        createRoomBtn.textContent = "Create Room";

        // Join Room button
        const joinRoomBtn = document.createElement("button");
        joinRoomBtn.id = "bingerJoinRoom";
        joinRoomBtn.textContent = "Join Room";

        // Leave Room button
        const leaveRoomBtn = document.createElement("button");
        leaveRoomBtn.id = "bingerLeaveRoom";
        leaveRoomBtn.textContent = "Leave Room";
        leaveRoomBtn.disabled = true;

        buttonWrapper.appendChild(createRoomBtn);
        buttonWrapper.appendChild(joinRoomBtn);
        buttonWrapper.appendChild(leaveRoomBtn);

        const joinBubble = document.createElement("div");
        joinBubble.id = "bingerJoinBubble";

        const joinInput = document.createElement("input");
        joinInput.id = "bingerJoinBubbleInput";
        joinInput.type = "text";
        joinInput.maxLength = 6;
        joinInput.inputMode = "numeric";

        joinBubble.appendChild(joinInput);
        buttonWrapper.appendChild(joinBubble);

        leftPane.appendChild(buttonWrapper);

        return leftPane;
    }

    /**
     * Create the chat wrapper HTML
     * @returns {string}
     */
    function getChatWrapperHTML() {
        return `
            <div id="bingerChatRoomHeader">
                <div id="bingerRoomId">(No Room)</div>
                <div id="bingerUserList">(Users: -)</div>
            </div>
            <div id="bingerChatLog">(Chat log will appear here)</div>
            <div id="bingerChatInputBar">
                <input type="text" id="bingerChatInput" placeholder="Type a message..." disabled />
                <button id="bingerSendBtn" disabled>Send</button>
            </div>
        `;
    }

    /**
     * Create the right pane (chat wrapper)
     * @returns {HTMLElement}
     */
    function createRightPane() {
        const rightPane = document.createElement("div");
        rightPane.id = "bingerRightPane";

        // Chat wrapper
        const chatWrapper = document.createElement("div");
        chatWrapper.id = "bingerChatWrapper";
        chatWrapper.classList.add("disabled");
        chatWrapper.innerHTML = getChatWrapperHTML();

        rightPane.appendChild(chatWrapper);

        return rightPane;
    }

    /**
     * Create the bottom button bar (watch together, camera toggle)
     * @returns {HTMLElement}
     */
    function createBottomButtons() {
        const bottomBtnBar = document.createElement("div");
        bottomBtnBar.id = "bingerBottomButtons";

        // Watch Together button
        const watchTogetherBtn = document.createElement("button");
        watchTogetherBtn.id = "watchTogetherBtn";
        watchTogetherBtn.disabled = true;
        watchTogetherBtn.innerHTML = `<img src="${chrome.runtime.getURL("binger_assets/images/binge.png")}" alt="Watch Together" class="bottom-icon" />`;

        // Camera Toggle button
        const cameraToggleBtn = document.createElement("button");
        cameraToggleBtn.id = "cameraToggleBtn";
        cameraToggleBtn.disabled = true;
        cameraToggleBtn.innerHTML = `<img src="${chrome.runtime.getURL("binger_assets/images/cam.png")}" alt="Camera Toggle" class="bottom-icon" />`;

        bottomBtnBar.appendChild(watchTogetherBtn);
        bottomBtnBar.appendChild(cameraToggleBtn);

        return bottomBtnBar;
    }

    /**
     * Create the main overlay element with all children
     * @returns {HTMLElement}
     */
    function createOverlay() {
        // Main overlay container
        const overlay = document.createElement("div");
        overlay.id = "bingerOverlay";

        // Layout container for fullscreen split
        const layoutContainer = document.createElement("div");
        layoutContainer.id = "bingerLayoutContainer";

        // Create panes
        const leftPane = createLeftPane();
        const rightPane = createRightPane();
        const bottomButtons = createBottomButtons();

        // Assemble layout
        layoutContainer.appendChild(leftPane);
        layoutContainer.appendChild(rightPane);
        layoutContainer.appendChild(bottomButtons);

        overlay.appendChild(layoutContainer);

        // Initial styles
        overlay.style.display = "none";
        overlay.style.zIndex = "2147483647";

        return overlay;
    }

    // ========================================================================
    // INITIALIZATION
    // ========================================================================

    /**
     * Initialize the overlay DOM
     * Creates all elements and appends to body
     * Only initializes once to prevent duplicate overlays
     */
    function initOverlayDOM() {
        // Prevent duplicate initialization
        if (overlayInitialized) {
            console.log("[Binger] Overlay DOM already initialized - skipping");
            return;
        }

        // Check if overlay already exists in DOM (from previous init)
        if (document.getElementById("bingerOverlay")) {
            console.log("[Binger] Overlay already exists in DOM - caching elements only");
            cacheElements();
            overlayInitialized = true;
            return;
        }

        // Create and append overlay
        const overlay = createOverlay();
        document.body.appendChild(overlay);

        // Cache element references
        cacheElements();

        overlayInitialized = true;
        console.log("[Binger] Overlay DOM initialized");
    }

    /**
     * Cache references to frequently accessed elements
     */
    function cacheElements() {
        elements = {
            // Main containers
            overlay: document.getElementById("bingerOverlay"),
            layoutContainer: document.getElementById("bingerLayoutContainer"),
            leftPane: document.getElementById("bingerLeftPane"),
            rightPane: document.getElementById("bingerRightPane"),

            // Left pane
            username: document.getElementById("bingerUsername"),
            createRoomBtn: document.getElementById("bingerCreateRoom"),
            joinRoomBtn: document.getElementById("bingerJoinRoom"),
            leaveRoomBtn: document.getElementById("bingerLeaveRoom"),

            // Chat
            chatWrapper: document.getElementById("bingerChatWrapper"),
            roomId: document.getElementById("bingerRoomId"),
            userList: document.getElementById("bingerUserList"),
            chatLog: document.getElementById("bingerChatLog"),
            chatInputBar: document.getElementById("bingerChatInputBar"),
            chatInput: document.getElementById("bingerChatInput"),
            sendBtn: document.getElementById("bingerSendBtn"),

            // Bottom buttons
            bottomButtons: document.getElementById("bingerBottomButtons"),
            watchTogetherBtn: document.getElementById("watchTogetherBtn"),
            cameraToggleBtn: document.getElementById("cameraToggleBtn"),

            joinBubble: document.getElementById("bingerJoinBubble"),
            joinBubbleInput: document.getElementById("bingerJoinBubbleInput")
        };
    }

    /**
     * Get all cached element references
     * @returns {object} Object containing all element references
     */
    function getElements() {
        return elements;
    }

    /**
     * Get a specific element by key
     * @param {string} key - The element key
     * @returns {HTMLElement|null}
     */
    function getElement(key) {
        return elements?.[key] || null;
    }

    // ========================================================================
    // OVERLAY VISIBILITY
    // ========================================================================

    /**
     * Show the overlay
     */
    function showOverlay() {
        if (elements?.overlay) {
            elements.overlay.style.display = "block";
        }
    }

    /**
     * Hide the overlay
     */
    function hideOverlay() {
        if (elements?.overlay) {
            elements.overlay.style.display = "none";
        }
    }

    /**
     * Check if overlay is currently visible
     * @returns {boolean}
     */
    function isOverlayVisible() {
        return elements?.overlay?.style.display !== "none";
    }

    // ========================================================================
    // USERNAME DISPLAY
    // ========================================================================

    /**
     * Set the username display text
     * @param {string} username - The username to display
     */
    function setUsername(username) {
        if (elements?.username) {
            // Handle null/undefined/empty username
            const displayName = username || "Unknown";
            elements.username.textContent = `Signed in as: ${displayName}`;
        }
    }

    // ========================================================================
    // ROOM DISPLAY
    // ========================================================================

    /**
     * Set the room ID display text
     * @param {string} roomId - The room ID to display
     */
    function setRoomIdDisplay(roomId) {
        if (elements?.roomId) {
            elements.roomId.textContent = roomId ? `Room: ${roomId}` : "(No Room)";
        }
    }

    /**
     * Set the user list display text
     * @param {string[]} users - Array of usernames
     */
    function setUserListDisplay(users) {
        if (elements?.userList) {
            // Validate users is an array with items
            if (Array.isArray(users) && users.length > 0) {
                elements.userList.textContent = `Users: ${users.join(", ")}`;
            } else {
                elements.userList.textContent = "(Users: -)";
            }
        }
    }

    // ========================================================================
    // MULTI-TAB WARNING
    // ========================================================================

    /**
     * Show the multi-tab warning banner
     */
    function showMultiTabWarning() {
        if (document.getElementById("bingerMultiTabWarning")) return;

        const warning = document.createElement("div");
        warning.id = "bingerMultiTabWarning";

        const icon = document.createElement("span");
        icon.className = "multi-tab-icon";
        icon.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;

        const text = document.createElement("span");
        text.className = "multi-tab-text";
        text.textContent = "Multiple Phimbro tabs detected - close extras to avoid sync issues";

        warning.appendChild(icon);
        warning.appendChild(text);
        document.body.appendChild(warning);
    }

    /**
     * Hide the multi-tab warning banner
     */
    function hideMultiTabWarning() {
        const existing = document.getElementById("bingerMultiTabWarning");
        if (existing) existing.remove();
    }

    // ========================================================================
    // CLEANUP
    // ========================================================================

    /**
     * Destroy the overlay and clean up all references
     * Used for extension cleanup or sign out
     */
    function destroyOverlayDOM() {
        // Remove overlay from DOM
        if (elements?.overlay) {
            elements.overlay.remove();
        }

        // Remove multi-tab warning if present
        hideMultiTabWarning();

        // Clear cached references
        elements = null;

        // Reset initialization flag
        overlayInitialized = false;

        console.log("[Binger] Overlay DOM destroyed");
    }

    // ========================================================================
    // EXPOSE TO WINDOW
    // ========================================================================

    window.BingerOverlayDOM = {
        // Initialization
        initOverlayDOM,

        // Element access
        getElements,
        getElement,

        // Overlay visibility
        showOverlay,
        hideOverlay,
        isOverlayVisible,

        // Display updates
        setUsername,
        setRoomIdDisplay,
        setUserListDisplay,

        // Multi-tab warning
        showMultiTabWarning,
        hideMultiTabWarning,

        // Cleanup
        destroyOverlayDOM
    };

})();