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
        usernameEl.innerHTML = '<span class="binger-username-dot"></span><span class="binger-username-name">...</span>';
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
                <div id="bingerRoomBadge" class="binger-room-badge binger-room-badge--empty">------</div>
                <div class="binger-strip-divider binger-strip-divider--empty"></div>
                <div id="bingerAvatarGroup" class="binger-avatar-group">
                    <div class="binger-avatar binger-avatar--empty">?</div>
                    <div class="binger-avatar binger-avatar--empty">?</div>
                </div>
                <div id="bingerUserCount" class="binger-user-count"></div>
            </div>
            <div id="bingerChatLog">Chat log will appear here</div>
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
            roomBadge: document.getElementById("bingerRoomBadge"),
            avatarGroup: document.getElementById("bingerAvatarGroup"),
            userCount: document.getElementById("bingerUserCount"),
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
        if (!elements?.username) return;
        const nameEl = elements.username.querySelector(".binger-username-name");
        if (nameEl) {
            nameEl.textContent = username || "Unknown";
        }
    }

    function getInitials(name) {
        if (!name) return "?";
        const cleaned = name.replace(/\s+/g, "");
        return cleaned.substring(0, 1).toUpperCase();
    }

    function setRoomIdDisplay(roomId) {
        if (!elements?.roomBadge) return;

        const header = elements.roomBadge.closest("#bingerChatRoomHeader");
        const divider = header?.querySelector(".binger-strip-divider");

        if (roomId) {
            elements.roomBadge.textContent = roomId;
            elements.roomBadge.classList.remove("binger-room-badge--empty");
            if (divider) divider.classList.remove("binger-strip-divider--empty");
        } else {
            elements.roomBadge.textContent = "------";
            elements.roomBadge.classList.add("binger-room-badge--empty");
            if (divider) divider.classList.add("binger-strip-divider--empty");
        }
    }

    function setUserListDisplay(users) {
        if (!elements?.avatarGroup || !elements?.userCount) return;

        const header = elements.avatarGroup.closest("#bingerChatRoomHeader");

        const existingHostTag = header?.querySelector(".binger-host-tag");
        if (existingHostTag) existingHostTag.remove();

        if (!Array.isArray(users) || users.length === 0) {
            elements.avatarGroup.innerHTML = "";
            const slot1 = document.createElement("div");
            slot1.className = "binger-avatar binger-avatar--empty";
            slot1.textContent = "?";
            const slot2 = document.createElement("div");
            slot2.className = "binger-avatar binger-avatar--empty";
            slot2.textContent = "?";
            elements.avatarGroup.appendChild(slot1);
            elements.avatarGroup.appendChild(slot2);
            elements.userCount.textContent = "";
            header?.classList.add("binger-strip--empty");
            return;
        }

        header?.classList.remove("binger-strip--empty");
        elements.avatarGroup.innerHTML = "";

        users.forEach((user) => {
            const name = typeof user === "object" ? user.name : String(user);
            const isHost = typeof user === "object" ? user.isHost : false;

            const avatar = document.createElement("div");
            avatar.className = `binger-avatar ${isHost ? "binger-avatar--host" : "binger-avatar--guest"}`;
            avatar.textContent = getInitials(name);

            const tooltip = document.createElement("div");
            tooltip.className = "binger-avatar-tooltip";
            tooltip.textContent = isHost ? `${name} (host)` : name;
            avatar.appendChild(tooltip);

            if (isHost) {
                const hostTag = document.createElement("div");
                hostTag.className = "binger-host-tag";
                hostTag.textContent = "host";
                elements.avatarGroup.appendChild(hostTag);
            }

            elements.avatarGroup.appendChild(avatar);
        });

        elements.userCount.textContent = `${users.length}/2`;
    }

    function showMultiTabWarning() {
        if (document.getElementById("bingerMultiTabWarning")) return;

        const warning = document.createElement("div");
        warning.id = "bingerMultiTabWarning";

        const icon = document.createElement("div");
        icon.className = "multi-tab-icon";
        icon.textContent = "!";

        const text = document.createElement("span");
        text.className = "multi-tab-text";
        text.textContent = "Multiple Phimbro tabs open - please close the others and refresh to avoid sync issues.";

        warning.appendChild(icon);
        warning.appendChild(text);
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