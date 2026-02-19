(function() {
    "use strict";

    let elements = null;
    let overlayInitialized = false;

    const STORAGE_KEY = "bingerOverlayMinimized";

    function createMinimizeButton() {
        const bar = document.createElement("div");
        bar.id = "bingerMinimizeBar";
        return bar;
    }

    function attachHeaderToggle(header) {
        header.style.cursor = "pointer";
        header.addEventListener("click", toggleMinimized);
    }

    function toggleMinimized() {
        const overlay = elements?.overlay;
        if (!overlay) return;

        const isMinimized = overlay.classList.toggle("binger-minimized");
        persistMinimizedState(isMinimized);
    }

    function persistMinimizedState(isMinimized) {
        try {
            chrome.storage.local.set({ [STORAGE_KEY]: isMinimized });
        } catch (_) {}
    }

    function restoreMinimizedState() {
        const overlay = elements?.overlay;
        if (!overlay) return;

        try {
            chrome.storage.local.get(STORAGE_KEY, (result) => {
                if (chrome.runtime.lastError) return;
                if (result[STORAGE_KEY] === true) {
                    overlay.classList.add("binger-minimized");
                }
            });
        } catch (_) {}
    }

    function createLeftPane() {
        const leftPane = document.createElement("div");
        leftPane.id = "bingerLeftPane";

        const headerText = document.createElement("div");
        headerText.className = "bingerHeader";
        headerText.textContent = "Active Binger Overlay";
        headerText.appendChild(createMinimizeButton());
        attachHeaderToggle(headerText);
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
                <div id="bingerBotToggleWrap">
                    <button id="bingerBotToggle" disabled>B</button>
                    <span id="bingerBotTooltip">Talk to Binger Bot</span>
                </div>
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

        const inviteWrap = document.createElement("div");
        inviteWrap.className = "binger-bottom-btn-wrap";

        const watchTogetherBtn = document.createElement("button");
        watchTogetherBtn.id = "watchTogetherBtn";
        watchTogetherBtn.disabled = true;
        watchTogetherBtn.innerHTML = `<svg class="bottom-icon" viewBox="0 0 32 32" fill="none"><circle cx="10" cy="9" r="3.5" stroke="currentColor" stroke-width="1.5" opacity="0.7" fill="none"/><circle cx="22" cy="9" r="3.5" stroke="currentColor" stroke-width="1.5" opacity="0.7" fill="none"/><path d="M4 22C4 18.5 6.5 16 10 16C11.5 16 12.8 16.5 13.8 17.3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.5" fill="none"/><path d="M28 22C28 18.5 25.5 16 22 16C20.5 16 19.2 16.5 18.2 17.3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.5" fill="none"/><path d="M13 21L20 25.5L13 30V21Z" fill="currentColor" fill-opacity="0.5" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" opacity="0.7"/></svg>`;

        const inviteTooltip = document.createElement("span");
        inviteTooltip.className = "binger-bottom-tooltip";
        inviteTooltip.textContent = "Play a movie with 2 in the room to invite";

        inviteWrap.appendChild(watchTogetherBtn);
        inviteWrap.appendChild(inviteTooltip);

        const cameraWrap = document.createElement("div");
        cameraWrap.className = "binger-bottom-btn-wrap";

        const cameraToggleBtn = document.createElement("button");
        cameraToggleBtn.id = "cameraToggleBtn";
        cameraToggleBtn.disabled = true;
        cameraToggleBtn.innerHTML = `<svg class="bottom-icon" viewBox="0 0 32 32" fill="none"><rect x="3" y="8" width="19" height="16" rx="4" stroke="currentColor" stroke-width="1.5" opacity="0.7" fill="none"/><path d="M22 12.5L29 8.5V23.5L22 19.5" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" opacity="0.5" fill="currentColor" fill-opacity="0.08"/><circle cx="12.5" cy="16" r="4" stroke="currentColor" stroke-width="1.2" opacity="0.35" fill="none"/><circle cx="12.5" cy="16" r="1.5" fill="currentColor" opacity="0.3"/></svg>`;

        const cameraTooltip = document.createElement("span");
        cameraTooltip.className = "binger-bottom-tooltip";
        cameraTooltip.textContent = "Camera will be enabled in-session";

        cameraWrap.appendChild(cameraToggleBtn);
        cameraWrap.appendChild(cameraTooltip);

        bottomBtnBar.appendChild(inviteWrap);
        bottomBtnBar.appendChild(cameraWrap);

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
            restoreMinimizedState();
            return;
        }

        const overlay = createOverlay();
        document.body.appendChild(overlay);

        cacheElements();
        overlayInitialized = true;
        restoreMinimizedState();
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
            joinBubbleInput: document.getElementById("bingerJoinBubbleInput"),

            minimizeBar: document.getElementById("bingerMinimizeBar")
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
            const fullName = name;
            tooltip.textContent = fullName.length > 15 ? fullName.slice(0, 15) + "..." : fullName;
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