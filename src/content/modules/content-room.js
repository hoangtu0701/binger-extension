// ============================================================================
// ROOM MODULE
// Handles room creation, joining, leaving, and cleanup
// ============================================================================

(function() {
    "use strict";

    // ========================================================================
    // STATE
    // ========================================================================

    // Track if room buttons have been setup (prevents duplicate listeners)
    let roomButtonsInitialized = false;

    // ========================================================================
    // UNSUBSCRIBE HELPERS
    // ========================================================================

    /**
     * Unsubscribe from all room listeners
     * Sends async unsubscribe commands - does not wait for responses
     * @param {string} roomId - The room ID to unsubscribe from
     */
    function unsubscribeFromAllListeners(roomId) {
        if (!roomId) return;

        // Unsubscribe from all Firebase listeners
        BingerConnection.sendMessageAsync({ command: "unsubscribeFromUsers", roomId });
        BingerConnection.sendMessageAsync({ command: "unsubscribeFromMessages", roomId });
        BingerConnection.sendMessageAsync({ command: "unsubscribeFromTyping", roomId });
        BingerConnection.sendMessageAsync({ command: "unsubscribeFromTheme", roomId });
        BingerConnection.sendMessageAsync({ command: "unsubscribeFromActiveInvite", roomId });
        BingerConnection.sendMessageAsync({ command: "stopInSessionListener", roomId });

        // Deactivate theme listener on content side
        BingerTheme.deactivateThemeListener();
    }

    // ========================================================================
    // ROOM CLEANUP
    // ========================================================================

    /**
     * Leave room and clean up all listeners
     * IMPORTANT: Always calls callback, even on error, to prevent hanging callers
     * @param {Function} callback - Optional callback after cleanup
     */
    function leaveRoomAndCleanup(callback = () => {}) {
        BingerConnection.getCurrentRoomId()
            .then((roomId) => {
                console.log("[Binger] leaveRoomAndCleanup called - roomId =", roomId);

                if (!roomId) {
                    callback();
                    return;
                }

                // Leave room
                return BingerConnection.sendMessage({ command: "leaveRoom", roomId })
                    .then(() => {
                        // Unsubscribe from all listeners
                        unsubscribeFromAllListeners(roomId);

                        // Clear room ID from storage
                        return BingerConnection.clearCurrentRoomId();
                    })
                    .then(() => {
                        console.log("[Binger] Cleaned up room on exit.");
                        callback();
                    });
            })
            .catch((err) => {
                console.error("[Binger] leaveRoomAndCleanup error:", err);
                // Always call callback to prevent hanging callers
                callback();
            });
    }

    /**
     * Leave old room if exists (used before joining/creating new room)
     * Always resolves - errors are logged but don't block the caller
     * @param {string} oldRoomId - The old room ID to leave
     * @returns {Promise<void>}
     */
    function leaveOldRoom(oldRoomId) {
        if (!oldRoomId) {
            return Promise.resolve();
        }

        return BingerConnection.sendMessage({ command: "leaveRoom", roomId: oldRoomId })
            .then(() => {
                // Unsubscribe from all listeners
                unsubscribeFromAllListeners(oldRoomId);

                // Clear room ID from storage
                return BingerConnection.clearCurrentRoomId();
            })
            .catch((err) => {
                console.warn("[Binger] Error leaving old room:", err);
                // Resolve anyway so caller can continue
                return BingerConnection.clearCurrentRoomId();
            });
    }

    // ========================================================================
    // ROOM CREATION
    // ========================================================================

    /**
     * Create a new room and join it
     */
    function createRoom() {
        BingerConnection.getCurrentRoomId()
            .then((oldRoomId) => {
                // Leave old room first if exists
                return leaveOldRoom(oldRoomId).then(() => oldRoomId);
            })
            .then((oldRoomId) => {
                // Create new room
                return BingerConnection.sendMessage({ command: "createRoom" })
                    .then((response) => {
                        if (response?.status !== "success") {
                            console.error("[Binger] Failed to create room:", response?.error);
                            alert("Failed to create room: " + (response?.error || "Unknown error"));
                            return null;
                        }
                        return { roomId: response.roomId, oldRoomId };
                    });
            })
            .then((data) => {
                if (!data) return; // Creation failed

                const { roomId, oldRoomId } = data;
                console.log(`[Binger] Room created: ${roomId}`);

                // Join the new room
                return BingerConnection.sendMessage({ command: "joinRoom", roomId })
                    .then((joinResponse) => {
                        if (joinResponse?.status !== "success") {
                            alert("Failed to join new room: " + (joinResponse?.error || "Unknown error"));
                            return;
                        }

                        // Save room ID and reload
                        return Promise.all([
                            BingerConnection.setCurrentRoomId(roomId),
                            BingerConnection.setLocal("bingerSwitchingFromRoom", oldRoomId)
                        ]).then(() => {
                            console.log(`[Binger] Room ID ${roomId} saved to storage`);
                            BingerNavigation.reloadWithFlag();
                        });
                    });
            })
            .catch((err) => {
                console.error("[Binger] Error creating room:", err);
                alert("Failed to create room. Please try again.");
            });
    }

    // ========================================================================
    // ROOM JOINING
    // ========================================================================

    /**
     * Join an existing room
     * @param {string} newRoomId - The room ID to join
     */
    function joinRoom(newRoomId) {
        // Validate room code
        if (!BingerHelpers.isValidRoomCode(newRoomId)) {
            alert("Please enter a valid 6-digit room code.");
            return;
        }

        BingerConnection.getCurrentRoomId()
            .then((oldRoomId) => {
                // Leave old room first if exists
                return leaveOldRoom(oldRoomId).then(() => oldRoomId);
            })
            .then((oldRoomId) => {
                // Join the new room
                return BingerConnection.sendMessage({ command: "joinRoom", roomId: newRoomId })
                    .then((response) => {
                        if (response?.status !== "success") {
                            alert(`Failed to join room: ${response?.error || "Unknown error"}`);
                            return;
                        }

                        // Save room ID and reload
                        return Promise.all([
                            BingerConnection.setCurrentRoomId(newRoomId),
                            BingerConnection.setLocal("bingerSwitchingFromRoom", oldRoomId)
                        ]).then(() => {
                            console.log(`[Binger] Joined room: ${newRoomId} - reloading`);
                            BingerNavigation.reloadWithFlag();
                        });
                    });
            })
            .catch((err) => {
                console.error("[Binger] Error joining room:", err);
                alert("Failed to join room. Please try again.");
            });
    }

    function toggleJoinBubble() {
        const bubble = BingerOverlayDOM.getElement("joinBubble");
        if (!bubble) return;

        const isVisible = bubble.style.display === "block";
        if (isVisible) {
            closeJoinBubble();
        } else {
            openJoinBubble();
        }
    }

    function openJoinBubble() {
        const bubble = BingerOverlayDOM.getElement("joinBubble");
        const input = BingerOverlayDOM.getElement("joinBubbleInput");
        if (!bubble || !input) return;

        input.value = "";
        bubble.style.display = "block";

        requestAnimationFrame(() => input.focus());

        document.addEventListener("mousedown", handleBubbleOutsideClick, true);
    }

    function closeJoinBubble() {
        const bubble = BingerOverlayDOM.getElement("joinBubble");
        const input = BingerOverlayDOM.getElement("joinBubbleInput");
        if (!bubble) return;

        bubble.style.display = "none";
        if (input) input.value = "";

        document.removeEventListener("mousedown", handleBubbleOutsideClick, true);
    }

    function handleBubbleOutsideClick(e) {
        const bubble = BingerOverlayDOM.getElement("joinBubble");
        const joinBtn = BingerOverlayDOM.getElement("joinRoomBtn");

        if (!bubble) return;

        if (!bubble.contains(e.target) && e.target !== joinBtn) {
            closeJoinBubble();
        }
    }

    function handleBubbleKeydown(e) {
        if (e.key === "Enter") {
            const input = BingerOverlayDOM.getElement("joinBubbleInput");
            if (!input) return;

            const code = input.value.trim();
            if (!code) return;

            closeJoinBubble();
            joinRoom(code);
        }

        if (e.key === "Escape") {
            closeJoinBubble();
        }
    }

    // ========================================================================
    // ROOM LEAVING
    // ========================================================================

    /**
     * Leave the current room
     */
    function leaveRoom() {
        BingerConnection.getCurrentRoomId()
            .then((roomId) => {
                if (!roomId) return;

                return BingerConnection.sendMessage({ command: "leaveRoom", roomId })
                    .then((response) => {
                        if (response?.status !== "success") {
                            alert("Failed to leave room: " + (response?.error || "Unknown error"));
                            return;
                        }

                        // Unsubscribe from all listeners
                        unsubscribeFromAllListeners(roomId);

                        // Clear room ID and reload
                        return BingerConnection.clearCurrentRoomId()
                            .then(() => {
                                console.log(`[Binger] Left room: ${roomId}`);
                                BingerChatbox.deactivateChatbox();
                                BingerNavigation.reloadWithFlag();
                            });
                    });
            })
            .catch((err) => {
                console.error("[Binger] Error leaving room:", err);
                alert("Failed to leave room. Please try again.");
            });
    }

    // ========================================================================
    // ROOM REJOIN (AFTER RELOAD)
    // ========================================================================

    /**
     * Attempt to rejoin a room after page reload
     * @param {string} roomId - The room ID to rejoin
     * @returns {Promise<boolean>} True if rejoined successfully
     */
    function attemptRejoin(roomId) {
        // Validate roomId
        if (!roomId || typeof roomId !== "string") {
            console.log("[Binger] attemptRejoin called with invalid roomId");
            return Promise.resolve(false);
        }

        return BingerConnection.sendMessage({
            command: "rejoinIfRecentlyKicked",
            roomId
        })
            .then((res) => {
                if (res?.status === "rejoined") {
                    console.log("[Binger] Rejoined room successfully after reload");

                    // Activate chatbox
                    BingerChatbox.activateChatbox(roomId);

                    // Subscribe to room theme
                    BingerTheme.activateThemeListener(roomId);

                    // Check watch together eligibility
                    checkWatchTogetherEligibility();

                    // Start active invite listener
                    BingerConnection.sendMessageAsync({
                        command: "subscribeToActiveInvite",
                        roomId
                    });

                    // Start inSession listener
                    BingerConnection.sendMessageAsync({
                        command: "startInSessionListener",
                        roomId
                    });

                    return true;
                } else {
                    console.log("[Binger] Could not rejoin room. Cleaning up...");
                    return BingerConnection.clearCurrentRoomId()
                        .then(() => {
                            BingerChatbox.deactivateChatbox();
                            return false;
                        });
                }
            })
            .catch((err) => {
                console.error("[Binger] Error attempting rejoin:", err);
                // Clean up and return false
                return BingerConnection.clearCurrentRoomId()
                    .then(() => {
                        BingerChatbox.deactivateChatbox();
                        return false;
                    })
                    .catch(() => false);
            });
    }

    // ========================================================================
    // WATCH TOGETHER ELIGIBILITY
    // ========================================================================

    /**
     * Check if Watch Together button should be enabled
     * Requires: signed in + on /watch/ page + 2+ users
     */
    function checkWatchTogetherEligibility() {
        const watchTogetherBtn = BingerOverlayDOM.getElement("watchTogetherBtn");
        if (!watchTogetherBtn) return;

        // Do not override button state when invite system is controlling it
        const isInviteActive = watchTogetherBtn.classList.contains("binge-inviter-active")
            || watchTogetherBtn.classList.contains("binge-invitee-active")
            || watchTogetherBtn.classList.contains("binge-invitee-accepted");

        if (isInviteActive) return;

        const isSignedIn = BingerState.isSignedIn();
        const isInWatchPage = BingerHelpers.isOnWatchPage();
        const enoughPeople = BingerState.hasEnoughUsers();

        const shouldEnable = isSignedIn && isInWatchPage && enoughPeople;
        watchTogetherBtn.disabled = !shouldEnable;
    }

    // ========================================================================
    // BUTTON SETUP
    // ========================================================================

    /**
     * Setup room button event listeners
     * Only sets up once to prevent duplicate listeners
     */
    function setupRoomButtons() {
        // Prevent duplicate listener attachment
        if (roomButtonsInitialized) {
            console.log("[Binger] Room buttons already initialized - skipping");
            return;
        }

        const elements = BingerOverlayDOM.getElements();

        if (elements?.createRoomBtn) {
            elements.createRoomBtn.addEventListener("click", createRoom);
        }

        if (elements?.joinRoomBtn) {
            elements.joinRoomBtn.addEventListener("click", toggleJoinBubble);
        }

        if (elements?.joinBubbleInput) {
            elements.joinBubbleInput.addEventListener("keydown", handleBubbleKeydown);
        }

        if (elements?.leaveRoomBtn) {
            elements.leaveRoomBtn.addEventListener("click", leaveRoom);
        }

        roomButtonsInitialized = true;
        console.log("[Binger] Room buttons initialized");
    }

    // ========================================================================
    // EXPOSE TO WINDOW
    // ========================================================================

    window.BingerRoom = {
        // Room operations
        createRoom,
        joinRoom,
        toggleJoinBubble,
        closeJoinBubble,
        leaveRoom,

        // Cleanup
        leaveRoomAndCleanup,
        leaveOldRoom,

        // Rejoin
        attemptRejoin,

        // Eligibility
        checkWatchTogetherEligibility,

        // Setup
        setupRoomButtons
    };

})();