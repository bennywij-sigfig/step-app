// Shadow Pig Game UI Management
// Handles all UI interactions and state management for the pig game

window.PigUI = (function() {
    'use strict';
    
    let elements = {};
    let gameData = {};
    
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
    
    function loadGameData() {
        const today = getPacificDateString(); // Use Pacific Time instead of browser timezone
        const storedData = localStorage.getItem('shadowPigGameData');
        
        try {
            gameData = storedData ? JSON.parse(storedData) : {};
        } catch (e) {
            console.warn('Failed to parse shadow pig game data, resetting:', e);
            gameData = {};
        }
        
        // Initialize today's data if not exists
        if (!gameData[today]) {
            gameData[today] = {
                hearts: 5,
                steps: 0,
                gamesPlayed: 0,
                bestDistance: 0
            };
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
        
        return gameData;
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
            elements.heartsRemaining.textContent = todayData.hearts;
        }
        
        // Show hours until hearts reset (Pacific Time) - only when hearts are 0
        if (elements.heartsReset) {
            if (todayData.hearts <= 0) {
                const hoursUntilReset = getHoursUntilPacificMidnight();
                if (hoursUntilReset <= 24) {
                    elements.heartsReset.textContent = `(${hoursUntilReset}h to reset)`;
                    elements.heartsReset.title = 'Hearts reset at midnight Pacific Time';
                    elements.heartsReset.style.display = 'inline';
                }
            } else {
                elements.heartsReset.textContent = '';
                elements.heartsReset.style.display = 'none';
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
            if (todayData.hearts <= 0) {
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
    
    function showGameResult(stepsEarned, distance) {
        const today = getPacificDateString(); // Use Pacific Time
        
        // Update game data
        gameData[today].hearts = Math.max(0, gameData[today].hearts - 1);
        gameData[today].steps += stepsEarned;
        gameData[today].gamesPlayed += 1;
        gameData[today].bestDistance = Math.max(gameData[today].bestDistance, distance);
        
        gameData.overall.totalSteps += stepsEarned;
        gameData.overall.totalGames += 1;
        gameData.overall.bestEverDistance = Math.max(gameData.overall.bestEverDistance, distance);
        
        saveGameData();
        
        // Reset button text back to "Start"
        if (elements.startGameBtn) {
            elements.startGameBtn.textContent = 'Start';
            elements.startGameBtn.disabled = false;
        }
        
        // Save to database via API
        const heartsUsed = 1; // Always use 1 heart per game
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
            // Still works with localStorage as fallback
        });
        
        // Create result overlay
        const resultOverlay = document.createElement('div');
        resultOverlay.className = 'game-result';
        
        const isGoodRun = stepsEarned >= 75;
        const noHeartsLeft = gameData[today].hearts <= 0;
        
        let resultTitle;
        if (noHeartsLeft) {
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
            <p style="color: #ff6b6b; margin: 8px 0; font-size: 0.9em;">
                Hearts remaining: ${gameData[today].hearts}
            </p>
            ${gameData[today].bestDistance === distance ? '<p style="color: #FFD700; margin: 4px 0; font-size: 0.9em;">New personal best!</p>' : ''}
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
            
            // Refresh leaderboards with new data
            if (elements.individualLeaderboard && elements.individualLeaderboard.style.display !== 'none') {
                loadIndividualLeaderboard();
            }
            if (elements.teamLeaderboard && elements.teamLeaderboard.style.display !== 'none') {
                loadTeamLeaderboard();
            }
            
            // Trigger confetti for good runs (if available)
            if (isGoodRun && typeof createConfetti === 'function') {
                createConfetti();
            }
        }, 1000); // Delay a bit to allow database save to complete
    }
    
    function resetGameCanvas() {
        if (elements.gameCanvas) {
            const today = getPacificDateString();
            const todayData = gameData[today];
            const heartsLeft = todayData ? todayData.hearts : 5;
            
            const message = heartsLeft > 0 ? 'Ready to step...' : 'Time to rest';
            
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
                
                if (todayData.hearts <= 0) {
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
    
    function startGame() {
        if (!elements.gameCanvas) {
            console.error('Game canvas not found');
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
        
        // Start the game
        PigGameEngine.startGame(canvas);
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
                            <div style="color: #fff;">${player.name}</div>
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
        onBonusHeart: function() {
            const today = getPacificDateString();
            if (gameData[today] && gameData[today].hearts < 5) {
                gameData[today].hearts += 1;
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
    
    // Public API
    return {
        init: function() {
            initializeElements();
            gameData = loadGameData();
            setupEventListeners();
            updateUI();
            resetGameCanvas();
            loadLeaderboard();
            
            console.log('Shadow Pig Game UI initialized');
        },
        
        updateUI: updateUI,
        showGameResult: showGameResult,
        loadLeaderboard: loadLeaderboard,
        
        // For testing/debugging
        getGameData: function() {
            return gameData;
        }
    };
})();