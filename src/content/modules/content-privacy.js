(function() {
    "use strict";

    const TIP_GAP = 10;
    const ERROR_FLASH_MS = 700;

    const state = {
        roomId: null,
        isPrivate: false,
        password: "",
        editing: false,
        initialized: false
    };

    let outsideHandler = null;

    function getLock() {
        return BingerOverlayDOM.getElement("roomLock");
    }

    function getTip() {
        return getLock()?.querySelector(".binger-lock-tip") || null;
    }

    function getTipInput() {
        return getLock()?.querySelector(".binger-lock-tip-input") || null;
    }

    function getTipLabel() {
        return getLock()?.querySelector(".binger-lock-tip-label") || null;
    }

    function isHost() {
        return BingerState.isCurrentUserHost();
    }

    function positionTip() {
        const lock = getLock();
        const tip = getTip();
        if (!lock || !tip) return;

        const rect = lock.getBoundingClientRect();
        const tipRect = tip.getBoundingClientRect();

        let left = rect.left + rect.width / 2;
        const half = tipRect.width / 2;

        left = Math.max(half + 6, Math.min(left, window.innerWidth - half - 6));

        tip.style.left = `${left}px`;
        tip.style.bottom = `${window.innerHeight - rect.top + TIP_GAP}px`;
    }

    function openTip() {
        const lock = getLock();
        if (!lock || lock.hidden) return;

        lock.classList.add("tip-open");
        positionTip();
        requestAnimationFrame(positionTip);
    }

    function closeTip(force) {
        const lock = getLock();
        if (!lock) return;

        if (state.editing && force !== true) return;

        lock.classList.remove("tip-open");
    }

    function render() {
        const lock = getLock();
        if (!lock) return;

        const active = Boolean(state.roomId);

        lock.hidden = !active;

        if (!active) {
            lock.classList.remove("tip-open", "is-private", "is-host");
            return;
        }

        lock.classList.toggle("is-private", state.isPrivate);
        lock.classList.toggle("is-host", isHost());

        const label = getTipLabel();
        const input = getTipInput();

        if (label) {
            label.textContent = state.isPrivate ? "Room password" : "Room is public";
        }

        if (input) {
            input.readOnly = !isHost();
            if (!state.editing) {
                input.value = state.password || "";
            }
        }

        if (lock.classList.contains("tip-open")) {
            positionTip();
        }
    }

    function commitPassword() {
        const input = getTipInput();
        if (!input) return;

        const value = input.value.replace(/\D/g, "").slice(0, 4);

        if (value.length !== 4 || value === state.password) {
            input.value = state.password || "";
            return;
        }

        const roomId = state.roomId;
        if (!roomId) {
            input.value = state.password || "";
            return;
        }

        state.password = value;
        input.value = value;

        BingerConnection.sendMessage({
            command: "setRoomPassword",
            roomId,
            password: value
        })
            .then((res) => {
                if (res?.status !== "success") {
                    console.error("[Binger] Failed to save room password:", res?.error);
                }
            })
            .catch((err) => {
                console.error("[Binger] Error saving room password:", err);
            });
    }

    function stopEditing(save) {
        if (!state.editing) return;

        state.editing = false;

        if (save) {
            commitPassword();
        } else {
            const input = getTipInput();
            if (input) input.value = state.password || "";
        }

        const input = getTipInput();
        if (input) input.blur();

        closeTip(true);
        detachOutsideHandler();
    }

    function attachOutsideHandler() {
        if (outsideHandler) return;

        outsideHandler = (event) => {
            const lock = getLock();
            if (!lock) return;
            if (lock.contains(event.target)) return;

            stopEditing(true);
        };

        document.addEventListener("mousedown", outsideHandler, true);
    }

    function detachOutsideHandler() {
        if (!outsideHandler) return;
        document.removeEventListener("mousedown", outsideHandler, true);
        outsideHandler = null;
    }

    function togglePrivacy() {
        if (!state.roomId || !isHost()) return;

        const nextValue = !state.isPrivate;

        BingerConnection.sendMessage({
            command: "setRoomPrivacy",
            roomId: state.roomId,
            isPrivate: nextValue
        })
            .then((res) => {
                if (res?.status !== "success") {
                    console.error("[Binger] Failed to set room privacy:", res?.error);
                }
            })
            .catch((err) => {
                console.error("[Binger] Error setting room privacy:", err);
            });
    }

    function initPrivacy() {
        if (state.initialized) return;

        const lock = getLock();
        if (!lock) return;

        lock.addEventListener("mouseenter", openTip);
        lock.addEventListener("mouseleave", () => closeTip(false));

        lock.addEventListener("click", (event) => {
            if (event.target.closest(".binger-lock-tip")) return;
            togglePrivacy();
        });

        const input = getTipInput();

        if (input) {
            input.addEventListener("mousedown", (event) => {
                if (!isHost() || !state.isPrivate) {
                    event.preventDefault();
                }
            });

            input.addEventListener("focus", () => {
                if (!isHost() || !state.isPrivate) {
                    input.blur();
                    return;
                }
                state.editing = true;
                openTip();
                attachOutsideHandler();
            });

            input.addEventListener("input", () => {
                input.value = input.value.replace(/\D/g, "").slice(0, 4);
            });

            input.addEventListener("keydown", (event) => {
                if (event.key === "Enter") {
                    event.preventDefault();
                    stopEditing(true);
                }
                if (event.key === "Escape") {
                    event.preventDefault();
                    stopEditing(false);
                }
            });
        }

        window.addEventListener("resize", () => {
            if (lock.classList.contains("tip-open")) positionTip();
        });

        state.initialized = true;
    }

    function activatePrivacy(roomId) {
        if (!roomId || typeof roomId !== "string") return;

        state.roomId = roomId;

        BingerConnection.sendMessageAsync({
            command: "subscribeToPrivacy",
            roomId
        });

        render();
    }

    function deactivatePrivacy() {
        const roomId = state.roomId;

        stopEditing(false);
        detachOutsideHandler();

        if (roomId) {
            BingerConnection.sendMessageAsync({
                command: "unsubscribeFromPrivacy",
                roomId
            });
        }

        state.roomId = null;
        state.isPrivate = false;
        state.password = "";

        render();
    }

    function handlePrivacyUpdate(msg) {
        if (!msg || msg.roomId !== state.roomId) return;

        state.isPrivate = msg.isPrivate === true;

        if (!state.editing) {
            state.password = typeof msg.password === "string" ? msg.password : "";
        }

        render();
    }

    function refreshLockRole() {
        render();
    }

    window.BingerPrivacy = {
        initPrivacy,
        activatePrivacy,
        deactivatePrivacy,
        handlePrivacyUpdate,
        refreshLockRole,
        ERROR_FLASH_MS
    };

})();