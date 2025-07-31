// Team disclosure functionality - must be global
let expandedTeams = new Set(); // Track expanded state

// Theme functionality
function initializeTheme() {
    // Load theme from localStorage
    const savedTheme = localStorage.getItem('adminTheme') || 'default';
    applyTheme(savedTheme);
}

function applyTheme(themeName) {
    document.documentElement.setAttribute('data-theme', themeName === 'default' ? '' : themeName);
}

// Confetti animation system
function createConfetti() {
    const canvas = document.getElementById('confettiCanvas');
    const ctx = canvas.getContext('2d');
    
    // Set canvas size
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.display = 'block';
    
    const confettiPieces = [];
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57', '#FF9FF3', '#54A0FF'];
    
    // Create confetti pieces
    for (let i = 0; i < 150; i++) {
        confettiPieces.push({
            x: Math.random() * canvas.width,
            y: -10,
            vx: (Math.random() - 0.5) * 6,
            vy: Math.random() * 3 + 2,
            color: colors[Math.floor(Math.random() * colors.length)],
            size: Math.random() * 4 + 2,
            rotation: Math.random() * 360,
            rotationSpeed: (Math.random() - 0.5) * 10
        });
    }
    
    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        for (let i = confettiPieces.length - 1; i >= 0; i--) {
            const piece = confettiPieces[i];
            
            // Update position
            piece.x += piece.vx;
            piece.y += piece.vy;
            piece.rotation += piece.rotationSpeed;
            
            // Apply gravity
            piece.vy += 0.1;
            
            // Remove pieces that are off screen
            if (piece.y > canvas.height + 10) {
                confettiPieces.splice(i, 1);
                continue;
            }
            
            // Draw confetti piece
            ctx.save();
            ctx.translate(piece.x, piece.y);
            ctx.rotate(piece.rotation * Math.PI / 180);
            ctx.fillStyle = piece.color;
            ctx.fillRect(-piece.size/2, -piece.size/2, piece.size, piece.size);
            ctx.restore();
        }
        
        if (confettiPieces.length > 0) {
            requestAnimationFrame(animate);
        } else {
            // Hide canvas when animation is done
            canvas.style.display = 'none';
        }
    }
    
    animate();
}

// Trigger confetti celebration
function celebrateSteps(stepCount) {
    if (stepCount >= 15000) {
        createConfetti();
        
        // Add celebration message
        setTimeout(() => {
            const messageDiv = document.getElementById('stepsMessage');
            const currentMessage = messageDiv.innerHTML;
            messageDiv.innerHTML = currentMessage + '<div class="message success" style="background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%); color: #B8860B; animation: pulse 1s ease-in-out 3;">🎉 Amazing! 15,000+ steps celebration! 🎉</div>';
        }, 500);
    }
}

