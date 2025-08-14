// Shadow Pig Game API Interface
// Handles all backend communication for the shadow pig game

window.PigAPI = (function() {
    'use strict';
    
    const API_BASE = '/api/shadow';
    let csrfToken = null;
    
    // Get CSRF token for authenticated requests
    async function getCSRFToken() {
        if (!csrfToken) {
            try {
                const response = await fetch('/api/csrf-token');
                if (response.ok) {
                    const data = await response.json();
                    csrfToken = data.csrfToken;
                }
            } catch (error) {
                console.warn('Failed to get CSRF token:', error);
            }
        }
        return csrfToken;
    }
    
    // Check if user is authenticated
    async function checkAuth() {
        try {
            const response = await fetch('/api/user');
            return response.ok;
        } catch (error) {
            return false;
        }
    }
    
    // Get user's shadow game status (hearts, steps, etc.)
    async function getShadowStatus() {
        try {
            const response = await fetch(`${API_BASE}/status`);
            if (response.ok) {
                return await response.json();
            } else if (response.status === 404) {
                // Shadow API not implemented yet, use localStorage
                console.log('Shadow API not available, using local storage');
                return null;
            }
        } catch (error) {
            console.warn('Failed to get shadow status:', error);
        }
        return null;
    }
    
    // Submit game session results
    async function submitGameSession(sessionData) {
        try {
            const token = await getCSRFToken();
            const response = await fetch(`${API_BASE}/play-session`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    ...sessionData,
                    csrfToken: token
                })
            });
            
            if (response.ok) {
                return await response.json();
            } else if (response.status === 404) {
                // Shadow API not implemented yet
                console.log('Shadow API not available, storing locally');
                return null;
            } else {
                const error = await response.json();
                throw new Error(error.message || 'Failed to submit session');
            }
        } catch (error) {
            console.warn('Failed to submit game session:', error);
            return null;
        }
    }
    
    // Get shadow leaderboard
    async function getShadowLeaderboard() {
        try {
            const response = await fetch(`${API_BASE}/leaderboard`);
            if (response.ok) {
                return await response.json();
            } else if (response.status === 404) {
                // Shadow API not implemented yet
                console.log('Shadow leaderboard not available');
                return null;
            }
        } catch (error) {
            console.warn('Failed to get shadow leaderboard:', error);
        }
        return null;
    }
    
    // Mark shadow mode as discovered for user
    async function markShadowDiscovered() {
        try {
            const token = await getCSRFToken();
            const response = await fetch(`${API_BASE}/discover`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    csrfToken: token
                })
            });
            
            return response.ok;
        } catch (error) {
            console.warn('Failed to mark shadow discovered:', error);
            return false;
        }
    }
    
    // Get user's shadow statistics
    async function getShadowStats() {
        try {
            const response = await fetch(`${API_BASE}/my-stats`);
            if (response.ok) {
                return await response.json();
            }
        } catch (error) {
            console.warn('Failed to get shadow stats:', error);
        }
        return null;
    }
    
    // Get current heart status from server
    async function getHeartStatus() {
        try {
            const response = await fetch(`${API_BASE}/hearts`);
            if (response.ok) {
                return await response.json();
            } else if (response.status === 404) {
                console.log('Server-side hearts not available, using localStorage');
                return null;
            }
        } catch (error) {
            console.warn('Failed to get heart status:', error);
        }
        return null;
    }
    
    // Start a new game (decrements server-side heart)
    async function startSecureGame() {
        try {
            const token = await getCSRFToken();
            const response = await fetch(`${API_BASE}/start-game`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    csrfToken: token
                })
            });
            
            if (response.ok) {
                return await response.json();
            } else if (response.status === 400) {
                const error = await response.json();
                throw new Error(error.error || 'Cannot start game');
            }
        } catch (error) {
            console.warn('Failed to start secure game:', error);
            throw error;
        }
        return null;
    }
    
    // Submit game result with server validation
    async function submitSecureGameResult(stepsEarned, distance, gameToken) {
        try {
            const token = await getCSRFToken();
            const response = await fetch(`${API_BASE}/save-result-secure`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    stepsEarned: stepsEarned,
                    distance: distance,
                    gameToken: gameToken,
                    csrfToken: token
                })
            });
            
            if (response.ok) {
                return await response.json();
            } else {
                const error = await response.json();
                throw new Error(error.error || 'Failed to save game result');
            }
        } catch (error) {
            console.warn('Failed to submit secure game result:', error);
            throw error;
        }
    }
    
    // Award bonus heart to user
    async function awardBonusHeart() {
        try {
            const token = await getCSRFToken();
            const response = await fetch(`${API_BASE}/bonus-heart`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    csrfToken: token
                })
            });
            
            if (response.ok) {
                return await response.json();
            } else {
                const error = await response.json();
                throw new Error(error.error || 'Failed to award bonus heart');
            }
        } catch (error) {
            console.warn('Failed to award bonus heart:', error);
            throw error;
        }
    }
    
    // Public API
    return {
        // Authentication
        checkAuth: checkAuth,
        
        // Game data
        getShadowStatus: getShadowStatus,
        submitGameSession: submitGameSession,
        getShadowStats: getShadowStats,
        
        // Heart management (server-side)
        getHeartStatus: getHeartStatus,
        startSecureGame: startSecureGame,
        submitSecureGameResult: submitSecureGameResult,
        awardBonusHeart: awardBonusHeart,
        
        // Discovery
        markShadowDiscovered: markShadowDiscovered,
        
        // Leaderboard
        getShadowLeaderboard: getShadowLeaderboard,
        
        // Utility
        isAPIAvailable: async function() {
            try {
                const response = await fetch(`${API_BASE}/status`);
                return response.status !== 404;
            } catch (error) {
                return false;
            }
        }
    };
})();

// Initialize the pig game when DOM is ready
window.PigGame = {
    init: function() {
        console.log('Initializing Shadow Pig Game...');
        
        // Check if we're on the pig game page
        if (!document.querySelector('#gameCanvas')) {
            console.log('Not on pig game page, skipping initialization');
            return;
        }
        
        // Initialize UI first
        if (window.PigUI) {
            PigUI.init();
        } else {
            console.error('PigUI not loaded');
        }
        
        // Check API availability
        PigAPI.isAPIAvailable().then(available => {
            if (available) {
                console.log('🌐 Shadow API available - using backend integration');
                // TODO: Integrate with backend when API is implemented
            } else {
                console.log('💾 Shadow API not available - using local storage');
            }
        });
        
        console.log('✅ Shadow Pig Game initialized successfully');
    }
};