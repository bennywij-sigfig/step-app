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

function formatDayCount(count) {
    return `${count} day${count === 1 ? '' : 's'}`;
}

function formatStepRateDetail(totalSteps, daysLogged) {
    const total = Number(totalSteps).toLocaleString();
    const days = Number(daysLogged);
    const fullLabel = `${total} steps / ${formatDayCount(days)}`;

    return `<div class="leaderboard-detail">
        <span class="rate-detail-full">${fullLabel}</span>
        <span class="rate-detail-compact" aria-label="${fullLabel}">${total}/${days}</span>
    </div>`;
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
        
        // Navigation stays immediate; only the incoming view receives a short
        // compositor animation, so there is no fade-out delay before content appears.
        const dashboardViews = ['myStepsView', 'leaderboardView', 'teamLeaderboardView'];
        const dashboardTabs = ['myStepsBtn', 'leaderboardBtn', 'teamLeaderboardBtn'];
        const dashboardRoutes = {
            '/dashboard': { viewId: 'myStepsView', tabId: 'myStepsBtn' },
            '/individuals': { viewId: 'leaderboardView', tabId: 'leaderboardBtn' },
            '/teams': { viewId: 'teamLeaderboardView', tabId: 'teamLeaderboardBtn' }
        };
        const navigationLoads = new Map();

        function loadForNavigation(key, loader) {
            const existing = navigationLoads.get(key);
            if (existing?.promise) return existing.promise;
            if (existing?.loadedAt && Date.now() - existing.loadedAt < 10000) return Promise.resolve(true);

            const promise = loader().then(succeeded => {
                if (succeeded) {
                    navigationLoads.set(key, { promise: null, loadedAt: Date.now() });
                } else {
                    // A failed idle preload must never suppress a retry when the
                    // user opens the tab.
                    navigationLoads.delete(key);
                }
                return succeeded;
            }, error => {
                navigationLoads.delete(key);
                throw error;
            });
            navigationLoads.set(key, { promise, loadedAt: existing?.loadedAt || 0 });
            return promise;
        }

        const loadIndividualForNavigation = () => loadForNavigation('individual', loadLeaderboard);
        const loadTeamsForNavigation = () => loadForNavigation('teams', loadTeamLeaderboard);

        function showDashboardView(viewId, tabId, refresh = null) {
            const view = document.getElementById(viewId);
            dashboardViews.forEach(id => document.getElementById(id).classList.toggle('hidden', id !== viewId));
            dashboardTabs.forEach(id => {
                const tab = document.getElementById(id);
                const active = id === tabId;
                tab.classList.toggle('active', active);
                if (active) tab.setAttribute('aria-current', 'page');
                else tab.removeAttribute('aria-current');
            });

            const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
            if (!reduceMotion && typeof view.animate === 'function') {
                view.animate([
                    { opacity: 0.94, transform: 'translateY(4px)' },
                    { opacity: 1, transform: 'translateY(0)' }
                ], { duration: 140, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' });
            }
            if (refresh) refresh();
        }

        function showDashboardRoute(pathname, updateHistory = false) {
            const route = dashboardRoutes[pathname] || dashboardRoutes['/dashboard'];
            const refresh = route.tabId === 'leaderboardBtn'
                ? loadIndividualForNavigation
                : route.tabId === 'teamLeaderboardBtn' ? loadTeamsForNavigation : null;
            if (updateHistory && window.location.pathname !== pathname) {
                window.history.pushState({}, '', pathname);
            }
            showDashboardView(route.viewId, route.tabId, refresh);
        }

        document.getElementById('myStepsBtn').addEventListener('click', () => {
            showDashboardRoute('/dashboard', true);
        });

        document.getElementById('leaderboardBtn').addEventListener('click', () => {
            showDashboardRoute('/individuals', true);
        });

        document.getElementById('teamLeaderboardBtn').addEventListener('click', () => {
            showDashboardRoute('/teams', true);
        });
        window.addEventListener('popstate', () => showDashboardRoute(window.location.pathname));
        showDashboardRoute(window.location.pathname);
        
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
        
        // Load user's steps and chart benchmarks together so the chart can compare
        // the participant with the leading team without waiting for leaderboard UI.
        async function loadSteps() {
            try {
                const [response, benchmarkResponse] = await Promise.all([
                    fetch('/api/steps'),
                    fetch('/api/chart-benchmarks').catch(() => null)
                ]);
                
                if (response.status === 429) {
                    const data = await response.json();
                    const retryAfter = Math.floor(data.retryAfter / 60) || 60;
                    document.getElementById('stepsList').innerHTML = '<p>Too many requests. Please wait ' + retryAfter + ' minutes and refresh the page.</p>';
                    document.getElementById('stepsChart').innerHTML = '<p>Rate limit exceeded</p>';
                    return;
                }
                
                const steps = await response.json();
                const benchmarks = benchmarkResponse?.ok ? await benchmarkResponse.json() : null;
                
                const stepsList = document.getElementById('stepsList');
                if (steps.length === 0) {
                    stepsList.innerHTML = '<p>No steps logged yet. Start by adding your first day!</p>';
                } else {
                    stepsList.innerHTML = steps.map(step => 
                        `<div class="step-item">
                            <span>${formatCompactDate(step.date)}</span>
                            <span><strong>${step.count.toLocaleString()}</strong></span>
                        </div>`
                    ).join('');
                }
                
                // Update chart
                renderStepsChart(steps, benchmarks);
                
                // Set date selector to today (with challenge end date as ceiling if applicable)
                setTodayDate(currentUser?.current_challenge);
                
            } catch (error) {
                document.getElementById('stepsList').innerHTML = '<p>Error loading steps</p>';
                document.getElementById('stepsChart').innerHTML = '<p>Error loading chart</p>';
            }
        }


        // Render the active challenge's complete calendar so elapsed and upcoming
        // days are visible. Without a challenge, show 30 calendar days ending at
        // the user's most recent entry; absent dates are represented as zero.
        function renderStepsChart(steps, benchmarks = null) {
            const chartContainer = document.getElementById('stepsChart');

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

            const relevantSteps = currentUser?.current_challenge
                ? steps.filter(step => Number(step.challenge_id) === Number(currentUser.current_challenge.id))
                : steps;
            const stepsByDate = new Map(relevantSteps.map(step => [step.date, Number(step.count) || 0]));
            const latestSupportedDate = getLatestSupportedDate();
            let startDate;
            let endDate;

            if (currentUser?.current_challenge) {
                startDate = currentUser.current_challenge.start_date;
                endDate = currentUser.current_challenge.end_date;
            } else {
                endDate = benchmarks?.end_date || steps[0]?.date;
                if (!endDate) {
                    chartContainer.innerHTML = '<p class="steps-chart-empty">No step data to display</p>';
                    return;
                }
                startDate = benchmarks?.start_date || shiftDate(endDate, -29);
            }

            const days = [];
            for (let date = startDate; date <= endDate; date = shiftDate(date, 1)) {
                days.push({
                    date,
                    steps: stepsByDate.get(date) || 0,
                    hasEntry: stepsByDate.has(date),
                    isFuture: date > latestSupportedDate
                });
            }

            const loggedDays = days.filter(day => day.hasEntry);
            const total = loggedDays.reduce((sum, day) => sum + day.steps, 0);
            const userAverage = Number.isFinite(Number(benchmarks?.user_daily_average))
                ? Number(benchmarks.user_daily_average)
                : (loggedDays.length ? Math.round(total / loggedDays.length) : 0);
            const teamAverage = Number(benchmarks?.leading_team?.daily_average) || 0;
            const maxSteps = Math.max(...days.map(day => day.steps), userAverage, teamAverage, 1);
            const bars = days.map((day, index) => {
                const hasData = day.steps > 0;
                const dayOfMonth = Number(day.date.slice(-2));
                const showAxisLabel = index === 0 || index === days.length - 1 || dayOfMonth % 5 === 0;
                const heightPercent = hasData ? Math.max(6, (day.steps / maxSteps) * 100) : 3;
                const detail = day.isFuture
                    ? 'Upcoming challenge day'
                    : (day.hasEntry ? `${day.steps.toLocaleString()} steps` : 'No steps logged');
                return `<div class="step-bar${hasData ? '' : ' no-data'}${day.isFuture ? ' future' : ''}${showAxisLabel ? ' axis-label' : ''}"
                    style="height: ${heightPercent}%"
                    data-day="${dayOfMonth}"
                    data-steps="${detail}"
                    role="img" title="${formatShortDate(day.date)}: ${detail}"
                    aria-label="${formatShortDate(day.date)}: ${detail}"></div>`;
            }).join('');

            const benchmarksToRender = [
                userAverage > 0 ? {
                    className: 'user-average',
                    average: userAverage,
                    label: 'Your avg',
                    value: Math.round(userAverage).toLocaleString()
                } : null,
                teamAverage > 0 ? {
                    className: 'team-average',
                    average: teamAverage,
                    label: 'Leading team avg',
                    value: Math.round(teamAverage).toLocaleString()
                } : null
            ].filter(Boolean);
            const benchmarkLines = benchmarksToRender.map(line => `
                <div class="chart-benchmark ${line.className}" data-benchmark="${line.className}"
                    style="bottom: ${(line.average / maxSteps) * 100}%" aria-hidden="true"></div>`).join('');
            const benchmarkLegend = benchmarksToRender.map(line => `
                <span class="chart-benchmark-toggle ${line.className}" role="button" tabindex="0"
                    data-benchmark="${line.className}" aria-pressed="false"
                    aria-label="Show ${line.label} line at ${line.value} steps per day">${line.label} ${line.value}</span>`
            ).join(' <span class="chart-summary-separator">·</span> ');

            chartContainer.innerHTML = `
                ${benchmarkLegend ? `<div class="steps-chart-summary">
                    <span class="steps-chart-legend">${benchmarkLegend}</span>
                </div>` : ''}
                <div class="steps-chart">
                    <div class="steps-chart-plot">
                        <div class="steps-chart-bars" style="--bar-count: ${days.length}">${bars}</div>
                        ${benchmarkLines}
                    </div>
                </div>`;

            chartContainer.querySelectorAll('.chart-benchmark-toggle').forEach(toggle => {
                const line = chartContainer.querySelector(`.chart-benchmark[data-benchmark="${toggle.dataset.benchmark}"]`);
                const showLine = () => line?.classList.add('visible');
                const hideLine = () => {
                    if (toggle.dataset.pinned !== 'true') line?.classList.remove('visible');
                };
                toggle.addEventListener('pointerenter', showLine);
                toggle.addEventListener('pointerleave', hideLine);
                toggle.addEventListener('focus', showLine);
                toggle.addEventListener('blur', hideLine);
                const togglePinnedLine = () => {
                    const pinned = toggle.dataset.pinned !== 'true';
                    toggle.dataset.pinned = String(pinned);
                    toggle.setAttribute('aria-pressed', String(pinned));
                    line?.classList.toggle('visible', pinned);
                };
                toggle.addEventListener('click', togglePinnedLine);
                toggle.addEventListener('keydown', event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        togglePinnedLine();
                    }
                });
            });
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
                        const isCurrentUser = currentUser && Number(user.id) === Number(currentUser.id);
                        const highlightClass = isCurrentUser ? ' current-user' : '';
                        
                        return `<div class="leaderboard-item${highlightClass}">
                            <div class="leaderboard-identity">
                                <button type="button" class="team-disclosure" data-user-id="${user.id}" data-user-name="${escapeHtml(user.name)}" aria-expanded="false" aria-label="Show daily steps for ${escapeHtml(user.name)}"></button>
                                <span class="rank">#${index + 1}</span>
                                <span class="leaderboard-label">
                                    <span class="leaderboard-name">${escapeHtml(user.name)}</span>
                                    <span class="leaderboard-supporting">
                                        ${user.team ? `<span class="leaderboard-meta">${escapeHtml(user.team)}</span>` : ''}
                                        ${formatReportingRate(user.personal_reporting_rate)}
                                    </span>
                                </span>
                            </div>
                            <div class="leaderboard-metrics">
                                <div><span class="leaderboard-average">${Math.round(user.steps_per_day_reported).toLocaleString()}</span></div>
                                ${formatStepRateDetail(user.total_steps, user.days_logged)}
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
                        const isCurrentUser = currentUser && Number(user.id) === Number(currentUser.id);
                        const highlightClass = isCurrentUser ? ' current-user' : '';
                        
                        return `<div class="leaderboard-item${highlightClass}">
                            <div class="leaderboard-identity">
                                <button type="button" class="team-disclosure" data-user-id="${user.id}" data-user-name="${escapeHtml(user.name)}" aria-expanded="false" aria-label="Show daily steps for ${escapeHtml(user.name)}"></button>
                                <span class="rank" aria-hidden="true"></span>
                                <span class="leaderboard-label">
                                    <span class="leaderboard-name">${escapeHtml(user.name)}</span>
                                    <span class="leaderboard-supporting">
                                        ${user.team ? `<span class="leaderboard-meta">${escapeHtml(user.team)}</span>` : ''}
                                        ${formatReportingRate(user.personal_reporting_rate)}
                                    </span>
                                </span>
                            </div>
                            <div class="leaderboard-metrics">
                                <div><span class="leaderboard-average">${Math.round(user.steps_per_day_reported).toLocaleString()}</span></div>
                                ${formatStepRateDetail(user.total_steps, user.days_logged)}
                            </div>
                        </div>`;
                    }).join('');
                    html += '</div>';
                }
                
                // Handle legacy array format (all-time rankings)
                if (Array.isArray(data)) {
                    html = data.map((user, index) => {
                        const isCurrentUser = currentUser && Number(user.id) === Number(currentUser.id);
                        const highlightClass = isCurrentUser ? ' current-user' : '';
                        
                        return `<div class="leaderboard-item${highlightClass}">
                            <div class="leaderboard-identity">
                                <button type="button" class="team-disclosure" data-user-id="${user.id}" data-user-name="${escapeHtml(user.name)}" aria-expanded="false" aria-label="Show daily steps for ${escapeHtml(user.name)}"></button>
                                <span class="rank">#${index + 1}</span>
                                <span class="leaderboard-label">
                                    <span class="leaderboard-name">${escapeHtml(user.name)}</span>
                                    ${user.team ? `<span class="leaderboard-supporting"><span class="leaderboard-meta">${escapeHtml(user.team)}</span></span>` : ''}
                                </span>
                            </div>
                            <div class="leaderboard-metrics">
                                <div><span class="leaderboard-average">${Math.round(user.steps_per_day_reported).toLocaleString()}</span></div>
                                ${formatStepRateDetail(user.total_steps, user.days_logged)}
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
                
                // Attach listeners only to the freshly rendered leaderboard.
                // Scanning the whole document here used to add duplicate handlers
                // to the hidden team leaderboard (and vice versa).
                attachDisclosureListeners(leaderboardDiv);
                return true;
            } catch (error) {
                console.error('Leaderboard error:', error);
                document.getElementById('leaderboard').innerHTML = '<p>Error loading leaderboard</p>';
                return false;
            }
        }
        
        let pendingDateWarningConfirmation = null;

        function renderDateWarning(warning, date, rawSteps) {
            const messageDiv = document.getElementById('stepsMessage');
            messageDiv.innerHTML = '';

            const panel = document.createElement('div');
            panel.className = 'message date-warning';
            const text = document.createElement('p');
            text.textContent = warning.message;
            panel.appendChild(text);

            const actions = document.createElement('div');
            actions.className = 'date-warning-actions';
            const saveButton = document.createElement('button');
            saveButton.type = 'button';
            saveButton.textContent = `Yes, save for ${formatCompactDate(date)}`;
            saveButton.addEventListener('click', () => {
                for (const button of actions.querySelectorAll('button')) button.disabled = true;
                pendingDateWarningConfirmation = { date, rawSteps };
                document.getElementById('stepsForm').requestSubmit();
            });
            actions.appendChild(saveButton);

            if (warning.suggested_date) {
                const changeButton = document.createElement('button');
                changeButton.type = 'button';
                changeButton.className = 'secondary';
                changeButton.textContent = warning.code === 'early_local_today'
                    ? `Use yesterday (${formatCompactDate(warning.suggested_date)})`
                    : `Use local today (${formatCompactDate(warning.suggested_date)})`;
                changeButton.addEventListener('click', () => {
                    for (const button of actions.querySelectorAll('button')) button.disabled = true;
                    document.getElementById('date').value = warning.suggested_date;
                    validateDateInput(document.getElementById('date'), currentUser?.current_challenge);
                    document.getElementById('stepsForm').requestSubmit();
                });
                actions.appendChild(changeButton);
            }

            panel.appendChild(actions);
            messageDiv.appendChild(panel);
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
            
            const dateWarningConfirmed = pendingDateWarningConfirmation?.date === date
                && pendingDateWarningConfirmation?.rawSteps === rawSteps;
            pendingDateWarningConfirmation = null;

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
                        csrfToken: token,
                        client_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                        date_warning_confirmed: dateWarningConfirmed
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
                    if (response.status === 409 && data.code === 'STEP_DATE_CONFIRMATION_REQUIRED' && data.warning) {
                        renderDateWarning(data.warning, date, rawSteps);
                    } else if (response.status === 429) {
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
        
        function teamAccentStyle(teamId) {
            const numericId = Number(teamId) || 0;
            const hue = Math.round((numericId * 137.508) % 360);
            return `--team-accent: hsl(${hue} 48% 46%)`;
        }

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
                    return true;
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
                        
                        return `<div class="leaderboard-item team-identified${highlightClass}" style="${teamAccentStyle(team.team_id)}">
                            <div class="leaderboard-identity">
                                <button type="button" class="team-disclosure" data-team="${escapeHtml(team.team)}" data-team-id="${Number(team.team_id)}" aria-expanded="false" aria-label="Show members of ${escapeHtml(team.team)}"></button>
                                <span class="rank">#${index + 1}</span>
                                <span class="leaderboard-label">
                                    <span class="leaderboard-name">${escapeHtml(team.team)}</span>
                                    <span class="leaderboard-supporting">${formatTeamSummary(team.member_count, team.team_reporting_rate)}</span>
                                </span>
                            </div>
                            <div class="leaderboard-metrics">
                                <div><span class="leaderboard-average">${Math.round(team.team_steps_per_day_reported).toLocaleString()}</span></div>
                                <div class="leaderboard-detail">${team.total_steps.toLocaleString()} total</div>
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
                        
                        return `<div class="leaderboard-item team-identified${highlightClass}" style="${teamAccentStyle(team.team_id)}">
                            <div class="leaderboard-identity">
                                <button type="button" class="team-disclosure" data-team="${escapeHtml(team.team)}" data-team-id="${Number(team.team_id)}" aria-expanded="false" aria-label="Show members of ${escapeHtml(team.team)}"></button>
                                <span class="rank" aria-hidden="true"></span>
                                <span class="leaderboard-label">
                                    <span class="leaderboard-name">${escapeHtml(team.team)}</span>
                                    <span class="leaderboard-supporting">${formatTeamSummary(team.member_count, team.team_reporting_rate)}</span>
                                </span>
                            </div>
                            <div class="leaderboard-metrics">
                                <div><span class="leaderboard-average">${Math.round(team.team_steps_per_day_reported).toLocaleString()}</span></div>
                                <div class="leaderboard-detail">${team.total_steps.toLocaleString()} total</div>
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
                            
                            return `<div class="leaderboard-item team-identified${highlightClass}" style="${teamAccentStyle(team.team_id)}">
                                <div class="leaderboard-identity">
                                    <button type="button" class="team-disclosure" data-team="${escapeHtml(team.team)}" data-team-id="${Number(team.team_id)}" aria-expanded="false" aria-label="Show members of ${escapeHtml(team.team)}"></button>
                                    <span class="rank">#${index + 1}</span>
                                    <span class="leaderboard-label">
                                        <span class="leaderboard-name">${escapeHtml(team.team)}</span>
                                        <span class="leaderboard-supporting">${formatMemberCount(team.member_count)}</span>
                                    </span>
                                </div>
                                <div class="leaderboard-metrics">
                                    <div><span class="leaderboard-average">${Math.round(team.team_steps_per_day_reported).toLocaleString()}</span></div>
                                    <div class="leaderboard-detail">${team.total_steps.toLocaleString()} total</div>
                                </div>
                            </div>`;
                        }).join('');
                    }
                }
                
                const hasTeamRows = Array.isArray(data)
                    ? data.length > 0
                    : Boolean(data.data?.ranked?.length || data.data?.unranked?.length);
                if (hasTeamRows) html += '<div class="leaderboard-footer">members · reporting · steps/day</div>';
                teamLeaderboard.innerHTML = html;
                attachDisclosureListeners(teamLeaderboard);
                return true;
            } catch (error) {
                console.error('Team leaderboard error:', error);
                document.getElementById('teamLeaderboard').innerHTML = '<p>Error loading team leaderboard</p>';
                return false;
            }
        }

        // Attach event listeners to disclosure triangles (both team and user)
        function attachDisclosureListeners(container) {
            const disclosureTriangles = container.querySelectorAll('.team-disclosure');
            disclosureTriangles.forEach(triangle => {
                triangle.addEventListener('click', function() {
                    const teamName = this.getAttribute('data-team');
                    const teamId = this.getAttribute('data-team-id');
                    const userId = this.getAttribute('data-user-id');
                    const userName = this.getAttribute('data-user-name');
                    
                    if (teamName) {
                        // This is a team disclosure
                        toggleTeamDisclosure(teamName, teamId, this);
                    } else if (userId && userName) {
                        // This is a user disclosure
                        toggleUserDisclosure(userId, userName, this);
                    }
                });
            });
        }

        // Team member disclosure functionality
        async function toggleTeamDisclosure(teamName, teamId, disclosureElement) {
            if (disclosureElement.getAttribute('aria-busy') === 'true') return;
            const isExpanded = expandedTeams.has(teamName);

            if (isExpanded) {
                const membersList = document.getElementById(`members-${teamName.replace(/[^a-zA-Z0-9]/g, '_')}`);
                if (membersList) membersList.remove();
                disclosureElement.classList.remove('expanded');
                disclosureElement.setAttribute('aria-expanded', 'false');
                disclosureElement.setAttribute('aria-label', `Show members of ${teamName}`);
                expandedTeams.delete(teamName);
                return;
            }

            disclosureElement.setAttribute('aria-busy', 'true');
            try {
                const response = await fetch(`/api/teams/${encodeURIComponent(teamName)}/members`);
                const members = await response.json();
                if (response.ok) {
                    const membersList = createMembersList(teamName, members, teamId);
                    disclosureElement.closest('.leaderboard-item').insertAdjacentElement('afterend', membersList);
                    disclosureElement.classList.add('expanded');
                    disclosureElement.setAttribute('aria-expanded', 'true');
                    disclosureElement.setAttribute('aria-label', `Hide members of ${teamName}`);
                    expandedTeams.add(teamName);
                } else {
                    console.error('Error loading team members:', members.error);
                }
            } catch (error) {
                console.error('Error fetching team members:', error);
            } finally {
                disclosureElement.removeAttribute('aria-busy');
            }
        }

        function createMembersList(teamName, members, teamId) {
            const membersList = document.createElement('div');
            membersList.id = `members-${teamName.replace(/[^a-zA-Z0-9]/g, '_')}`;
            membersList.className = 'team-members-list team-identified';
            membersList.setAttribute('style', teamAccentStyle(teamId));

            const membersHtml = members.map(member => `
                <div class="member-item">
                    <div class="member-info">
                        <span class="member-name">${escapeHtml(member.name)}</span>
                        ${member.personal_reporting_rate !== undefined ? 
                            `<span class="member-reporting">${member.personal_reporting_rate >= 1 ? Math.round(member.personal_reporting_rate) : member.personal_reporting_rate}% reporting</span>` 
                            : ''}
                    </div>
                    <div class="member-stats">
                        <div><strong>${Math.round(member.steps_per_day_reported).toLocaleString()}</strong></div>
                        ${formatStepRateDetail(member.total_steps, member.days_logged)}
                    </div>
                </div>
            `).join('');
            
            membersList.innerHTML = membersHtml;
            return membersList;
        }


        // Toggle user daily data disclosure
        async function toggleUserDisclosure(userId, userName, disclosureElement) {
            if (disclosureElement.getAttribute('aria-busy') === 'true') return;
            const isExpanded = expandedUsers.has(userId);
            const userItem = disclosureElement.closest('.leaderboard-item');

            if (isExpanded) {
                const userDataList = document.getElementById(`user-data-${userId}`);
                if (userDataList) userDataList.remove();
                disclosureElement.classList.remove('expanded');
                disclosureElement.setAttribute('aria-expanded', 'false');
                disclosureElement.setAttribute('aria-label', `Show daily steps for ${userName}`);
                expandedUsers.delete(userId);
                return;
            }

            disclosureElement.setAttribute('aria-busy', 'true');
            try {
                const response = await fetch(`/api/user/${userId}/daily-steps`);
                const userData = await response.json();
                if (response.ok) {
                    const userDataList = createUserDataList(userId, userName, userData);
                    userItem.insertAdjacentElement('afterend', userDataList);
                    disclosureElement.classList.add('expanded');
                    disclosureElement.setAttribute('aria-expanded', 'true');
                    disclosureElement.setAttribute('aria-label', `Hide daily steps for ${userName}`);
                    expandedUsers.add(userId);
                } else {
                    console.error('Error loading user daily data:', userData.error);
                    const errorDiv = createUserDataError(userId, userName, userData.error || 'Failed to load data');
                    userItem.insertAdjacentElement('afterend', errorDiv);
                    setTimeout(() => errorDiv.remove(), 3000);
                }
            } catch (error) {
                console.error('Error fetching user daily data:', error);
                const errorDiv = createUserDataError(userId, userName, 'Network error');
                userItem.insertAdjacentElement('afterend', errorDiv);
                setTimeout(() => errorDiv.remove(), 3000);
            } finally {
                disclosureElement.removeAttribute('aria-busy');
            }
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
            
            if (userData.daily_steps.length === 0) {
                userDataList.innerHTML = `
                    <div class="user-data-item" style="padding: 12px 16px; text-align: center; color: #666; font-style: italic;">
                        No step data available for ${userName}
                    </div>
                `;
            } else {
                // Filter data based on active challenge date range
                let filteredSteps;
                
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
                    
                } else {
                    // No active challenge - show last 14 days
                    filteredSteps = userData.daily_steps.slice(0, 14);
                }
                
                const dailyDataHtml = filteredSteps.map(day => `
                    <div class="user-data-item">
                        <span>${formatCompactDate(day.date)}</span>
                        <strong>${day.steps.toLocaleString()} steps</strong>
                    </div>
                `).join('');
                
                userDataList.innerHTML = dailyDataHtml;
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
                                toggleTeamDisclosure(
                                    teamName,
                                    disclosureElement.getAttribute('data-team-id'),
                                    disclosureElement
                                );
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
                                    toggleTeamDisclosure(
                                        teamName,
                                        disclosureElement.getAttribute('data-team-id'),
                                        disclosureElement
                                    );
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

        // Load the visible view first, then populate hidden leaderboards while
        // the browser is idle. Their first tab switch can therefore paint cached
        // DOM immediately; the normal click refresh still happens in the background.
        loadCurrentUser().then(async () => {
            await loadSteps();
            const preloadLeaderboards = () => {
                Promise.allSettled([loadIndividualForNavigation(), loadTeamsForNavigation()]);
            };
            if (typeof window.requestIdleCallback === 'function') {
                window.requestIdleCallback(preloadLeaderboards, { timeout: 1500 });
            } else {
                setTimeout(preloadLeaderboards, 250);
            }
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
