(function() {
    "use strict";

    const state = {
        currentUser: null,
        currentUsersInRoom: [],
        isChatSubscribed: false,
        isThemeSubscribed: false,
        isBotMode: false,
        progressBar: null
    };

    function getCurrentUser() {
        return state.currentUser;
    }

    function getCurrentUsersInRoom() {
        return state.currentUsersInRoom;
    }

    function getIsChatSubscribed() {
        return state.isChatSubscribed;
    }

    function getIsThemeSubscribed() {
        return state.isThemeSubscribed;
    }

    function getIsBotMode() {
        return state.isBotMode;
    }

    function getProgressBar() {
        if (state.progressBar && !document.contains(state.progressBar)) {
            state.progressBar = null;
        }
        return state.progressBar;
    }

    function setCurrentUser(user) {
        if (user !== null && (typeof user !== "object" || !user.uid)) {
            console.warn("[Binger] setCurrentUser called with invalid user object");
            return;
        }
        state.currentUser = user;
    }

    function setCurrentUsersInRoom(users) {
        state.currentUsersInRoom = Array.isArray(users) ? users : [];
    }

    function setIsChatSubscribed(value) {
        state.isChatSubscribed = Boolean(value);
    }

    function setIsThemeSubscribed(value) {
        state.isThemeSubscribed = Boolean(value);
    }

    function setIsBotMode(value) {
        state.isBotMode = Boolean(value);
    }

    function setProgressBar(element) {
        if (element !== null && !(element instanceof HTMLElement)) {
            console.warn("[Binger] setProgressBar called with non-element");
            return;
        }
        state.progressBar = element;
    }

    function resetState() {
        state.currentUser = null;
        state.currentUsersInRoom = [];
        state.isChatSubscribed = false;
        state.isThemeSubscribed = false;
        state.isBotMode = false;
        state.progressBar = null;
    }

    function getCurrentUserUid() {
        return state.currentUser?.uid || null;
    }

    function getCurrentUsername() {
        if (!state.currentUser?.email) return null;
        return state.currentUser.email.split("@")[0];
    }

    function isSignedIn() {
        return state.currentUser !== null;
    }

    function hasEnoughUsers() {
        if (!Array.isArray(state.currentUsersInRoom)) {
            return false;
        }
        return state.currentUsersInRoom.length >= 2;
    }

    window.BingerState = {
        getCurrentUser,
        getCurrentUsersInRoom,
        getIsChatSubscribed,
        getIsThemeSubscribed,
        getIsBotMode,
        getProgressBar,

        setCurrentUser,
        setCurrentUsersInRoom,
        setIsChatSubscribed,
        setIsThemeSubscribed,
        setIsBotMode,
        setProgressBar,

        resetState,
        getCurrentUserUid,
        getCurrentUsername,
        isSignedIn,
        hasEnoughUsers
    };

})();