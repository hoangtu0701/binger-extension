(function() {
    "use strict";

    const TIP_GAP = 10;
    const TIP_CLOSE_DELAY = 130;
    const LABEL_SWAP_MS = 130;
    const LABEL_FLIP_MS = 360;

    const state = {
        roomId: null,
        isPrivate: false,
        password: "",
        editing: false,
        overLock: false,
        overTip: false,
        initialized: false
    };

    let tipEl = null;
    let closeTimer = null;
    let outsideHandler = null;
    let labelSwapTimer = null;
    let labelFlipTimer = null;

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

    function ensureTipParent() {
        const lock = getLock();
        if (!tipEl || !lock) return;

        const target = document.fullscreenElement || lock;

        tipEl.classList.toggle("tip-fullscreen", Boolean(document.fullscreenElement));

        if (tipEl.parentNode === target) return;

        target.appendChild(tipEl);
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

        const container = findFixedContainer(tipEl);

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
        return state.editing
            || state.overLock
            || state.overTip
            || document.activeElement === getTipInput();
    }

    function openTip() {
        const lock = getLock();
        if (!lock || !tipEl || lock.hidden) return;

        cancelCloseTimer();
        ensureTipParent();
        positionTip();

        if (tipEl.classList.contains("tip-open")) return;

        tipEl.classList.add("tip-open");
        requestAnimationFrame(positionTip);
    }

    function scheduleClose() {
        cancelCloseTimer();

        closeTimer = setTimeout(() => {
            closeTimer = null;
            if (isTipHeld()) return;
            tipEl?.classList.remove("tip-open");
        }, TIP_CLOSE_DELAY);
    }

    function forceCloseTip() {
        cancelCloseTimer();
        state.overLock = false;
        state.overTip = false;
        tipEl?.classList.remove("tip-open");
    }

    function updateLabel() {
        const label = getTipLabel();
        if (!label || !tipEl) return;

        const nextText = state.isPrivate ? "Room password" : "Room is public";
        if (label.textContent === nextText) return;

        if (labelSwapTimer) clearTimeout(labelSwapTimer);
        if (labelFlipTimer) clearTimeout(labelFlipTimer);

        tipEl.classList.remove("tip-flip");
        void tipEl.offsetWidth;
        tipEl.classList.add("tip-flip");

        labelSwapTimer = setTimeout(() => {
            label.textContent = nextText;
            labelSwapTimer = null;
            if (tipEl.classList.contains("tip-open")) positionTip();
        }, LABEL_SWAP_MS);

        labelFlipTimer = setTimeout(() => {
            tipEl.classList.remove("tip-flip");
            labelFlipTimer = null;
            if (tipEl.classList.contains("tip-open")) positionTip();
        }, LABEL_FLIP_MS);
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

        updateLabel();

        const input = getTipInput();

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

    function endEditing(save, closeTip) {
        if (!state.editing) {
            detachOutsideHandler();
            if (closeTip) forceCloseTip();
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

        if (closeTip) forceCloseTip();
    }

    function attachOutsideHandler() {
        if (outsideHandler) return;

        outsideHandler = (event) => {
            const lock = getLock();
            if (tipEl && tipEl.contains(event.target)) return;
            if (lock && lock.contains(event.target)) return;

            endEditing(true, true);
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

    function isOnTipSurface(event) {
        if (!tipEl || !tipEl.classList.contains("tip-open")) return false;

        const rect = tipEl.getBoundingClientRect();

        return event.clientX >= rect.left
            && event.clientX <= rect.right
            && event.clientY >= rect.top
            && event.clientY <= rect.bottom;
    }

    function initPrivacy() {
        if (state.initialized) return;

        const lock = getLock();
        if (!lock) return;

        tipEl = lock.querySelector(".binger-lock-tip");
        if (!tipEl) return;

        lock.addEventListener("mouseenter", () => {
            state.overLock = true;
            openTip();
        });

        lock.addEventListener("mouseleave", () => {
            state.overLock = false;
            scheduleClose();
        });

        lock.addEventListener("mousedown", (event) => {
            if (isOnTipSurface(event)) return;
            event.preventDefault();
        });

        lock.addEventListener("click", (event) => {
            if (isOnTipSurface(event)) return;

            endEditing(true, false);
            togglePrivacy();
        });

        tipEl.addEventListener("mouseenter", () => {
            state.overTip = true;
            cancelCloseTimer();
        });

        tipEl.addEventListener("mouseleave", () => {
            state.overTip = false;
            scheduleClose();
        });

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
                    endEditing(true, true);
                }
                if (event.key === "Escape") {
                    event.preventDefault();
                    endEditing(false, true);
                }
            });
        }

        window.addEventListener("resize", () => {
            if (tipEl?.classList.contains("tip-open")) positionTip();
        });

        window.addEventListener("scroll", () => {
            if (tipEl?.classList.contains("tip-open")) positionTip();
        }, true);

        document.addEventListener("fullscreenchange", () => {
            state.editing = false;
            detachOutsideHandler();
            forceCloseTip();
            ensureTipParent();
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

        endEditing(false, true);
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

        if (!state.isPrivate && state.editing) {
            endEditing(false, false);
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