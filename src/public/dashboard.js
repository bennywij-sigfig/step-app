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

// Team disclosure functionality - must be global
let expandedTeams = new Set(); // Track expanded state

// Individual user disclosure functionality
let expandedUsers = new Set(); // Track expanded user data state

// Note: confettiThresholds now declared in confetti.js




// Note: Mega confetti functions moved to mega-confetti-physics.js
// createMegaConfetti is now provided by the physics module

// Fun features initialization
async function initializeFunFeatures() {
    try {
        // Check if fun is enabled from localStorage (set by admin)
        const funEnabled = localStorage.getItem('allowFun') === 'true';
        
        const funGameSection = document.getElementById('funGameSection');
        const pigGameBtn = document.getElementById('pigGameBtn');
        
        if (funEnabled && funGameSection && pigGameBtn) {
            // Show the fun game section
            funGameSection.style.display = 'block';
            
            // Random button text options
            const randomTexts = [
                "Hmmm?",
                "Look what you made me do", 
                "Hot to trot",
                "What is this?",
                "I can win this one"
            ];
            
            // Set random text on the button
            const randomText = randomTexts[Math.floor(Math.random() * randomTexts.length)];
            pigGameBtn.textContent = randomText;
            
            // Add click handler to navigate to pig game
            pigGameBtn.addEventListener('click', function() {
                window.location.href = '/pig';
            });
        }
    } catch (error) {
        console.error('Error initializing fun features:', error);
    }
}

// Load confetti thresholds from server
async function loadConfettiThresholds() {
    try {
        const response = await fetch('/api/confetti-thresholds');
        if (response.ok) {
            const thresholds = await response.json();
            if (window.updateConfettiThresholds) {
                window.updateConfettiThresholds(thresholds);
            }
            console.log('✅ Loaded confetti thresholds:', thresholds);
        } else {
            console.warn('Failed to load confetti thresholds, using defaults');
        }
    } catch (error) {
        console.warn('Error loading confetti thresholds, using defaults:', error);
    }
}

