// ============================================================================
// ROOM MODULE
// Handles room creation, joining, leaving, and cleanup
// ============================================================================

(function() {
    "use strict";

    // ========================================================================
    // ROOM CLEANUP
    // ========================================================================

    /**
     * Leave room and clean up all listeners
     * @param {Function} callback - Optional callback after cleanup
     */
    function leaveRoomAndCleanup(callback = () => {}) {
        BingerConnection.getCurrentRoomId().then((roomId) => {
            console.log("[Binger] leaveRoomAndCleanup called - roomId =", roomId);

            if (!roomId) {
                callback();
                return;
            }

            // Leave room
            BingerConnection.sendMessage({ command: "leaveRoom", roomId }).then(() => {
                // Unsubscribe from all listeners
                BingerConnection.sendMessageAsync({ command: "unsubscribeFromUsers", roomId });
                BingerConnection.sendMessageAsync({ command: "unsubscribeFromMessages", roomId });
                BingerConnection.sendMessageAsync({ command: "unsubscribeFromTyping", roomId });
                BingerConnection.sendMessageAsync({ command: "unsubscribeFromTheme", roomId });

                BingerTheme.deactivateThemeListener();

                // Clear room ID from storage
                BingerConnection.clearCurrentRoomId().then(() => {
                    console.log("[Binger] Cleaned up room on exit.");
                    callback();
                });
            });
        });
    }

    /**
     * Leave old room if exists (used before joining/creating new room)
     * @param {string} oldRoomId - The old room ID to leave
     * @returns {Promise<void>}
     */
    function leaveOldRoom(oldRoomId) {
        if (!oldRoomId) {
            return Promise.resolve();
        }

        return new Promise((resolve) => {
            BingerConnection.sendMessage({ command: "leaveRoom", roomId: oldRoomId }).then(() => {
                BingerConnection.sendMessageAsync({ command: "unsubscribeFromUsers", roomId: oldRoomId });
                BingerConnection.sendMessageAsync({ command: "unsubscribeFromMessages", roomId: oldRoomId });
                BingerConnection.sendMessageAsync({ command: "unsubscribeFromTyping", roomId: oldRoomId });

                BingerConnection.clearCurrentRoomId().then(resolve);
            });
        });
    }

    // ========================================================================
    // ROOM CREATION
    // ========================================================================

    /**
     * Create a new room and join it
     */
    function createRoom() {
        BingerConnection.getCurrentRoomId().then((oldRoomId) => {
            // Leave old room first if exists
            leaveOldRoom(oldRoomId).then(() => {
                // Create new room
                BingerConnection.sendMessage({ command: "createRoom" }).then((response) => {
                    if (response?.status !== "success") {
                        console.error("[Binger] Failed to create room:", response?.error);
                        return;
                    }

                    const roomId = response.roomId;
                    console.log(`[Binger] Room created: ${roomId}`);

                    // Join the new room
                    BingerConnection.sendMessage({ command: "joinRoom", roomId }).then((joinResponse) => {
                        if (joinResponse?.status !== "success") {
                            alert("Failed to join new room: " + (joinResponse?.error || "Unknown error"));
                            return;
                        }

                        // Save room ID and reload
                        Promise.all([
                            BingerConnection.setCurrentRoomId(roomId),
                            BingerConnection.setLocal("bingerSwitchingFromRoom", oldRoomId)
                        ]).then(() => {
                            console.log(`[Binger] Room ID ${roomId} saved to storage`);
                            BingerNavigation.reloadWithFlag();
                        });
                    });
                });
            });
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

        BingerConnection.getCurrentRoomId().then((oldRoomId) => {
            // Leave old room first if exists
            leaveOldRoom(oldRoomId).then(() => {
                // Join the new room
                BingerConnection.sendMessage({ command: "joinRoom", roomId: newRoomId }).then((response) => {
                    if (response?.status !== "success") {
                        alert(`Failed to join room: ${response?.error}`);
                        return;
                    }

                    // Save room ID and reload
                    Promise.all([
                        BingerConnection.setLocal("bingerIsReloading", true),
                        BingerConnection.setCurrentRoomId(newRoomId),
                        BingerConnection.setLocal("bingerSwitchingFromRoom", oldRoomId)
                    ]).then(() => {
                        console.log(`[Binger] Joined room: ${newRoomId} - reloading`);
                        BingerNavigation.reloadWithFlag();
                    });
                });
            });
        });
    }

    /**
     * Prompt user for room code and join
     */
    function promptAndJoinRoom() {
        const newRoomId = prompt("Enter 6-digit room code:");

        // User hit Cancel
        if (newRoomId === null) return;

        joinRoom(newRoomId);
    }

    // ========================================================================
    // ROOM LEAVING
    // ========================================================================

    /**
     * Leave the current room
     */
    function leaveRoom() {
        BingerConnection.getCurrentRoomId().then((roomId) => {
            if (!roomId) return;

            BingerConnection.sendMessage({ command: "leaveRoom", roomId }).then((response) => {
                if (response?.status !== "success") {
                    alert("Failed to leave room: " + (response?.error || "Unknown error"));
                    return;
                }

                // Unsubscribe from all listeners
                BingerConnection.sendMessageAsync({ command: "unsubscribeFromUsers", roomId });
                BingerConnection.sendMessageAsync({ command: "unsubscribeFromMessages", roomId });
                BingerConnection.sendMessageAsync({ command: "unsubscribeFromTyping", roomId });
                BingerConnection.sendMessageAsync({ command: "unsubscribeFromTheme", roomId });

                BingerTheme.deactivateThemeListener();

                // Clear room ID and reload
                BingerConnection.clearCurrentRoomId().then(() => {
                    console.log(`[Binger] Left room: ${roomId}`);
                    BingerChatbox.deactivateChatbox();
                    BingerNavigation.reloadWithFlag();
                });
            });
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
        return new Promise((resolve) => {
            BingerConnection.sendMessage({
                command: "rejoinIfRecentlyKicked",
                roomId
            }).then((res) => {
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

                    resolve(true);
                } else {
                    console.log("[Binger] Could not rejoin room. Cleaning up...");
                    BingerConnection.clearCurrentRoomId().then(() => {
                        BingerChatbox.deactivateChatbox();
                        resolve(false);
                    });
                }
            });
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
        const isSignedIn = BingerState.isSignedIn();
        const isInWatchPage = BingerHelpers.isOnWatchPage();
        const enoughPeople = BingerState.hasEnoughUsers();

        const shouldEnable = isSignedIn && isInWatchPage && enoughPeople;

        const watchTogetherBtn = BingerOverlayDOM.getElement("watchTogetherBtn");
        if (watchTogetherBtn) {
            watchTogetherBtn.disabled = !shouldEnable;
        }
    }

    // ========================================================================
    // BUTTON SETUP
    // ========================================================================

    /**
     * Setup room button event listeners
     */
    function setupRoomButtons() {
        const elements = BingerOverlayDOM.getElements();

        if (elements.createRoomBtn) {
            elements.createRoomBtn.addEventListener("click", createRoom);
        }

        if (elements.joinRoomBtn) {
            elements.joinRoomBtn.addEventListener("click", promptAndJoinRoom);
        }

        if (elements.leaveRoomBtn) {
            elements.leaveRoomBtn.addEventListener("click", leaveRoom);
        }
    }

    // ========================================================================
    // EXPOSE TO WINDOW
    // ========================================================================

    window.BingerRoom = {
        // Room operations
        createRoom,
        joinRoom,
        promptAndJoinRoom,
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