// Handle window resize for confetti canvas
window.addEventListener('resize', function() {
    const canvas = document.getElementById('confettiCanvas');
    if (canvas && canvas.style.display !== 'none') {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
});

document.addEventListener('DOMContentLoaded', function() {
    // Initialize theme
    initializeTheme();
    
    // Get user info from session
    let currentUser = null;
    let csrfToken = null;
    
    // CSRF token management
    async function getCSRFToken() {
        if (!csrfToken) {
            try {
                const response = await fetch('/api/csrf-token');
                const data = await response.json();
                csrfToken = data.csrfToken;
            } catch (error) {
                console.error('Error fetching CSRF token:', error);
            }
        }
        return csrfToken;
    }
        
        // Load current user from session
        async function loadCurrentUser() {
            try {
                const response = await fetch('/api/user');
                if (!response.ok) {
                    window.location.href = '/';
                    return;
                }
                currentUser = await response.json();
                document.getElementById('userName').textContent = currentUser.email;
                
                // Update challenge info display
                updateChallengeInfo(currentUser.current_challenge);
            } catch (error) {
                console.error('Error loading user:', error);
                window.location.href = '/';
            }
        }
        
        // Update challenge information display
        function updateChallengeInfo(challenge) {
            const challengeInfo = document.getElementById('challengeInfo');
            const form = document.getElementById('stepsForm');
            const submitBtn = document.getElementById('submitStepsBtn');
            const dateInput = document.getElementById('date');
            
            if (challenge) {
                const today = new Date();
                const startDate = new Date(challenge.start_date + 'T00:00:00');
                const endDate = new Date(challenge.end_date + 'T23:59:59');
                const isWithinPeriod = today >= startDate && today <= endDate;
                
                challengeInfo.innerHTML = `
                    <h3>${challenge.name}</h3>
                    <p><strong>Challenge Period:</strong> ${formatDate(challenge.start_date)} to ${formatDate(challenge.end_date)}</p>
                    <p style="color: #666; font-size: 14px; margin-top: 8px;">You can log steps from the start date onwards, including catch-up entries</p>
                    ${!isWithinPeriod ? '<p style="color: #d63384; font-weight: 500;">You can still log steps for dates during this challenge period.</p>' : ''}
                `;
                
                challengeInfo.className = isWithinPeriod ? 'challenge-info active' : 'challenge-info inactive';
                challengeInfo.classList.remove('hidden');
                
                // Disable form if outside challenge period
                if (!isWithinPeriod) {
                    form.classList.add('form-disabled');
                    submitBtn.textContent = 'Challenge Period Inactive';
                    submitBtn.disabled = true;
                } else {
                    form.classList.remove('form-disabled');
                    submitBtn.textContent = 'Save Steps';
                    submitBtn.disabled = false;
                }
                
                // Set date input constraints (works in most browsers)
                dateInput.min = challenge.start_date;
                
                // Set max date to prevent future entries (allow +1 day for timezone flexibility)
                const now = new Date();
                const maxAllowedDate = new Date(now);
                maxAllowedDate.setDate(maxAllowedDate.getDate() + 1);
                const maxDateString = maxAllowedDate.toISOString().split('T')[0];
                
                // Use the earlier of challenge end date or max allowed date
                const challengeEndDate = new Date(challenge.end_date + 'T12:00:00');
                dateInput.max = (maxAllowedDate.getTime() < challengeEndDate.getTime()) ? maxDateString : challenge.end_date;
                
                // Add real-time validation for Safari and other browsers
                dateInput.addEventListener('change', function() {
                    validateDateInput(this, challenge);
                });
                dateInput.addEventListener('input', function() {
                    validateDateInput(this, challenge);
                });
            } else {
                challengeInfo.classList.add('hidden');
                form.classList.remove('form-disabled');
                submitBtn.textContent = 'Save Steps';
                submitBtn.disabled = false;
                
                // Remove date constraints
                dateInput.removeAttribute('min');
                dateInput.removeAttribute('max');
            }
        }
        
        // Real-time date validation for all browsers (including Safari)
        function validateDateInput(dateInput, challenge) {
            const messageDiv = document.getElementById('stepsMessage');
            const date = dateInput.value;
            
            if (!date || !challenge) {
                // Reset styling if no date or challenge
                dateInput.style.borderColor = '';
                dateInput.style.backgroundColor = '';
                messageDiv.innerHTML = '';
                return;
            }
            
            // Use specific times for inclusive date range (cross-browser compatibility)
            const stepDate = new Date(date + 'T12:00:00');
            const startDate = new Date(challenge.start_date + 'T00:00:00');
            const endDate = new Date(challenge.end_date + 'T23:59:59');
            
            // Check if date parsing was successful
            if (isNaN(stepDate.getTime())) {
                dateInput.style.borderColor = '#dc3545';
                dateInput.style.backgroundColor = '#fff5f5';
                messageDiv.innerHTML = '<div class="message error">Please enter a valid date</div>';
                return;
            }
            
            // Check for future dates (allow +1 day for timezone flexibility)
            const now = new Date();
            const maxAllowedDate = new Date(now);
            maxAllowedDate.setDate(maxAllowedDate.getDate() + 1);
            
            if (stepDate.getTime() > maxAllowedDate.getTime()) {
                dateInput.style.borderColor = '#dc3545';
                dateInput.style.backgroundColor = '#fff5f5';
                messageDiv.innerHTML = '<div class="message error">Cannot enter steps for future dates</div>';
                return;
            }
            
            // Use getTime() for reliable cross-browser date comparison
            // Only block dates before challenge start - allow historical catch-up entries within challenge period
            if (stepDate.getTime() < startDate.getTime()) {
                dateInput.style.borderColor = '#dc3545';
                dateInput.style.backgroundColor = '#fff5f5';
                messageDiv.innerHTML = `<div class="message error">Date must be on or after the challenge start date (${formatDate(challenge.start_date)})</div>`;
            } else {
                dateInput.style.borderColor = '#667eea';
                dateInput.style.backgroundColor = '#f8fff8';
                messageDiv.innerHTML = '<div class="message success">Date is valid</div>';
            }
        }
        
        // Format date for display
        function formatDate(dateString) {
            const date = new Date(dateString + 'T00:00:00');
            return date.toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
            });
        }
        
        // Set default date to today
        document.getElementById('date').value = new Date().toISOString().split('T')[0];
        
        // Navigation
        document.getElementById('myStepsBtn').addEventListener('click', () => {
            document.getElementById('myStepsView').classList.remove('hidden');
            document.getElementById('leaderboardView').classList.add('hidden');
            document.getElementById('teamLeaderboardView').classList.add('hidden');
            document.getElementById('myStepsBtn').classList.add('active');
            document.getElementById('leaderboardBtn').classList.remove('active');
            document.getElementById('teamLeaderboardBtn').classList.remove('active');
        });
        
        document.getElementById('leaderboardBtn').addEventListener('click', () => {
            document.getElementById('myStepsView').classList.add('hidden');
            document.getElementById('leaderboardView').classList.remove('hidden');
            document.getElementById('teamLeaderboardView').classList.add('hidden');
            document.getElementById('myStepsBtn').classList.remove('active');
            document.getElementById('leaderboardBtn').classList.add('active');
            document.getElementById('teamLeaderboardBtn').classList.remove('active');
            loadLeaderboard();
        });
        
        document.getElementById('teamLeaderboardBtn').addEventListener('click', () => {
            document.getElementById('myStepsView').classList.add('hidden');
            document.getElementById('leaderboardView').classList.add('hidden');
            document.getElementById('teamLeaderboardView').classList.remove('hidden');
            document.getElementById('myStepsBtn').classList.remove('active');
            document.getElementById('leaderboardBtn').classList.remove('active');
            document.getElementById('teamLeaderboardBtn').classList.add('active');
            loadTeamLeaderboard();
        });
        
        // Load user's steps
        async function loadSteps() {
            try {
                const response = await fetch('/api/steps');
                
                if (response.status === 429) {
                    const data = await response.json();
                    const retryAfter = Math.floor(data.retryAfter / 60) || 60;
                    document.getElementById('stepsList').innerHTML = '<p>Too many requests. Please wait ' + retryAfter + ' minutes and refresh the page.</p>';
                    document.getElementById('stepsChart').innerHTML = '<p>Rate limit exceeded</p>';
                    return;
                }
                
                const steps = await response.json();
                
                const stepsList = document.getElementById('stepsList');
                if (steps.length === 0) {
                    stepsList.innerHTML = '<p>No steps logged yet. Start by adding your first day!</p>';
                } else {
                    stepsList.innerHTML = steps.map(step => 
                        `<div class="step-item">
                            <span>${step.date}</span>
                            <span><strong>${step.count.toLocaleString()} steps</strong></span>
                        </div>`
                    ).join('');
                }
                
                // Update chart
                renderStepsChart(steps);
                
            } catch (error) {
                document.getElementById('stepsList').innerHTML = '<p>Error loading steps</p>';
                document.getElementById('stepsChart').innerHTML = '<p>Error loading chart</p>';
            }
        }
        
        // Render steps chart
        function renderStepsChart(steps) {
            const chartContainer = document.getElementById('stepsChart');
            
            if (steps.length === 0) {
                chartContainer.innerHTML = '<p style="text-align: center; color: #666; margin: 40px 0;">No step data to display</p>';
                return;
            }
            
            // Create a map of steps by date
            const stepsByDate = {};
            steps.forEach(step => {
                stepsByDate[step.date] = step.count;
            });
            
            // Generate last 10 days (or all available data if less)
            const today = new Date();
            const days = [];
            const maxDays = Math.min(10, steps.length + 5); // Show some empty days too
            
            for (let i = maxDays - 1; i >= 0; i--) {
                const date = new Date(today);
                date.setDate(date.getDate() - i);
                const dateStr = date.toISOString().split('T')[0];
                
                days.push({
                    date: dateStr,
                    displayDate: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                    steps: stepsByDate[dateStr] || 0
                });
            }
            
            // Find max steps for scaling
            const maxSteps = Math.max(...days.map(d => d.steps), 1);
            
            // Create bars
            const bars = days.map(day => {
                const heightPercent = day.steps > 0 ? (day.steps / maxSteps) * 90 + 10 : 5; // Min 5% height for empty days
                const isToday = day.date === today.toISOString().split('T')[0];
                const hasData = day.steps > 0;
                
                return `<div class="step-bar ${!hasData ? 'no-data' : ''}" 
                             style="height: ${heightPercent}%${isToday ? '; border: 2px solid #667eea;' : ''}"
                             data-date="${day.displayDate}" 
                             data-steps="${hasData ? day.steps.toLocaleString() + ' steps' : 'No data'}"
                             title="${day.displayDate}: ${hasData ? day.steps.toLocaleString() + ' steps' : 'No data'}">
                        </div>`;
            }).join('');
            
            chartContainer.innerHTML = bars;
        }
        
        // Load leaderboard
        async function loadLeaderboard() {
            try {
                const response = await fetch('/api/leaderboard');
                const data = await response.json();
                
                console.log('Leaderboard API response:', data);
                
                const leaderboardDiv = document.getElementById('leaderboard');
                
                
                // Handle legacy all-time format or new challenge format
                let leaderboard = [];
                let challengeInfo = '';
                
                if (data.type === 'all_time') {
                    leaderboard = data.data;
                    challengeInfo = '<h3>All-Time Rankings</h3>';
                } else if (data.type === 'challenge') {
                    challengeInfo = `<h3>${data.meta.challenge_name} - Day ${data.meta.challenge_day}</h3>`;
                }
                
                let html = challengeInfo;
                
                // Show ranked section
                if (data.data.ranked && data.data.ranked.length > 0) {
                    html += '<div class="ranked-section"><h4 style="color: #28a745; margin: 15px 0 10px 0;">Ranked Participants</h4>';
                    html += data.data.ranked.map((user, index) => {
                        const isCurrentUser = currentUser && user.name === currentUser.name;
                        const highlightClass = isCurrentUser ? ' current-user' : '';
                        
                        return `<div class="leaderboard-item${highlightClass}">
                            <div>
                                <span class="rank">#${index + 1}</span>
                                <strong>${user.name}</strong>
                                ${user.team ? `<span style="color: #666;">(${user.team})</span>` : ''}
                                <span style="color: #28a745; font-size: 0.8em;">
                                    ${user.personal_reporting_rate >= 1 ? Math.round(user.personal_reporting_rate) : user.personal_reporting_rate}% reporting
                                </span>
                            </div>
                            <div>
                                <div><strong>${Math.round(user.steps_per_day_reported).toLocaleString()}</strong> steps/day</div>
                                <div style="font-size: 0.9em; color: #666;">
                                    ${user.total_steps.toLocaleString()} total • ${user.days_logged} days
                                </div>
                            </div>
                        </div>`;
                    }).join('');
                    html += '</div>';
                }
                
                // Show unranked section
                if (data.data.unranked && data.data.unranked.length > 0) {
                    html += '<div class="unranked-section"><h4 style="color: #ffc107; margin: 15px 0 10px 0;">Unranked Participants</h4>';
                    html += '<p style="font-size: 0.85em; color: #666; margin-bottom: 10px;">Need more consistent reporting to be ranked</p>';
                    html += data.data.unranked.map((user) => {
                        const isCurrentUser = currentUser && user.name === currentUser.name;
                        const highlightClass = isCurrentUser ? ' current-user' : '';
                        
                        return `<div class="leaderboard-item${highlightClass}" style="opacity: 0.8;">
                            <div>
                                <span class="rank">-</span>
                                <strong>${user.name}</strong>
                                ${user.team ? `<span style="color: #666;">(${user.team})</span>` : ''}
                                <span style="color: #ffc107; font-size: 0.8em;">
                                    ${user.personal_reporting_rate >= 1 ? Math.round(user.personal_reporting_rate) : user.personal_reporting_rate}% reporting
                                </span>
                            </div>
                            <div>
                                <div><strong>${Math.round(user.steps_per_day_reported).toLocaleString()}</strong> steps/day</div>
                                <div style="font-size: 0.9em; color: #666;">
                                    ${user.total_steps.toLocaleString()} total • ${user.days_logged} days
                                </div>
                            </div>
                        </div>`;
                    }).join('');
                    html += '</div>';
                }
                
                // Handle legacy array format (all-time rankings)
                if (Array.isArray(data)) {
                    html = data.map((user, index) => {
                        const isCurrentUser = currentUser && user.name === currentUser.name;
                        const highlightClass = isCurrentUser ? ' current-user' : '';
                        
                        return `<div class="leaderboard-item${highlightClass}">
                            <div>
                                <span class="rank">#${index + 1}</span>
                                <strong>${user.name}</strong>
                                ${user.team ? `<span style="color: #666;">(${user.team})</span>` : ''}
                            </div>
                            <div>
                                <div><strong>${Math.round(user.steps_per_day_reported).toLocaleString()}</strong> steps/day</div>
                                <div style="font-size: 0.9em; color: #666;">
                                    ${user.total_steps.toLocaleString()} total • ${user.days_logged} days
                                </div>
                            </div>
                        </div>`;
                    }).join('');
                }
                
                leaderboardDiv.innerHTML = html;
            } catch (error) {
                console.error('Leaderboard error:', error);
                document.getElementById('leaderboard').innerHTML = '<p>Error loading leaderboard</p>';
            }
        }
        
        // Handle form submission
        document.getElementById('stepsForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const date = document.getElementById('date').value;
            const steps = parseInt(document.getElementById('steps').value);
            const messageDiv = document.getElementById('stepsMessage');
            
            // Comprehensive client-side date validation for all browsers (including Safari)
            if (currentUser && currentUser.current_challenge) {
                const challenge = currentUser.current_challenge;
                
                // Validate date format first
                if (!date || date.trim() === '') {
                    messageDiv.innerHTML = '<div class="message error">Please select a date.</div>';
                    return;
                }
                
                // Parse dates carefully for inclusive date range
                const stepDate = new Date(date + 'T12:00:00'); // Use noon to avoid timezone edge cases
                const startDate = new Date(challenge.start_date + 'T00:00:00');
                const endDate = new Date(challenge.end_date + 'T23:59:59');
                
                // Check if date parsing was successful
                if (isNaN(stepDate.getTime())) {
                    messageDiv.innerHTML = '<div class="message error">Please enter a valid date.</div>';
                    return;
                }
                
                // Prevent future date entries (allow +1 day for timezone flexibility)
                const now = new Date();
                const maxAllowedDate = new Date(now);
                maxAllowedDate.setDate(maxAllowedDate.getDate() + 1);
                
                if (stepDate.getTime() > maxAllowedDate.getTime()) {
                    messageDiv.innerHTML = '<div class="message error">Cannot enter steps for future dates.</div>';
                    return;
                }
                
                // Compare dates using getTime() for cross-browser compatibility
                // Only block dates before challenge start - allow historical catch-up entries within challenge period
                if (stepDate.getTime() < startDate.getTime()) {
                    messageDiv.innerHTML = `<div class="message error">Step logging is only allowed from the challenge start date onwards (${formatDate(challenge.start_date)}).</div>`;
                    return;
                }
            }
            
            // Additional validation for steps input
            if (!steps || steps <= 0) {
                messageDiv.innerHTML = '<div class="message error">Please enter a valid number of steps.</div>';
                return;
            }
            
            if (steps > 100000) {
                messageDiv.innerHTML = '<div class="message error">Maximum 100,000 steps per day allowed.</div>';
                return;
            }
            
            try {
                const token = await getCSRFToken();
                const response = await fetch('/api/steps', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        date: date,
                        count: steps,
                        csrfToken: token
                    })
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    messageDiv.innerHTML = '<div class="message success">Steps saved successfully!</div>';
                    document.getElementById('steps').value = '';
                    
                    // Trigger confetti for high step counts
                    celebrateSteps(steps);
                    
                    loadSteps(); // Reload the steps list
                } else if (response.status === 429) {
                    const retryAfter = Math.floor(data.retryAfter / 60) || 60; // Convert to minutes
                    messageDiv.innerHTML = '<div class="message error">Too many requests. Please wait ' + retryAfter + ' minutes before trying again.</div>';
                } else {
                    messageDiv.innerHTML = '<div class="message error">' + data.error + '</div>';
                }
            } catch (error) {
                messageDiv.innerHTML = '<div class="message error">Network error. Please try again.</div>';
            }
        });
        
        // Load team leaderboard
        async function loadTeamLeaderboard() {
            // Clear expanded state when reloading
            expandedTeams.clear();
            
            try {
                const response = await fetch('/api/team-leaderboard');
                const data = await response.json();
                
                const teamLeaderboard = document.getElementById('teamLeaderboard');
                
                // Handle different response types
                if (data.type === 'insufficient_data') {
                    teamLeaderboard.innerHTML = `<div class="info-message">
                        <h3>${data.meta.challenge_name} - Day ${data.meta.challenge_day}</h3>
                        <p>${data.message}</p>
                        <p style="font-size: 0.9em; color: #666;">
                            ${data.meta.actual_entries}/${data.meta.expected_entries} expected team entries 
                            (${data.meta.reporting_percentage >= 1 ? Math.round(data.meta.reporting_percentage) : data.meta.reporting_percentage}% team participation)
                        </p>
                    </div>`;
                    return;
                }
                
                // Handle legacy all-time format or new challenge format
                let challengeInfo = '';
                
                if (data.type === 'all_time') {
                    challengeInfo = '<h3>All-Time Team Rankings</h3>';
                } else if (data.type === 'challenge') {
                    challengeInfo = `<h3>${data.meta.challenge_name} - Day ${data.meta.challenge_day}</h3>`;
                }
                
                let html = challengeInfo;
                
                // Show ranked teams section
                if (data.data.ranked && data.data.ranked.length > 0) {
                    html += '<div class="ranked-section"><h4 style="color: #28a745; margin: 15px 0 10px 0;">Ranked Teams</h4>';
                    html += data.data.ranked.map((team, index) => {
                        const isCurrentTeam = currentUser && currentUser.team === team.team;
                        const highlightClass = isCurrentTeam ? ' current-team' : '';
                        
                        return `<div class="leaderboard-item${highlightClass}">
                            <div>
                                <span class="team-disclosure" data-team="${team.team}">▶</span>
                                <span class="rank">#${index + 1}</span>
                                <strong>${team.team}</strong>
                                <span style="color: #666;">(${team.member_count} members)</span>
                                <span style="color: #28a745; font-size: 0.8em;">
                                    ${team.team_reporting_rate >= 1 ? Math.round(team.team_reporting_rate) : team.team_reporting_rate}% reporting
                                </span>
                            </div>
                            <div>
                                <div><strong>${Math.round(team.team_steps_per_day_reported).toLocaleString()}</strong> steps/day</div>
                                <div style="font-size: 0.9em; color: #666;">
                                    ${team.total_steps.toLocaleString()} total steps
                                </div>
                            </div>
                        </div>`;
                    }).join('');
                    html += '</div>';
                }
                
                // Show unranked teams section
                if (data.data.unranked && data.data.unranked.length > 0) {
                    html += '<div class="unranked-section"><h4 style="color: #ffc107; margin: 15px 0 10px 0;">Unranked Teams</h4>';
                    html += '<p style="font-size: 0.85em; color: #666; margin-bottom: 10px;">Need more consistent team reporting to be ranked</p>';
                    html += data.data.unranked.map((team) => {
                        const isCurrentTeam = currentUser && currentUser.team === team.team;
                        const highlightClass = isCurrentTeam ? ' current-team' : '';
                        
                        return `<div class="leaderboard-item${highlightClass}" style="opacity: 0.8;">
                            <div>
                                <span class="team-disclosure" data-team="${team.team}">▶</span>
                                <span class="rank">-</span>
                                <strong>${team.team}</strong>
                                <span style="color: #666;">(${team.member_count} members)</span>
                                <span style="color: #ffc107; font-size: 0.8em;">
                                    ${team.team_reporting_rate >= 1 ? Math.round(team.team_reporting_rate) : team.team_reporting_rate}% reporting
                                </span>
                            </div>
                            <div>
                                <div><strong>${Math.round(team.team_steps_per_day_reported).toLocaleString()}</strong> steps/day</div>
                                <div style="font-size: 0.9em; color: #666;">
                                    ${team.total_steps.toLocaleString()} total steps
                                </div>
                            </div>
                        </div>`;
                    }).join('');
                    html += '</div>';
                }
                
                // Handle legacy array format (all-time rankings) or empty data
                if (Array.isArray(data)) {
                    if (data.length === 0) {
                        html = '<p>No teams with members yet.</p>';
                    } else {
                        html = data.map((team, index) => {
                            const isCurrentTeam = currentUser && currentUser.team === team.team;
                            const highlightClass = isCurrentTeam ? ' current-team' : '';
                            
                            return `<div class="leaderboard-item${highlightClass}">
                                <div>
                                    <span class="team-disclosure" data-team="${team.team}">▶</span>
                                    <span class="rank">#${index + 1}</span>
                                    <strong>${team.team}</strong>
                                    <span style="color: #666;">(${team.member_count} members)</span>
                                </div>
                                <div>
                                    <div><strong>${Math.round(team.team_steps_per_day_reported).toLocaleString()}</strong> steps/day</div>
                                    <div style="font-size: 0.9em; color: #666;">
                                        ${team.total_steps.toLocaleString()} total steps
                                    </div>
                                </div>
                            </div>`;
                        }).join('');
                    }
                }
                
                teamLeaderboard.innerHTML = html;
                attachDisclosureListeners();
            } catch (error) {
                console.error('Team leaderboard error:', error);
                document.getElementById('teamLeaderboard').innerHTML = '<p>Error loading team leaderboard</p>';
            }
        }

        // Attach event listeners to disclosure triangles
        function attachDisclosureListeners() {
            const disclosureTriangles = document.querySelectorAll('.team-disclosure');
            disclosureTriangles.forEach(triangle => {
                triangle.addEventListener('click', function() {
                    const teamName = this.getAttribute('data-team');
                    toggleTeamDisclosure(teamName, this);
                });
            });
        }

        // Team member disclosure functionality
        async function toggleTeamDisclosure(teamName, disclosureElement) {
            console.log('toggleTeamDisclosure called with:', teamName, disclosureElement);
            const isExpanded = expandedTeams.has(teamName);
            
            if (isExpanded) {
                // Collapse
                const membersList = document.getElementById(`members-${teamName.replace(/[^a-zA-Z0-9]/g, '_')}`);
                if (membersList) {
                    membersList.style.maxHeight = membersList.scrollHeight + 'px';
                    membersList.style.overflow = 'hidden';
                    requestAnimationFrame(() => {
                        membersList.style.maxHeight = '0px';
                        setTimeout(() => {
                            membersList.remove();
                        }, 300);
                    });
                }
                
                disclosureElement.innerHTML = '▶';
                expandedTeams.delete(teamName);
            } else {
                // Expand
                try {
                    const response = await fetch(`/api/teams/${encodeURIComponent(teamName)}/members`);
                    const members = await response.json();
                    
                    if (response.ok) {
                        const membersList = createMembersList(teamName, members);
                        const teamItem = disclosureElement.closest('.leaderboard-item');
                        teamItem.insertAdjacentElement('afterend', membersList);
                        
                        // Animate expansion
                        membersList.style.maxHeight = '0px';
                        membersList.style.overflow = 'hidden';
                        requestAnimationFrame(() => {
                            membersList.style.maxHeight = membersList.scrollHeight + 'px';
                            setTimeout(() => {
                                membersList.style.maxHeight = 'none';
                                membersList.style.overflow = 'visible';
                            }, 300);
                        });
                        
                        disclosureElement.innerHTML = '▼';
                        expandedTeams.add(teamName);
                    } else {
                        console.error('Error loading team members:', members.error);
                    }
                } catch (error) {
                    console.error('Error fetching team members:', error);
                }
            }
        }

        function createMembersList(teamName, members) {
            const membersList = document.createElement('div');
            membersList.id = `members-${teamName.replace(/[^a-zA-Z0-9]/g, '_')}`;
            membersList.className = 'team-members-list';
            membersList.style.transition = 'max-height 0.3s ease-out';
            
            const membersHtml = members.map(member => `
                <div class="member-item">
                    <div class="member-info">
                        <span class="member-name">${member.name}</span>
                        ${member.personal_reporting_rate !== undefined ? 
                            `<span class="member-reporting">${member.personal_reporting_rate >= 1 ? Math.round(member.personal_reporting_rate) : member.personal_reporting_rate}% reporting</span>` 
                            : ''}
                    </div>
                    <div class="member-stats">
                        <div><strong>${Math.round(member.steps_per_day_reported).toLocaleString()}</strong> steps/day</div>
                        <div style="font-size: 0.8em; color: #666;">
                            ${member.total_steps.toLocaleString()} total • ${member.days_logged} days
                        </div>
                    </div>
                </div>
            `).join('');
            
            membersList.innerHTML = membersHtml;
            return membersList;
        }

        // Load initial data
        loadCurrentUser().then(() => {
            loadSteps();
        });
});
