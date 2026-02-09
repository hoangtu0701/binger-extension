// ============================================================================
// INVITE MODULE
// Handles watch together invites - sending, receiving, UI states
// ============================================================================

(function() {
    "use strict";

    // ========================================================================
    // CONSTANTS
    // ========================================================================

    // Long press threshold for decline action (milliseconds)
    const LONG_PRESS_THRESHOLD_MS = 800;

    // ========================================================================
    // INVITE SENDING
    // ========================================================================

    /**
     * Send a watch together invite
     * Default handler for the Binge button
     */
    function sendInvite() {
        console.log("[Binger] Watch Together clicked");

        const movieUrl = window.location.href;

        BingerConnection.getCurrentRoomId()
            .then((roomId) => {
                if (!roomId) {
                    alert("You're not in a room!");
                    return;
                }

                return BingerConnection.sendMessage({ command: "checkAuth" })
                    .then((response) => {
                        if (!response?.user) {
                            alert("Not signed in.");
                            return;
                        }

                        const email = response.user.email || "";
                        const sender = email.split("@")[0] || "anonymous";
                        const senderUid = response.user.uid;

                        // Construct invite data
                        const inviteData = {
                            createdBy: senderUid,
                            sender,
                            movieUrl,
                            timestamp: Date.now(),
                            accepted: {}
                        };

                        // Send invite to Firebase
                        return BingerConnection.sendMessage({
                            command: "sendInviteAndBroadcast",
                            roomId,
                            inviteData
                        }).then((res) => {
                            if (res?.status === "success") {
                                console.log("[Binger] Invite sent and stored");
                                BingerConnection.sendMessageAsync({
                                    command: "subscribeToActiveInvite",
                                    roomId
                                });
                            } else {
                                alert("Failed to send invite: " + (res?.error || "Unknown error"));
                            }
                        });
                    });
            })
            .catch((err) => {
                console.error("[Binger] Error sending invite:", err);
                alert("Failed to send invite. Please try again.");
            });
    }

    // ========================================================================
    // INVITE CANCELLATION
    // ========================================================================

    /**
     * Cancel the active invite (inviter action)
     */
    function cancelInvite() {
        BingerConnection.getCurrentRoomId()
            .then((roomId) => {
                if (!roomId) return;

                return BingerConnection.sendMessage({
                    command: "cancelActiveInvite",
                    roomId
                }).then((res) => {
                    if (res?.status === "success") {
                        console.log("[Binger] Invite cancelled - now posting chat message");

                        // Post cancellation message to chat
                        return BingerConnection.sendMessage({ command: "checkAuth" })
                            .then((authRes) => {
                                if (!authRes?.user) return;

                                const email = authRes.user.email || "";
                                const sender = email.split("@")[0] || "anonymous";
                                const movieCode = BingerHelpers.extractMovieCode(window.location.href);

                                const msg = {
                                    sender: "Binger Bot",
                                    timestamp: Date.now(),
                                    text: `${sender} cancelled the invite for movie ${movieCode}`
                                };

                                return BingerConnection.sendMessage({
                                    command: "post",
                                    path: `rooms/${roomId}/messages`,
                                    data: msg
                                });
                            });
                    } else {
                        alert("Failed to cancel invite: " + (res?.error || "Unknown error"));
                    }
                });
            })
            .catch((err) => {
                console.error("[Binger] Error cancelling invite:", err);
            });
    }

    // ========================================================================
    // INVITE ACCEPTANCE
    // ========================================================================

    /**
     * Accept an invite (invitee action)
     * @param {object} invite - The invite object
     */
    function acceptInvite(invite) {
        const watchTogetherBtn = BingerOverlayDOM.getElement("watchTogetherBtn");
        if (watchTogetherBtn) {
            watchTogetherBtn.innerText = "Accepted";
            watchTogetherBtn.disabled = true;
            watchTogetherBtn.style.backgroundColor = "gray";
        }

        BingerConnection.sendMessage({ command: "checkAuth" })
            .then((authRes) => {
                if (!authRes?.user) return;

                const email = authRes.user.email || "";
                const sender = email.split("@")[0] || "anonymous";
                const uid = authRes.user.uid;
                const movieUrl = invite?.movieUrl || window.location.href;
                const movieCode = BingerHelpers.extractMovieCode(movieUrl);

                return BingerConnection.getCurrentRoomId()
                    .then((roomId) => {
                        if (!roomId) return;

                        // Post acceptance message
                        const msg = {
                            sender: "Binger Bot",
                            timestamp: Date.now(),
                            text: `${sender} accepted the invite for movie ${movieCode}`
                        };

                        BingerConnection.sendMessageAsync({
                            command: "post",
                            path: `rooms/${roomId}/messages`,
                            data: msg
                        });

                        // Mark as accepted in Firebase
                        BingerConnection.sendMessageAsync({
                            command: "post",
                            path: `rooms/${roomId}/activeInvite/acceptedInvitees/${uid}`,
                            data: true
                        });
                    });
            })
            .catch((err) => {
                console.error("[Binger] Error accepting invite:", err);
            });
    }

    // ========================================================================
    // INVITE DECLINE
    // ========================================================================

    /**
     * Decline an invite (invitee action)
     */
    function declineInvite() {
        BingerConnection.sendMessage({ command: "checkAuth" })
            .then((authRes) => {
                if (!authRes?.user) return;

                const email = authRes.user.email || "";
                const sender = email.split("@")[0] || "anonymous";
                const movieCode = BingerHelpers.extractMovieCode(window.location.href);

                return BingerConnection.getCurrentRoomId()
                    .then((roomId) => {
                        if (!roomId) return;

                        // Post decline message
                        const msg = {
                            sender: "Binger Bot",
                            timestamp: Date.now(),
                            text: `${sender} declined the invite for movie ${movieCode}`
                        };

                        return BingerConnection.sendMessage({
                            command: "post",
                            path: `rooms/${roomId}/messages`,
                            data: msg
                        }).then((postRes) => {
                            if (postRes?.status !== "success") {
                                console.error("[Binger] Failed to post decline message:", postRes?.error);
                                return;
                            }

                            // Cancel the invite in Firebase
                            return BingerConnection.sendMessage({
                                command: "cancelActiveInvite",
                                roomId
                            }).then((cancelRes) => {
                                if (cancelRes?.status !== "success") {
                                    console.error("[Binger] Failed to cancel invite:", cancelRes?.error);
                                }
                            });
                        });
                    });
            })
            .catch((err) => {
                console.error("[Binger] Error declining invite:", err);
            });
    }

    // ========================================================================
    // INVITER UI
    // ========================================================================

    /**
     * Setup the inviter UI (cancel button)
     */
    function setupInviterUI() {
        const watchTogetherBtn = BingerOverlayDOM.getElement("watchTogetherBtn");
        if (!watchTogetherBtn) return;

        watchTogetherBtn.disabled = false;
        watchTogetherBtn.innerText = "Cancel Invite";
        watchTogetherBtn.classList.add("binge-inviter-active");

        // Clear any existing handlers
        clearButtonHandlers(watchTogetherBtn);

        watchTogetherBtn.onclick = cancelInvite;
    }

    // ========================================================================
    // INVITEE UI
    // ========================================================================

    /**
     * Setup the invitee UI (accept/decline with progress bar)
     * Short press = Accept, Long press (800ms+) = Decline
     * @param {object} invite - The invite object
     */
    function setupInviteeUI(invite) {
        const watchTogetherBtn = BingerOverlayDOM.getElement("watchTogetherBtn");
        if (!watchTogetherBtn) return;

        watchTogetherBtn.innerText = "Accept / Decline";
        watchTogetherBtn.disabled = false;
        watchTogetherBtn.classList.remove("binge-invitee-accepted");
        watchTogetherBtn.classList.add("binge-invitee-active");

        // Clear any existing handlers
        clearButtonHandlers(watchTogetherBtn);

        // Create progress bar
        const progressBar = document.createElement("div");
        progressBar.style.height = "4px";
        progressBar.style.width = "0%";
        progressBar.style.maxWidth = "80%";
        progressBar.style.margin = "0 auto";
        progressBar.style.backgroundColor = "white";
        progressBar.style.borderRadius = "2px";
        progressBar.style.transition = `width ${LONG_PRESS_THRESHOLD_MS / 1000}s linear`;
        watchTogetherBtn.appendChild(progressBar);

        BingerState.setProgressBar(progressBar);

        // Track press time
        let pressStartTime = null;

        // Handler for press start (mouse or touch)
        function handlePressStart(e) {
            // Prevent default to avoid double-firing on touch devices
            if (e.type === "touchstart") {
                e.preventDefault();
            }
            pressStartTime = Date.now();
            progressBar.style.width = "100%";
        }

        // Handler for press end (mouse or touch)
        function handlePressEnd(e) {
            // Prevent default to avoid double-firing on touch devices
            if (e.type === "touchend") {
                e.preventDefault();
            }

            progressBar.style.width = "0%";

            if (pressStartTime === null) return;

            const duration = Date.now() - pressStartTime;
            pressStartTime = null;

            if (duration >= LONG_PRESS_THRESHOLD_MS) {
                // Long press = Decline
                declineInvite();
            } else {
                // Short press = Accept
                acceptInvite(invite);
            }
        }

        // Handler for press cancel (mouse leave or touch cancel)
        function handlePressCancel() {
            progressBar.style.width = "0%";
            pressStartTime = null;
        }

        // Mouse events
        watchTogetherBtn.onmousedown = handlePressStart;
        watchTogetherBtn.onmouseup = handlePressEnd;
        watchTogetherBtn.onmouseleave = handlePressCancel;

        // Touch events for mobile support
        watchTogetherBtn.ontouchstart = handlePressStart;
        watchTogetherBtn.ontouchend = handlePressEnd;
        watchTogetherBtn.ontouchcancel = handlePressCancel;
    }

    /**
     * Setup the accepted state UI
     */
    function setupAcceptedUI() {
        const watchTogetherBtn = BingerOverlayDOM.getElement("watchTogetherBtn");
        if (!watchTogetherBtn) return;

        watchTogetherBtn.classList.remove("binge-invitee-active");
        watchTogetherBtn.classList.add("binge-invitee-accepted");
        watchTogetherBtn.innerText = "Accepted";
        watchTogetherBtn.disabled = true;

        // Clear all handlers
        clearButtonHandlers(watchTogetherBtn);
    }

    // ========================================================================
    // RESET UI
    // ========================================================================

    /**
     * Clear all button handlers (mouse and touch)
     * @param {HTMLElement} button - The button element
     */
    function clearButtonHandlers(button) {
        if (!button) return;

        // Mouse events
        button.onclick = null;
        button.onmousedown = null;
        button.onmouseup = null;
        button.onmouseleave = null;

        // Touch events
        button.ontouchstart = null;
        button.ontouchend = null;
        button.ontouchcancel = null;
    }

    /**
     * Reset the watch together button to default state
     */
    function resetWatchTogetherButton() {
        const watchTogetherBtn = BingerOverlayDOM.getElement("watchTogetherBtn");
        if (!watchTogetherBtn) return;

        console.log("[Binger] No active invite - resetting button state");

        // Remove lingering progress bar
        const progressBar = watchTogetherBtn.querySelector("div");
        if (progressBar) progressBar.remove();

        // Clear handlers
        clearButtonHandlers(watchTogetherBtn);

        // Reset to original state
        watchTogetherBtn.innerHTML = `<img src="${chrome.runtime.getURL("binger_assets/images/binge.png")}" alt="Watch Together" class="bottom-icon" />`;
        watchTogetherBtn.disabled = true;
        watchTogetherBtn.style.backgroundColor = "";
        watchTogetherBtn.style.color = "";
        watchTogetherBtn.style.border = "";

        // Remove all styling classes
        watchTogetherBtn.classList.remove("binge-invitee-active");
        watchTogetherBtn.classList.remove("binge-inviter-active");
        watchTogetherBtn.classList.remove("binge-invitee-accepted");

        // Restore default click handler
        watchTogetherBtn.onclick = sendInvite;

        // Re-enable if eligible
        BingerRoom.checkWatchTogetherEligibility();
    }

    // ========================================================================
    // INVITE UPDATE HANDLER
    // ========================================================================

    /**
     * Handle active invite update from background
     * @param {object|null} invite - The invite object or null if no invite
     */
    function handleInviteUpdate(invite) {
        const currentUser = BingerState.getCurrentUser();

        // Validate invite object has required fields
        if (invite && typeof invite === "object" && invite.createdBy) {
            console.log("[Binger] Active invite received:", invite);

            const isSender = invite.createdBy === currentUser?.uid;

            if (isSender) {
                // Inviter view
                setupInviterUI();
            } else {
                // Invitee view
                const uid = currentUser?.uid;
                const hasAccepted = invite.acceptedInvitees && invite.acceptedInvitees[uid];

                if (hasAccepted) {
                    // Already accepted
                    setupAcceptedUI();
                } else {
                    // Fresh invitee - show accept/decline
                    setupInviteeUI(invite);
                }
            }
        } else {
            // No active invite or invalid invite
            resetWatchTogetherButton();
        }
    }

    // ========================================================================
    // INITIALIZATION
    // ========================================================================

    /**
     * Setup the default watch together button handler
     */
    function setupWatchTogetherButton() {
        const watchTogetherBtn = BingerOverlayDOM.getElement("watchTogetherBtn");
        if (watchTogetherBtn) {
            watchTogetherBtn.onclick = sendInvite;
        }
    }

    // ========================================================================
    // EXPOSE TO WINDOW
    // ========================================================================

    window.BingerInvite = {
        // Actions
        sendInvite,
        cancelInvite,
        acceptInvite,
        declineInvite,

        // UI
        setupInviterUI,
        setupInviteeUI,
        setupAcceptedUI,
        resetWatchTogetherButton,

        // Handler
        handleInviteUpdate,

        // Setup
        setupWatchTogetherButton
    };

})();