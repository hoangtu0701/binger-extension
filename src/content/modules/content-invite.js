(function() {
    "use strict";

    const LONG_PRESS_THRESHOLD_MS = 800;

    function sendInvite() {
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

                        const inviteData = {
                            createdBy: senderUid,
                            sender,
                            movieUrl,
                            timestamp: Date.now(),
                            accepted: {}
                        };

                        return BingerConnection.sendMessage({
                            command: "sendInviteAndBroadcast",
                            roomId,
                            inviteData
                        }).then((res) => {
                            if (res?.status === "success") {
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

    function cancelInvite() {
        BingerConnection.getCurrentRoomId()
            .then((roomId) => {
                if (!roomId) return;

                return BingerConnection.sendMessage({
                    command: "cancelActiveInvite",
                    roomId
                }).then((res) => {
                    if (res?.status === "success") {
                        return BingerConnection.sendMessage({ command: "checkAuth" })
                            .then((authRes) => {
                                if (!authRes?.user) return;

                                const email = authRes.user.email || "";
                                const sender = email.split("@")[0] || "anonymous";
                                const movieCode = BingerHelpers.extractMovieCode(window.location.href);

                                const msg = {
                                    sender: "Binger Bot",
                                    type: "bot",
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

                        const msg = {
                            sender: "Binger Bot",
                            type: "bot",
                            timestamp: Date.now(),
                            text: `${sender} accepted the invite for movie ${movieCode}`
                        };

                        BingerConnection.sendMessageAsync({
                            command: "post",
                            path: `rooms/${roomId}/messages`,
                            data: msg
                        });

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

                        const msg = {
                            sender: "Binger Bot",
                            type: "bot",
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

    function setupInviterUI() {
        const watchTogetherBtn = BingerOverlayDOM.getElement("watchTogetherBtn");
        if (!watchTogetherBtn) return;

        watchTogetherBtn.disabled = false;
        watchTogetherBtn.innerText = "Cancel Invite";
        watchTogetherBtn.classList.add("binge-inviter-active");

        clearButtonHandlers(watchTogetherBtn);

        watchTogetherBtn.onclick = cancelInvite;
    }

    function setupInviteeUI(invite) {
        const watchTogetherBtn = BingerOverlayDOM.getElement("watchTogetherBtn");
        if (!watchTogetherBtn) return;

        watchTogetherBtn.innerText = "Accept / Decline";
        watchTogetherBtn.disabled = false;
        watchTogetherBtn.classList.remove("binge-invitee-accepted");
        watchTogetherBtn.classList.add("binge-invitee-active");

        const tooltip = watchTogetherBtn.parentElement?.querySelector(".binger-bottom-tooltip");
        if (tooltip) tooltip.textContent = "Click to Accept. Hold to Decline";

        clearButtonHandlers(watchTogetherBtn);

        const progressBar = document.createElement("div");
        progressBar.className = "binge-invite-progress";
        progressBar.style.transition = `width ${LONG_PRESS_THRESHOLD_MS / 1000}s linear`;
        watchTogetherBtn.appendChild(progressBar);

        BingerState.setProgressBar(progressBar);

        let pressStartTime = null;

        function handlePressStart(e) {
            if (e.type === "touchstart") {
                e.preventDefault();
            }
            pressStartTime = Date.now();
            progressBar.style.width = "100%";
        }

        function handlePressEnd(e) {
            if (e.type === "touchend") {
                e.preventDefault();
            }

            progressBar.style.width = "0%";

            if (pressStartTime === null) return;

            const duration = Date.now() - pressStartTime;
            pressStartTime = null;

            if (duration >= LONG_PRESS_THRESHOLD_MS) {
                declineInvite();
            } else {
                acceptInvite(invite);
            }
        }

        function handlePressCancel() {
            progressBar.style.width = "0%";
            pressStartTime = null;
        }

        watchTogetherBtn.onmousedown = handlePressStart;
        watchTogetherBtn.onmouseup = handlePressEnd;
        watchTogetherBtn.onmouseleave = handlePressCancel;

        watchTogetherBtn.ontouchstart = handlePressStart;
        watchTogetherBtn.ontouchend = handlePressEnd;
        watchTogetherBtn.ontouchcancel = handlePressCancel;
    }

    function setupAcceptedUI() {
        const watchTogetherBtn = BingerOverlayDOM.getElement("watchTogetherBtn");
        if (!watchTogetherBtn) return;

        watchTogetherBtn.classList.remove("binge-invitee-active");
        watchTogetherBtn.classList.add("binge-invitee-accepted");
        watchTogetherBtn.innerText = "Accepted";
        watchTogetherBtn.disabled = true;

        clearButtonHandlers(watchTogetherBtn);
    }

    function clearButtonHandlers(button) {
        if (!button) return;

        button.onclick = null;
        button.onmousedown = null;
        button.onmouseup = null;
        button.onmouseleave = null;

        button.ontouchstart = null;
        button.ontouchend = null;
        button.ontouchcancel = null;
    }

    function resetWatchTogetherButton() {
        const watchTogetherBtn = BingerOverlayDOM.getElement("watchTogetherBtn");
        if (!watchTogetherBtn) return;

        const progressBar = watchTogetherBtn.querySelector("div");
        if (progressBar) progressBar.remove();

        clearButtonHandlers(watchTogetherBtn);

        watchTogetherBtn.innerHTML = `<svg class="bottom-icon" viewBox="0 0 32 32" fill="none"><circle cx="10" cy="9" r="3.5" stroke="currentColor" stroke-width="1.5" opacity="0.7" fill="none"/><circle cx="22" cy="9" r="3.5" stroke="currentColor" stroke-width="1.5" opacity="0.7" fill="none"/><path d="M4 22C4 18.5 6.5 16 10 16C11.5 16 12.8 16.5 13.8 17.3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.5" fill="none"/><path d="M28 22C28 18.5 25.5 16 22 16C20.5 16 19.2 16.5 18.2 17.3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.5" fill="none"/><path d="M13 21L20 25.5L13 30V21Z" fill="currentColor" fill-opacity="0.5" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" opacity="0.7"/></svg>`;
        watchTogetherBtn.disabled = true;
        watchTogetherBtn.style.backgroundColor = "";
        watchTogetherBtn.style.color = "";
        watchTogetherBtn.style.border = "";

        watchTogetherBtn.classList.remove("binge-invitee-active");
        watchTogetherBtn.classList.remove("binge-inviter-active");
        watchTogetherBtn.classList.remove("binge-invitee-accepted");

        const tooltip = watchTogetherBtn.parentElement?.querySelector(".binger-bottom-tooltip");
        if (tooltip) tooltip.textContent = "Play a movie with 2 in the room to invite";

        watchTogetherBtn.onclick = sendInvite;

        BingerRoom.checkWatchTogetherEligibility();
    }

    function handleInviteUpdate(invite) {
        const currentUser = BingerState.getCurrentUser();

        if (invite && typeof invite === "object" && invite.createdBy) {
            const isSender = invite.createdBy === currentUser?.uid;

            if (isSender) {
                setupInviterUI();
            } else {
                const uid = currentUser?.uid;
                const hasAccepted = invite.acceptedInvitees && invite.acceptedInvitees[uid];

                if (hasAccepted) {
                    setupAcceptedUI();
                } else {
                    setupInviteeUI(invite);
                }
            }
        } else {
            resetWatchTogetherButton();
        }
    }

    function setupWatchTogetherButton() {
        const watchTogetherBtn = BingerOverlayDOM.getElement("watchTogetherBtn");
        if (watchTogetherBtn) {
            watchTogetherBtn.onclick = sendInvite;
        }
    }

    window.BingerInvite = {
        sendInvite,
        cancelInvite,
        acceptInvite,
        declineInvite,

        setupInviterUI,
        setupInviteeUI,
        setupAcceptedUI,
        resetWatchTogetherButton,

        handleInviteUpdate,

        setupWatchTogetherButton
    };

})();