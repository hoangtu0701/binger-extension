// ============================================================================
// STATE MODULE
// Centralized state management for Binger content scripts
// ============================================================================

(function() {
    "use strict";

    // ========================================================================
    // PRIVATE STATE
    // ========================================================================

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

    /**
     * Get the current user object
     * @returns {object|null} User object with uid and email, or null
     */
    function getCurrentUser() {
        return state.currentUser;
    }

    /**
     * Get the list of users currently in the room
     * @returns {Array} Array of user display strings
     */
    function getCurrentUsersInRoom() {
        return state.currentUsersInRoom;
    }

    /**
     * Check if chat messages are currently subscribed
     * @returns {boolean}
     */
    function getIsChatSubscribed() {
        return state.isChatSubscribed;
    }

    /**
     * Check if theme changes are currently subscribed
     * @returns {boolean}
     */
    function getIsThemeSubscribed() {
        return state.isThemeSubscribed;
    }

    /**
     * Get the progress bar element reference
     * Clears stale references if element is no longer in DOM
     * @returns {HTMLElement|null}
     */
    function getProgressBar() {
        // Clear stale reference if element was removed from DOM
        if (state.progressBar && !document.contains(state.progressBar)) {
            state.progressBar = null;
        }
        return state.progressBar;
    }

    // ========================================================================
    // SETTERS
    // ========================================================================

    /**
     * Set the current user object
     * @param {object|null} user - User object with uid and email, or null
     */
    function setCurrentUser(user) {
        // Allow null or object with uid
        if (user !== null && (typeof user !== "object" || !user.uid)) {
            console.warn("[Binger] setCurrentUser called with invalid user object");
            return;
        }
        state.currentUser = user;
    }

    /**
     * Set the list of users in the room
     * @param {Array} users - Array of user display strings
     */
    function setCurrentUsersInRoom(users) {
        // Ensure we always have an array
        state.currentUsersInRoom = Array.isArray(users) ? users : [];
    }

    /**
     * Set chat subscription status
     * @param {boolean} value - Whether chat is subscribed
     */
    function setIsChatSubscribed(value) {
        state.isChatSubscribed = Boolean(value);
    }

    /**
     * Set theme subscription status
     * @param {boolean} value - Whether theme is subscribed
     */
    function setIsThemeSubscribed(value) {
        state.isThemeSubscribed = Boolean(value);
    }

    /**
     * Set the progress bar element reference
     * @param {HTMLElement|null} element - The progress bar element
     */
    function setProgressBar(element) {
        // Allow null or HTMLElement
        if (element !== null && !(element instanceof HTMLElement)) {
            console.warn("[Binger] setProgressBar called with non-element");
            return;
        }
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
     * Check if there are enough users for watch together (2+ users)
     * @returns {boolean}
     */
    function hasEnoughUsers() {
        // Defensive check in case state was corrupted
        if (!Array.isArray(state.currentUsersInRoom)) {
            return false;
        }
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