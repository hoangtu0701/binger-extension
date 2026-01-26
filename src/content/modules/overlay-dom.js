// ============================================================================
// OVERLAY DOM MODULE
// Creates and manages the Binger overlay DOM structure
// ============================================================================

(function() {
    "use strict";

    // Cached element references
    let elements = null;

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
     */
    function initOverlayDOM() {
        // Create and append overlay
        const overlay = createOverlay();
        document.body.appendChild(overlay);

        // Cache element references
        cacheElements();
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
            cameraToggleBtn: document.getElementById("cameraToggleBtn")
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
            elements.username.textContent = `Signed in as: ${username}`;
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
            if (users && users.length > 0) {
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
        warning.textContent = "Multiple Phimbro tabs open - please close the others to avoid sync issues.";
        Object.assign(warning.style, {
            position: "fixed",
            top: "0px",
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: "#fff3cd",
            color: "#856404",
            padding: "12px 20px",
            fontSize: "16px",
            fontWeight: "600",
            border: "1px solid #ffeeba",
            borderRadius: "0 0 12px 12px",
            zIndex: "9999999",
            fontFamily: "Figtree",
            boxShadow: "0 4px 10px rgba(0,0,0,0.1)",
            pointerEvents: "none"
        });

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
        hideMultiTabWarning
    };

})();