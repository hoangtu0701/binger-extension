(function() {
    "use strict";

    let elements = null;
    let overlayInitialized = false;

    function createLeftPane() {
        const leftPane = document.createElement("div");
        leftPane.id = "bingerLeftPane";

        const headerText = document.createElement("div");
        headerText.className = "bingerHeader";
        headerText.textContent = "Active Binger Overlay";
        leftPane.appendChild(headerText);

        const usernameEl = document.createElement("div");
        usernameEl.id = "bingerUsername";
        usernameEl.textContent = "Signed in as: (loading...)";
        leftPane.appendChild(usernameEl);

        const buttonWrapper = document.createElement("div");
        buttonWrapper.id = "bingerButtonWrapper";

        const createRoomBtn = document.createElement("button");
        createRoomBtn.id = "bingerCreateRoom";
        createRoomBtn.textContent = "Create Room";

        const joinRoomBtn = document.createElement("button");
        joinRoomBtn.id = "bingerJoinRoom";
        joinRoomBtn.textContent = "Join Room";

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

    function getChatWrapperHTML() {
        return `
            <div id="bingerChatRoomHeader">
                <div id="bingerRoomId">(No Room)</div>
                <div id="bingerUserList">(Users: -)</div>
            </div>
            <div id="bingerChatLog">(Chat log will appear here)</div>
            <div id="bingerChatInputBar">
                <button id="bingerBotToggle" title="Toggle Bot Mode" disabled>B</button>
                <input type="text" id="bingerChatInput" placeholder="Type a message..." disabled />
                <button id="bingerSendBtn" disabled>Send</button>
            </div>
        `;
    }

    function createRightPane() {
        const rightPane = document.createElement("div");
        rightPane.id = "bingerRightPane";

        const chatWrapper = document.createElement("div");
        chatWrapper.id = "bingerChatWrapper";
        chatWrapper.classList.add("disabled");
        chatWrapper.innerHTML = getChatWrapperHTML();

        rightPane.appendChild(chatWrapper);

        return rightPane;
    }

    function createBottomButtons() {
        const bottomBtnBar = document.createElement("div");
        bottomBtnBar.id = "bingerBottomButtons";

        const watchTogetherBtn = document.createElement("button");
        watchTogetherBtn.id = "watchTogetherBtn";
        watchTogetherBtn.disabled = true;
        watchTogetherBtn.innerHTML = `<img src="${chrome.runtime.getURL("binger_assets/images/binge.png")}" alt="Watch Together" class="bottom-icon" />`;

        const cameraToggleBtn = document.createElement("button");
        cameraToggleBtn.id = "cameraToggleBtn";
        cameraToggleBtn.disabled = true;
        cameraToggleBtn.innerHTML = `<img src="${chrome.runtime.getURL("binger_assets/images/cam.png")}" alt="Camera Toggle" class="bottom-icon" />`;

        bottomBtnBar.appendChild(watchTogetherBtn);
        bottomBtnBar.appendChild(cameraToggleBtn);

        return bottomBtnBar;
    }

    function createOverlay() {
        const overlay = document.createElement("div");
        overlay.id = "bingerOverlay";

        const layoutContainer = document.createElement("div");
        layoutContainer.id = "bingerLayoutContainer";

        const leftPane = createLeftPane();
        const rightPane = createRightPane();
        const bottomButtons = createBottomButtons();

        layoutContainer.appendChild(leftPane);
        layoutContainer.appendChild(rightPane);
        layoutContainer.appendChild(bottomButtons);

        overlay.appendChild(layoutContainer);

        overlay.style.display = "none";
        overlay.style.zIndex = "2147483647";

        return overlay;
    }

    function initOverlayDOM() {
        if (overlayInitialized) {
            return;
        }

        if (document.getElementById("bingerOverlay")) {
            cacheElements();
            overlayInitialized = true;
            return;
        }

        const overlay = createOverlay();
        document.body.appendChild(overlay);

        cacheElements();
        overlayInitialized = true;
    }

    function cacheElements() {
        elements = {
            overlay: document.getElementById("bingerOverlay"),
            layoutContainer: document.getElementById("bingerLayoutContainer"),
            leftPane: document.getElementById("bingerLeftPane"),
            rightPane: document.getElementById("bingerRightPane"),

            username: document.getElementById("bingerUsername"),
            createRoomBtn: document.getElementById("bingerCreateRoom"),
            joinRoomBtn: document.getElementById("bingerJoinRoom"),
            leaveRoomBtn: document.getElementById("bingerLeaveRoom"),

            chatWrapper: document.getElementById("bingerChatWrapper"),
            roomId: document.getElementById("bingerRoomId"),
            userList: document.getElementById("bingerUserList"),
            chatLog: document.getElementById("bingerChatLog"),
            chatInputBar: document.getElementById("bingerChatInputBar"),
            botToggle: document.getElementById("bingerBotToggle"),
            chatInput: document.getElementById("bingerChatInput"),
            sendBtn: document.getElementById("bingerSendBtn"),

            bottomButtons: document.getElementById("bingerBottomButtons"),
            watchTogetherBtn: document.getElementById("watchTogetherBtn"),
            cameraToggleBtn: document.getElementById("cameraToggleBtn"),

            joinBubble: document.getElementById("bingerJoinBubble"),
            joinBubbleInput: document.getElementById("bingerJoinBubbleInput")
        };
    }

    function getElements() {
        return elements;
    }

    function getElement(key) {
        return elements?.[key] || null;
    }

    function showOverlay() {
        if (elements?.overlay) {
            elements.overlay.style.display = "block";
        }
    }

    function hideOverlay() {
        if (elements?.overlay) {
            elements.overlay.style.display = "none";
        }
    }

    function isOverlayVisible() {
        return elements?.overlay?.style.display !== "none";
    }

    function setUsername(username) {
        if (elements?.username) {
            const displayName = username || "Unknown";
            elements.username.textContent = `Signed in as: ${displayName}`;
        }
    }

    function setRoomIdDisplay(roomId) {
        if (elements?.roomId) {
            elements.roomId.textContent = roomId ? `Room: ${roomId}` : "(No Room)";
        }
    }

    function setUserListDisplay(users) {
        if (elements?.userList) {
            if (Array.isArray(users) && users.length > 0) {
                elements.userList.textContent = `Users: ${users.join(", ")}`;
            } else {
                elements.userList.textContent = "(Users: -)";
            }
        }
    }

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

    function hideMultiTabWarning() {
        const existing = document.getElementById("bingerMultiTabWarning");
        if (existing) existing.remove();
    }

    function destroyOverlayDOM() {
        if (elements?.overlay) {
            elements.overlay.remove();
        }

        hideMultiTabWarning();

        elements = null;
        overlayInitialized = false;
    }

    window.BingerOverlayDOM = {
        initOverlayDOM,

        getElements,
        getElement,

        showOverlay,
        hideOverlay,
        isOverlayVisible,

        setUsername,
        setRoomIdDisplay,
        setUserListDisplay,

        showMultiTabWarning,
        hideMultiTabWarning,

        destroyOverlayDOM
    };

})();