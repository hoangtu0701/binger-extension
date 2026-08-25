(function() {
    "use strict";

    const TIP_GAP = 10;
    const TIP_CLOSE_DELAY = 130;

    const state = {
        roomId: null,
        isPrivate: false,
        password: "",
        editing: false,
        initialized: false
    };

    let tipEl = null;
    let closeTimer = null;
    let outsideHandler = null;

    function getLock() {
        return BingerOverlayDOM.getElement("roomLock");
    }

    function getTipInput() {
        return tipEl?.querySelector(".binger-lock-tip-input") || null;
    }

    function getTipLabel() {
        return tipEl?.querySelector(".binger-lock-tip-label") || null;
    }

    function isHost() {
        return BingerState.isCurrentUserHost();
    }

    function canEdit() {
        return isHost() && state.isPrivate;
    }

    function cancelCloseTimer() {
        if (closeTimer) {
            clearTimeout(closeTimer);
            closeTimer = null;
        }
    }

    function findFixedContainer(node) {
        let current = node?.parentElement || null;

        while (current && current !== document.documentElement) {
            const style = getComputedStyle(current);

            const traps = style.transform !== "none"
                || style.filter !== "none"
                || (style.backdropFilter && style.backdropFilter !== "none")
                || style.perspective !== "none"
                || (style.willChange && /transform|filter|perspective/.test(style.willChange))
                || (style.contain && /paint|layout|strict|content/.test(style.contain));

            if (traps) return current;

            current = current.parentElement;
        }

        return null;
    }

    function positionTip() {
        const lock = getLock();
        if (!lock || !tipEl) return;

        const rect = lock.getBoundingClientRect();
        const tipRect = tipEl.getBoundingClientRect();
        const half = tipRect.width / 2;

        const container = findFixedContainer(lock);

        let left = rect.left + rect.width / 2;
        left = Math.max(half + 6, Math.min(left, window.innerWidth - half - 6));

        let top = rect.top - TIP_GAP;

        if (container) {
            const base = container.getBoundingClientRect();
            left -= base.left;
            top -= base.top;
        }

        tipEl.style.left = `${left}px`;
        tipEl.style.top = `${top}px`;
        tipEl.style.bottom = "auto";
    }

    function isTipHeld() {
        return state.editing || document.activeElement === getTipInput();
    }

    function openTip() {
        const lock = getLock();
        if (!lock || !tipEl || lock.hidden) return;

        cancelCloseTimer();

        if (tipEl.classList.contains("tip-open")) {
            positionTip();
            return;
        }

        tipEl.classList.add("tip-open");
        positionTip();
        requestAnimationFrame(positionTip);
    }

    function scheduleClose() {
        if (isTipHeld()) return;

        cancelCloseTimer();
        closeTimer = setTimeout(() => {
            closeTimer = null;
            if (isTipHeld()) return;
            tipEl?.classList.remove("tip-open");
        }, TIP_CLOSE_DELAY);
    }

    function forceCloseTip() {
        cancelCloseTimer();
        tipEl?.classList.remove("tip-open");
    }

    function render() {
        const lock = getLock();
        if (!lock || !tipEl) return;

        const active = Boolean(state.roomId);

        lock.hidden = !active;

        if (!active) {
            lock.classList.remove("is-private", "is-host");
            forceCloseTip();
            return;
        }

        lock.classList.toggle("is-private", state.isPrivate);
        lock.classList.toggle("is-host", isHost());

        tipEl.classList.toggle("is-private", state.isPrivate);
        tipEl.classList.toggle("is-editable", canEdit());

        const label = getTipLabel();
        const input = getTipInput();

        if (label) {
            label.textContent = state.isPrivate ? "Room password" : "Room is public";
        }

        if (input) {
            input.readOnly = !canEdit();
            if (!state.editing) {
                input.value = state.password || "";
            }
        }

        if (tipEl.classList.contains("tip-open")) {
            positionTip();
        }
    }

    function commitPassword() {
        const input = getTipInput();
        if (!input) return;

        const value = input.value.replace(/\D/g, "").slice(0, 4);
        const roomId = state.roomId;

        if (value.length !== 4 || value === state.password || !roomId) {
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
        if (!state.editing) {
            getTipInput()?.blur();
            detachOutsideHandler();
            forceCloseTip();
            return;
        }

        state.editing = false;

        if (save) {
            commitPassword();
        } else {
            const input = getTipInput();
            if (input) input.value = state.password || "";
        }

        getTipInput()?.blur();
        detachOutsideHandler();
        forceCloseTip();
    }

    function attachOutsideHandler() {
        if (outsideHandler) return;

        outsideHandler = (event) => {
            const lock = getLock();
            if (tipEl && tipEl.contains(event.target)) return;
            if (lock && lock.contains(event.target)) return;

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

        tipEl = lock.querySelector(".binger-lock-tip");
        if (!tipEl) return;

        lock.addEventListener("mouseenter", openTip);
        lock.addEventListener("mouseleave", scheduleClose);

        window.addEventListener("scroll", () => {
            if (tipEl?.classList.contains("tip-open")) positionTip();
        }, true);

        lock.addEventListener("mousedown", (event) => {
            event.preventDefault();
        });

        lock.addEventListener("click", togglePrivacy);

        tipEl.addEventListener("mouseenter", cancelCloseTimer);
        tipEl.addEventListener("mouseleave", scheduleClose);

        const input = getTipInput();

        if (input) {
            input.addEventListener("mousedown", () => {
                cancelCloseTimer();
                attachOutsideHandler();

                if (canEdit()) {
                    state.editing = true;
                }
            });

            input.addEventListener("focus", () => {
                cancelCloseTimer();
                attachOutsideHandler();

                if (canEdit()) {
                    state.editing = true;
                }
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
            if (tipEl?.classList.contains("tip-open")) positionTip();
        });

        document.addEventListener("fullscreenchange", () => {
            forceCloseTip();
            state.editing = false;
            detachOutsideHandler();
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
        forceCloseTip();

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

        if (!state.isPrivate && state.editing) {
            stopEditing(false);
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
        refreshLockRole
    };

})();