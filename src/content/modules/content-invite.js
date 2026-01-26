// ============================================================================
// INVITE MODULE
// Handles watch together invites - sending, receiving, UI states
// ============================================================================

(function() {
    "use strict";

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

        BingerConnection.getCurrentRoomId().then((roomId) => {
            if (!roomId) {
                alert("You're not in a room!");
                return;
            }

            BingerConnection.sendMessage({ command: "checkAuth" }).then((response) => {
                if (!response?.user) {
                    alert("Not signed in.");
                    return;
                }

                const sender = response.user.email.split("@")[0];
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
                BingerConnection.sendMessage({
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
        });
    }

    // ========================================================================
    // INVITE CANCELLATION
    // ========================================================================

    /**
     * Cancel the active invite (inviter action)
     */
    function cancelInvite() {
        BingerConnection.getCurrentRoomId().then((roomId) => {
            if (!roomId) return;

            BingerConnection.sendMessage({
                command: "cancelActiveInvite",
                roomId
            }).then((res) => {
                if (res?.status === "success") {
                    console.log("[Binger] Invite cancelled - now posting chat message");

                    // Post cancellation message to chat
                    BingerConnection.sendMessage({ command: "checkAuth" }).then((authRes) => {
                        if (!authRes?.user) return;

                        const sender = authRes.user.email.split("@")[0];
                        const movieCode = BingerHelpers.extractMovieCode(window.location.href);

                        const msg = {
                            sender: "Binger Bot",
                            timestamp: Date.now(),
                            text: `${sender} cancelled the invite for movie ${movieCode}`
                        };

                        BingerConnection.sendMessage({
                            command: "post",
                            path: `rooms/${roomId}/messages`,
                            data: msg
                        });
                    });
                } else {
                    alert("Failed to cancel invite: " + res?.error);
                }
            });
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

        BingerConnection.sendMessage({ command: "checkAuth" }).then((authRes) => {
            if (!authRes?.user) return;

            const sender = authRes.user.email.split("@")[0];
            const uid = authRes.user.uid;
            const movieUrl = invite.movieUrl || window.location.href;
            const movieCode = BingerHelpers.extractMovieCode(movieUrl);

            BingerConnection.getCurrentRoomId().then((roomId) => {
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
        });
    }

    // ========================================================================
    // INVITE DECLINE
    // ========================================================================

    /**
     * Decline an invite (invitee action)
     */
    function declineInvite() {
        BingerConnection.sendMessage({ command: "checkAuth" }).then((authRes) => {
            if (!authRes?.user) return;

            const sender = authRes.user.email.split("@")[0];
            const movieCode = BingerHelpers.extractMovieCode(window.location.href);

            BingerConnection.getCurrentRoomId().then((roomId) => {
                if (!roomId) return;

                // Post decline message
                const msg = {
                    sender: "Binger Bot",
                    timestamp: Date.now(),
                    text: `${sender} declined the invite for movie ${movieCode}`
                };

                BingerConnection.sendMessage({
                    command: "post",
                    path: `rooms/${roomId}/messages`,
                    data: msg
                }).then((postRes) => {
                    if (postRes?.status !== "success") {
                        console.error("[Binger] Failed to post decline message:", postRes?.error);
                        return;
                    }

                    // Cancel the invite in Firebase
                    BingerConnection.sendMessage({
                        command: "cancelActiveInvite",
                        roomId
                    }).then((cancelRes) => {
                        if (cancelRes?.status !== "success") {
                            console.error("[Binger] Failed to cancel invite:", cancelRes?.error);
                        }
                    });
                });
            });
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
        progressBar.style.backgroundColor = "yellow";
        progressBar.style.transition = "width 0.8s linear";
        watchTogetherBtn.appendChild(progressBar);

        BingerState.setProgressBar(progressBar);

        // Track press time
        let pressStartTime = null;

        watchTogetherBtn.onmousedown = () => {
            pressStartTime = Date.now();
            progressBar.style.width = "100%";
        };

        watchTogetherBtn.onmouseup = () => {
            progressBar.style.width = "0%";

            const duration = Date.now() - pressStartTime;
            pressStartTime = null;

            if (duration >= 800) {
                // Long press = Decline
                declineInvite();
            } else {
                // Short press = Accept
                acceptInvite(invite);
            }
        };

        watchTogetherBtn.onmouseleave = () => {
            progressBar.style.width = "0%";
            pressStartTime = null;
        };
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
     * Clear all button handlers
     * @param {HTMLElement} button - The button element
     */
    function clearButtonHandlers(button) {
        button.onclick = null;
        button.onmousedown = null;
        button.onmouseup = null;
        button.onmouseleave = null;
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

        if (invite) {
            console.log("[Binger] Active invite received:", invite);

            const isSender = invite.createdBy === currentUser?.uid;

            if (isSender) {
                // Inviter view
                setupInviterUI();
            } else {
                // Invitee view
                const uid = currentUser?.uid;
                const hasAccepted = invite?.acceptedInvitees && invite.acceptedInvitees[uid];

                if (hasAccepted) {
                    // Already accepted
                    setupAcceptedUI();
                } else {
                    // Fresh invitee - show accept/decline
                    setupInviteeUI(invite);
                }
            }
        } else {
            // No active invite
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