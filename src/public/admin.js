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
        
        
        document.getElementById('manageTeamsBtn').addEventListener('click', () => {
            showView('manageTeams');
            loadManageTeams();
        });

        document.getElementById('challengesBtn').addEventListener('click', () => {
            showView('challenges');
            loadChallenges();
        });
        
        document.getElementById('mcpTokensBtn').addEventListener('click', () => {
            showView('mcpTokens');
            loadMCPTokens();
        });
        
        document.getElementById('overviewBtn').addEventListener('click', () => {
            showView('overview');
            loadOverview();
        });
        
        document.getElementById('extrasBtn').addEventListener('click', () => {
            showView('extras');
            loadExtras();
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
                
                // Store original users data for sorting
                window.usersData = users;
                window.teamsData = teams;
                
                renderUsersTable(users, teams);
            } catch (error) {
                document.getElementById('usersTable').innerHTML = '<p>Error loading users</p>';
            }
        }

        // Table sorting state
        let currentSortColumn = null;
        let currentSortDirection = 'asc';

        // Render users table with sorting capability
        function renderUsersTable(users, teams) {
            const usersTable = document.getElementById('usersTable');
            usersTable.innerHTML = `
                <table id="users-table">
                    <thead>
                        <tr>
                            <th class="sortable" data-column="name">Name <span class="sort-indicator"></span></th>
                            <th class="sortable" data-column="email">Email <span class="sort-indicator"></span></th>
                            <th class="sortable" data-column="team">Team <span class="sort-indicator"></span></th>
                            <th class="sortable" data-column="total_steps">Total Steps <span class="sort-indicator"></span></th>
                            <th class="sortable" data-column="days_logged">Days Logged <span class="sort-indicator"></span></th>
                            <th class="sortable" data-column="is_admin">Admin <span class="sort-indicator"></span></th>
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
                                <td class="actions-cell">
                                    <button class="action-btn save-btn save-team-btn" id="save-${user.id}" data-user-id="${user.id}" disabled title="Save team assignment">
                                        💾
                                    </button>
                                    <button class="action-btn magic-link-btn" data-user-id="${user.id}" data-user-name="${user.name}" data-user-email="${user.email}" title="Generate magic login link">
                                        🔗
                                    </button>
                                    <button class="action-btn clear-btn clear-steps-btn" data-user-id="${user.id}" data-user-name="${user.name}" title="Clear all steps for this user">
                                        🗑️
                                    </button>
                                    <button class="action-btn delete-btn delete-user-btn" data-user-id="${user.id}" data-user-name="${user.name}" title="Delete user account">
                                        ❌
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;

            // Add click event listeners to sortable headers
            document.querySelectorAll('.sortable').forEach(header => {
                header.addEventListener('click', () => {
                    const column = header.dataset.column;
                    sortUsersTable(column);
                });
                header.style.cursor = 'pointer';
            });

            // Update sort indicators
            updateSortIndicators();
        }

        // Sort users table by column
        function sortUsersTable(column) {
            if (currentSortColumn === column) {
                currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                currentSortColumn = column;
                currentSortDirection = 'asc';
            }

            const sortedUsers = [...window.usersData].sort((a, b) => {
                let aValue = a[column];
                let bValue = b[column];

                // Handle special cases
                if (column === 'team') {
                    aValue = aValue || '';
                    bValue = bValue || '';
                }

                // Convert to appropriate types for comparison
                if (typeof aValue === 'string' && typeof bValue === 'string') {
                    aValue = aValue.toLowerCase();
                    bValue = bValue.toLowerCase();
                }

                let comparison = 0;
                if (aValue < bValue) {
                    comparison = -1;
                } else if (aValue > bValue) {
                    comparison = 1;
                }

                return currentSortDirection === 'asc' ? comparison : -comparison;
            });

            renderUsersTable(sortedUsers, window.teamsData);
        }

        // Update sort indicators
        function updateSortIndicators() {
            document.querySelectorAll('.sort-indicator').forEach(indicator => {
                indicator.textContent = '';
            });

            if (currentSortColumn) {
                const activeHeader = document.querySelector(`[data-column="${currentSortColumn}"] .sort-indicator`);
                if (activeHeader) {
                    activeHeader.textContent = currentSortDirection === 'asc' ? ' ↑' : ' ↓';
                }
            }
        }

        // Update team selection for user
        function updateUserTeam(userId) {
            const saveBtn = document.getElementById(`save-${userId}`);
            saveBtn.disabled = false;
            saveBtn.classList.remove('save-success');
            saveBtn.classList.add('save-active');
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
            saveBtn.classList.add('save-active');
            
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
                    saveBtn.classList.remove('save-active');
                    saveBtn.classList.add('save-success');
                    setTimeout(() => {
                        messageDiv.innerHTML = '';
                        saveBtn.classList.remove('save-success');
                        saveBtn.disabled = true;
                    }, 3000);
                } else {
                    messageDiv.innerHTML = '<div class="message error">' + data.error + '</div>';
                    saveBtn.disabled = false;
                    saveBtn.classList.remove('save-active');
                }
            } catch (error) {
                messageDiv.innerHTML = '<div class="message error">Network error. Please try again.</div>';
                saveBtn.disabled = false;
                saveBtn.classList.remove('save-active');
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

        // Generate magic link for user (admin only) with enhanced security
        async function generateMagicLink(userId, userName, userEmail) {
            // First, show confirmation dialog as required by security review
            const confirmed = confirm(
                `⚠️ SECURITY WARNING ⚠️\n\n` +
                `You are about to generate a temporary login link for:\n` +
                `• User: ${userName} (${userEmail})\n\n` +
                `This action will:\n` +
                `• Create a direct login link that bypasses email authentication\n` +
                `• Grant immediate access to the user's account\n` +
                `• Be logged for security audit purposes\n\n` +
                `Are you sure you want to proceed?`
            );
            
            if (!confirmed) {
                return;
            }
            
            const messageDiv = document.getElementById('usersMessage');
            messageDiv.innerHTML = '<div class="message info">Generating magic link...</div>';
            
            try {
                // First call without confirmation to trigger security prompt
                let response = await authenticatedFetch('/api/admin/generate-magic-link', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: userId })
                });
                
                let data = await response.json();
                
                // If requires confirmation, make the confirmed call
                if (data.requiresConfirmation) {
                    response = await authenticatedFetch('/api/admin/generate-magic-link', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userId: userId, confirmed: true })
                    });
                    
                    data = await response.json();
                }
                
                if (response.ok) {
                    // Show success message
                    messageDiv.innerHTML = '<div class="message success">Magic link generated successfully!</div>';
                    
                    // Show secure modal with magic link
                    showMagicLinkModal(data);
                    
                    setTimeout(() => messageDiv.innerHTML = '', 5000);
                } else {
                    messageDiv.innerHTML = '<div class="message error">' + data.error + '</div>';
                }
            } catch (error) {
                console.error('Error generating magic link:', error);
                messageDiv.innerHTML = '<div class="message error">Network error. Please try again.</div>';
            }
        }

        // Show magic link in secure modal with enhanced security features
        function showMagicLinkModal(linkData) {
            // Create modal HTML with security enhancements
            const modalHTML = `
                <div id="magicLinkModal" style="
                    position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
                    background: rgba(0, 0, 0, 0.8); z-index: 10000; 
                    display: flex; align-items: center; justify-content: center;
                ">
                    <div style="
                        background: white; padding: 30px; border-radius: 15px; 
                        max-width: 600px; width: 90%; box-shadow: 0 20px 40px rgba(0,0,0,0.3);
                        position: relative;
                    ">
                        <h2 style="color: #d9534f; margin: 0 0 20px 0; display: flex; align-items: center;">
                            🔗 Magic Link Generated
                            <span style="
                                background: #f8d7da; color: #721c24; font-size: 12px; 
                                padding: 4px 8px; border-radius: 4px; margin-left: 10px;
                            ">SECURITY SENSITIVE</span>
                        </h2>
                        
                        <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                            <strong>Target User:</strong> ${linkData.targetUser.name} (${linkData.targetUser.email})<br>
                            <strong>Expires:</strong> ${linkData.expiresAtLocal}<br>
                            <strong>Token ID:</strong> ${linkData.maskedToken}
                        </div>
                        
                        <div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #ffc107;">
                            <strong>⚠️ Security Notice:</strong><br>
                            ${linkData.securityNotice}
                        </div>
                        
                        <div style="margin-bottom: 20px;">
                            <label style="font-weight: bold; display: block; margin-bottom: 8px;">Magic Link:</label>
                            <div style="display: flex; gap: 10px;">
                                <input type="text" id="magicLinkInput" value="${linkData.magicLink}" 
                                       style="flex: 1; padding: 12px; border: 2px solid #007bff; border-radius: 6px; font-family: monospace;" 
                                       readonly>
                                <button id="copyLinkBtn" style="
                                    background: #007bff; color: white; border: none; padding: 12px 20px; 
                                    border-radius: 6px; cursor: pointer; white-space: nowrap;
                                ">📋 Copy</button>
                            </div>
                        </div>
                        
                        <div style="display: flex; gap: 10px; justify-content: flex-end;">
                            <button id="closeMagicLinkModal" style="
                                background: #6c757d; color: white; border: none; padding: 12px 20px; 
                                border-radius: 6px; cursor: pointer;
                            ">Close</button>
                        </div>
                    </div>
                </div>
            `;
            
            // Add modal to DOM
            document.body.insertAdjacentHTML('beforeend', modalHTML);
            
            // Auto-select the link text for easy copying
            const linkInput = document.getElementById('magicLinkInput');
            linkInput.select();
            linkInput.setSelectionRange(0, 99999); // For mobile devices
            
            // Copy button functionality with secure clipboard handling
            document.getElementById('copyLinkBtn').addEventListener('click', async () => {
                try {
                    await navigator.clipboard.writeText(linkData.magicLink);
                    
                    // Show success feedback
                    const copyBtn = document.getElementById('copyLinkBtn');
                    const originalText = copyBtn.textContent;
                    copyBtn.textContent = '✅ Copied!';
                    copyBtn.style.background = '#28a745';
                    
                    // Auto-clear clipboard after 60 seconds for security
                    setTimeout(async () => {
                        try {
                            await navigator.clipboard.writeText('');
                            console.log('🔒 Clipboard cleared for security');
                        } catch (e) {
                            console.log('Could not clear clipboard automatically');
                        }
                    }, 60000);
                    
                    setTimeout(() => {
                        if (document.getElementById('copyLinkBtn')) {
                            copyBtn.textContent = originalText;
                            copyBtn.style.background = '#007bff';
                        }
                    }, 2000);
                } catch (err) {
                    console.error('Could not copy to clipboard:', err);
                    // Fallback: select text for manual copy
                    linkInput.select();
                    alert('Please copy the link manually (Ctrl+C or Cmd+C)');
                }
            });
            
            // Close modal functionality
            document.getElementById('closeMagicLinkModal').addEventListener('click', () => {
                document.getElementById('magicLinkModal').remove();
            });
            
            // Close on background click
            document.getElementById('magicLinkModal').addEventListener('click', (e) => {
                if (e.target.id === 'magicLinkModal') {
                    document.getElementById('magicLinkModal').remove();
                }
            });
            
            // Close on Escape key
            const escapeHandler = (e) => {
                if (e.key === 'Escape') {
                    document.getElementById('magicLinkModal').remove();
                    document.removeEventListener('keydown', escapeHandler);
                }
            };
            document.addEventListener('keydown', escapeHandler);
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
            
            // Generate magic link buttons
            if (e.target.classList.contains('magic-link-btn')) {
                const userId = e.target.dataset.userId;
                const userName = e.target.dataset.userName;
                const userEmail = e.target.dataset.userEmail;
                generateMagicLink(parseInt(userId), userName, userEmail);
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
        
        // MCP Token Management Functions
        async function loadMCPTokens() {
            try {
                // Load users for dropdown and tokens table
                const [usersRes, tokensRes, auditRes] = await Promise.all([
                    fetch('/api/admin/users'),
                    fetch('/api/admin/mcp-tokens'),
                    fetch('/api/admin/mcp-audit?limit=50')
                ]);
                
                const users = await usersRes.json();
                const tokens = await tokensRes.json();
                const auditResponse = await auditRes.json();
                
                // Populate user dropdown
                const userSelect = document.getElementById('newTokenUserId');
                userSelect.innerHTML = '<option value="">Select User...</option>';
                users.forEach(user => {
                    userSelect.innerHTML += `<option value="${user.id}">${user.name} (${user.email})</option>`;
                });
                
                // Load tokens table
                loadTokensTable(tokens);
                
                // Load audit table - extract logs array from response
                const auditLog = auditResponse.logs || auditResponse || [];
                loadAuditTable(auditLog);
                
                // Add event listeners
                document.getElementById('createTokenBtn').addEventListener('click', createMCPToken);
                document.getElementById('refreshAuditBtn').addEventListener('click', refreshAuditLog);
                
                // Add search/filter listeners
                document.getElementById('auditSearchUser').addEventListener('input', filterAuditLog);
                document.getElementById('auditSearchMethod').addEventListener('change', filterAuditLog);
                
                // Add event delegation for token action buttons
                addTokenEventListeners();
                
            } catch (error) {
                console.error('Error loading MCP tokens:', error);
                document.getElementById('mcpTokensTable').innerHTML = '<p>Error loading tokens</p>';
                document.getElementById('mcpAuditTable').innerHTML = '<p>Error loading audit log</p>';
            }
        }
        
        function loadTokensTable(tokens) {
            const tokenTable = document.getElementById('mcpTokensTable');
            
            if (!tokens || tokens.length === 0) {
                tokenTable.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">No MCP tokens created yet</p>';
                return;
            }
            
            tokenTable.innerHTML = `
                <table>
                    <thead>
                        <tr>
                            <th>User</th>
                            <th>Token Name</th>
                            <th>Permissions</th>
                            <th>Scopes</th>
                            <th>Created</th>
                            <th>Expires</th>
                            <th>Last Used</th>
                            <th>Usage Count</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tokens.map(token => {
                            const isExpired = new Date(token.expires_at) < new Date();
                            const expiresDate = new Date(token.expires_at).toLocaleDateString();
                            const createdDate = new Date(token.created_at).toLocaleDateString();
                            const lastUsed = token.last_used_at ? new Date(token.last_used_at).toLocaleDateString() : 'Never';
                            
                            return `
                                <tr ${isExpired ? 'style="opacity: 0.6; background: rgba(255,0,0,0.05);"' : ''}>
                                    <td><strong>${token.user_name}</strong><br><small>${token.user_email}</small></td>
                                    <td>${token.name}</td>
                                    <td><span style="padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; background: ${token.permissions === 'read_write' ? '#e8f5e8; color: #2d7d2d' : '#fff3cd; color: #856404'};">${token.permissions === 'read_write' ? 'Read+Write' : 'Read Only'}</span></td>
                                    <td><code style="font-size: 11px; background: rgba(0,0,0,0.05); padding: 2px 4px; border-radius: 3px;">${token.scopes || 'default'}</code></td>
                                    <td>${createdDate}</td>
                                    <td ${isExpired ? 'style="color: #dc3545; font-weight: bold;"' : ''}>${expiresDate}${isExpired ? ' (Expired)' : ''}</td>
                                    <td>${lastUsed}</td>
                                    <td style="text-align: center;">${token.usage_count || 0}</td>
                                    <td class="actions-cell">
                                        <button class="action-btn delete-btn mcp-revoke-btn" data-token-id="${token.id}" data-token-name="${token.name}" data-user-name="${token.user_name}" title="Revoke token">
                                            🗑️
                                        </button>
                                        <button class="action-btn mcp-copy-btn" data-token-value="${token.token}" title="Copy token" style="background: linear-gradient(135deg, #17a2b8 0%, #138496 100%);">
                                            📋
                                        </button>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            `;
        }
        
        function loadAuditTable(auditData) {
            const auditTable = document.getElementById('mcpAuditTable');
            
            if (!auditData || auditData.length === 0) {
                auditTable.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">No MCP activity recorded yet</p>';
                return;
            }
            
            auditTable.innerHTML = `
                <table>
                    <thead>
                        <tr>
                            <th>Time</th>
                            <th>User</th>
                            <th>Method</th>
                            <th>Status</th>
                            <th>Details</th>
                            <th>IP Address</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${auditData.map(entry => {
                            const timestamp = new Date(entry.timestamp).toLocaleString();
                            const isSuccess = entry.status_code < 400;
                            
                            return `
                                <tr>
                                    <td style="font-size: 12px;">${timestamp}</td>
                                    <td><strong>${entry.user_name}</strong></td>
                                    <td><code style="font-size: 12px; background: rgba(0,0,0,0.05); padding: 2px 4px; border-radius: 3px;">${entry.method}</code></td>
                                    <td><span style="padding: 2px 6px; border-radius: 3px; font-size: 11px; font-weight: bold; background: ${isSuccess ? '#d4edda; color: #155724' : '#f8d7da; color: #721c24'};">${entry.status_code}</span></td>
                                    <td style="font-size: 12px; max-width: 200px; word-wrap: break-word;">${entry.details || '-'}</td>
                                    <td style="font-size: 11px; color: #666;">${entry.ip_address}</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            `;
        }
        
        async function createMCPToken() {
            const userId = document.getElementById('newTokenUserId').value;
            const tokenName = document.getElementById('newTokenName').value;
            const permissions = document.getElementById('newTokenPermissions').value;
            const scopes = document.getElementById('newTokenScopes').value;
            const expiresDays = document.getElementById('newTokenExpires').value;
            const messageDiv = document.getElementById('mcpTokensMessage');
            
            // Validation
            if (!userId) {
                messageDiv.innerHTML = '<div class="message error">Please select a user</div>';
                setTimeout(() => messageDiv.innerHTML = '', 3000);
                return;
            }
            
            if (!tokenName.trim()) {
                messageDiv.innerHTML = '<div class="message error">Please enter a token name</div>';
                setTimeout(() => messageDiv.innerHTML = '', 3000);
                return;
            }
            
            const createBtn = document.getElementById('createTokenBtn');
            createBtn.disabled = true;
            createBtn.textContent = 'Creating...';
            
            try {
                const response = await authenticatedFetch('/api/admin/mcp-tokens', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        user_id: parseInt(userId),
                        name: tokenName.trim(),
                        permissions: permissions,
                        scopes: scopes.trim(),
                        expires_days: parseInt(expiresDays)
                    })
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    messageDiv.innerHTML = `
                        <div class="message success">
                            <strong>Token created successfully!</strong><br>
                            <div style="margin-top: 10px; padding: 10px; background: rgba(0,0,0,0.05); border-radius: 5px; font-family: monospace; word-break: break-all; font-size: 12px;">
                                ${data.token || 'Token created but not displayed for security'}
                            </div>
                            <div style="margin-top: 5px; font-size: 12px; color: #666;">
                                ⚠️ Save this token now - it won't be shown again!
                            </div>
                        </div>
                    `;
                    
                    // Clear form
                    document.getElementById('newTokenUserId').value = '';
                    document.getElementById('newTokenName').value = '';
                    document.getElementById('newTokenScopes').value = 'steps:read,steps:write,profile:read';
                    document.getElementById('newTokenExpires').value = '30';
                    
                    // Reload tokens table
                    setTimeout(() => {
                        loadMCPTokens();
                        messageDiv.innerHTML = '';
                    }, 10000);
                } else {
                    messageDiv.innerHTML = '<div class="message error">' + data.error + '</div>';
                    setTimeout(() => messageDiv.innerHTML = '', 5000);
                }
            } catch (error) {
                messageDiv.innerHTML = '<div class="message error">Network error. Please try again.</div>';
                setTimeout(() => messageDiv.innerHTML = '', 5000);
            } finally {
                createBtn.disabled = false;
                createBtn.textContent = 'Create Token';
            }
        }
        
        function addTokenEventListeners() {
            // Remove existing listeners to prevent duplicates
            const tokenTable = document.getElementById('mcpTokensTable');
            if (tokenTable) {
                tokenTable.removeEventListener('click', handleTokenActions);
                tokenTable.addEventListener('click', handleTokenActions);
            }
        }
        
        function handleTokenActions(event) {
            const target = event.target;
            
            if (target.classList.contains('mcp-revoke-btn')) {
                const tokenId = target.getAttribute('data-token-id');
                const tokenName = target.getAttribute('data-token-name');
                const userName = target.getAttribute('data-user-name');
                revokeMCPToken(tokenId, tokenName, userName);
            } else if (target.classList.contains('mcp-copy-btn')) {
                const tokenValue = target.getAttribute('data-token-value');
                copyTokenValue(tokenValue);
            }
        }

        async function revokeMCPToken(tokenId, tokenName, userName) {
            if (!confirm(`Are you sure you want to revoke the token "${tokenName}" for ${userName}? This action cannot be undone and will immediately disable API access.`)) {
                return;
            }
            
            const messageDiv = document.getElementById('mcpTokensMessage');
            
            try {
                const response = await authenticatedFetch(`/api/admin/mcp-tokens/${tokenId}`, {
                    method: 'DELETE'
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    messageDiv.innerHTML = '<div class="message success">Token revoked successfully!</div>';
                    setTimeout(() => {
                        messageDiv.innerHTML = '';
                        loadMCPTokens(); // Reload the table with event listeners
                    }, 2000);
                } else {
                    messageDiv.innerHTML = '<div class="message error">' + data.error + '</div>';
                    setTimeout(() => messageDiv.innerHTML = '', 5000);
                }
            } catch (error) {
                messageDiv.innerHTML = '<div class="message error">Network error. Please try again.</div>';
                setTimeout(() => messageDiv.innerHTML = '', 5000);
            }
        }
        
        async function copyTokenValue(token) {
            try {
                await navigator.clipboard.writeText(token);
                
                // Show temporary feedback
                const messageDiv = document.getElementById('mcpTokensMessage');
                messageDiv.innerHTML = '<div class="message success">Token copied to clipboard!</div>';
                setTimeout(() => messageDiv.innerHTML = '', 2000);
            } catch (error) {
                // Fallback for older browsers
                const textArea = document.createElement('textarea');
                textArea.value = token;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                
                const messageDiv = document.getElementById('mcpTokensMessage');
                messageDiv.innerHTML = '<div class="message success">Token copied to clipboard!</div>';
                setTimeout(() => messageDiv.innerHTML = '', 2000);
            }
        }
        
        async function refreshAuditLog() {
            const refreshBtn = document.getElementById('refreshAuditBtn');
            refreshBtn.disabled = true;
            refreshBtn.textContent = 'Loading...';
            
            try {
                const response = await fetch('/api/admin/mcp-audit?limit=50');
                const auditResponse = await response.json();
                const auditLog = auditResponse.logs || auditResponse || [];
                loadAuditTable(auditLog);
            } catch (error) {
                console.error('Error refreshing audit log:', error);
            } finally {
                refreshBtn.disabled = false;
                refreshBtn.textContent = 'Refresh';
            }
        }
        
        function filterAuditLog() {
            const userFilter = document.getElementById('auditSearchUser').value.toLowerCase();
            const methodFilter = document.getElementById('auditSearchMethod').value;
            
            const rows = document.querySelectorAll('#mcpAuditTable tbody tr');
            
            rows.forEach(row => {
                const userName = row.cells[1].textContent.toLowerCase();
                const method = row.cells[2].textContent;
                
                const userMatch = !userFilter || userName.includes(userFilter);
                const methodMatch = !methodFilter || method.includes(methodFilter);
                
                row.style.display = (userMatch && methodMatch) ? '' : 'none';
            });
        }

        // Load Extras functionality
        function loadExtras() {
            // Load current mega confetti setting
            const megaConfettiEnabled = localStorage.getItem('megaConfettiEnabled') === 'true';
            document.getElementById('megaConfettiEnabled').checked = megaConfettiEnabled;
            
            // Load current reverse Y direction setting
            const reverseYDirection = localStorage.getItem('reverseYDirection') === 'true';
            document.getElementById('reverseYDirection').checked = reverseYDirection;
            
            // Add event listener for mega confetti toggle
            document.getElementById('megaConfettiEnabled').addEventListener('change', function() {
                const enabled = this.checked;
                localStorage.setItem('megaConfettiEnabled', enabled.toString());
                
                // Show success message
                showExtrasMessage(`Epic Confetti ${enabled ? 'enabled' : 'disabled'}! ${enabled ? '🎉' : '😔'}`, 'success');
            });
            
            // Add event listener for reverse Y direction toggle
            document.getElementById('reverseYDirection').addEventListener('change', function() {
                const enabled = this.checked;
                localStorage.setItem('reverseYDirection', enabled.toString());
                
                // Show success message
                showExtrasMessage(`Y Direction ${enabled ? 'reversed' : 'normal'}! Confetti will now fall ${enabled ? 'upward' : 'downward'} by default.`, 'success');
            });
            
            // Add confetti testing buttons
            document.getElementById('testRegularConfetti').addEventListener('click', function() {
                testRegularConfetti();
                showExtrasMessage('🎉 Regular confetti test triggered!', 'success');
            });
            
            document.getElementById('testMegaConfetti').addEventListener('click', function() {
                const megaConfettiEnabled = localStorage.getItem('megaConfettiEnabled') === 'true';
                if (megaConfettiEnabled) {
                    testMegaConfetti();
                    showExtrasMessage('🚀 Epic confetti test triggered!', 'success');
                } else {
                    showExtrasMessage('⚠️ Enable Epic Confetti first to test it!', 'error');
                }
            });

            // Add physics controls functionality
            setupPhysicsControls();
        }
        
        // Test confetti functions
        function testRegularConfetti() {
            // Import the confetti function from dashboard context if available
            if (typeof createConfetti === 'function') {
                createConfetti();
            } else {
                // Create a temporary canvas and run basic confetti
                createTestCanvas();
                createBasicConfetti();
            }
        }
        
        function testMegaConfetti() {
            // Import the mega confetti function from dashboard context if available
            if (typeof createMegaConfetti === 'function') {
                createMegaConfetti();
            } else {
                // Create a temporary canvas and run test mega confetti
                createTestCanvas();
                createTestMegaConfetti();
            }
        }
        
        function createTestCanvas() {
            // Create canvas if it doesn't exist
            let canvas = document.getElementById('confettiCanvas');
            if (!canvas) {
                canvas = document.createElement('canvas');
                canvas.id = 'confettiCanvas';
                canvas.style.position = 'fixed';
                canvas.style.top = '0';
                canvas.style.left = '0';
                canvas.style.width = '100%';
                canvas.style.height = '100%';
                canvas.style.pointerEvents = 'none';
                canvas.style.zIndex = '10000';
                canvas.style.display = 'none';
                document.body.appendChild(canvas);
            }
        }
        
        function createBasicConfetti() {
            const canvas = document.getElementById('confettiCanvas');
            const ctx = canvas.getContext('2d');
            
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
                    
                    piece.x += piece.vx;
                    piece.y += piece.vy;
                    piece.rotation += piece.rotationSpeed;
                    piece.vy += 0.1; // gravity
                    
                    if (piece.y > canvas.height + 10) {
                        confettiPieces.splice(i, 1);
                        continue;
                    }
                    
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
                    canvas.style.display = 'none';
                }
            }
            
            animate();
        }
        
        function createTestMegaConfetti() {
            // Load the dashboard script dynamically to access mega confetti
            const script = document.createElement('script');
            script.src = '/dashboard.js';
            script.onload = function() {
                // Try to call the mega confetti function
                if (typeof window.createMegaConfetti === 'function') {
                    window.createMegaConfetti();
                } else {
                    // Fallback to basic implementation
                    showExtrasMessage('⚠️ Epic confetti requires dashboard context. Try testing from the main app.', 'error');
                }
            };
            document.head.appendChild(script);
        }
        
        function showExtrasMessage(message, type) {
            const messageDiv = document.getElementById('extrasMessage');
            messageDiv.innerHTML = `<div class="message ${type}">${message}</div>`;
            setTimeout(() => {
                messageDiv.innerHTML = '';
            }, 3000);
        }

        function setupPhysicsControls() {
            // Initialize values from localStorage
            const particleCountSlider = document.getElementById('particleCountSlider');
            const particleCountValue = document.getElementById('particleCountValue');
            const lifetimeSlider = document.getElementById('lifetimeSlider');
            const lifetimeValue = document.getElementById('lifetimeValue');
            const tiltSensitivitySlider = document.getElementById('tiltSensitivitySlider');
            const tiltSensitivityValue = document.getElementById('tiltSensitivityValue');
            const maxTiltForceSlider = document.getElementById('maxTiltForceSlider');
            const maxTiltForceValue = document.getElementById('maxTiltForceValue');

            // Load saved values or use defaults
            particleCountSlider.value = localStorage.getItem('confettiParticleCount') || '600';
            particleCountValue.textContent = particleCountSlider.value;
            
            lifetimeSlider.value = localStorage.getItem('confettiLifetime') || '10000';
            lifetimeValue.textContent = (lifetimeSlider.value / 1000) + 's';
            
            tiltSensitivitySlider.value = localStorage.getItem('confettiTiltSensitivity') || '0.3';
            tiltSensitivityValue.textContent = tiltSensitivitySlider.value;
            
            maxTiltForceSlider.value = localStorage.getItem('confettiMaxTiltForce') || '2.0';
            maxTiltForceValue.textContent = maxTiltForceSlider.value;

            // Add event listeners for real-time updates
            particleCountSlider.addEventListener('input', function() {
                particleCountValue.textContent = this.value;
                localStorage.setItem('confettiParticleCount', this.value);
            });

            lifetimeSlider.addEventListener('input', function() {
                lifetimeValue.textContent = (this.value / 1000) + 's';
                localStorage.setItem('confettiLifetime', this.value);
            });

            tiltSensitivitySlider.addEventListener('input', function() {
                tiltSensitivityValue.textContent = this.value;
                localStorage.setItem('confettiTiltSensitivity', this.value);
            });

            maxTiltForceSlider.addEventListener('input', function() {
                maxTiltForceValue.textContent = this.value;
                localStorage.setItem('confettiMaxTiltForce', this.value);
            });

            // Reset to defaults button
            document.getElementById('resetPhysicsBtn').addEventListener('click', function() {
                particleCountSlider.value = '600';
                particleCountValue.textContent = '600';
                localStorage.setItem('confettiParticleCount', '600');

                lifetimeSlider.value = '10000';
                lifetimeValue.textContent = '10s';
                localStorage.setItem('confettiLifetime', '10000');

                tiltSensitivitySlider.value = '0.3';
                tiltSensitivityValue.textContent = '0.3';
                localStorage.setItem('confettiTiltSensitivity', '0.3');

                maxTiltForceSlider.value = '2.0';
                maxTiltForceValue.textContent = '2.0';
                localStorage.setItem('confettiMaxTiltForce', '2.0');

                showExtrasMessage('🔄 Physics settings reset to defaults!', 'success');
            });

            // Test current settings button
            document.getElementById('testPhysicsBtn').addEventListener('click', function() {
                const megaConfettiEnabled = localStorage.getItem('megaConfettiEnabled') === 'true';
                if (megaConfettiEnabled) {
                    testMegaConfetti();
                    const particles = localStorage.getItem('confettiParticleCount') || '600';
                    const lifetime = (localStorage.getItem('confettiLifetime') || '10000') / 1000;
                    showExtrasMessage(`🧪 Testing: ${particles} particles, ${lifetime}s lifetime!`, 'success');
                } else {
                    showExtrasMessage('⚠️ Enable Epic Confetti first to test physics!', 'error');
                }
            });
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
