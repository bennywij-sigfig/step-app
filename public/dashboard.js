document.addEventListener('DOMContentLoaded', function() {
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
                    ${!isWithinPeriod ? '<p style="color: #d63384; font-weight: 500;">⚠️ Step logging is only allowed during the challenge period.</p>' : ''}
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
                
                // Set date input constraints
                dateInput.min = challenge.start_date;
                dateInput.max = challenge.end_date;
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
            document.getElementById('myStepsBtn').classList.add('active');
            document.getElementById('leaderboardBtn').classList.remove('active');
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
                    document.getElementById('stepsList').innerHTML = '<p>⏰ Too many requests. Please wait ' + retryAfter + ' minutes and refresh the page.</p>';
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
                const leaderboard = await response.json();
                
                const leaderboardDiv = document.getElementById('leaderboard');
                leaderboardDiv.innerHTML = leaderboard.map((user, index) => {
                    const isCurrentUser = currentUser && user.email === currentUser.email;
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
            } catch (error) {
                document.getElementById('leaderboard').innerHTML = '<p>Error loading leaderboard</p>';
            }
        }
        
        // Handle form submission
        document.getElementById('stepsForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const date = document.getElementById('date').value;
            const steps = parseInt(document.getElementById('steps').value);
            const messageDiv = document.getElementById('stepsMessage');
            
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
                    messageDiv.innerHTML = '<div class="message success">✅ Steps saved successfully!</div>';
                    document.getElementById('steps').value = '';
                    loadSteps(); // Reload the steps list
                } else if (response.status === 429) {
                    const retryAfter = Math.floor(data.retryAfter / 60) || 60; // Convert to minutes
                    messageDiv.innerHTML = '<div class="message error">⏰ Too many requests. Please wait ' + retryAfter + ' minutes before trying again.</div>';
                } else {
                    messageDiv.innerHTML = '<div class="message error">❌ ' + data.error + '</div>';
                }
            } catch (error) {
                messageDiv.innerHTML = '<div class="message error">❌ Network error. Please try again.</div>';
            }
        });
        
        // Load team leaderboard
        async function loadTeamLeaderboard() {
            try {
                const response = await fetch('/api/team-leaderboard');
                const teams = await response.json();
                
                const teamLeaderboard = document.getElementById('teamLeaderboard');
                if (teams.length === 0) {
                    teamLeaderboard.innerHTML = '<p>No teams with members yet.</p>';
                } else {
                    teamLeaderboard.innerHTML = teams.map((team, index) => {
                        const isCurrentTeam = currentUser && currentUser.team === team.team;
                        const highlightClass = isCurrentTeam ? ' current-team' : '';
                        
                        return `<div class="leaderboard-item${highlightClass}">
                            <div>
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
            } catch (error) {
                document.getElementById('teamLeaderboard').innerHTML = '<p>Error loading team leaderboard</p>';
            }
        }

        // Load initial data
        loadCurrentUser().then(() => {
            loadSteps();
        });
});
