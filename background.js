/* background.js */


try {
  console.log("[Binger] background.js starting");

  // Load Firebase SDKs from local files (CSP-safe)
  try {
    self.importScripts(
      'firebase/firebase-app.js',
      'firebase/firebase-auth.js',
      'firebase/firebase-database.js'
    );
    console.log("[Binger] Firebase SDKs loaded");
  } catch (e) {
    console.error("[Binger] importScripts failed:", e);
  }

  // Firebase config
  const firebaseConfig = {
    apiKey: "AIzaSyCOBk1uGy_Mb29zeww7KlwaTcvvfKrzKoo",
    authDomain: "binger-extension.firebaseapp.com",
    databaseURL: "https://binger-extension-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "binger-extension",
    storageBucket: "binger-extension.firebasestorage.app",
    messagingSenderId: "6476560552",
    appId: "1:6476560552:web:fc5d9801506dbef89daa9d"
  };

  // Initialize Firebase
  try {
    firebase.initializeApp(firebaseConfig);
    console.log("[Binger] Firebase initialized in background");
  } catch (e) {
    console.error("[Binger] Firebase init failed:", e);
  }

  const db = firebase.database();
  const activeInviteListeners = {}; // key: roomId, value: callback fn
  const inSessionListeners = {}; // key: roomId, value: callback
  const playerListeners = {};   // keyed by roomId  -->  unsubscribeFn
  const bufferListeners = {};
  const resetIframeListeners = {}; 


  // Automatically delete room if inactive (no users) for over 20 minutes
  setInterval(() => {
    const now = Date.now();
    const expiration = now - 20 * 60 * 1000;

    firebase.database().ref("rooms").once("value").then((snapshot) => {
        const rooms = snapshot.val();
        if (!rooms) return;

        Object.entries(rooms).forEach(([roomId, room]) => {
        const users = room.users || {};
        const lastLeft = room.lastUserLeftAt || 0;

        if (Object.keys(users).length === 0 && lastLeft < expiration) {
            firebase.database().ref(`rooms/${roomId}`).remove()
            .then(() => console.log(`[Binger] Deleted room ${roomId} due to inactivity`))
            .catch((err) => console.error(`[Binger] Failed to delete room ${roomId}`, err));
        }
        });
    });
  }, 5 * 60 * 1000); // run every 5 minutes

  function monitorPhimbroTabsContinuously() {
    chrome.tabs.query({ url: "*://phimbro.com/*" }, async (tabs) => {
        const overlayTabs = [];

        // Ask each tab if overlay is shown
        const responses = await Promise.all(tabs.map(tab => {
        return new Promise((resolve) => {
            chrome.tabs.sendMessage(tab.id, { command: "isOverlayShown" }, (res) => {
            resolve({ id: tab.id, hasOverlay: res?.overlay === true });
            });
        });
        }));

        // Filter only overlay-visible tabs
        const activeOverlayTabs = responses.filter(r => r.hasOverlay);

        if (activeOverlayTabs.length > 1) {
        activeOverlayTabs.forEach(t => {
            chrome.tabs.sendMessage(t.id, { command: "showMultiTabWarning" });
        });
        } else {
        activeOverlayTabs.forEach(t => {
            chrome.tabs.sendMessage(t.id, { command: "hideMultiTabWarning" });
        });
        }
    });
  }

  // Hook it up to tab events
  chrome.tabs.onCreated.addListener(monitorPhimbroTabsContinuously);
  chrome.tabs.onRemoved.addListener(() => setTimeout(monitorPhimbroTabsContinuously, 200));
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === "complete") {
        monitorPhimbroTabsContinuously();
    }
  });

  // Auto-delete expired invites upon checking every 5 seconds
  function startInviteExpiryCheckerForRoom(roomId) {
    console.log(`[Binger] Invite expiry checker started for room ${roomId}`);

    const intervalId = setInterval(() => {
        const inviteRef = firebase.database().ref(`rooms/${roomId}/activeInvite`);

        inviteRef.once("value").then((snapshot) => {
        const invite = snapshot.val();

        // No invite? Nothing to check
        if (!invite || !invite.expiresAt) return;

        const now = Date.now();
        if (now > invite.expiresAt) {
            // Invite expired — delete it
            inviteRef.remove()
            .then(() => console.log(`[Binger] Auto-deleted expired invite in room ${roomId}`))
            .catch((err) => console.error(`[Binger] Failed to delete expired invite in ${roomId}`, err));
        }
        }).catch((err) => {
        console.error(`[Binger] Error reading invite for room ${roomId}`, err);
        });
    }, 5000); // Check every 5 seconds
  }





  function broadcastUpdatedUserList(roomId) {
    const usersRef = firebase.database().ref(`rooms/${roomId}/users`);
    const hostRef = firebase.database().ref(`rooms/${roomId}/host`);

    Promise.all([usersRef.once("value"), hostRef.once("value")])
        .then(([userSnap, hostSnap]) => {
        const usersData = userSnap.val();
        const hostUid = hostSnap.val();

        if (!usersData) return;

        const finalDisplay = Object.entries(usersData).map(([uid, user]) => {
            const name = user.email.split("@")[0];
            return uid === hostUid ? `${name} (host)` : name;
        });

        // Send to all tabs, not just active one
        chrome.tabs.query({url: "*://phimbro.com/*"}, (tabs) => {
            tabs.forEach((tab) => {
            if (tab.id) {
                chrome.tabs.sendMessage(tab.id, {
                command: "updateUserList",
                users: finalDisplay
                });
            }
            });
        });
        });
    }



  // Track the number of active ports
  let activePorts = 0;
  
  // Handle alarm events
  chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === "binger_keepAlive") {
        // no-op; this event just wakes the worker
    }
  });

  // Handle closing tabs  
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name === "binger-connection") {
        // Register the port
        activePorts++;
        console.log(`Port connected — activePorts = ${activePorts}`);

        // On the first port, start the keep‑alive alarm
        if (activePorts === 1) {
            chrome.alarms.create("binger_keepAlive", { periodInMinutes: 1 });
            console.log("keepAlive alarm STARTED");
        }

        const tabId = port.sender.tab.id;

        console.log("[Binger] Persistent connection established with tab", tabId);

        port.onDisconnect.addListener(() => {
            // Track the removed port
            activePorts--;
            console.log(`Port disconnected — activePorts = ${activePorts}`);

            // Once all ports are gone, clear the alarm so the worker can unload
            if (activePorts === 0) {
                chrome.alarms.clear("binger_keepAlive", wasCleared => {
                if (wasCleared) {
                    console.log("keepAlive alarm CLEARED — SW can sleep now");
                }
                });
            }

            console.log("[Binger] Tab closed or reloaded — cleaning up");

            chrome.storage.local.get(
            ["bingerCurrentRoomId", "bingerSwitchingFromRoom", "bingerIsReloading"],
            (result) => {
                const roomId = result.bingerCurrentRoomId;

                // Skip cleanup if we're just reloading (only applicable to our forced reload, not clicking on the reload button of the page)
                if (result.bingerIsReloading) {

                    chrome.storage.local.remove("bingerIsReloading");
                    console.log("[Binger] Reload detected — skipping cleanup");

                    // Reset inSession flag to false
                    firebase.database().ref(`rooms/${roomId}/inSession`).set(false)
                        .then(() => console.log(`[Binger] inSession set to false on tab close`))
                        .catch((err) => console.error(`[Binger] Failed to reset inSession:`, err));
                        
                    return;
                }
                
                const switchingFromRoom = result.bingerSwitchingFromRoom;
                const user = firebase.auth().currentUser;
                if (!user) return;

                // If switching rooms → clean only OLD room, not current
                if (switchingFromRoom && switchingFromRoom !== roomId) {
                const userRef = firebase.database().ref(`rooms/${switchingFromRoom}/users/${user.uid}`);

                // Mark the leaving time of this specific user
                const leaveRef = firebase.database().ref(`rooms/${switchingFromRoom}/lastLeaves/${user.uid}`);
                leaveRef.set(Date.now()).catch(err => console.error("[Binger] leave-write error:", err));

                userRef
                    .remove()
                    .then(() => {
                        console.log(`[Binger] Removed user from OLD room ${switchingFromRoom}`);

                        // If active invite exists → delete it
                        const inviteRef = firebase.database().ref(`rooms/${switchingFromRoom}/activeInvite`);
                        inviteRef.once("value").then((snapshot) => {
                            const invite = snapshot.val();
                            if (!invite) return;

                            inviteRef.remove()
                            .then(() => {
                                console.log("[Binger] Active invite deleted due to user leaving OLD room while switching");
                            })
                            .catch((err) => {
                                console.error("[Binger] Failed to remove invite on room switch:", err);
                            });
                        });
                    
                        // Reset inSession flag to false
                        firebase.database().ref(`rooms/${switchingFromRoom}/inSession`).set(false)
                        .then(() => console.log(`[Binger] inSession set to false on tab close`))
                        .catch((err) => console.error(`[Binger] Failed to reset inSession:`, err));

                    })

                    .catch((err) =>
                    console.error("[Binger] Cleanup error (switching):", err)
                    );

                firebase
                    .database()
                    .ref(`rooms/${switchingFromRoom}/users`)
                    .once("value")
                    .then((snap) => {
                    if (!snap.exists()) {
                        firebase
                        .database()
                        .ref(`rooms/${switchingFromRoom}/lastUserLeftAt`)
                        .set(Date.now());
                    }
                    });

                chrome.storage.local.remove("bingerSwitchingFromRoom");
                return;
                }

                // Normal case: user closed tab while in room
                if (roomId) {
                const userRef = firebase.database().ref(`rooms/${roomId}/users/${user.uid}`);

                // Mark the leaving time of this specific user
                const leaveRef = firebase.database().ref(`rooms/${roomId}/lastLeaves/${user.uid}`);
                leaveRef.set(Date.now()).catch(err => console.error("[Binger] leave-write error:", err));

                userRef
                    .remove()
                    .then(() => {
                        console.log(`[Binger] Removed user from room ${roomId}`);

                        // If active invite exists → delete it
                        const inviteRef = firebase.database().ref(`rooms/${roomId}/activeInvite`);
                        inviteRef.once("value").then((snapshot) => {
                            const invite = snapshot.val();
                            if (!invite) return;

                            inviteRef.remove()
                            .then(() => {
                                console.log("[Binger] Active invite deleted due to user leaving via tab close or reload");
                            })
                            .catch((err) => {
                                console.error("[Binger] Failed to remove invite on disconnect:", err);
                            });
                        });

                        // Reset inSession flag to false
                        firebase.database().ref(`rooms/${roomId}/inSession`).set(false)
                        .then(() => console.log(`[Binger] inSession set to false on tab close`))
                        .catch((err) => console.error(`[Binger] Failed to reset inSession:`, err));

                    })

                    .catch((err) =>
                    console.error("[Binger] Cleanup error (normal):", err)
                    );

                firebase
                    .database()
                    .ref(`rooms/${roomId}/users`)
                    .once("value")
                    .then((snap) => {
                    if (!snap.exists()) {
                        firebase
                        .database()
                        .ref(`rooms/${roomId}/lastUserLeftAt`)
                        .set(Date.now());
                    }
                    });
                }
            }
            );
        });


    }
  });




  // Global tracker for active listeners
  const messageListeners = {};  // key: roomId, value: callback reference


  // Listen for messages from popup.js or main.js
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    console.log("[Binger] Message received:", msg);

    // Handle messages and forward them to the database
    if (msg.command === "post") {
        const refPath = msg.path || "messages";
        const data = msg.data || {};
        const ref = db.ref(refPath);

        // Determine whether to use `.set()` or `.push()`
        // Use `.set()` when posting to an exact user-level field (like acceptedInvitees/UID)
        const shouldUseSet =
            refPath.includes("/acceptedInvitees/") ||
            refPath.includes("/inSession");

        // Execute the appropriate Firebase write
        const write = shouldUseSet ? ref.set(data) : ref.push(data);

        write
            .then(() => {
            console.log(`[Binger] Data posted to /${refPath}`);
            sendResponse({ status: "success" });
            })
            .catch((err) => {
            console.error("[Binger] Firebase post error:", err);
            sendResponse({ status: "error", error: err.message });
            });

        return true; // Keep message channel open for async
    }



    // Handle user signup
    if (msg.command === "signup") {
    const { email, password } = msg.data || {};
    firebase.auth().createUserWithEmailAndPassword(email, password)
        .then((userCredential) => {
        console.log("[Binger] Signup success:", userCredential.user);
        sendResponse({ status: "success" });
        })
        .catch((error) => {
        console.error("[Binger] Signup error:", error);
        sendResponse({ status: "error" });
        });
    return true;
    }

    // Handle user signin
    if (msg.command === "signin") {
    const { email, password } = msg.data || {};
    firebase.auth().signInWithEmailAndPassword(email, password)
        .then((userCredential) => {
        console.log("[Binger] Signin success:", userCredential.user);
        sendResponse({ status: "success" });
        })
        .catch((error) => {
        console.error("[Binger] Signin error:", error);
        sendResponse({ status: "error" }); 
        });
    return true;
    }


    // Handle verification for whether user is signed in
    if (msg.command === "checkAuth") {
        const unsubscribe = firebase.auth().onAuthStateChanged((user) => {
        unsubscribe(); // immediately unsubscribe to avoid memory leaks
        sendResponse({ user: user ? { uid: user.uid, email: user.email } : null });
        });
        return true; // keep message channel open for async response
    }


    // Handle signing out
    if (msg.command === "signOut") {
        firebase.auth().signOut().then(() => {
            chrome.storage.local.clear(() => {
            console.log("[Binger] Signed out and cleared local storage");
            sendResponse({ status: "success" });
            });
        }).catch((error) => {
            console.error("[Binger] Signout error:", error);
            sendResponse({ status: "error", error: error.message });
        });
        return true;
    }







    // ----------------------- Mainly main.js logic here -----------------------



    // Handle creating room on Firebase
    if (msg.command === "createRoom") {
        const user = firebase.auth().currentUser;
        if (!user) {
            sendResponse({ status: "error", error: "Not signed in" });
            return true;
        }

        function generateRoomId() {
            return Math.floor(100000 + Math.random() * 900000).toString();
        }

        function tryCreateRoom(attempts = 0) {
            if (attempts > 5) {
            sendResponse({ status: "error", error: "Failed to generate unique room ID" });
            return;
            }

            const roomId = generateRoomId();
            const roomRef = firebase.database().ref(`rooms/${roomId}`);

            roomRef.once("value").then((snapshot) => {
            if (snapshot.exists()) {
                // Room ID already taken, try again
                tryCreateRoom(attempts + 1);
            } else {
                // Safe to create
                const roomData = {
                host: user.uid,
                createdAt: firebase.database.ServerValue.TIMESTAMP,
                inSession: false,
                users: {
                    [user.uid]: {
                    email: user.email,
                    joinedAt: firebase.database.ServerValue.TIMESTAMP
                    }
                }
                };

                roomRef.set(roomData)
                .then(() => {
                    console.log(`[Binger] Room ${roomId} created by ${user.email}`);
                    sendResponse({ status: "success", roomId });
                })
                .catch((err) => {
                    console.error("[Binger] Error creating room:", err);
                    sendResponse({ status: "error", error: err.message });
                });
            }
            }).catch((err) => {
            console.error("[Binger] Error checking room existence:", err);
            sendResponse({ status: "error", error: err.message });
            });
        }

        tryCreateRoom();
        return true; // keep message channel open
    }




    // Handle joining room on Firebase
    if (msg.command === "joinRoom") {
        const user = firebase.auth().currentUser;
        const roomId = msg.roomId;

        if (!user) {
            sendResponse({ status: "error", error: "Not signed in" });
            return true;
        }

        const roomRef = firebase.database().ref(`rooms/${roomId}`);

        roomRef.once("value")
            .then((snapshot) => {
            if (!snapshot.exists()) {
                sendResponse({ status: "error", error: "Room not found" });
                return;
            }

            const roomData = snapshot.val();
            const currentUsers = Object.keys(roomData.users || {});

            if (currentUsers.includes(user.uid)) {
                sendResponse({ status: "success", roomId }); // already joined
                return;
            }

            if (currentUsers.length >= 2) {
                sendResponse({ status: "error", error: "Room is full" });
                return;
            }

            const updates = {};
            updates[`users/${user.uid}`] = {
                email: user.email,
                joinedAt: firebase.database.ServerValue.TIMESTAMP
            };

            roomRef.update(updates)
                .then(() => {
                    console.log(`[Binger] User ${user.email} joined room ${roomId}`);
                    sendResponse({ status: "success", roomId });
                    // Immediately broadcast updated user list afterwards
                    broadcastUpdatedUserList(roomId);
                })
                .catch((err) => {
                    console.error("[Binger] Join room error:", err);
                    sendResponse({ status: "error", error: err.message });
                });

            })
            .catch((err) => {
            console.error("[Binger] Firebase read error:", err);
            sendResponse({ status: "error", error: err.message });
            });

        return true; // async
    }


    // subscribe to real time changes in the room on Firebase and feed back info to main.js
    if (msg.command === "subscribeToMessages") {
        const { roomId } = msg;
        const ref = firebase.database().ref(`rooms/${roomId}/messages`);

        // If there's already a listener for this room, remove it
        if (messageListeners[roomId]) {
            ref.off("child_added", messageListeners[roomId]);
            console.log(`[Binger] Removed old message listener for room ${roomId}`);
            delete messageListeners[roomId];
        }

        // Create and store the new listener callback
        const callback = (snapshot) => {
            const newMessage = snapshot.val();
            chrome.tabs.query({url: "*://phimbro.com/*"}, (tabs) => {
            tabs.forEach((tab) => {
                if (tab.id) {
                chrome.tabs.sendMessage(tab.id, {
                    command: "newChatMessage",
                    message: newMessage
                });
                }
            });
            });
        };

        ref.on("child_added", callback);
        messageListeners[roomId] = callback;

        console.log(`[Binger] Subscribed to messages in room ${roomId}`);
        sendResponse({ status: "subscribed" });
        return true;
    }

    // Unsubscribe fromt the messages (OPTIONAL AND UNUSED ANYWHERE FOR NOW)
    if (msg.command === "unsubscribeFromMessages") {
        const { roomId } = msg;
        if (messageListeners[roomId]) {
            firebase.database().ref(`rooms/${roomId}/messages`).off("child_added", messageListeners[roomId]);
            delete messageListeners[roomId];
            console.log(`[Binger] Unsubscribed from messages in room ${roomId}`);
        }
        sendResponse({ status: "unsubscribed" });
        return true;
    }





    // subscribe to real time changes in the room on Firebase and feed back info to main.js
    if (msg.command === "subscribeToUsers") {
        const { roomId } = msg;

        const roomUsersRef = firebase.database().ref(`rooms/${roomId}/users`);

        roomUsersRef.on("value", (snapshot) => {
            const usersData = snapshot.val();
            if (!usersData) return;

            const formattedUsers = Object.values(usersData).map((user) => {
            const name = user.email.split("@")[0];
            return name;
            });

            firebase.database().ref(`rooms/${roomId}/host`).once("value").then((hostSnap) => {
                const hostUid = hostSnap.val();
                const finalDisplay = Object.entries(usersData).map(([uid, user]) => {
                    const name = user.email.split("@")[0];
                    return uid === hostUid ? `${name} (host)` : name;
                });

                chrome.tabs.query({url: "*://phimbro.com/*"}, (tabs) => {
                    tabs.forEach((tab) => {
                        if (tab.id) {
                        chrome.tabs.sendMessage(tab.id, {
                            command: "updateUserList",
                            users: finalDisplay
                        });
                        }
                    });
                });

            });
        });

        sendResponse({ status: "subscribed" });
        return true;
    }

    // Handle unsubscribing from room users
    if (msg.command === "unsubscribeFromUsers") {
        const { roomId } = msg;
        const roomUsersRef = firebase.database().ref(`rooms/${roomId}/users`);
        roomUsersRef.off(); // Turn off all 'value' listeners
        console.log(`[Binger] Unsubscribed from users in room ${roomId}`);
        sendResponse({ status: "unsubscribed" });
        return true;
    }



    // Handle leaving the room
    if (msg.command === "leaveRoom") {
        const user = firebase.auth().currentUser;
        const { roomId } = msg;

        if (!user) {
            sendResponse({ status: "error", error: "Not signed in" });
            return true;
        }

        const userRef = firebase.database().ref(`rooms/${roomId}/users/${user.uid}`);
        userRef.remove()
            .then(() => {
                console.log(`[Binger] User ${user.email} left room ${roomId}`);
                
                // Delete the active invite
                const inviteRef = firebase.database().ref(`rooms/${roomId}/activeInvite`);
                inviteRef.once("value").then((snapshot) => {
                    const invite = snapshot.val();
                    if (!invite) return; // No invite, nothing to delete

                    // If ANYONE leaves while an invite exists → delete it
                    inviteRef.remove()
                        .then(() => {
                        console.log("[Binger] Active invite deleted because someone left the room");
                        })
                        .catch((err) => {
                        console.error("[Binger] Failed to delete active invite on leave:", err);
                        });
                });

                // Reset inSession flag to false
                firebase.database().ref(`rooms/${roomId}/inSession`).set(false)
                    .then(() => console.log(`[Binger] inSession set to false on tab close`))
                    .catch((err) => console.error(`[Binger] Failed to reset inSession:`, err));


                // Record personal leave time on manual leave
                firebase.database().ref(`rooms/${roomId}/lastLeaves/${user.uid}`).set(Date.now()).catch(err => console.error("[Binger] leave-write error:", err));

                const usersRef = firebase.database().ref(`rooms/${roomId}/users`);
                usersRef.once("value").then((snap) => {
                if (!snap.exists()) {
                    firebase.database().ref(`rooms/${roomId}/lastUserLeftAt`).set(Date.now());
                }
                });
                sendResponse({ status: "success" });
                broadcastUpdatedUserList(roomId);
            })

            .catch((err) => {
                console.error("[Binger] Leave room error:", err);
                sendResponse({ status: "error", error: err.message });
            });

        return true;
    }



    // Auto rejoin for users recently kicked out of a room
    if (msg.command === "rejoinIfRecentlyKicked") {
        const user = firebase.auth().currentUser;
        const { roomId } = msg;

        if (!user) {
            sendResponse({ status: "error", error: "Not signed in" });
            return true;
        }

        const roomRef = firebase.database().ref(`rooms/${roomId}`);

        roomRef.once("value")
            .then((snapshot) => {
            if (!snapshot.exists()) {
                sendResponse({ status: "error", error: "Room not found" });
                return;
            }

            const roomData = snapshot.val();
            const userInRoom = roomData.users?.[user.uid];
            const lastLeave = roomData.lastLeaves?.[user.uid] || 0;

            const now = Date.now();
            const oneMinuteAgo = now - 60 * 1000;

            if (userInRoom) {
                // User still in room
                sendResponse({ status: "rejoined" });
            } else if (lastLeave >= oneMinuteAgo) {
                // Was recently in room --> Re-add
                const updates = {};
                updates[`users/${user.uid}`] = {
                email: user.email,
                joinedAt: firebase.database.ServerValue.TIMESTAMP
                };

                roomRef.update(updates)
                .then(() => {
                    console.log(`[Binger] Re-added user ${user.email} to room ${roomId} after reload`);
                    sendResponse({ status: "rejoined" });
                })
                .catch((err) => {
                    console.error("[Binger] Rejoin update error:", err);
                    sendResponse({ status: "error", error: err.message });
                });
            } else {
                // Too late — no rejoin
                sendResponse({ status: "stale" });
            }
            })
            .catch((err) => {
            console.error("[Binger] Firebase error on rejoin check:", err);
            sendResponse({ status: "error", error: err.message });
            });

        return true; // async
    }


    if (msg.command === "refreshUserList" && msg.roomId) {
        // re-broadcast to every tab in this room
        broadcastUpdatedUserList(msg.roomId);
        // no need to sendResponse
    }


    // Handle the invite sent by user clicking on the Binge button
    if (msg.command === "sendInviteAndBroadcast") {
        const { roomId, inviteData, chatMessage } = msg;
        const now = Date.now();
        const expiresInMs = 120000; // 2 minutes until it expires
        inviteData.createdAt = now;
        inviteData.expiresAt = now + expiresInMs;

        const invitePath = `rooms/${roomId}/activeInvite`;
        const chatPath = `rooms/${roomId}/messages`;

        // Store the invite data
        firebase.database().ref(invitePath).set(inviteData)
            .then(() => {
            console.log(`[Binger] Stored active invite in ${invitePath}`);
            startInviteExpiryCheckerForRoom(roomId);

            // Push the chat message
            return firebase.database().ref(chatPath).push(chatMessage);
            })
            .then(() => {
            console.log("[Binger] Invite message pushed to chat");
            sendResponse({ status: "success" });
            })
            .catch((err) => {
            console.error("[Binger] Failed to handle invite broadcast:", err);
            sendResponse({ status: "error", error: err.message });
            });

        return true;
    }


    if (msg.command === "subscribeToActiveInvite") {
        const { roomId } = msg;
        const ref = firebase.database().ref(`rooms/${roomId}/activeInvite`);

        // If already listening, detach previous listener
        if (activeInviteListeners[roomId]) {
            ref.off("value", activeInviteListeners[roomId]);
            console.log(`[Binger] Removed duplicate listener for activeInvite in room ${roomId}`);
        }

        // Define and store new callback
        const callback = (snapshot) => {
            const invite = snapshot.val();

            chrome.tabs.query({url: "*://phimbro.com/*"}, (tabs) => {
                tabs.forEach((tab) => {
                    if (tab.id) {
                        chrome.tabs.sendMessage(tab.id, {
                            command: "activeInviteUpdated",
                            invite,
                        });
                    }
                });
            });


            // After broadcasting invite info, check if everyone has accepted
            if (invite && invite.acceptedInvitees && invite.createdBy) {
                const accepted = invite.acceptedInvitees;
                const acceptedUserIds = Object.keys(accepted).filter(uid => accepted[uid] === true);

                // Load current room users (excluding inviter)
                firebase.database().ref(`rooms/${roomId}/users`).once("value").then((snapshot) => {
                    const usersInRoom = snapshot.val() || {};
                    const userIdsInRoom = Object.keys(usersInRoom).filter(uid => uid !== invite.createdBy);

                    console.log("AcceptedInvitees:", acceptedUserIds);
                    console.log("Users in room (excluding inviter):", userIdsInRoom);

                    const allAccepted = userIdsInRoom.every(uid => acceptedUserIds.includes(uid));

                        if (allAccepted && userIdsInRoom.length > 0) {
                        console.log("[Binger] All invitees accepted — starting session");

                        // Clean up the active invite
                        firebase.database().ref(`rooms/${roomId}/activeInvite`).remove().then(() => {
                            console.log("[Binger] Deleted active invite after full acceptance");

                            // Broadcast to all tabs that session is starting
                            chrome.tabs.query({url: "*://phimbro.com/*"}, (tabs) => {
                                tabs.forEach((tab) => {
                                    if (tab.id) {
                                    chrome.tabs.sendMessage(tab.id, {
                                        command: "startSession",
                                        movieUrl: invite.movieUrl
                                    });
                                    }
                                });
                            });
                        });
                        }
                });
            }            


        };

        ref.on("value", callback);
        activeInviteListeners[roomId] = callback;

        console.log(`[Binger] Subscribed to activeInvite in room ${roomId}`); 
        return true;
    }

    // Delete the current invite in Firebase
    if (msg.command === "cancelActiveInvite") {
        console.log("[Binger] Cancel Invite clicked");
        const { roomId } = msg;
        const inviteRef = firebase.database().ref(`rooms/${roomId}/activeInvite`);

        inviteRef.remove()
            .then(() => {
            console.log("[Binger] Active invite cancelled by sender");
            sendResponse({ status: "success" });
            })
            .catch((error) => {
            console.error("[Binger] Failed to cancel invite:", error);
            sendResponse({ status: "error", error: error.msg });
            });

        return true; // IMPORTANT: keep async sendResponse alive
    }

    if (msg.command === "startInSessionListener") {
        const { roomId } = msg;
        const ref = firebase.database().ref(`rooms/${roomId}/inSession`);

        // Detach old one if it exists
        if (inSessionListeners[roomId]) {
            ref.off("value", inSessionListeners[roomId]);
            console.log(`[Binger] Replacing existing inSession listener for room ${roomId}`);
        }

        const callback = (snapshot) => {
            const isInSession = snapshot.val();
            console.log(`[Binger] inSession changed: ${isInSession} for room ${roomId}`);

            // Broadcast update to all tabs
            chrome.tabs.query({url: "*://phimbro.com/*"}, (tabs) => {
                tabs.forEach((tab) => {
                    if (tab.id) {
                    chrome.tabs.sendMessage(tab.id, {
                        command: "inSessionUpdated",
                        isInSession,
                    });
                    }
                });
            });
        };

        ref.on("value", callback);
        inSessionListeners[roomId] = callback;

        console.log(`[Binger] Started inSession listener for room ${roomId}`);

        // Send back response to acknowledge
        sendResponse({ status: "attached" });
        return true; // Important: keep sendResponse alive
    }

    // Whenever a user is ready (navigated successfully to movie link), recheck the whole room to see if everyone's ready and set room's inSession to true if so
    if (msg.command === "userReady") {
        const { roomId } = msg;
        const userId = firebase.auth().currentUser?.uid;
        if (!roomId || !userId) return;

        // Mark this user as ready in Firebase
        const readyRef = firebase.database().ref(`rooms/${roomId}/readyUsers/${userId}`);
        readyRef.set(true).then(() => {
            console.log(`[Binger] ${userId} marked as ready`);

            // Check if all users are ready
            Promise.all([
            firebase.database().ref(`rooms/${roomId}/users`).once("value"),
            firebase.database().ref(`rooms/${roomId}/readyUsers`).once("value"),
            ]).then(([usersSnap, readySnap]) => {
            const users = usersSnap.val() || {};
            const readyUsers = readySnap.val() || {};

            const allUserIds = Object.keys(users);
            const readyUserIds = Object.keys(readyUsers);

            const allReady = allUserIds.every(uid => readyUserIds.includes(uid));

            if (allReady && allUserIds.length > 0) {
                console.log(`[Binger] All users are ready — setting inSession`);

                // Set inSession = true
                firebase.database().ref(`rooms/${roomId}/inSession`).set(true).then(() => {
                // Clean up readyUsers list
                firebase.database().ref(`rooms/${roomId}/readyUsers`).remove();
                console.log(`[Binger] 🧹 Cleaned up readyUsers`);
                });
            }
            });
        });

        sendResponse({ status: "ready acknowledged" });
        return true; // Needed for async sendResponse
    }







    /***************  WRITE from content-script  ******************/
    if (msg.command === "syncPlayerState") {
        const { roomId, action, time } = msg;
        firebase.database()
        .ref(`rooms/${roomId}/playerState`)
        .set({ action, time });
    }

    /***************  START firebase LISTENER  ********************/
    if (msg.command === "startPlayerListener") {
        const { roomId } = msg;
        
        // Always clear previous listener if exists
        if (playerListeners[roomId]) {
            playerListeners[roomId]();              
            delete playerListeners[roomId];
        }

        const ref = firebase.database().ref(`rooms/${roomId}/playerState`);
        const onPlayerStateChange = (snap) => {
            const data = snap.val();
            if (!data) return;

            // Relay to all tabs in that room
            chrome.tabs.query({ url: "*://phimbro.com/*" }, (tabs) => {
                tabs.forEach((tab) => {
                    chrome.tabs.sendMessage(tab.id, {
                        command: "playerStateUpdated",
                        roomId,
                        data
                    });
                });
            });
        };

        ref.on("value", onPlayerStateChange);
        playerListeners[roomId] = () => ref.off("value", onPlayerStateChange);
        sendResponse({ status: "listening" });
        return true;
    }

    /***************  STOP firebase LISTENER  *********************/
    if (msg.command === "stopPlayerListener") {
        const { roomId } = msg;
        if (playerListeners[roomId]) {
            playerListeners[roomId](); 
            delete playerListeners[roomId];
        }
        sendResponse({ status: "playerState listener removed" });
        return true;
    }




    // Handle buffer reports
    if (msg.command === "reportBufferStatus") {
        const { roomId, userId, status } = msg;
        firebase.database()
            .ref(`rooms/${roomId}/bufferStatus/${userId}`)
            .set(status)
            .then(() => console.log(`[Binger] Buffer status for ${userId} = ${status}`))
            .catch(err => console.error("[Binger] Failed to update bufferStatus", err));
    }

    // Buffer status listener
    if (msg.command === "startBufferStatusListener") {
        const { roomId } = msg;

        // Always destroy any prior listener for this room
        if (bufferListeners[roomId]) {
        bufferListeners[roomId]();
        delete bufferListeners[roomId];
        }

        const ref = firebase.database().ref(`rooms/${roomId}/bufferStatus`);

        let resumeTimeout = null; // Delay before sending "resumePlay"

        const unsub = ref.on("value", (snap) => {
            const data = snap.val();
            if (!data) return;

            const allReady = Object.values(data).every(status => status === "ready");
            console.log("[Binger] 🔍 Buffer status update:", data, "→ allReady =", allReady);

            if (allReady) {
                // Wait 300ms before sending resumePlay
                if (!resumeTimeout) {
                    resumeTimeout = setTimeout(() => {
                        chrome.tabs.query({url: "*://phimbro.com/*"}, (tabs) => {
                            tabs.forEach(tab => {
                                chrome.tabs.sendMessage(tab.id, {
                                    command: "resumePlay",
                                    roomId
                                });
                            });
                        });
                        resumeTimeout = null;
                    }, 300);
                }
            } else {
                // If even one person is not ready, cancel the pending resumePlay
                if (resumeTimeout) {
                    clearTimeout(resumeTimeout);
                    resumeTimeout = null;
                }

                chrome.tabs.query({url: "*://phimbro.com/*"}, (tabs) => {
                    tabs.forEach(tab => {
                        chrome.tabs.sendMessage(tab.id, {
                            command: "blockPlay",
                            roomId
                        });
                    });
                });
            }
        });

        // attach new listener
        ref.on("value", onValue);

        bufferListeners[roomId] = () => {
            ref.off("value", unsub);
            if (resumeTimeout) {
                clearTimeout(resumeTimeout);
                resumeTimeout = null;
            }
        };

        sendResponse({ status: "bufferStatus listener attached" });
        return true;
    }

    // Remove the buffer status listener
    if (msg.command === "stopBufferStatusListener") {
        // Clean up on demand
        if (bufferListeners[roomId]) {
            bufferListeners[roomId]();
            delete bufferListeners[roomId];
        }
        sendResponse({ status: "bufferStatus listener removed" });
        return true;
    }

    // Broadcasting call to reset iframes
    if (msg.command === "broadcastCallReset") {
        const { roomId } = msg;
        const user = firebase.auth().currentUser;
        if (!user) return true;

        const flagRef = firebase.database().ref(`rooms/${roomId}/resetIframeFlag`);
        flagRef.set({
            by: user.uid,
            at: Date.now()
        }).then(() => {
            console.log(`[Binger] Set resetIframeFlag for room ${roomId}`);
        }).catch(err => {
            console.error("[Binger] Failed to write resetIframeFlag:", err);
        });

        return true;
    }

    // Listen to call and detect if current user set the flag. If not, then reset iframe
    if (msg.command === "startResetIframeListener") {
        const { roomId } = msg;
        const user = firebase.auth().currentUser;
        if (!user) {
            sendResponse({ status: "error", error: "not signed in" });
            return true;
        }

        // Always destroy any prior listener
        if (resetIframeListeners[roomId]) {
            resetIframeListeners[roomId]();
            delete resetIframeListeners[roomId];
        }

        const ref = firebase.database().ref(`rooms/${roomId}/resetIframeFlag`);
        const cb = (snap) => {
            const data = snap.val();
            if (!data) return;

            const senderUid = data.by;
            if (senderUid === user.uid) {
            console.log("[Binger] Ignoring self-triggered resetIframeFlag");
            return;
            }

            console.log("[Binger] Detected external resetIframeFlag — triggering local reset");

            // Dispatch to local content script
            chrome.tabs.query({ url: "*://phimbro.com/*" }, (tabs) => {
            tabs.forEach((tab) => {
                chrome.tabs.sendMessage(tab.id, {
                command: "resetCallIframe",
                roomId,
                });
            });
            });

            // Cleanup the flag
            ref.remove().then(() => {
            console.log("[Binger] resetIframeFlag removed after broadcast");
            });
        };

        ref.on("value", cb);
        resetIframeListeners[roomId] = () => ref.off("value", cb);
        sendResponse({ status: "attached" });
        return true;
    }

    // Stop the listener for Iframe Reset
    if (msg.command === "stopResetIframeListener") {
        const { roomId } = msg;
        if (resetIframeListeners[roomId]) {
            resetIframeListeners[roomId]();
            delete resetIframeListeners[roomId];
            console.log(`[Binger] resetIframeListener detached for room ${roomId}`);
        }
        sendResponse({ status: "detached" });
        return true;
    }

    // Placeholder for other command handlers

  });

} catch (err) {
  console.error("[Binger] Fatal error in background.js:", err);
}
