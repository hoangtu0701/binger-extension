// ============================================================================
// STATE MODULE
// Centralized state management for Binger content scripts
// ============================================================================

(function() {
    "use strict";

    // Private state object
    const state = {
        currentUser: null,
        currentUsersInRoom: [],
        isChatSubscribed: false,
        isThemeSubscribed: false,
        progressBar: null
    };

    // ========================================================================
    // GETTERS
    // ========================================================================

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

    function getProgressBar() {
        return state.progressBar;
    }

    // ========================================================================
    // SETTERS
    // ========================================================================

    function setCurrentUser(user) {
        state.currentUser = user;
    }

    function setCurrentUsersInRoom(users) {
        state.currentUsersInRoom = users;
    }

    function setIsChatSubscribed(value) {
        state.isChatSubscribed = value;
    }

    function setIsThemeSubscribed(value) {
        state.isThemeSubscribed = value;
    }

    function setProgressBar(element) {
        state.progressBar = element;
    }

    // ========================================================================
    // UTILITIES
    // ========================================================================

    /**
     * Reset all state to initial values
     * Used when signing out or cleaning up
     */
    function resetState() {
        state.currentUser = null;
        state.currentUsersInRoom = [];
        state.isChatSubscribed = false;
        state.isThemeSubscribed = false;
        state.progressBar = null;
    }

    /**
     * Get the current user's UID
     * @returns {string|null} The UID or null if not signed in
     */
    function getCurrentUserUid() {
        return state.currentUser?.uid || null;
    }

    /**
     * Get the current user's username (from email)
     * @returns {string|null} The username or null if not signed in
     */
    function getCurrentUsername() {
        if (!state.currentUser?.email) return null;
        return state.currentUser.email.split("@")[0];
    }

    /**
     * Check if user is signed in
     * @returns {boolean}
     */
    function isSignedIn() {
        return state.currentUser !== null;
    }

    /**
     * Check if there are enough users for watch together
     * @returns {boolean}
     */
    function hasEnoughUsers() {
        return state.currentUsersInRoom.length >= 2;
    }

    // ========================================================================
    // EXPOSE TO WINDOW
    // ========================================================================

    window.BingerState = {
        // Getters
        getCurrentUser,
        getCurrentUsersInRoom,
        getIsChatSubscribed,
        getIsThemeSubscribed,
        getProgressBar,

        // Setters
        setCurrentUser,
        setCurrentUsersInRoom,
        setIsChatSubscribed,
        setIsThemeSubscribed,
        setProgressBar,

        // Utilities
        resetState,
        getCurrentUserUid,
        getCurrentUsername,
        isSignedIn,
        hasEnoughUsers
    };

})();