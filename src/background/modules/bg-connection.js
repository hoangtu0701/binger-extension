(function() {
    "use strict";

    const KEEP_ALIVE_ALARM = "binger_keepAlive";
    const KEEP_ALIVE_INTERVAL_MINUTES = 0.33;
    const INVITE_DELETION_DELAY_MS = 1500;

    function validateDependencies() {
        const required = ["BingerBGState", "BingerBGFirebase", "BingerBGHelpers"];
        const missing = required.filter(dep => typeof self[dep] === "undefined");

        if (missing.length > 0) {
            console.error("[Binger] bg-connection missing dependencies:", missing.join(", "));
            return false;
        }
        return true;
    }

    function initAlarmListener() {
        chrome.alarms.onAlarm.addListener((alarm) => {
            if (alarm.name === KEEP_ALIVE_ALARM) {
            }
        });
    }

    function startKeepAliveAlarm() {
        chrome.alarms.create(KEEP_ALIVE_ALARM, { periodInMinutes: KEEP_ALIVE_INTERVAL_MINUTES });
    }

    function stopKeepAliveAlarm() {
        chrome.alarms.clear(KEEP_ALIVE_ALARM, (wasCleared) => {
            if (chrome.runtime.lastError) {
                console.warn("[Binger] Error clearing alarm:", chrome.runtime.lastError.message);
            }
        });
    }

    function initConnectionListener() {
        chrome.runtime.onConnect.addListener((port) => {
            if (port.name !== "binger-connection") return;

            if (!validateDependencies()) return;

            const portCount = BingerBGState.incrementActivePorts();

            if (portCount === 1) {
                startKeepAliveAlarm();
            }

            port.onDisconnect.addListener(() => {
                handlePortDisconnect();
            });
        });
    }

    function handlePortDisconnect() {
        if (!validateDependencies()) return;

        const portCount = BingerBGState.decrementActivePorts();

        if (portCount === 0) {
            stopKeepAliveAlarm();
        }

        chrome.storage.local.get(
            ["bingerCurrentRoomId", "bingerSwitchingFromRoom", "bingerIsReloading"],
            (result) => {
                if (chrome.runtime.lastError) {
                    console.error("[Binger] Storage error during cleanup:", chrome.runtime.lastError.message);
                    return;
                }

                const roomId = result.bingerCurrentRoomId;
                const remainingPorts = BingerBGState.getActivePorts();

                if (remainingPorts === 0) {
                    BingerBGHelpers.unsubscribeFromTyping(roomId);
                }

                if (result.bingerIsReloading) {
                    chrome.storage.local.remove("bingerIsReloading", () => {
                        if (chrome.runtime.lastError) {
                            console.warn("[Binger] Error removing reload flag:", chrome.runtime.lastError.message);
                        }
                    });

                    if (roomId && typeof roomId === "string") {
                        BingerBGFirebase.ref(`rooms/${roomId}/inSession`).set(false)
                            .catch((err) => console.error("[Binger] Failed to reset inSession:", err));
                    }

                    return;
                }

                const switchingFromRoom = result.bingerSwitchingFromRoom;
                const user = BingerBGFirebase.getCurrentUser();
                if (!user) return;

                if (switchingFromRoom && switchingFromRoom !== roomId) {
                    cleanupRoom(switchingFromRoom, user, true);
                    chrome.storage.local.remove("bingerSwitchingFromRoom", () => {
                        if (chrome.runtime.lastError) {
                            console.warn("[Binger] Error removing switching flag:", chrome.runtime.lastError.message);
                        }
                    });
                    return;
                }

                if (roomId && typeof roomId === "string") {
                    cleanupRoom(roomId, user, false);
                }
            }
        );
    }

    function cleanupRoom(roomId, user, isSwitching) {
        if (!roomId || typeof roomId !== "string") return;
        if (!user || !user.uid) return;

        const userRef = BingerBGFirebase.ref(`rooms/${roomId}/users/${user.uid}`);
        const leaveRef = BingerBGFirebase.ref(`rooms/${roomId}/lastLeaves/${user.uid}`);
        const typingRef = BingerBGFirebase.ref(`rooms/${roomId}/typing/${user.uid}`);
        const sessionRef = BingerBGFirebase.ref(`rooms/${roomId}/inSession`);

        leaveRef.set(Date.now())
            .catch((err) => console.error("[Binger] Failed to write leave timestamp:", err));

        typingRef.remove()
            .catch((err) => console.warn("[Binger] Failed to remove typing status:", err));

        BingerBGHelpers.unsubscribeFromTyping(roomId);

        userRef.remove()
            .then(() => {
                handleInviteDeletion(roomId, isSwitching);

                sessionRef.set(false)
                    .catch((err) => console.error("[Binger] Failed to reset inSession:", err));
            })
            .catch((err) => {
                console.error("[Binger] Cleanup error:", err);
            });

        BingerBGFirebase.ref(`rooms/${roomId}/users`).once("value")
            .then((snap) => {
                if (!snap.exists()) {
                    BingerBGFirebase.ref(`rooms/${roomId}`).remove()
                        .catch((err) => console.warn("[Binger] Failed to delete empty room:", err));
                }
            })
            .catch((err) => console.warn("[Binger] Failed to check room users:", err));
    }

    function handleInviteDeletion(roomId, immediate) {
        if (!roomId || typeof roomId !== "string") return;

        const inviteRef = BingerBGFirebase.ref(`rooms/${roomId}/activeInvite`);

        inviteRef.once("value")
            .then((snapshot) => {
                const invite = snapshot.val();
                if (!invite) return;

                if (immediate) {
                    inviteRef.remove()
                        .catch((err) => console.error("[Binger] Failed to remove invite on room switch:", err));
                } else {
                    setTimeout(() => {
                        checkAndDeleteInvite(roomId, inviteRef);
                    }, INVITE_DELETION_DELAY_MS);
                }
            })
            .catch((err) => {
                console.error("[Binger] Failed to check active invite:", err);
            });
    }

    function checkAndDeleteInvite(roomId, inviteRef) {
        BingerBGFirebase.ref(`rooms/${roomId}/users`).once("value")
            .then((userSnap) => {
                const users = userSnap.val();
                const numUsers = users ? Object.keys(users).length : 0;

                if (numUsers < 2) {
                    inviteRef.remove()
                        .catch((err) => console.error("[Binger] Failed to remove invite after delay:", err));
                }
            })
            .catch((err) => {
                console.error("[Binger] Failed to check user count for invite deletion:", err);
            });
    }

    function init() {
        initAlarmListener();
        initConnectionListener();
    }

    self.BingerBGConnection = {
        init
    };

})();