document.addEventListener('DOMContentLoaded', function() {
    // Initialize theme
    initializeTheme();
    
    // Load confetti thresholds
    loadConfettiThresholds();
    
    // Initialize fun features
    initializeFunFeatures();
    
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
                const welcomeMsg = document.getElementById('welcomeMessage');
                if (welcomeMsg) {
                    const username = currentUser.email.split('@')[0];
                    welcomeMsg.textContent = `Welcome, ${username}!`;
                }
                
                // Update challenge info display
                updateChallengeInfo(currentUser.current_challenge);
                
                // Setup admin navigation if user is admin
                if (currentUser.is_admin) {
                    setupAdminNavigation();
                }
            } catch (error) {
                console.error('Error loading user:', error);
                window.location.href = '/';
            }
        }
        
        // Singapore reaches each date first among the supported challenge regions.
        // Using it for the entry ceiling matches the server's inclusive policy.
        function getLatestSupportedDate() {
            const parts = new Intl.DateTimeFormat('en-US', {
                timeZone: 'Asia/Singapore',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            }).formatToParts(new Date());
            const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
            return `${values.year}-${values.month}-${values.day}`;
        }

        // Update challenge information display
        function updateChallengeInfo(challenge) {
            const challengeInfo = document.getElementById('challengeInfo');
            const form = document.getElementById('stepsForm');
            const submitBtn = document.getElementById('submitStepsBtn');
            const dateInput = document.getElementById('date');
            
            if (challenge) {
                const now = new Date();
                const startDate = new Date(challenge.window_start_utc || `${challenge.start_date}T00:00:00+08:00`);
                const endDate = new Date(challenge.window_end_utc || `${challenge.end_date}T23:59:59-07:00`);
                const isWithinPeriod = now >= startDate && now <= endDate;
                
                // Calculate days remaining against the inclusive global window.
                let daysInfo = '';
                if (isWithinPeriod) {
                    const daysRemaining = Math.max(0, Math.ceil((endDate - now) / (1000 * 60 * 60 * 24)));
                    daysInfo = `${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} remaining`;
                } else if (now < startDate) {
                    const daysUntilStart = Math.ceil((startDate - now) / (1000 * 60 * 60 * 24));
                    daysInfo = `starts in ${daysUntilStart} day${daysUntilStart !== 1 ? 's' : ''}`;
                } else {
                    daysInfo = 'challenge ended';
                }
                
                challengeInfo.innerHTML = `
                    <div class="challenge-header" id="challengeHeader">
                        <div class="challenge-title">
                            <div class="challenge-name">
                                <div class="challenge-expand" id="challengeExpand">▶</div>
                                <h3>${escapeHtml(challenge.name)}</h3>
                            </div>
                            <div class="challenge-status">${daysInfo}</div>
                        </div>
                    </div>
                    <div class="challenge-details" id="challengeDetails">
                        <p><strong>Period:</strong> ${formatDate(challenge.start_date)} to ${formatDate(challenge.end_date)}</p>
                        ${now >= startDate ? '<p>You can log steps for any date within the challenge period, including retroactive entries.</p>' : ''}
                        ${now > endDate ? '<p style="color: #28a745; font-size: 14px; margin-top: 4px;">✓ Challenge ended - retroactive step entry available for dates within challenge period.</p>' : ''}
                    </div>
                `;
                
                // Add event listeners after creating the HTML
                const challengeHeader = document.getElementById('challengeHeader');
                
                if (challengeHeader) {
                    challengeHeader.addEventListener('click', toggleChallengeDetails);
                }
                
                challengeInfo.className = isWithinPeriod ? 'challenge-info active' : 'challenge-info inactive';
                challengeInfo.classList.remove('hidden');
                
                // Always enable form for retroactive entry within challenge period
                // Users can enter steps for any date within the challenge period
                form.classList.remove('form-disabled');
                submitBtn.textContent = 'Save Steps';
                submitBtn.disabled = false;
                
                // Set date input constraints (works in most browsers)
                dateInput.min = challenge.start_date;
                
                // Cap at both the challenge end and the earliest supported region's
                // current date. This is intentionally generous across time zones.
                const latestSupportedDate = getLatestSupportedDate();
                dateInput.max = latestSupportedDate < challenge.end_date
                    ? latestSupportedDate
                    : challenge.end_date;
                
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
            
            // Match the server's generous cross-region future-date ceiling.
            if (date > getLatestSupportedDate()) {
                dateInput.style.borderColor = '#dc3545';
                dateInput.style.backgroundColor = '#fff5f5';
                messageDiv.innerHTML = '<div class="message error">Cannot enter steps for future dates</div>';
                return;
            }
            
            // Use getTime() for reliable cross-browser date comparison
            // Block dates before challenge start
            if (stepDate.getTime() < startDate.getTime()) {
                dateInput.style.borderColor = '#dc3545';
                dateInput.style.backgroundColor = '#fff5f5';
                messageDiv.innerHTML = `<div class="message error">This challenge hasn’t started yet. You can log steps from ${formatDate(challenge.start_date)}.</div>`;
                return;
            }
            
            // Block dates after challenge end date (no retroactive entry beyond challenge period)
            if (stepDate.getTime() > endDate.getTime()) {
                dateInput.style.borderColor = '#dc3545';
                dateInput.style.backgroundColor = '#fff5f5';
                messageDiv.innerHTML = `<div class="message error">Choose a date within the challenge period (${formatDate(challenge.start_date)} to ${formatDate(challenge.end_date)}).</div>`;
                return;
            }
            
            // Date is valid - within challenge period
            dateInput.style.borderColor = '#667eea';
            dateInput.style.backgroundColor = '#f8fff8';
            messageDiv.innerHTML = '<div class="message success">Date is valid</div>';
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

        function formatCompactDate(dateString) {
            const date = new Date(dateString + 'T00:00:00');
            return date.toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        }
        
        // Set date selector to user's device "today" date, with challenge end date as ceiling
        function setTodayDate(challenge = null) {
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0'); // getMonth() is 0-based
            const day = String(now.getDate()).padStart(2, '0');
            let targetDate = `${year}-${month}-${day}`;
            
            if (challenge) {
                const latestSupportedDate = getLatestSupportedDate();
                if (latestSupportedDate >= challenge.start_date && targetDate < challenge.start_date) {
                    targetDate = challenge.start_date;
                }
                if (targetDate > challenge.end_date) {
                    targetDate = challenge.end_date;
                }
            }

            console.log(`📅 Date selector: Set to ${targetDate} (inclusive cross-region policy)`);
            
            const dateInput = document.getElementById('date');
            dateInput.value = targetDate;
        }
        
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
        
        // CSV Download functionality
        document.getElementById('csvDownloadBtn').addEventListener('click', async () => {
            const button = document.getElementById('csvDownloadBtn');
            const originalText = button.textContent;
            
            try {
                // Show loading state
                button.disabled = true;
                button.textContent = '📊 Preparing...';
                button.style.opacity = '0.6';
                
                // Download the CSV file
                const response = await fetch('/api/steps/csv');
                
                if (!response.ok) {
                    throw new Error('Failed to download CSV');
                }
                
                // Create download link
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                
                // Extract filename from Content-Disposition header if available
                const contentDisposition = response.headers.get('Content-Disposition');
                let filename = 'my_step_data.csv';
                if (contentDisposition) {
                    const filenameMatch = contentDisposition.match(/filename="(.+)"/);
                    if (filenameMatch) {
                        filename = filenameMatch[1];
                    }
                }
                a.download = filename;
                
                document.body.appendChild(a);
                a.click();
                
                // Cleanup
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                
                // Show success feedback
                button.textContent = '✅ Downloaded!';
                setTimeout(() => {
                    button.textContent = originalText;
                    button.disabled = false;
                    button.style.opacity = '1';
                }, 2000);
                
            } catch (error) {
                console.error('CSV download error:', error);
                
                // Show error feedback
                button.textContent = '❌ Error';
                setTimeout(() => {
                    button.textContent = originalText;
                    button.disabled = false;
                    button.style.opacity = '1';
                }, 3000);
            }
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
                            <span>${formatCompactDate(step.date)}</span>
                            <span><strong>${step.count.toLocaleString()} steps</strong></span>
                        </div>`
                    ).join('');
                }
                
                // Update chart
                renderStepsChart(steps);
                
                // Set date selector to today (with challenge end date as ceiling if applicable)
                setTodayDate(currentUser?.current_challenge);
                
            } catch (error) {
                document.getElementById('stepsList').innerHTML = '<p>Error loading steps</p>';
                document.getElementById('stepsChart').innerHTML = '<p>Error loading chart</p>';
            }
        }

        // Refresh the existing dashboard after Step Chat commits entries.
        window.addEventListener('step-chat-saved', loadSteps);
        
        // Render at most 14 elapsed dates. Future challenge dates made the old
        // chart look empty and compressed useful data into narrow bars.
        function renderStepsChart(steps) {
            const chartContainer = document.getElementById('stepsChart');
            if (steps.length === 0) {
                chartContainer.innerHTML = '<p class="steps-chart-empty">No step data to display</p>';
                return;
            }

            const parseDate = value => new Date(`${value}T00:00:00Z`);
            const dateString = value => value.toISOString().slice(0, 10);
            const shiftDate = (value, days) => {
                const date = parseDate(value);
                date.setUTCDate(date.getUTCDate() + days);
                return dateString(date);
            };
            const formatShortDate = value => parseDate(value).toLocaleDateString(undefined, {
                month: 'short', day: 'numeric', timeZone: 'UTC'
            });

            const stepsByDate = new Map(steps.map(step => [step.date, Number(step.count) || 0]));
            const latestSupportedDate = getLatestSupportedDate();
            let endDate = latestSupportedDate;
            let startDate = shiftDate(endDate, -13);

            if (currentUser?.current_challenge) {
                const challenge = currentUser.current_challenge;
                endDate = challenge.end_date < latestSupportedDate ? challenge.end_date : latestSupportedDate;
                if (endDate < challenge.start_date) {
                    chartContainer.innerHTML = '<p class="steps-chart-empty">The challenge has not started yet</p>';
                    return;
                }
                startDate = shiftDate(endDate, -13);
                if (startDate < challenge.start_date) startDate = challenge.start_date;
            }

            const days = [];
            for (let date = startDate; date <= endDate; date = shiftDate(date, 1)) {
                days.push({ date, steps: stepsByDate.get(date) || 0 });
            }

            const loggedDays = days.filter(day => day.steps > 0);
            const total = loggedDays.reduce((sum, day) => sum + day.steps, 0);
            const average = loggedDays.length ? Math.round(total / loggedDays.length) : 0;
            const maxSteps = Math.max(...days.map(day => day.steps), 1);
            const bars = days.map(day => {
                const hasData = day.steps > 0;
                const heightPercent = hasData ? Math.max(6, (day.steps / maxSteps) * 100) : 3;
                const detail = hasData ? `${day.steps.toLocaleString()} steps` : 'No steps logged';
                return `<div class="step-bar${hasData ? '' : ' no-data'}"
                    style="height: ${heightPercent}%"
                    data-day="${Number(day.date.slice(-2))}"
                    data-steps="${detail}"
                    role="img" title="${formatShortDate(day.date)}: ${detail}"
                    aria-label="${formatShortDate(day.date)}: ${detail}"></div>`;
            }).join('');

            const dateRange = startDate === endDate
                ? formatShortDate(startDate)
                : `${formatShortDate(startDate)}–${formatShortDate(endDate)}`;
            const activitySummary = loggedDays.length
                ? `${loggedDays.length} logged · ${average.toLocaleString()} avg`
                : 'No days logged';
            chartContainer.innerHTML = `
                <div class="steps-chart-summary">
                    <span>${dateRange}</span>
                    <span>${activitySummary}</span>
                </div>
                <div class="steps-chart" style="--bar-count: ${days.length}">${bars}</div>`;
        }
        
        // Load leaderboard
        async function loadLeaderboard() {
            // Clear expanded user state when reloading individual leaderboard
            expandedUsers.clear();
            
            // Update header text based on challenge status
            const leaderboardHeader = document.querySelector('#leaderboardView h2');
            if (!currentUser || !currentUser.current_challenge) {
                leaderboardHeader.textContent = 'No active challenge';
            } else {
                leaderboardHeader.textContent = 'Individual Leaderboard';
            }
            
            try {
                const response = await fetch('/api/leaderboard');
                const data = await response.json();
                
                const leaderboardDiv = document.getElementById('leaderboard');
                
                
                // Handle legacy all-time format or new challenge format
                let leaderboard = [];
                let challengeInfo = '';
                
                if (data.type === 'all_time') {
                    leaderboard = data.data;
                    challengeInfo = '<h3>All-Time Rankings</h3>';
                } else if (data.type === 'challenge') {
                    challengeInfo = `<h3>${escapeHtml(data.meta.challenge_name)} - Day ${data.meta.challenge_day}</h3>`;
                }
                
                let html = challengeInfo;
                
                // Show ranked section
                if (data.data.ranked && data.data.ranked.length > 0) {
                    html += '<div class="ranked-section"><h4 class="leaderboard-section-title">Ranked Participants</h4>';
                    html += data.data.ranked.map((user, index) => {
                        const isCurrentUser = currentUser && user.name === currentUser.name;
                        const highlightClass = isCurrentUser ? ' current-user' : '';
                        
                        return `<div class="leaderboard-item${highlightClass}">
                            <div class="leaderboard-identity">
                                <button type="button" class="team-disclosure" data-user-id="${user.id}" data-user-name="${escapeHtml(user.name)}" aria-expanded="false" aria-label="Show daily steps for ${escapeHtml(user.name)}"></button>
                                <span class="rank">#${index + 1}</span>
                                <span class="leaderboard-name">${escapeHtml(user.name)}</span>
                                ${user.team ? `<span class="leaderboard-meta">${escapeHtml(user.team)}</span>` : ''}
                                ${formatReportingRate(user.personal_reporting_rate)}
                            </div>
                            <div class="leaderboard-metrics">
                                <div><span class="leaderboard-average">${Math.round(user.steps_per_day_reported).toLocaleString()}</span> steps/day</div>
                                <div class="leaderboard-detail">${user.total_steps.toLocaleString()} total · ${user.days_logged} days</div>
                            </div>
                        </div>`;
                    }).join('');
                    html += '</div>';
                }
                
                // Show unranked section
                if (data.data.unranked && data.data.unranked.length > 0) {
                    html += '<div class="unranked-section"><h4 class="leaderboard-section-title">Unranked Participants</h4>';
                    html += '<p class="leaderboard-section-note">Need more consistent reporting to be ranked</p>';
                    html += data.data.unranked.map((user) => {
                        const isCurrentUser = currentUser && user.name === currentUser.name;
                        const highlightClass = isCurrentUser ? ' current-user' : '';
                        
                        return `<div class="leaderboard-item${highlightClass}">
                            <div class="leaderboard-identity">
                                <button type="button" class="team-disclosure" data-user-id="${user.id}" data-user-name="${escapeHtml(user.name)}" aria-expanded="false" aria-label="Show daily steps for ${escapeHtml(user.name)}"></button>
                                <span class="rank" aria-hidden="true"></span>
                                <span class="leaderboard-name">${escapeHtml(user.name)}</span>
                                ${user.team ? `<span class="leaderboard-meta">${escapeHtml(user.team)}</span>` : ''}
                                ${formatReportingRate(user.personal_reporting_rate)}
                            </div>
                            <div class="leaderboard-metrics">
                                <div><span class="leaderboard-average">${Math.round(user.steps_per_day_reported).toLocaleString()}</span> steps/day</div>
                                <div class="leaderboard-detail">${user.total_steps.toLocaleString()} total · ${user.days_logged} days</div>
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
                            <div class="leaderboard-identity">
                                <button type="button" class="team-disclosure" data-user-id="${user.id}" data-user-name="${escapeHtml(user.name)}" aria-expanded="false" aria-label="Show daily steps for ${escapeHtml(user.name)}"></button>
                                <span class="rank">#${index + 1}</span>
                                <span class="leaderboard-name">${escapeHtml(user.name)}</span>
                                ${user.team ? `<span class="leaderboard-meta">${escapeHtml(user.team)}</span>` : ''}
                            </div>
                            <div class="leaderboard-metrics">
                                <div><span class="leaderboard-average">${Math.round(user.steps_per_day_reported).toLocaleString()}</span> steps/day</div>
                                <div class="leaderboard-detail">${user.total_steps.toLocaleString()} total · ${user.days_logged} days</div>
                            </div>
                        </div>`;
                    }).join('');
                }
                
                // Add explanatory footer if there's actual leaderboard content (Individual only shows reporting rate)
                const hasContent = (data.data.ranked && data.data.ranked.length > 0) || (data.data.unranked && data.data.unranked.length > 0) || Array.isArray(data);
                if (hasContent) {
                    html += '<div class="leaderboard-footer">Reporting rate reflects elapsed challenge days.</div>';
                }
                
                leaderboardDiv.innerHTML = html;
                
                // Attach disclosure listeners for individual leaderboard
                attachDisclosureListeners();
            } catch (error) {
                console.error('Leaderboard error:', error);
                document.getElementById('leaderboard').innerHTML = '<p>Error loading leaderboard</p>';
            }
        }
        
        // Handle form submission
        document.getElementById('stepsForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const date = document.getElementById('date').value;
            const rawSteps = document.getElementById('steps').value.trim();
            const steps = Number(rawSteps);
            const messageDiv = document.getElementById('stepsMessage');

            if (!date) {
                messageDiv.innerHTML = '<div class="message error">Please select a date.</div>';
                return;
            }
            if (date > getLatestSupportedDate()) {
                messageDiv.innerHTML = '<div class="message error">Cannot enter steps for future dates.</div>';
                return;
            }
            
            // Comprehensive client-side date validation for all browsers (including Safari)
            if (currentUser && currentUser.current_challenge) {
                const challenge = currentUser.current_challenge;
                const stepDate = new Date(date + 'T12:00:00'); // Use noon to avoid timezone edge cases
                const startDate = new Date(challenge.start_date + 'T00:00:00');
                const endDate = new Date(challenge.end_date + 'T23:59:59');
                
                if (isNaN(stepDate.getTime())) {
                    messageDiv.innerHTML = '<div class="message error">Please enter a valid date.</div>';
                    return;
                }
                if (stepDate.getTime() < startDate.getTime()) {
                    messageDiv.innerHTML = `<div class="message error">This challenge hasn’t started yet. You can log steps from ${formatDate(challenge.start_date)}.</div>`;
                    return;
                }
                if (stepDate.getTime() > endDate.getTime()) {
                    messageDiv.innerHTML = `<div class="message error">Choose a date within the challenge period (${formatDate(challenge.start_date)} to ${formatDate(challenge.end_date)}).</div>`;
                    return;
                }
            }
            
            if (rawSteps === '') {
                messageDiv.innerHTML = '<div class="message error">Please enter a step count.</div>';
                return;
            }
            if (!/^-?\d+$/.test(rawSteps) || !Number.isInteger(steps)) {
                messageDiv.innerHTML = '<div class="message error">Step count must be a whole number.</div>';
                return;
            }
            if (steps < 0) {
                messageDiv.innerHTML = '<div class="message error">Step count cannot be below 0.</div>';
                return;
            }
            if (steps > 70000) {
                messageDiv.innerHTML = '<div class="message error">Step count cannot exceed 70,000 per day.</div>';
                return;
            }
            
            if (window.stepEntryUX?.isEnabled) window.stepEntryUX.handleSubmitStart();

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
                    if (window.stepEntryUX?.isEnabled) {
                        window.stepEntryUX.handleSubmitSuccess(steps, messageDiv);
                        setTimeout(() => window.stepEntryUX.animateChartUpdate(), 100);
                    } else {
                        messageDiv.innerHTML = '<div class="message success">Steps saved successfully!</div>';
                    }
                    
                    document.getElementById('steps').value = '';
                    
                    // Trigger confetti for high step counts
                    celebrateSteps(steps);
                    
                    loadSteps(); // Reload the steps list
                } else {
                    if (window.stepEntryUX?.isEnabled) window.stepEntryUX.handleSubmitError();
                    if (response.status === 429) {
                        const retryAfter = Math.floor(data.retryAfter / 60) || 60; // Convert to minutes
                        messageDiv.innerHTML = '<div class="message error">Too many requests. Please wait ' + retryAfter + ' minutes before trying again.</div>';
                    } else {
                        messageDiv.innerHTML = '<div class="message error">' + data.error + '</div>';
                    }
                }
            } catch (error) {
                if (window.stepEntryUX?.isEnabled) window.stepEntryUX.handleSubmitError();
                messageDiv.innerHTML = '<div class="message error">Network error. Please try again.</div>';
            }
        });
        
        // Load team leaderboard
        async function loadTeamLeaderboard() {
            // Clear expanded state when reloading
            expandedTeams.clear();
            
            // Update header text based on challenge status
            const teamLeaderboardHeader = document.querySelector('#teamLeaderboardView h2');
            if (!currentUser || !currentUser.current_challenge) {
                teamLeaderboardHeader.textContent = 'No active challenge';
            } else {
                teamLeaderboardHeader.textContent = 'Team Leaderboard';
            }
            
            try {
                const response = await fetch('/api/team-leaderboard');
                const data = await response.json();
                
                const teamLeaderboard = document.getElementById('teamLeaderboard');
                
                // Handle different response types
                if (data.type === 'insufficient_data') {
                    teamLeaderboard.innerHTML = `<div class="info-message">
                        <h3>${escapeHtml(data.meta.challenge_name)} - Day ${data.meta.challenge_day}</h3>
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
                    challengeInfo = `<h3>${escapeHtml(data.meta.challenge_name)} - Day ${data.meta.challenge_day}</h3>`;
                }
                
                let html = challengeInfo;
                
                // Show ranked teams section
                if (data.data.ranked && data.data.ranked.length > 0) {
                    html += '<div class="ranked-section"><h4 class="leaderboard-section-title">Ranked Teams</h4>';
                    html += data.data.ranked.map((team, index) => {
                        const isCurrentTeam = currentUser && currentUser.team === team.team;
                        const highlightClass = isCurrentTeam ? ' current-team' : '';
                        
                        return `<div class="leaderboard-item${highlightClass}">
                            <div class="leaderboard-identity">
                                <button type="button" class="team-disclosure" data-team="${escapeHtml(team.team)}" aria-expanded="false" aria-label="Show members of ${escapeHtml(team.team)}"></button>
                                <span class="rank">#${index + 1}</span>
                                <span class="leaderboard-name">${escapeHtml(team.team)}</span>
                                ${formatMemberCount(team.member_count)}
                                ${formatReportingRate(team.team_reporting_rate)}
                            </div>
                            <div class="leaderboard-metrics">
                                <div><span class="leaderboard-average">${Math.round(team.team_steps_per_day_reported).toLocaleString()}</span> steps/day</div>
                                <div class="leaderboard-detail">${team.total_steps.toLocaleString()} total steps</div>
                            </div>
                        </div>`;
                    }).join('');
                    html += '</div>';
                }
                
                // Show unranked teams section
                if (data.data.unranked && data.data.unranked.length > 0) {
                    html += '<div class="unranked-section"><h4 class="leaderboard-section-title">Unranked Teams</h4>';
                    html += '<p class="leaderboard-section-note">Need more consistent team reporting to be ranked</p>';
                    html += data.data.unranked.map((team) => {
                        const isCurrentTeam = currentUser && currentUser.team === team.team;
                        const highlightClass = isCurrentTeam ? ' current-team' : '';
                        
                        return `<div class="leaderboard-item${highlightClass}">
                            <div class="leaderboard-identity">
                                <button type="button" class="team-disclosure" data-team="${escapeHtml(team.team)}" aria-expanded="false" aria-label="Show members of ${escapeHtml(team.team)}"></button>
                                <span class="rank" aria-hidden="true"></span>
                                <span class="leaderboard-name">${escapeHtml(team.team)}</span>
                                ${formatMemberCount(team.member_count)}
                                ${formatReportingRate(team.team_reporting_rate)}
                            </div>
                            <div class="leaderboard-metrics">
                                <div><span class="leaderboard-average">${Math.round(team.team_steps_per_day_reported).toLocaleString()}</span> steps/day</div>
                                <div class="leaderboard-detail">${team.total_steps.toLocaleString()} total steps</div>
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
                                <div class="leaderboard-identity">
                                    <button type="button" class="team-disclosure" data-team="${escapeHtml(team.team)}" aria-expanded="false" aria-label="Show members of ${escapeHtml(team.team)}"></button>
                                    <span class="rank">#${index + 1}</span>
                                    <span class="leaderboard-name">${escapeHtml(team.team)}</span>
                                    ${formatMemberCount(team.member_count)}
                                </div>
                                <div class="leaderboard-metrics">
                                    <div><span class="leaderboard-average">${Math.round(team.team_steps_per_day_reported).toLocaleString()}</span> steps/day</div>
                                    <div class="leaderboard-detail">${team.total_steps.toLocaleString()} total steps</div>
                                </div>
                            </div>`;
                        }).join('');
                    }
                }
                
                // Add explanatory footer if there's actual leaderboard content (Teams show both member count and reporting rate)
                const hasTeamContent = (data.data && ((data.data.ranked && data.data.ranked.length > 0) || (data.data.unranked && data.data.unranked.length > 0))) || (Array.isArray(data) && data.length > 0);
                if (hasTeamContent) {
                    html += '<div class="leaderboard-footer">Member count · reporting rate</div>';
                }
                
                teamLeaderboard.innerHTML = html;
                attachDisclosureListeners();
            } catch (error) {
                console.error('Team leaderboard error:', error);
                document.getElementById('teamLeaderboard').innerHTML = '<p>Error loading team leaderboard</p>';
            }
        }

        // Attach event listeners to disclosure triangles (both team and user)
        function attachDisclosureListeners() {
            const disclosureTriangles = document.querySelectorAll('.team-disclosure');
            disclosureTriangles.forEach(triangle => {
                triangle.addEventListener('click', function() {
                    const teamName = this.getAttribute('data-team');
                    const userId = this.getAttribute('data-user-id');
                    const userName = this.getAttribute('data-user-name');
                    
                    if (teamName) {
                        // This is a team disclosure
                        toggleTeamDisclosure(teamName, this);
                    } else if (userId && userName) {
                        // This is a user disclosure
                        toggleUserDisclosure(userId, userName, this);
                    }
                });
            });
        }

        // Team member disclosure functionality
        async function toggleTeamDisclosure(teamName, disclosureElement) {
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
                
                disclosureElement.classList.remove('expanded');
                disclosureElement.setAttribute('aria-expanded', 'false');
                disclosureElement.setAttribute('aria-label', `Show members of ${teamName}`);
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
                        
                        disclosureElement.classList.add('expanded');
                        disclosureElement.setAttribute('aria-expanded', 'true');
                        disclosureElement.setAttribute('aria-label', `Hide members of ${teamName}`);
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
                        <span class="member-name">${escapeHtml(member.name)}</span>
                        ${member.personal_reporting_rate !== undefined ? 
                            `<span class="member-reporting">${member.personal_reporting_rate >= 1 ? Math.round(member.personal_reporting_rate) : member.personal_reporting_rate}% reporting</span>` 
                            : ''}
                    </div>
                    <div class="member-stats">
                        <div><strong>${Math.round(member.steps_per_day_reported).toLocaleString()}</strong> steps/day</div>
                        <div class="leaderboard-detail">${member.total_steps.toLocaleString()} total · ${member.days_logged} days</div>
                    </div>
                </div>
            `).join('');
            
            membersList.innerHTML = membersHtml;
            return membersList;
        }


        // Toggle user daily data disclosure
        async function toggleUserDisclosure(userId, userName, disclosureElement) {
            const isExpanded = expandedUsers.has(userId);
            
            if (isExpanded) {
                // Collapse
                const userDataList = document.getElementById(`user-data-${userId}`);
                if (userDataList) {
                    userDataList.style.maxHeight = userDataList.scrollHeight + 'px';
                    userDataList.style.overflow = 'hidden';
                    requestAnimationFrame(() => {
                        userDataList.style.maxHeight = '0px';
                        setTimeout(() => {
                            userDataList.remove();
                        }, 300);
                    });
                }
                
                disclosureElement.classList.remove('expanded');
                disclosureElement.setAttribute('aria-expanded', 'false');
                disclosureElement.setAttribute('aria-label', `Show daily steps for ${userName}`);
                expandedUsers.delete(userId);
            } else {
                // Expand - show loading state
                const userItem = disclosureElement.closest('.leaderboard-item');
                const loadingIndicator = createUserDataLoading(userId, userName);
                userItem.insertAdjacentElement('afterend', loadingIndicator);
                
                try {
                    const response = await fetch(`/api/user/${userId}/daily-steps`);
                    const userData = await response.json();
                    
                    // Remove loading indicator
                    loadingIndicator.remove();
                    
                    if (response.ok) {
                        const userDataList = createUserDataList(userId, userName, userData);
                        userItem.insertAdjacentElement('afterend', userDataList);
                        
                        // Animate expansion
                        userDataList.style.maxHeight = '0px';
                        userDataList.style.overflow = 'hidden';
                        requestAnimationFrame(() => {
                            userDataList.style.maxHeight = userDataList.scrollHeight + 'px';
                            setTimeout(() => {
                                userDataList.style.maxHeight = 'none';
                                userDataList.style.overflow = 'visible';
                            }, 300);
                        });
                        
                        disclosureElement.classList.add('expanded');
                        disclosureElement.setAttribute('aria-expanded', 'true');
                        disclosureElement.setAttribute('aria-label', `Hide daily steps for ${userName}`);
                        expandedUsers.add(userId);
                    } else {
                        console.error('Error loading user daily data:', userData.error);
                        // Show error state
                        const errorDiv = createUserDataError(userId, userName, userData.error || 'Failed to load data');
                        userItem.insertAdjacentElement('afterend', errorDiv);
                        setTimeout(() => errorDiv.remove(), 3000); // Auto-remove after 3 seconds
                    }
                } catch (error) {
                    // Remove loading indicator
                    loadingIndicator.remove();
                    console.error('Error fetching user daily data:', error);
                    // Show error state
                    const errorDiv = createUserDataError(userId, userName, 'Network error');
                    userItem.insertAdjacentElement('afterend', errorDiv);
                    setTimeout(() => errorDiv.remove(), 3000); // Auto-remove after 3 seconds
                }
            }
        }

        function createUserDataLoading(userId, userName) {
            const loadingDiv = document.createElement('div');
            loadingDiv.id = `user-data-${userId}`;
            loadingDiv.className = 'user-data-list';
            loadingDiv.style.transition = 'max-height 0.3s ease-out';
            
            loadingDiv.innerHTML = `
                <div class="user-data-item" style="padding: 12px 16px; text-align: center; color: #666; font-style: italic;">
                    <span class="loading"></span> Loading ${userName}'s daily data...
                </div>
            `;
            
            return loadingDiv;
        }

        function createUserDataError(userId, userName, errorMessage) {
            const errorDiv = document.createElement('div');
            errorDiv.id = `user-data-error-${userId}`;
            errorDiv.className = 'user-data-list';
            errorDiv.style.background = 'rgba(220, 53, 69, 0.08)';
            
            errorDiv.innerHTML = `
                <div class="user-data-item" style="padding: 12px 16px; text-align: center; color: #dc3545; font-size: 0.9em;">
                    ⚠️ ${errorMessage}
                </div>
            `;
            
            return errorDiv;
        }

        function createUserDataList(userId, userName, userData) {
            const userDataList = document.createElement('div');
            userDataList.id = `user-data-${userId}`;
            userDataList.className = 'user-data-list';
            userDataList.style.transition = 'max-height 0.3s ease-out';
            
            if (userData.daily_steps.length === 0) {
                userDataList.innerHTML = `
                    <div class="user-data-item" style="padding: 12px 16px; text-align: center; color: #666; font-style: italic;">
                        No step data available for ${userName}
                    </div>
                `;
            } else {
                // Filter data based on active challenge date range
                let filteredSteps;
                let periodDescription;
                
                if (currentUser && currentUser.current_challenge) {
                    const challenge = currentUser.current_challenge;
                    // Normalize challenge dates to midnight
                    const challengeStartDate = new Date(challenge.start_date + 'T00:00:00');
                    const challengeEndDate = new Date(challenge.end_date + 'T00:00:00');
                    
                    // Filter steps to only include those within the challenge date range
                    filteredSteps = userData.daily_steps.filter(day => {
                        const stepDate = new Date(day.date + 'T00:00:00');
                        return stepDate >= challengeStartDate && stepDate <= challengeEndDate;
                    });
                    
                    periodDescription = 'full active challenge period';
                } else {
                    // No active challenge - show last 14 days
                    filteredSteps = userData.daily_steps.slice(0, 14);
                    periodDescription = '14 days';
                }
                
                const dailyDataHtml = filteredSteps.map(day => `
                    <div class="user-data-item">
                        <span>${formatCompactDate(day.date)}</span>
                        <strong>${day.steps.toLocaleString()} steps</strong>
                    </div>
                `).join('');
                
                let showingText;
                if (currentUser && currentUser.current_challenge) {
                    showingText = ` (${periodDescription})`;
                } else {
                    showingText = ` (${filteredSteps.length} days total)`;
                }
                
                userDataList.innerHTML = `
                    <div class="disclosure-heading">${userName}'s daily steps${showingText}</div>
                    ${dailyDataHtml}
                `;
            }
            
            return userDataList;
        }

        // Handle responsive leaderboard updates on window resize with enhanced scroll detection
        let resizeDebounceTimer;
        let orientationChangeTimer;
        let lastWindowWidth = window.innerWidth;
        let lastWindowHeight = window.innerHeight;
        let isScrolling = false;
        let scrollTimeout;
        
        // Track scrolling to prevent false resize events
        window.addEventListener('scroll', function() {
            isScrolling = true;
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                isScrolling = false;
            }, 150);
        }, { passive: true });
        
        // Track orientation changes separately for more reliable detection
        window.addEventListener('orientationchange', function() {
            clearTimeout(orientationChangeTimer);
            orientationChangeTimer = setTimeout(() => {
                const currentWidth = window.innerWidth;
                const currentHeight = window.innerHeight;
                
                // Force reload on orientation change
                const individualTab = document.getElementById('leaderboardBtn');
                const teamTab = document.getElementById('teamLeaderboardBtn');
                
                if (individualTab && individualTab.classList.contains('active')) {
                    loadLeaderboard();
                } else if (teamTab && teamTab.classList.contains('active')) {
                    const currentExpandedTeams = new Set(expandedTeams);
                    loadTeamLeaderboard().then(() => {
                        currentExpandedTeams.forEach(teamName => {
                            const disclosureElement = document.querySelector(`[data-team="${teamName}"]`);
                            if (disclosureElement && !expandedTeams.has(teamName)) {
                                toggleTeamDisclosure(teamName, disclosureElement);
                            }
                        });
                    });
                }
                
                lastWindowWidth = currentWidth;
                lastWindowHeight = currentHeight;
            }, 100);
        });
        
        window.addEventListener('resize', function() {
            const currentWidth = window.innerWidth;
            const currentHeight = window.innerHeight;
            
            // Clear existing timer
            clearTimeout(resizeDebounceTimer);
            
            // Ignore resize events that happen during scrolling
            if (isScrolling) {
                return;
            }
            
            // Only trigger if there's an actual significant window size change
            const widthDiff = Math.abs(currentWidth - lastWindowWidth);
            const heightDiff = Math.abs(currentHeight - lastWindowHeight);
            const hasSignificantResize = (widthDiff > 100 || heightDiff > 100);
            
            if (hasSignificantResize) {
                // Extended debounce for genuine resize events
                resizeDebounceTimer = setTimeout(() => {
                    // Double-check we're not scrolling
                    if (isScrolling) return;
                    
                    const individualTab = document.getElementById('leaderboardBtn');
                    const teamTab = document.getElementById('teamLeaderboardBtn');
                    
                    if (individualTab && individualTab.classList.contains('active')) {
                        loadLeaderboard();
                    } else if (teamTab && teamTab.classList.contains('active')) {
                        // Preserve expanded state when reloading for legitimate resize
                        const currentExpandedTeams = new Set(expandedTeams);
                        loadTeamLeaderboard().then(() => {
                            // Restore expanded teams after reload
                            currentExpandedTeams.forEach(teamName => {
                                const disclosureElement = document.querySelector(`[data-team="${teamName}"]`);
                                if (disclosureElement && !expandedTeams.has(teamName)) {
                                    toggleTeamDisclosure(teamName, disclosureElement);
                                }
                            });
                        });
                    }
                    
                    // Update last known dimensions
                    lastWindowWidth = currentWidth;
                    lastWindowHeight = currentHeight;
                }, 750);
            }
        });

        // Load initial data
        loadCurrentUser().then(() => {
            loadSteps();
        });
        
        // Expose functions globally for admin panel testing
        window.createMegaConfetti = createMegaConfetti;
        window.createConfetti = createConfetti;
        window.celebrateSteps = celebrateSteps;

        // Handle user theme selector
        const userThemeSelector = document.getElementById('userThemeSelector');
        if (userThemeSelector) {
            // Set initial value based on current user preference
            const userTheme = localStorage.getItem(THEME_STORAGE_KEYS.USER);
            userThemeSelector.value = userTheme || SYSTEM_DEFAULT_VALUE;
            
            // Handle theme changes
            userThemeSelector.addEventListener('change', function() {
                const selectedTheme = this.value;
                setUserTheme(selectedTheme);
                
                // Show visual feedback
                const parent = this.parentElement;
                const feedback = parent.querySelector('.theme-feedback') || document.createElement('div');
                feedback.className = 'theme-feedback';
                feedback.style.cssText = 'font-size: 11px; color: #4CAF50; margin-top: 4px; opacity: 1; transition: opacity 0.3s ease;';
                
                if (selectedTheme === SYSTEM_DEFAULT_VALUE) {
                    feedback.textContent = '✓ Using system default theme';
                } else {
                    const themeName = THEME_DEFINITIONS[selectedTheme]?.name || selectedTheme;
                    feedback.textContent = `✓ Personal theme: ${themeName}`;
                }
                
                if (!parent.querySelector('.theme-feedback')) {
                    parent.appendChild(feedback);
                }
                
                // Fade out feedback after 2 seconds
                setTimeout(() => {
                    feedback.style.opacity = '0';
                    setTimeout(() => {
                        if (feedback.parentElement) {
                            feedback.parentElement.removeChild(feedback);
                        }
                    }, 300);
                }, 2000);
            });
        }

        // Handle accelerometer permission reset button
        const resetAccelerometerBtn = document.getElementById('resetAccelerometerBtn');
        if (resetAccelerometerBtn) {
            // Add hover effects via JavaScript to avoid CSP violations
            resetAccelerometerBtn.addEventListener('mouseenter', function() {
                this.style.background = 'rgba(102, 126, 234, 0.2)';
            });
            
            resetAccelerometerBtn.addEventListener('mouseleave', function() {
                this.style.background = 'rgba(102, 126, 234, 0.1)';
            });
            
            resetAccelerometerBtn.addEventListener('click', async function() {
                // Reset the cached permission status to force a new request
                deviceMotionPermissionStatus = null;
                
                try {
                    if (!window.DeviceMotionEvent) {
                        alert('❌ Device motion not supported on this device/browser.');
                        return;
                    }
                    
                    if (typeof DeviceMotionEvent.requestPermission === 'function') {
                        // iOS 13+ - request permission
                        const permission = await DeviceMotionEvent.requestPermission();
                        if (permission === 'granted') {
                            alert('✅ Accelerometer access granted! Epic confetti will now respond to device tilting.');
                            deviceMotionPermissionStatus = true;
                        } else {
                            alert('❌ Accelerometer access denied. Epic confetti will work but won\'t respond to device tilting.');
                            deviceMotionPermissionStatus = false;
                        }
                    } else {
                        // Non-iOS or older iOS - permission not required
                        alert('✅ Device motion is available! Epic confetti will respond to device tilting.');
                        deviceMotionPermissionStatus = true;
                    }
                } catch (error) {
                    console.error('Permission request failed:', error);
                    alert('❌ Could not request accelerometer permission. Make sure you\'re using HTTPS and try again.');
                    deviceMotionPermissionStatus = false;
                }
            });
        }
        
        // Challenge UI functions
        function toggleChallengeDetails() {
            const details = document.getElementById('challengeDetails');
            const expand = document.getElementById('challengeExpand');
            
            if (!details || !expand) return;
            
            const isExpanded = details.classList.contains('expanded');
            
            if (isExpanded) {
                details.classList.remove('expanded');
                expand.classList.remove('expanded');
                // Remember collapsed state
                localStorage.setItem('challengeDetailsExpanded', 'false');
            } else {
                details.classList.add('expanded');
                expand.classList.add('expanded');
                // Remember expanded state
                localStorage.setItem('challengeDetailsExpanded', 'true');
            }
        }
        
        function showChallengeInfo(event) {
            event.stopPropagation();
            alert('💡 Challenge Tips:\n\n• You can log steps for any date during the challenge period\n• Entries can be made retroactively (catch-up entries)\n• The challenge runs from start date to end date (inclusive)\n• Your steps count toward individual and team rankings\n\n📅 Use the date picker to select which day you want to log steps for!');
        }
        
        // Setup subtle admin navigation
        function setupAdminNavigation() {
            const appIcon = document.getElementById('appIcon');
            if (appIcon) {
                // Make app icon clickable with subtle hover effect
                appIcon.style.cursor = 'pointer';
                appIcon.style.transition = 'all 0.2s ease';
                appIcon.title = 'Admin Panel';
                
                // Subtle hover effect
                appIcon.addEventListener('mouseenter', function() {
                    appIcon.style.transform = 'scale(1.1)';
                    appIcon.style.opacity = '0.8';
                });
                
                appIcon.addEventListener('mouseleave', function() {
                    appIcon.style.transform = 'scale(1)';
                    appIcon.style.opacity = '1';
                });
                
                // Click handler to navigate to admin
                appIcon.addEventListener('click', function() {
                    window.location.href = '/admin';
                });
            }
        }
        
        // Tidbits section scroll handling
        function handleTidbitsToggle() {
            const tidbitsSection = document.getElementById('tidbitsSection');
            if (!tidbitsSection) return;
            
            // Check if details element was just opened (not closed)
            if (tidbitsSection.open) {
                // Small delay to allow DOM to update with expanded content
                setTimeout(() => {
                    const rect = tidbitsSection.getBoundingClientRect();
                    const viewportHeight = window.innerHeight;
                    const sectionBottom = rect.bottom;
                    
                    // If Tidbits content extends below viewport, smoothly scroll minimal amount needed
                    if (sectionBottom > viewportHeight) {
                        tidbitsSection.scrollIntoView({ 
                            behavior: 'smooth', 
                            block: 'nearest' 
                        });
                    }
                }, 100);
            }
        }
        
        // Initialize app icon on page load
        document.addEventListener('DOMContentLoaded', function() {
            applyAppIcon();
            
            // Add Tidbits scroll handling
            const tidbitsSection = document.getElementById('tidbitsSection');
            if (tidbitsSection) {
                tidbitsSection.addEventListener('toggle', handleTidbitsToggle);
            }
            
            // Restore challenge details expansion state
            const wasExpanded = localStorage.getItem('challengeDetailsExpanded') === 'true';
            if (wasExpanded) {
                setTimeout(() => {
                    const details = document.getElementById('challengeDetails');
                    const expand = document.getElementById('challengeExpand');
                    if (details && expand) {
                        details.classList.add('expanded');
                        expand.classList.add('expanded');
                    }
                }, 100);
            }
        });
});
