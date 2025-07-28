document.addEventListener('DOMContentLoaded', function() {
    // CSRF token management
    let csrfToken = null;
    
    async function getCSRFToken() {
        if (!csrfToken) {
            try {
                console.log('Fetching CSRF token...');
                const response = await fetch('/api/csrf-token');
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                const data = await response.json();
                csrfToken = data.csrfToken;
                console.log('CSRF token fetched successfully');
            } catch (error) {
                console.error('Error fetching CSRF token:', error);
                throw error;
            }
        }
        return csrfToken;
    }

    // Helper function for authenticated POST/PUT/DELETE requests
    async function authenticatedFetch(url, options = {}) {
        try {
            if (options.method && options.method !== 'GET') {
                console.log(`Making ${options.method} request to ${url}`);
                const token = await getCSRFToken();
                if (token) {
                    if (options.body && typeof options.body === 'string') {
                        // Parse existing body and add CSRF token
                        const bodyData = JSON.parse(options.body);
                        bodyData.csrfToken = token;
                        options.body = JSON.stringify(bodyData);
                    } else if (options.method === 'DELETE') {
                        // For DELETE requests without body, create one with just the CSRF token
                        options.body = JSON.stringify({ csrfToken: token });
                        options.headers = options.headers || {};
                        options.headers['Content-Type'] = 'application/json';
                    }
                    console.log('CSRF token added to request');
                } else {
                    console.error('No CSRF token available');
                }
            }
            const response = await fetch(url, options);
            console.log(`Response status: ${response.status}`);
            return response;
        } catch (error) {
            console.error('authenticatedFetch error:', error);
            throw error;
        }
    }

    // Navigation
    document.getElementById('usersBtn').addEventListener('click', () => {
            showView('users');
        });
        
        document.getElementById('teamsBtn').addEventListener('click', () => {
            showView('teams');
            loadTeamLeaderboard();
        });
        
        document.getElementById('manageTeamsBtn').addEventListener('click', () => {
            showView('manageTeams');
            loadManageTeams();
        });

        document.getElementById('challengesBtn').addEventListener('click', () => {
            showView('challenges');
            loadChallenges();
        });
        
        document.getElementById('overviewBtn').addEventListener('click', () => {
            showView('overview');
            loadOverview();
        });
        
        document.getElementById('exportBtn').addEventListener('click', () => {
            exportCSV();
        });
        
        function showView(view) {
            document.querySelectorAll('.nav button').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.card').forEach(card => card.classList.add('hidden'));
            
            document.getElementById(`${view}Btn`).classList.add('active');
            document.getElementById(`${view}View`).classList.remove('hidden');
        }

        // Load users
        async function loadUsers() {
            try {
                const [usersRes, teamsRes] = await Promise.all([
                    fetch('/api/admin/users'),
                    fetch('/api/teams')
                ]);
                
                const users = await usersRes.json();
                const teams = await teamsRes.json();
                
                const usersTable = document.getElementById('usersTable');
                usersTable.innerHTML = `
                    <table>
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Email</th>
                                <th>Team</th>
                                <th>Total Steps</th>
                                <th>Days Logged</th>
                                <th>Admin</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${users.map(user => `
                                <tr>
                                    <td>${user.name}</td>
                                    <td>${user.email}</td>
                                    <td>
                                        <select id="team-${user.id}" class="team-select" data-user-id="${user.id}">
                                            <option value="">No Team</option>
                                            ${teams.map(team => 
                                                `<option value="${team.name}" ${user.team === team.name ? 'selected' : ''}>${team.name}</option>`
                                            ).join('')}
                                        </select>
                                    </td>
                                    <td>${user.total_steps.toLocaleString()}</td>
                                    <td>${user.days_logged}</td>
                                    <td><span style="font-weight: bold; color: ${user.is_admin ? '#28a745' : '#dc3545'}">${user.is_admin ? 'Yes' : 'No'}</span></td>
                                    <td>
                                        <button class="save-btn save-team-btn" id="save-${user.id}" data-user-id="${user.id}" disabled>
                                            Save
                                        </button>
                                        <button class="delete-btn clear-steps-btn" data-user-id="${user.id}" data-user-name="${user.name}" style="background: linear-gradient(135deg, #fd7e14 0%, #e9630b 100%); margin-left: 4px;">
                                            Clear Steps
                                        </button>
                                        <button class="delete-btn delete-user-btn" data-user-id="${user.id}" data-user-name="${user.name}">
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                `;
            } catch (error) {
                document.getElementById('usersTable').innerHTML = '<p>Error loading users</p>';
            }
        }

        // Update team selection for user
        function updateUserTeam(userId) {
            const saveBtn = document.getElementById(`save-${userId}`);
            saveBtn.disabled = false;
            saveBtn.style.background = '#007bff';
            saveBtn.textContent = 'Save';
        }

        // Save team assignment
        async function saveTeam(userId) {
            console.log('saveTeam called with userId:', userId);
            const teamSelect = document.getElementById(`team-${userId}`);
            const saveBtn = document.getElementById(`save-${userId}`);
            const messageDiv = document.getElementById('usersMessage');
            
            if (!teamSelect || !saveBtn) {
                console.error('Required elements not found');
                return;
            }
            
            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving...';
            
            try {
                const response = await authenticatedFetch(`/api/admin/users/${userId}/team`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ team: teamSelect.value })
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    messageDiv.innerHTML = '<div class="message success">Team updated successfully!</div>';
                    saveBtn.style.background = '#28a745';
                    saveBtn.textContent = 'Saved';
                    setTimeout(() => {
                        messageDiv.innerHTML = '';
                    }, 3000);
                } else {
                    messageDiv.innerHTML = '<div class="message error">' + data.error + '</div>';
                    saveBtn.disabled = false;
                    saveBtn.textContent = 'Save';
                }
            } catch (error) {
                messageDiv.innerHTML = '<div class="message error">Network error. Please try again.</div>';
                saveBtn.disabled = false;
                saveBtn.textContent = 'Save';
            }
        }

        // Load team leaderboard
        async function loadTeamLeaderboard() {
            try {
                const response = await fetch('/api/team-leaderboard');
                const data = await response.json();
                
                const teamLeaderboard = document.getElementById('teamLeaderboard');
                
                // Handle different response types (same logic as main dashboard)
                if (data.type === 'insufficient_data') {
                    teamLeaderboard.innerHTML = `<div class="info-message" style="background: rgba(255, 193, 7, 0.1); padding: 20px; border-radius: 12px; border: 1px solid rgba(255, 193, 7, 0.2); margin-bottom: 20px;">
                        <h3 style="color: #856404; margin: 0 0 10px 0;">${data.meta.challenge_name} - Day ${data.meta.challenge_day}</h3>
                        <p style="color: #856404; margin: 0 0 10px 0;">${data.message}</p>
                        <p style="font-size: 0.9em; color: #6c757d; margin: 0;">
                            ${data.meta.actual_entries}/${data.meta.expected_entries} expected team entries 
                            (${data.meta.reporting_percentage}% team participation)
                        </p>
                    </div>`;
                    return;
                }
                
                // Handle legacy all-time format or new challenge format
                let challengeInfo = '';
                
                if (data.type === 'all_time') {
                    challengeInfo = '<h3 style="color: #555; margin: 0 0 20px 0;">All-Time Team Rankings</h3>';
                } else if (data.type === 'challenge') {
                    challengeInfo = `<h3 style="color: #555; margin: 0 0 20px 0;">${data.meta.challenge_name} - Day ${data.meta.challenge_day}</h3>`;
                }
                
                let html = challengeInfo;
                
                // Show ranked teams section
                if (data.data && data.data.ranked && data.data.ranked.length > 0) {
                    html += `<div style="margin-bottom: 30px;">
                        <h4 style="color: #28a745; margin: 0 0 15px 0; font-weight: 600;">Ranked Teams</h4>
                        <table>
                            <thead>
                                <tr>
                                    <th>Rank</th>
                                    <th>Team</th>
                                    <th>Members</th>
                                    <th>Reporting Rate</th>
                                    <th>Steps/Day</th>
                                    <th>Total Steps</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${data.data.ranked.map((team, index) => `
                                    <tr style="background: rgba(40, 167, 69, 0.05);">
                                        <td><span class="team-rank">#${index + 1}</span></td>
                                        <td><strong>${team.team}</strong></td>
                                        <td>${team.member_count}</td>
                                        <td><span style="color: #28a745; font-weight: 500;">${team.team_reporting_rate >= 1 ? Math.round(team.team_reporting_rate) : team.team_reporting_rate}%</span></td>
                                        <td><strong>${Math.round(team.team_steps_per_day_reported).toLocaleString()}</strong></td>
                                        <td>${team.total_steps.toLocaleString()}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>`;
                }
                
                // Show unranked teams section
                if (data.data && data.data.unranked && data.data.unranked.length > 0) {
                    html += `<div>
                        <h4 style="color: #ffc107; margin: 0 0 10px 0; font-weight: 600;">Unranked Teams</h4>
                        <p style="font-size: 0.85em; color: #6c757d; margin: 0 0 15px 0;">Need more consistent team reporting to be ranked</p>
                        <table>
                            <thead>
                                <tr>
                                    <th>Rank</th>
                                    <th>Team</th>
                                    <th>Members</th>
                                    <th>Reporting Rate</th>
                                    <th>Steps/Day</th>
                                    <th>Total Steps</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${data.data.unranked.map((team) => `
                                    <tr style="opacity: 0.8; background: rgba(255, 193, 7, 0.05);">
                                        <td><span style="color: #6c757d;">-</span></td>
                                        <td><strong>${team.team}</strong></td>
                                        <td>${team.member_count}</td>
                                        <td><span style="color: #ffc107; font-weight: 500;">${team.team_reporting_rate >= 1 ? Math.round(team.team_reporting_rate) : team.team_reporting_rate}%</span></td>
                                        <td><strong>${Math.round(team.team_steps_per_day_reported).toLocaleString()}</strong></td>
                                        <td>${team.total_steps.toLocaleString()}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>`;
                }
                
                // Handle legacy array format (all-time rankings) or empty data
                if (Array.isArray(data)) {
                    if (data.length === 0) {
                        html = '<p>No teams with members yet.</p>';
                    } else {
                        html = `<table>
                            <thead>
                                <tr>
                                    <th>Rank</th>
                                    <th>Team</th>
                                    <th>Members</th>
                                    <th>Steps/Day</th>
                                    <th>Total Steps</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${data.map((team, index) => `
                                    <tr>
                                        <td><span class="team-rank">#${index + 1}</span></td>
                                        <td><strong>${team.team}</strong></td>
                                        <td>${team.member_count}</td>
                                        <td><strong>${Math.round(team.team_steps_per_day_reported).toLocaleString()}</strong></td>
                                        <td>${team.total_steps.toLocaleString()}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>`;
                    }
                }
                
                teamLeaderboard.innerHTML = html;
            } catch (error) {
                console.error('Team leaderboard error:', error);
                document.getElementById('teamLeaderboard').innerHTML = '<p>Error loading team leaderboard</p>';
            }
        }

        // Load overview
        async function loadOverview() {
            try {
                const response = await fetch('/api/admin/users');
                const users = await response.json();
                
                const totalUsers = users.length;
                const totalSteps = users.reduce((sum, user) => sum + user.total_steps, 0);
                const avgSteps = totalUsers > 0 ? Math.round(totalSteps / totalUsers) : 0;
                const activeUsers = users.filter(user => user.days_logged > 0).length;
                
                document.getElementById('totalUsers').textContent = totalUsers;
                document.getElementById('totalSteps').textContent = totalSteps.toLocaleString();
                document.getElementById('avgSteps').textContent = avgSteps.toLocaleString();
                document.getElementById('activeUsers').textContent = activeUsers;
            } catch (error) {
                console.error('Error loading overview:', error);
            }
        }

        // Load manage teams
        async function loadManageTeams() {
            try {
                const response = await fetch('/api/teams');
                const teams = await response.json();
                
                const manageTeamsTable = document.getElementById('manageTeamsTable');
                manageTeamsTable.innerHTML = `
                    <table>
                        <thead>
                            <tr>
                                <th>Team Name</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${teams.map(team => `
                                <tr>
                                    <td>
                                        <input type="text" id="teamName-${team.id}" value="${team.name}" 
                                               style="width: 100%; padding: 10px; border: 2px solid rgba(102, 126, 234, 0.1); border-radius: 10px; background: rgba(255, 255, 255, 0.8); backdrop-filter: blur(10px); font-size: 14px; transition: all 0.3s ease;"
                                               class="team-name-input" data-team-id="${team.id}">
                                    </td>
                                    <td>
                                        <button class="save-btn save-team-name-btn" id="saveTeam-${team.id}" data-team-id="${team.id}" disabled>
                                            Save
                                        </button>
                                        <button class="delete-team-btn" data-team-id="${team.id}" 
                                                style="background: #dc3545; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; margin-left: 5px;">
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                `;
            } catch (error) {
                document.getElementById('manageTeamsTable').innerHTML = '<p>Error loading teams</p>';
            }
        }

        // Create new team
        async function createTeam() {
            const teamName = document.getElementById('newTeamName').value;
            const messageDiv = document.getElementById('teamsMessage');
            
            if (!teamName.trim()) {
                messageDiv.innerHTML = '<div class="message error">Please enter a team name</div>';
                return;
            }
            
            try {
                const response = await authenticatedFetch('/api/admin/teams', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ name: teamName })
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    messageDiv.innerHTML = '<div class="message success">Team created successfully!</div>';
                    document.getElementById('newTeamName').value = '';
                    loadManageTeams();
                    setTimeout(() => messageDiv.innerHTML = '', 3000);
                } else if (response.status === 429) {
                    const retryAfter = Math.floor(data.retryAfter / 60) || 60;
                    messageDiv.innerHTML = '<div class="message error">Too many requests. Please wait ' + retryAfter + ' minutes before trying again.</div>';
                } else {
                    messageDiv.innerHTML = '<div class="message error">' + data.error + '</div>';
                }
            } catch (error) {
                messageDiv.innerHTML = '<div class="message error">Network error. Please try again.</div>';
            }
        }

        // Enable save button when team name is changed
        function enableSaveButton(teamId) {
            const saveBtn = document.getElementById(`saveTeam-${teamId}`);
            saveBtn.disabled = false;
            saveBtn.style.background = '#007bff';
            saveBtn.textContent = 'Save';
        }

        // Update team name
        async function updateTeam(teamId) {
            const teamName = document.getElementById(`teamName-${teamId}`).value;
            const saveBtn = document.getElementById(`saveTeam-${teamId}`);
            const messageDiv = document.getElementById('teamsMessage');
            
            if (!teamName.trim()) {
                messageDiv.innerHTML = '<div class="message error">Team name cannot be empty</div>';
                return;
            }
            
            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving...';
            
            try {
                const response = await authenticatedFetch(`/api/admin/teams/${teamId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ name: teamName })
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    messageDiv.innerHTML = '<div class="message success">Team updated successfully!</div>';
                    saveBtn.style.background = '#28a745';
                    saveBtn.textContent = 'Saved';
                    setTimeout(() => messageDiv.innerHTML = '', 3000);
                } else {
                    messageDiv.innerHTML = '<div class="message error">' + data.error + '</div>';
                    saveBtn.disabled = false;
                    saveBtn.textContent = 'Save';
                }
            } catch (error) {
                messageDiv.innerHTML = '<div class="message error">Network error. Please try again.</div>';
                saveBtn.disabled = false;
                saveBtn.textContent = 'Save';
            }
        }

        // Delete team
        async function deleteTeam(teamId) {
            if (!confirm('Are you sure you want to delete this team? All users will be removed from this team.')) {
                return;
            }
            
            const messageDiv = document.getElementById('teamsMessage');
            
            try {
                const response = await authenticatedFetch(`/api/admin/teams/${teamId}`, {
                    method: 'DELETE'
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    messageDiv.innerHTML = '<div class="message success">Team deleted successfully!</div>';
                    loadManageTeams();
                    setTimeout(() => messageDiv.innerHTML = '', 3000);
                } else {
                    messageDiv.innerHTML = '<div class="message error">' + data.error + '</div>';
                }
            } catch (error) {
                messageDiv.innerHTML = '<div class="message error">Network error. Please try again.</div>';
            }
        }

        // Delete user
        async function deleteUser(userId, userName) {
            if (!confirm(`🚨 PERMANENT DELETION WARNING 🚨\n\nAre you sure you want to PERMANENTLY DELETE user "${userName}"?\n\nThis will:\n• Delete their user account forever\n• Delete all their step data permanently\n• Remove them from their team\n• Cannot be undone or recovered\n\nType "DELETE" to confirm this permanent action.`)) {
                return;
            }
            
            // Second confirmation with text input
            const confirmText = prompt(`Please type "DELETE" to confirm permanent deletion of "${userName}":`);
            if (confirmText !== 'DELETE') {
                alert('Action cancelled. You must type "DELETE" exactly to confirm.');
                return;
            }
            
            const messageDiv = document.getElementById('usersMessage');
            
            try {
                const response = await authenticatedFetch(`/api/admin/users/${userId}`, {
                    method: 'DELETE'
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    messageDiv.innerHTML = '<div class="message success">User deleted successfully!</div>';
                    loadUsers(); // Reload the users table
                    setTimeout(() => messageDiv.innerHTML = '', 3000);
                } else {
                    messageDiv.innerHTML = '<div class="message error">' + data.error + '</div>';
                }
            } catch (error) {
                messageDiv.innerHTML = '<div class="message error">Network error. Please try again.</div>';
            }
        }
        
        // Clear user steps function
        async function clearUserSteps(userId, userName) {
            if (!confirm(`⚠️ DESTRUCTIVE ACTION WARNING ⚠️\n\nAre you sure you want to clear ALL step data for user "${userName}"?\n\nThis will:\n• Delete all their recorded steps permanently\n• Keep their user account and team assignment\n• Cannot be undone\n\nType "CLEAR" to confirm this destructive action.`)) {
                return;
            }
            
            // Second confirmation with text input
            const confirmText = prompt(`Please type "CLEAR" to confirm clearing all steps for "${userName}":`);
            if (confirmText !== 'CLEAR') {
                alert('Action cancelled. You must type "CLEAR" exactly to confirm.');
                return;
            }
            
            const messageDiv = document.getElementById('usersMessage');
            
            try {
                const response = await authenticatedFetch(`/api/admin/users/${userId}/steps`, {
                    method: 'DELETE'
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    messageDiv.innerHTML = `<div class="message success">${data.message} (${data.stepsCleared} records removed)</div>`;
                    loadUsers(); // Reload the users table to show updated step counts
                    setTimeout(() => messageDiv.innerHTML = '', 5000);
                } else {
                    messageDiv.innerHTML = '<div class="message error">' + data.error + '</div>';
                }
            } catch (error) {
                messageDiv.innerHTML = '<div class="message error">Network error. Please try again.</div>';
            }
        }

        // Export CSV function
        async function exportCSV() {
            try {
                const response = await fetch('/api/admin/export-csv');
                
                if (response.ok) {
                    // Create a blob from the response
                    const blob = await response.blob();
                    
                    // Create a temporary URL for the blob
                    const url = window.URL.createObjectURL(blob);
                    
                    // Create a temporary download link
                    const link = document.createElement('a');
                    link.href = url;
                    
                    // Get filename from Content-Disposition header or use default
                    const contentDisposition = response.headers.get('Content-Disposition');
                    let filename = 'step-challenge-export.csv';
                    if (contentDisposition) {
                        const matches = contentDisposition.match(/filename="(.+)"/);
                        if (matches) {
                            filename = matches[1];
                        }
                    }
                    
                    link.download = filename;
                    
                    // Trigger download
                    document.body.appendChild(link);
                    link.click();
                    
                    // Clean up
                    document.body.removeChild(link);
                    window.URL.revokeObjectURL(url);
                    
                    // Show success message
                    const messageDiv = document.getElementById('usersMessage');
                    messageDiv.innerHTML = '<div class="message success">CSV export downloaded successfully!</div>';
                    setTimeout(() => messageDiv.innerHTML = '', 3000);
                    
                } else {
                    throw new Error('Export failed');
                }
            } catch (error) {
                console.error('Export error:', error);
                const messageDiv = document.getElementById('usersMessage');
                messageDiv.innerHTML = '<div class="message error">Export failed. Please try again.</div>';
                setTimeout(() => messageDiv.innerHTML = '', 3000);
            }
        }

        // Load challenges
        async function loadChallenges() {
            try {
                const response = await fetch('/api/admin/challenges');
                const challenges = await response.json();
                
                const challengesTable = document.getElementById('challengesTable');
                if (challenges.length === 0) {
                    challengesTable.innerHTML = '<p>No challenges created yet.</p>';
                } else {
                    challengesTable.innerHTML = `
                        <table>
                            <thead>
                                <tr>
                                    <th>Challenge Name</th>
                                    <th>Start Date</th>
                                    <th>End Date</th>
                                    <th>Threshold %</th>
                                    <th>Status</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${challenges.map(challenge => `
                                    <tr>
                                        <td>
                                            <input type="text" id="challengeName-${challenge.id}" value="${challenge.name}" 
                                                   style="width: 100%; padding: 10px; border: 2px solid rgba(102, 126, 234, 0.1); border-radius: 10px; background: rgba(255, 255, 255, 0.8); backdrop-filter: blur(10px); font-size: 14px; transition: all 0.3s ease;"
                                                   class="challenge-name-input" data-challenge-id="${challenge.id}">
                                        </td>
                                        <td>
                                            <input type="date" id="challengeStartDate-${challenge.id}" value="${challenge.start_date}" 
                                                   style="width: 100%; padding: 10px; border: 2px solid rgba(102, 126, 234, 0.1); border-radius: 10px; background: rgba(255, 255, 255, 0.8); backdrop-filter: blur(10px); font-size: 14px; transition: all 0.3s ease;"
                                                   class="challenge-date-input" data-challenge-id="${challenge.id}">
                                        </td>
                                        <td>
                                            <input type="date" id="challengeEndDate-${challenge.id}" value="${challenge.end_date}" 
                                                   style="width: 100%; padding: 10px; border: 2px solid rgba(102, 126, 234, 0.1); border-radius: 10px; background: rgba(255, 255, 255, 0.8); backdrop-filter: blur(10px); font-size: 14px; transition: all 0.3s ease;"
                                                   class="challenge-date-input" data-challenge-id="${challenge.id}">
                                        </td>
                                        <td>
                                            <input type="number" id="challengeThreshold-${challenge.id}" value="${challenge.reporting_threshold || 70}" min="1" max="100"
                                                   style="width: 100%; padding: 10px; border: 2px solid rgba(102, 126, 234, 0.1); border-radius: 10px; background: rgba(255, 255, 255, 0.8); backdrop-filter: blur(10px); font-size: 14px; transition: all 0.3s ease;"
                                                   class="challenge-threshold-input" data-challenge-id="${challenge.id}">
                                        </td>
                                        <td>
                                            <label style="display: flex; align-items: center; gap: 5px;">
                                                <input type="checkbox" id="challengeActive-${challenge.id}" ${challenge.is_active ? 'checked' : ''}
                                                       class="challenge-active-input" data-challenge-id="${challenge.id}">
                                                ${challenge.is_active ? '<span style="color: #28a745; font-weight: bold;">Active</span>' : 'Inactive'}
                                            </label>
                                        </td>
                                        <td>
                                            <button class="save-btn save-challenge-btn" id="saveChallenge-${challenge.id}" data-challenge-id="${challenge.id}" disabled>
                                                Save
                                            </button>
                                            <button class="delete-challenge-btn" data-challenge-id="${challenge.id}" data-challenge-name="${challenge.name}" 
                                                    style="background: #dc3545; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; margin-left: 5px;">
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    `;
                }
            } catch (error) {
                document.getElementById('challengesTable').innerHTML = '<p>Error loading challenges</p>';
            }
        }

        // Create new challenge
        async function createChallenge() {
            const name = document.getElementById('newChallengeName').value;
            const startDate = document.getElementById('newChallengeStartDate').value;
            const endDate = document.getElementById('newChallengeEndDate').value;
            const threshold = document.getElementById('newChallengeThreshold').value;
            const messageDiv = document.getElementById('challengesMessage');
            
            if (!name.trim() || !startDate || !endDate || !threshold) {
                messageDiv.innerHTML = '<div class="message error">Please fill in all fields</div>';
                return;
            }
            
            if (threshold < 1 || threshold > 100) {
                messageDiv.innerHTML = '<div class="message error">Threshold must be between 1% and 100%</div>';
                return;
            }
            
            if (new Date(startDate) >= new Date(endDate)) {
                messageDiv.innerHTML = '<div class="message error">Start date must be before end date</div>';
                return;
            }
            
            try {
                const response = await authenticatedFetch('/api/admin/challenges', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ 
                        name: name,
                        start_date: startDate,
                        end_date: endDate,
                        reporting_threshold: parseInt(threshold)
                    })
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    messageDiv.innerHTML = '<div class="message success">Challenge created successfully!</div>';
                    document.getElementById('newChallengeName').value = '';
                    document.getElementById('newChallengeStartDate').value = '';
                    document.getElementById('newChallengeEndDate').value = '';
                    document.getElementById('newChallengeThreshold').value = '70';
                    loadChallenges();
                    setTimeout(() => messageDiv.innerHTML = '', 3000);
                } else {
                    messageDiv.innerHTML = '<div class="message error">' + data.error + '</div>';
                }
            } catch (error) {
                messageDiv.innerHTML = '<div class="message error">Network error. Please try again.</div>';
            }
        }

        // Enable save button when challenge is changed
        function enableChallengeSaveButton(challengeId) {
            const saveBtn = document.getElementById(`saveChallenge-${challengeId}`);
            saveBtn.disabled = false;
            saveBtn.style.background = '#007bff';
            saveBtn.textContent = 'Save';
        }

        // Update challenge
        async function updateChallenge(challengeId) {
            const name = document.getElementById(`challengeName-${challengeId}`).value;
            const startDate = document.getElementById(`challengeStartDate-${challengeId}`).value;
            const endDate = document.getElementById(`challengeEndDate-${challengeId}`).value;
            const threshold = document.getElementById(`challengeThreshold-${challengeId}`).value;
            const isActive = document.getElementById(`challengeActive-${challengeId}`).checked;
            const saveBtn = document.getElementById(`saveChallenge-${challengeId}`);
            const messageDiv = document.getElementById('challengesMessage');
            
            if (!name.trim() || !startDate || !endDate || !threshold) {
                messageDiv.innerHTML = '<div class="message error">All fields are required</div>';
                return;
            }
            
            if (threshold < 1 || threshold > 100) {
                messageDiv.innerHTML = '<div class="message error">Threshold must be between 1% and 100%</div>';
                return;
            }
            
            if (new Date(startDate) >= new Date(endDate)) {
                messageDiv.innerHTML = '<div class="message error">Start date must be before end date</div>';
                return;
            }
            
            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving...';
            
            try {
                const response = await authenticatedFetch(`/api/admin/challenges/${challengeId}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ 
                        name: name,
                        start_date: startDate,
                        end_date: endDate,
                        reporting_threshold: parseInt(threshold),
                        is_active: isActive
                    })
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    messageDiv.innerHTML = '<div class="message success">Challenge updated successfully!</div>';
                    saveBtn.style.background = '#28a745';
                    saveBtn.textContent = 'Saved';
                    if (isActive) {
                        // Reload to update other challenges that may have been deactivated
                        loadChallenges();
                    }
                    setTimeout(() => messageDiv.innerHTML = '', 3000);
                } else {
                    messageDiv.innerHTML = '<div class="message error">' + data.error + '</div>';
                    saveBtn.disabled = false;
                    saveBtn.textContent = 'Save';
                }
            } catch (error) {
                messageDiv.innerHTML = '<div class="message error">Network error. Please try again.</div>';
                saveBtn.disabled = false;
                saveBtn.textContent = 'Save';
            }
        }

        // Delete challenge
        async function deleteChallenge(challengeId, challengeName) {
            if (!confirm(`Are you sure you want to delete the challenge "${challengeName}"? This action cannot be undone.`)) {
                return;
            }
            
            const messageDiv = document.getElementById('challengesMessage');
            
            try {
                const response = await authenticatedFetch(`/api/admin/challenges/${challengeId}`, {
                    method: 'DELETE'
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    messageDiv.innerHTML = '<div class="message success">Challenge deleted successfully!</div>';
                    loadChallenges();
                    setTimeout(() => messageDiv.innerHTML = '', 3000);
                } else {
                    messageDiv.innerHTML = '<div class="message error">' + data.error + '</div>';
                }
            } catch (error) {
                messageDiv.innerHTML = '<div class="message error">Network error. Please try again.</div>';
            }
        }

        // Load initial data
        loadUsers();
        
        // Add event listeners for static elements
        document.getElementById('createTeamBtn').addEventListener('click', createTeam);
        document.getElementById('createChallengeBtn').addEventListener('click', createChallenge);
        
        // Add delegated event listeners for dynamically generated elements
        document.addEventListener('change', function(e) {
            // Team select changes
            if (e.target.classList.contains('team-select')) {
                const userId = e.target.dataset.userId;
                updateUserTeam(parseInt(userId));
            }
            
            // Team name input changes
            if (e.target.classList.contains('team-name-input')) {
                const teamId = e.target.dataset.teamId;
                enableSaveButton(parseInt(teamId));
            }
            
            // Challenge input changes
            if (e.target.classList.contains('challenge-name-input') || 
                e.target.classList.contains('challenge-date-input') || 
                e.target.classList.contains('challenge-threshold-input') ||
                e.target.classList.contains('challenge-active-input')) {
                const challengeId = e.target.dataset.challengeId;
                enableChallengeSaveButton(parseInt(challengeId));
            }
        });
        
        // Add delegated event listeners for button clicks
        document.addEventListener('click', function(e) {
            // Save team assignment buttons
            if (e.target.classList.contains('save-team-btn')) {
                const userId = e.target.dataset.userId;
                saveTeam(parseInt(userId));
            }
            
            // Clear user steps buttons
            if (e.target.classList.contains('clear-steps-btn')) {
                const userId = e.target.dataset.userId;
                const userName = e.target.dataset.userName;
                clearUserSteps(parseInt(userId), userName);
            }
            
            // Delete user buttons
            if (e.target.classList.contains('delete-user-btn')) {
                const userId = e.target.dataset.userId;
                const userName = e.target.dataset.userName;
                deleteUser(parseInt(userId), userName);
            }
            
            // Save team name buttons
            if (e.target.classList.contains('save-team-name-btn')) {
                const teamId = e.target.dataset.teamId;
                updateTeam(parseInt(teamId));
            }
            
            // Delete team buttons
            if (e.target.classList.contains('delete-team-btn')) {
                const teamId = e.target.dataset.teamId;
                deleteTeam(parseInt(teamId));
            }
            
            // Save challenge buttons
            if (e.target.classList.contains('save-challenge-btn')) {
                const challengeId = e.target.dataset.challengeId;
                updateChallenge(parseInt(challengeId));
            }
            
            // Delete challenge buttons
            if (e.target.classList.contains('delete-challenge-btn')) {
                const challengeId = e.target.dataset.challengeId;
                const challengeName = e.target.dataset.challengeName;
                deleteChallenge(parseInt(challengeId), challengeName);
            }
        });
    
        // Keep functions globally accessible for backward compatibility
        window.updateUserTeam = updateUserTeam;
        window.saveTeam = saveTeam;
        // Theme management functionality
        function initializeThemes() {
            const themeSelector = document.getElementById('themeSelector');
            
            // Load saved theme
            const savedTheme = localStorage.getItem('adminTheme') || 'default';
            applyTheme(savedTheme);
            themeSelector.value = savedTheme;
            
            // Theme change handler
            themeSelector.addEventListener('change', function() {
                const selectedTheme = this.value;
                applyTheme(selectedTheme);
                localStorage.setItem('adminTheme', selectedTheme);
                
                // Also update the main app theme
                updateMainAppTheme(selectedTheme);
            });
        }
        
        function applyTheme(themeName) {
            // Apply to current page
            document.documentElement.setAttribute('data-theme', themeName === 'default' ? '' : themeName);
        }
        
        async function updateMainAppTheme(themeName) {
            try {
                const token = await getCSRFToken();
                const response = await authenticatedFetch('/api/admin/theme', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        theme: themeName,
                        csrfToken: token
                    })
                });
                
                if (response.ok) {
                    console.log('Theme updated successfully');
                } else {
                    console.error('Failed to update theme');
                }
            } catch (error) {
                console.error('Error updating theme:', error);
            }
        }
        
        // Initialize themes
        initializeThemes();
        
        window.deleteUser = deleteUser;
        window.createTeam = createTeam;
        window.enableSaveButton = enableSaveButton;
        window.updateTeam = updateTeam;
        window.deleteTeam = deleteTeam;
        window.createChallenge = createChallenge;
        window.enableChallengeSaveButton = enableChallengeSaveButton;
        window.updateChallenge = updateChallenge;
        window.deleteChallenge = deleteChallenge;
});
