// Shadow Pig Game UI Management
// Handles all UI interactions and state management for the pig game

// HTML escaping function to prevent XSS vulnerabilities
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

window.PigUI = (function() {
    'use strict';
    
    let elements = {};
    let gameData = {};
    let heartSyncInterval = null;
    let isHeartLoading = false;
    
    // Check for sandbox mode
    const urlParams = new URLSearchParams(window.location.search);
    const isSandboxMode = urlParams.get('sandbox') === '1';
    
    // UI element selectors
    const SELECTORS = {
        heartsRemaining: '#heartsRemaining',
        heartsReset: '#heartsReset',
        shadowStepsToday: '#shadowStepsToday',
        bestDistance: '#bestDistance',
        gameCanvas: '#gameCanvas',
        startGameBtn: '#startGameBtn',
        resetStatsBtn: '#resetStatsBtn',
        individualTab: '#individualTab',
        teamTab: '#teamTab',
        individualLeaderboard: '#individualLeaderboard',
        teamLeaderboard: '#teamLeaderboard'
    };
    
    function initializeElements() {
        // Get all UI elements
        Object.keys(SELECTORS).forEach(key => {
            elements[key] = document.querySelector(SELECTORS[key]);
            if (!elements[key]) {
                console.warn(`Pig Game UI: Element ${SELECTORS[key]} not found`);
            }
        });
    }
    
    // Pacific Time utilities (matching main app)
    function getPacificDateString() {
        // Get current date in Pacific Time (America/Los_Angeles)
        const now = new Date();
        const pacificTime = new Date(now.toLocaleString("en-US", {timeZone: "America/Los_Angeles"}));
        return pacificTime.toISOString().split('T')[0];
    }
    
    function getHoursUntilPacificMidnight() {
        const now = new Date();
        
        // Get current time in Pacific timezone 
        const pacificNow = new Date(now.toLocaleString("en-US", {timeZone: "America/Los_Angeles"}));
        
        // Calculate hours left in the current Pacific day
        const hoursLeft = 23 - pacificNow.getHours();
        const minutesLeft = 59 - pacificNow.getMinutes();
        const secondsLeft = 59 - pacificNow.getSeconds();
        
        // Convert to total hours until midnight
        const totalHoursLeft = hoursLeft + (minutesLeft / 60) + (secondsLeft / 3600);
        
        return Math.ceil(totalHoursLeft);
    }
    
    async function loadGameData() {
        const today = getPacificDateString(); // Use Pacific Time instead of browser timezone
        
        // In sandbox mode, skip server calls and provide infinite hearts
        if (isSandboxMode) {
            console.log('🛡️ Sandbox mode: Infinite hearts, no database writes');
            gameData = {
                [today]: {
                    hearts: 999, // Infinite hearts
                    steps: 0,
                    gamesPlayed: 0,
                    bestDistance: 0
                },
                overall: {
                    totalSteps: 0,
                    totalGames: 0,
                    bestEverDistance: 0,
                    totalPlayTime: 0
                }
            };
            return gameData;
        }
        
        // Try to get heart status from server first - always prioritize server data
        let serverHeartData = null;
        if (window.PigAPI) {
            try {
                isHeartLoading = true;
                updateUI(); // Show loading state
                serverHeartData = await PigAPI.getHeartStatus();
                if (serverHeartData) {
                    console.log('✅ Using server-side heart tracking');
                }
            } catch (error) {
                console.warn('Server heart tracking unavailable, falling back to localStorage');
            } finally {
                isHeartLoading = false;
            }
        }
        
        // Load localStorage data
        const storedData = localStorage.getItem('shadowPigGameData');
        try {
            gameData = storedData ? JSON.parse(storedData) : {};
        } catch (e) {
            console.warn('Failed to parse shadow pig game data, resetting:', e);
            gameData = {};
        }
        
        // Initialize today's data - prioritize server data over localStorage
        if (!gameData[today]) {
            gameData[today] = {
                hearts: serverHeartData ? serverHeartData.hearts : 5,
                steps: 0,
                gamesPlayed: 0,
                bestDistance: 0
            };
        } else {
            // ALWAYS update hearts from server when available (server is authoritative)
            if (serverHeartData) {
                gameData[today].hearts = serverHeartData.hearts;
            }
        }
        
        // Initialize overall stats if not exists
        if (!gameData.overall) {
            gameData.overall = {
                totalSteps: 0,
                totalGames: 0,
                bestEverDistance: 0,
                totalPlayTime: 0
            };
        }
        
        // Store server data for UI consistency
        if (serverHeartData) {
            gameData.serverHeartData = serverHeartData;
        }
        
        return gameData;
    }
    
    // Periodic heart synchronization to prevent drift
    async function syncHeartCount() {
        if (isSandboxMode || !window.PigAPI) return;
        
        try {
            const serverHeartData = await PigAPI.getHeartStatus();
            if (serverHeartData) {
                const today = getPacificDateString();
                const oldHearts = gameData[today]?.hearts || 0;
                const newHearts = serverHeartData.hearts;
                
                // Only update if there's a difference
                if (oldHearts !== newHearts) {
                    console.log(`🔄 Heart sync: ${oldHearts} → ${newHearts}`);
                    gameData[today].hearts = newHearts;
                    gameData.serverHeartData = serverHeartData;
                    saveGameData();
                    updateUI();
                }
            }
        } catch (error) {
            console.warn('Heart sync failed:', error);
        }
    }
    
    function startHeartSync() {
        if (heartSyncInterval) {
            clearInterval(heartSyncInterval);
        }
        
        // Sync every 30 seconds to catch changes from other tabs/windows
        if (!isSandboxMode && window.PigAPI) {
            heartSyncInterval = setInterval(syncHeartCount, 30000);
            console.log('🔄 Started periodic heart synchronization (30s intervals)');
        }
    }
    
    function stopHeartSync() {
        if (heartSyncInterval) {
            clearInterval(heartSyncInterval);
            heartSyncInterval = null;
            console.log('🔄 Stopped periodic heart synchronization');
        }
    }
    
    function saveGameData() {
        try {
            localStorage.setItem('shadowPigGameData', JSON.stringify(gameData));
        } catch (e) {
            console.error('Failed to save shadow pig game data:', e);
        }
    }
    
    function updateUI() {
        const today = getPacificDateString(); // Use Pacific Time
        const todayData = gameData[today] || { hearts: 0, steps: 0, bestDistance: 0 };
        const overallData = gameData.overall || { bestEverDistance: 0 };
        
        // Update stats display
        if (elements.heartsRemaining) {
            if (isSandboxMode) {
                elements.heartsRemaining.textContent = '∞';
                elements.heartsRemaining.title = 'Sandbox mode: Infinite hearts';
                elements.heartsRemaining.style.opacity = '1';
            } else if (isHeartLoading) {
                elements.heartsRemaining.textContent = '...';
                elements.heartsRemaining.title = 'Syncing heart count with server...';
                elements.heartsRemaining.style.opacity = '0.6';
            } else {
                elements.heartsRemaining.textContent = todayData.hearts;
                elements.heartsRemaining.title = gameData.serverHeartData ? 'Server-synced hearts' : 'Local hearts (offline mode)';
                elements.heartsRemaining.style.opacity = '1';
            }
        }
        
        // Show hours until hearts reset (Pacific Time) - only when hearts are 0 and not in sandbox mode
        if (elements.heartsReset) {
            if (isSandboxMode) {
                elements.heartsReset.textContent = '(Sandbox mode)';
                elements.heartsReset.title = 'Sandbox mode: Infinite hearts, no database writes';
                elements.heartsReset.style.display = 'inline';
                elements.heartsReset.style.color = '#FFD700';
            } else if (todayData.hearts === 0) {
                // Use server data if available, otherwise calculate locally
                const hoursUntilReset = gameData.serverHeartData?.hoursUntilReset || getHoursUntilPacificMidnight();
                if (hoursUntilReset <= 24) {
                    elements.heartsReset.textContent = `(${hoursUntilReset}h to reset)`;
                    elements.heartsReset.title = 'Hearts reset at midnight Pacific Time';
                    elements.heartsReset.style.display = 'inline';
                    elements.heartsReset.style.color = '';
                }
            } else {
                elements.heartsReset.textContent = '';
                elements.heartsReset.style.display = 'none';
                elements.heartsReset.style.color = '';
            }
        }
        
        if (elements.shadowStepsToday) {
            elements.shadowStepsToday.textContent = todayData.steps.toLocaleString();
        }
        
        if (elements.bestDistance) {
            elements.bestDistance.textContent = Math.max(todayData.bestDistance, overallData.bestEverDistance);
        }
        
        // Update start button state
        if (elements.startGameBtn) {
            if (todayData.hearts === 0) {
                elements.startGameBtn.disabled = true;
                elements.startGameBtn.textContent = 'No Hearts Left Today';
            } else if (PigGameEngine.isRunning()) {
                elements.startGameBtn.disabled = true;
                elements.startGameBtn.textContent = 'Playing...';
            } else {
                elements.startGameBtn.disabled = false;
                elements.startGameBtn.textContent = 'Start';
            }
        }
    }
    
    function displayGameResult(stepsEarned, distance, today) {
        // Create result overlay
        const resultOverlay = document.createElement('div');
        resultOverlay.className = 'game-result';
        
        const isGoodRun = stepsEarned >= 75;
        const noHeartsLeft = gameData[today].hearts === 0;
        
        let resultTitle;
        if (isSandboxMode) {
            resultTitle = isGoodRun ? '🎉 Excellent Run! (Sandbox)' : '🎮 Sandbox Mode';
        } else if (noHeartsLeft) {
            resultTitle = 'Out of Steps';
        } else {
            resultTitle = isGoodRun ? '🎉 Excellent Run!' : 'Out of Steps';
        }
        
        const resultColor = isGoodRun ? '#4CAF50' : '#ff6b6b';
        
        resultOverlay.innerHTML = `
            <h3 style="color: ${resultColor}; margin: 0;">${resultTitle}</h3>
            <p style="color: #fff; margin: 8px 0;">
                Distance: <strong>${distance}m</strong>
            </p>
            <p style="color: #fff; margin: 8px 0;">
                Trots: <strong>+${stepsEarned.toLocaleString()}</strong>
            </p>
            <p style="color: ${isSandboxMode ? '#FFD700' : '#ff6b6b'}; margin: 8px 0; font-size: 0.9em;">
                Hearts remaining: ${isSandboxMode ? '∞ (Infinite)' : gameData[today].hearts}
            </p>
            ${gameData[today].bestDistance === distance ? '<p style="color: #FFD700; margin: 4px 0; font-size: 0.9em;">New personal best!</p>' : ''}
            ${isSandboxMode ? '<p style="color: #888; margin: 4px 0; font-size: 0.8em;">🛡️ Sandbox mode - no data saved</p>' : ''}
        `;
        
        elements.gameCanvas.appendChild(resultOverlay);
        
        // Auto-dismiss result overlay after 3 seconds
        setTimeout(() => {
            if (resultOverlay && resultOverlay.parentElement) {
                resultOverlay.remove();
                updateUI();
            }
        }, 3000);
        
        // Update UI after result
        setTimeout(() => {
            updateUI();
            
            // Only refresh leaderboards in non-sandbox mode
            if (!isSandboxMode) {
                // Refresh leaderboards with new data
                if (elements.individualLeaderboard && elements.individualLeaderboard.style.display !== 'none') {
                    loadIndividualLeaderboard();
                }
                if (elements.teamLeaderboard && elements.teamLeaderboard.style.display !== 'none') {
                    loadTeamLeaderboard();
                }
            }
            
            // Trigger confetti for good runs (if available)
            if (isGoodRun && typeof createConfetti === 'function') {
                createConfetti();
            }
        }, 1000); // Delay a bit to allow database save to complete (non-sandbox only)
    }
    
    async function showGameResult(stepsEarned, distance) {
        const today = getPacificDateString(); // Use Pacific Time
        const gameToken = window.currentGameToken;
        
        // In sandbox mode, skip all database operations
        if (isSandboxMode) {
            console.log('🛡️ Sandbox mode: Skipping database writes for game result');
            
            // Update local data for UI display only
            gameData[today].steps += stepsEarned;
            gameData[today].gamesPlayed += 1;
            gameData[today].bestDistance = Math.max(gameData[today].bestDistance, distance);
            
            gameData.overall.totalSteps += stepsEarned;
            gameData.overall.totalGames += 1;
            gameData.overall.bestEverDistance = Math.max(gameData.overall.bestEverDistance, distance);
            
            // Hearts stay at 999 (infinite)
            gameData[today].hearts = 999;
            
            // Skip to result display
            displayGameResult(stepsEarned, distance, today);
            return;
        }
        
        // Try server-side result submission first (non-sandbox mode)
        let serverSuccess = false;
        if (window.PigAPI && gameData.serverHeartData && gameToken) {
            try {
                await PigAPI.submitSecureGameResult(stepsEarned, distance, gameToken);
                console.log('🔒 Secure result submitted to server');
                serverSuccess = true;
                // Don't update hearts locally - they're already decremented server-side
            } catch (error) {
                console.warn('Server result submission failed:', error.message);
            }
        }
        
        // Update local game data - server manages hearts, don't double-decrement
        if (!serverSuccess) {
            // Only decrement hearts if server didn't handle it
            gameData[today].hearts = Math.max(0, gameData[today].hearts - 1);
        }
        // Note: If server handled it, hearts were already updated in startGame()
        // No need to refresh here to avoid race conditions
        
        gameData[today].steps += stepsEarned;
        gameData[today].gamesPlayed += 1;
        gameData[today].bestDistance = Math.max(gameData[today].bestDistance, distance);
        
        gameData.overall.totalSteps += stepsEarned;
        gameData.overall.totalGames += 1;
        gameData.overall.bestEverDistance = Math.max(gameData.overall.bestEverDistance, distance);
        
        saveGameData();
        
        // Clear game token
        if (gameToken) {
            delete window.currentGameToken;
        }
        
        // Reset button text back to "Start"
        if (elements.startGameBtn) {
            elements.startGameBtn.textContent = 'Start';
            elements.startGameBtn.disabled = false;
        }
        
        // Fallback: Save to database via old API if server submission failed
        if (!serverSuccess) {
            const heartsUsed = 1;
            fetch('/api/shadow/save-result', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    stepsEarned: stepsEarned,
                    distance: distance,
                    heartsUsed: heartsUsed
                })
            }).catch(err => {
                console.warn('Failed to save game result to database:', err);
            });
        }
        
        // Display game result
        displayGameResult(stepsEarned, distance, today);
    }
    
    function resetGameCanvas() {
        if (elements.gameCanvas) {
            const today = getPacificDateString();
            const todayData = gameData[today];
            const heartsLeft = todayData ? todayData.hearts : 5;
            
            let message;
            if (isSandboxMode) {
                message = 'Ready to <s>step</s> trot... 🛡️ Sandbox Mode';
            } else {
                message = heartsLeft > 0 ? 'Ready to <s>step</s> trot...' : 'Time to rest';
            }
            
            elements.gameCanvas.innerHTML = `
                <div class="loading">
                    <p>${message}</p>
                </div>
            `;
        }
    }
    
    function setupEventListeners() {
        // Start game button
        if (elements.startGameBtn) {
            elements.startGameBtn.addEventListener('click', function() {
                const today = getPacificDateString(); // Use Pacific Time
                const todayData = gameData[today];
                
                if (todayData.hearts === 0) {
                    const hoursUntilReset = getHoursUntilPacificMidnight();
                    alert(`No hearts remaining today! Hearts reset in ${hoursUntilReset} hours (midnight Pacific Time).`);
                    return;
                }
                
                if (PigGameEngine.isRunning()) {
                    return;
                }
                
                startGame();
            });
        }
        
        // Reset stats button - only show in development
        if (elements.resetStatsBtn) {
            // Check if we're in development (localhost or specific conditions)
            const isDevelopment = window.location.hostname === 'localhost' || 
                                window.location.hostname === '127.0.0.1' ||
                                window.location.port === '3000';
            
            if (isDevelopment) {
                elements.resetStatsBtn.style.display = 'inline-block';
                elements.resetStatsBtn.addEventListener('click', function() {
                    if (confirm('Reset all pig game stats? This cannot be undone.')) {
                        localStorage.removeItem('shadowPigGameData');
                        gameData = loadGameData();
                        updateUI();
                        resetGameCanvas();
                        alert('Stats reset successfully!');
                    }
                });
            }
        }

        // Leaderboard tab switching
        if (elements.individualTab) {
            elements.individualTab.addEventListener('click', function() {
                switchLeaderboardTab('individual');
            });
        }

        if (elements.teamTab) {
            elements.teamTab.addEventListener('click', function() {
                switchLeaderboardTab('team');
            });
        }
    }
    
    async function startGame() {
        if (!elements.gameCanvas) {
            console.error('Game canvas not found');
            return;
        }
        
        const today = getPacificDateString();
        const todayData = gameData[today];
        
        // In sandbox mode, skip all server validation
        let gameToken = null;
        if (isSandboxMode) {
            console.log('🛡️ Sandbox mode: Skipping server validation, infinite hearts available');
        } else {
            // Try server-side heart validation first
            if (window.PigAPI && gameData.serverHeartData) {
                try {
                    const gameSession = await PigAPI.startSecureGame();
                    if (gameSession && gameSession.success) {
                        gameToken = gameSession.gameToken;
                        // Update local hearts to match server IMMEDIATELY
                        gameData[today].hearts = gameSession.heartsRemaining;
                        // Update server data cache
                        gameData.serverHeartData.hearts = gameSession.heartsRemaining;
                        // Update UI immediately with new heart count
                        updateUI();
                        console.log('🔒 Started secure game with server validation');
                    } else {
                        throw new Error('Server rejected game start');
                    }
                } catch (error) {
                    console.warn('Server-side validation failed:', error.message);
                    alert(`Cannot start game: ${error.message}`);
                    return;
                }
            } else {
                // Fallback to client-side validation
                if (todayData.hearts === 0) {
                    const hoursUntilReset = getHoursUntilPacificMidnight();
                    alert(`No hearts remaining today! Hearts reset in ${hoursUntilReset} hours (midnight Pacific Time).`);
                    return;
                }
            }
        }
        
        if (PigGameEngine.isRunning()) {
            return;
        }
        
        // Clear canvas and create game canvas element
        elements.gameCanvas.innerHTML = '';
        
        const canvas = document.createElement('canvas');
        canvas.width = elements.gameCanvas.offsetWidth || 600;
        canvas.height = elements.gameCanvas.offsetHeight || 300;
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        
        elements.gameCanvas.appendChild(canvas);
        
        // Update button text to indicate it's clickable during gameplay
        if (elements.startGameBtn) {
            elements.startGameBtn.textContent = 'Playing... (Click to Jump!)';
            elements.startGameBtn.disabled = false; // Keep it clickable
        }
        
        // Store game token for result submission
        if (gameToken) {
            window.currentGameToken = gameToken;
        }
        
        // Start the game
        await PigGameEngine.startGame(canvas);
        updateUI();
    }
    
    function switchLeaderboardTab(tabType) {
        // Update tab appearances
        if (elements.individualTab && elements.teamTab) {
            elements.individualTab.classList.remove('active');
            elements.teamTab.classList.remove('active');
            
            if (tabType === 'individual') {
                elements.individualTab.classList.add('active');
            } else {
                elements.teamTab.classList.add('active');
            }
        }
        
        // Show/hide leaderboard content
        if (elements.individualLeaderboard && elements.teamLeaderboard) {
            if (tabType === 'individual') {
                elements.individualLeaderboard.style.display = 'block';
                elements.teamLeaderboard.style.display = 'none';
                loadIndividualLeaderboard();
            } else {
                elements.individualLeaderboard.style.display = 'none';
                elements.teamLeaderboard.style.display = 'block';
                loadTeamLeaderboard();
            }
        }
    }

    function loadIndividualLeaderboard() {
        if (!elements.individualLeaderboard) return;
        
        fetch('/api/shadow/leaderboard/individual')
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    throw new Error(data.error);
                }
                
                let html = '';
                if (data.length === 0) {
                    html = `
                        <div style="text-align: center; padding: 20px; color: #888;">
                            <p>No shadow runners yet. Be the first!</p>
                        </div>
                    `;
                } else {
                    html = `
                        <div style="background: rgba(255,255,255,0.1); border-radius: 10px; padding: 15px;">
                            <div style="display: grid; grid-template-columns: auto 1fr auto; gap: 15px; align-items: center; font-size: 0.9em;">
                                <div style="font-weight: bold; color: #ff6b6b;">Rank</div>
                                <div style="font-weight: bold; color: #ff6b6b;">Name</div>
                                <div style="font-weight: bold; color: #ff6b6b;">Total Trots</div>
                    `;
                    
                    data.forEach(player => {
                        const rankColor = player.rank <= 3 ? '#FFD700' : '#fff';
                        html += `
                            <div style="color: ${rankColor}; font-weight: bold;">#${player.rank}</div>
                            <div style="color: #fff;">${escapeHtml(player.name)}</div>
                            <div style="color: #fff; font-weight: bold;">${player.total_trots.toLocaleString()}</div>
                        `;
                    });
                    
                    html += `
                            </div>
                        </div>
                    `;
                }
                
                elements.individualLeaderboard.innerHTML = html;
            })
            .catch(error => {
                console.error('Error loading individual leaderboard:', error);
                elements.individualLeaderboard.innerHTML = `
                    <div style="text-align: center; padding: 20px; color: #ff6b6b;">
                        <p>Failed to load leaderboard</p>
                        <p style="font-size: 0.8em; opacity: 0.7;">Check console for details</p>
                    </div>
                `;
            });
    }

    function loadTeamLeaderboard() {
        if (!elements.teamLeaderboard) return;
        
        fetch('/api/shadow/leaderboard/team')
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    throw new Error(data.error);
                }
                
                let html = '';
                if (data.length === 0) {
                    html = `
                        <div style="text-align: center; padding: 20px; color: #888;">
                            <p>No team activity yet!</p>
                        </div>
                    `;
                } else {
                    html = `
                        <div style="background: rgba(255,255,255,0.1); border-radius: 10px; padding: 15px;">
                            <div style="display: grid; grid-template-columns: auto 1fr auto auto; gap: 10px; align-items: center; font-size: 0.9em;">
                                <div style="font-weight: bold; color: #ff6b6b;">Rank</div>
                                <div style="font-weight: bold; color: #ff6b6b;">Team</div>
                                <div style="font-weight: bold; color: #ff6b6b;">Active</div>
                                <div style="font-weight: bold; color: #ff6b6b;">Avg Trots</div>
                    `;
                    
                    data.forEach(team => {
                        const rankColor = team.rank <= 3 ? '#FFD700' : '#fff';
                        const avgTrots = team.active_members > 0 ? Math.round(team.total_trots / team.active_members) : 0;
                        html += `
                            <div style="color: ${rankColor}; font-weight: bold;">#${team.rank}</div>
                            <div style="color: #fff;">${team.team}</div>
                            <div style="color: #aaa; font-size: 0.8em;">${team.active_members}/${team.member_count}</div>
                            <div style="color: #fff; font-weight: bold;">${avgTrots.toLocaleString()}</div>
                        `;
                    });
                    
                    html += `
                            </div>
                        </div>
                    `;
                }
                
                elements.teamLeaderboard.innerHTML = html;
            })
            .catch(error => {
                console.error('Error loading team leaderboard:', error);
                elements.teamLeaderboard.innerHTML = `
                    <div style="text-align: center; padding: 20px; color: #ff6b6b;">
                        <p>Failed to load team leaderboard</p>
                        <p style="font-size: 0.8em; opacity: 0.7;">Check console for details</p>
                    </div>
                `;
            });
    }

    function loadLeaderboard() {
        // Load the default (individual) leaderboard
        loadIndividualLeaderboard();
    }
    
    // Set up global callback for game engine
    window.PigGameCallbacks = {
        onGameOver: showGameResult,
        onBonusHeart: async function() {
            const today = getPacificDateString();
            if (gameData[today] && gameData[today].hearts < 5) {
                let serverSuccess = false;
                
                // Try server-side bonus heart first (non-blocking for UI responsiveness)
                if (!isSandboxMode && window.PigAPI && gameData.serverHeartData) {
                    try {
                        const bonusResult = await PigAPI.awardBonusHeart();
                        if (bonusResult && bonusResult.success) {
                            // Update local hearts to match server
                            gameData[today].hearts = bonusResult.heartsRemaining;
                            gameData.serverHeartData.hearts = bonusResult.heartsRemaining;
                            serverSuccess = true;
                            console.log('💖 Bonus heart awarded by server:', bonusResult.heartsRemaining, 'hearts');
                        }
                    } catch (error) {
                        console.warn('Failed to award bonus heart on server:', error);
                    }
                }
                
                // Fallback to local increment if server failed
                if (!serverSuccess) {
                    gameData[today].hearts += 1;
                    console.log('💖 Bonus heart awarded locally (server unavailable)');
                }
                
                saveGameData();
                updateUI();
                
                // Show bonus heart notification
                const notification = document.createElement('div');
                notification.style.cssText = `
                    position: fixed;
                    top: 50px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: linear-gradient(135deg, #ff6b6b, #ff8e8e);
                    color: white;
                    padding: 10px 20px;
                    border-radius: 20px;
                    font-weight: bold;
                    z-index: 1000;
                    animation: fadeInOut 2s forwards;
                `;
                notification.innerHTML = '💖 Bonus Heart! +1 Life';
                document.body.appendChild(notification);
                
                setTimeout(() => notification.remove(), 2000);
            }
        }
    };
    
    // Cleanup function to be called when page unloads
    window.addEventListener('beforeunload', stopHeartSync);
    
    // Public API
    return {
        init: async function() {
            initializeElements();
            gameData = await loadGameData();
            setupEventListeners();
            updateUI();
            resetGameCanvas();
            loadLeaderboard();
            
            // Start periodic heart synchronization
            startHeartSync();
            
            console.log('Shadow Pig Game UI initialized');
        },
        
        updateUI: updateUI,
        showGameResult: showGameResult,
        loadLeaderboard: loadLeaderboard,
        syncHeartCount: syncHeartCount,
        
        // For testing/debugging
        getGameData: function() {
            return gameData;
        },
        
        // Cleanup function
        destroy: function() {
            stopHeartSync();
        }
    };
})();