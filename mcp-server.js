const db = require('./database');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

// MCP token utilities
const mcpUtils = {
  // Generate secure MCP token
  generateToken: (userId) => {
    const uuid = uuidv4();
    const userHash = crypto.createHash('sha256').update(userId.toString()).digest('hex').substring(0, 8);
    return `mcp_${uuid}_${userHash}`;
  },

  // Validate and parse MCP token
  validateToken: async (token) => {
    return new Promise((resolve, reject) => {
      if (!token || !token.startsWith('mcp_')) {
        return resolve(null);
      }

      const query = `
        SELECT t.*, u.email, u.name as user_name 
        FROM mcp_tokens t 
        JOIN users u ON t.user_id = u.id 
        WHERE t.token = ? AND t.expires_at > datetime('now')
      `;

      db.get(query, [token], (err, result) => {
        if (err) return reject(err);
        if (!result) return resolve(null);

        // Update last_used_at
        db.run('UPDATE mcp_tokens SET last_used_at = datetime("now") WHERE id = ?', [result.id]);
        
        resolve(result);
      });
    });
  },

  // Log MCP action to audit trail
  logAction: async (tokenId, userId, action, params, oldValue = null, newValue = null, wasOverwrite = false, ipAddress = null, userAgent = null, success = true, errorMessage = null) => {
    return new Promise((resolve) => {
      const query = `
        INSERT INTO mcp_audit_log 
        (token_id, user_id, action, params, old_value, new_value, was_overwrite, ip_address, user_agent, success, error_message) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      db.run(query, [
        tokenId, 
        userId, 
        action, 
        JSON.stringify(params), 
        oldValue, 
        newValue, 
        wasOverwrite ? 1 : 0, 
        ipAddress, 
        userAgent, 
        success ? 1 : 0, 
        errorMessage
      ], function(err) {
        if (err) console.error('Failed to log MCP action:', err);
        resolve();
      });
    });
  }
};

// Helper functions for date validation and timezone handling
function isValidDate(dateString) {
  const date = new Date(dateString + 'T00:00:00');
  return date instanceof Date && !isNaN(date) && dateString.match(/^\d{4}-\d{2}-\d{2}$/);
}

function getCurrentPacificTime() {
  return new Date().toLocaleString("en-US", {timeZone: "America/Los_Angeles"});
}

function validateNumericInput(value, fieldName, min = 0, max = 70000) {
  // Handle null, undefined, empty string
  if (value === null || value === undefined || value === '') {
    throw new Error(`${fieldName} is required`);
  }

  // Handle string numbers
  if (typeof value === 'string') {
    if (!/^\d+$/.test(value.trim())) {
      throw new Error(`${fieldName} must be a valid number`);
    }
    value = parseInt(value.trim(), 10);
  }

  // Type check
  if (typeof value !== 'number') {
    throw new Error(`${fieldName} must be a number`);
  }

  // Range validation
  if (value < min || value > max) {
    throw new Error(`${fieldName} must be between ${min} and ${max}`);
  }

  return value;
}

// Check if user has existing step data for a date
async function getExistingSteps(userId, date) {
  return new Promise((resolve, reject) => {
    db.get('SELECT count FROM steps WHERE user_id = ? AND date = ?', [userId, date], (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
  });
}

// Get active challenge
async function getActiveChallenge() {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM challenges WHERE is_active = 1', (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
  });
}

// MCP Tools Implementation
const mcpTools = {
  // Add or update steps with overwrite protection
  add_steps: async (params, tokenInfo, ipAddress, userAgent) => {
    const { date, count, allow_overwrite = false } = params;
    const userId = tokenInfo.user_id;

    try {
      // Validate inputs
      if (!date) {
        throw new Error('Date is required');
      }

      const validatedCount = validateNumericInput(count, 'Step count', 0, 70000);

      if (!isValidDate(date)) {
        throw new Error('Invalid date format. Use YYYY-MM-DD');
      }

      // Prevent future date entries
      const stepDate = new Date(date + 'T00:00:00');
      const nowPacific = getCurrentPacificTime();
      const maxAllowedDate = new Date(nowPacific);
      maxAllowedDate.setDate(maxAllowedDate.getDate() + 1);

      if (stepDate > maxAllowedDate) {
        throw new Error('Cannot enter steps for future dates');
      }

      // Check for existing data (overwrite protection)
      const existingSteps = await getExistingSteps(userId, date);
      let wasOverwrite = false;
      let oldValue = null;

      if (existingSteps && !allow_overwrite) {
        throw new Error(`Steps already exist for ${date} (${existingSteps.count} steps). Set allow_overwrite=true to replace existing data.`);
      }

      if (existingSteps) {
        wasOverwrite = true;
        oldValue = existingSteps.count.toString();
      }

      // Check active challenge and validate date
      const challenge = await getActiveChallenge();
      let challengeId = null;

      if (challenge) {
        const stepDate = new Date(date + 'T00:00:00');
        const startDate = new Date(challenge.start_date + 'T00:00:00');
        const endDate = new Date(challenge.end_date + 'T23:59:59');

        if (stepDate < startDate || stepDate > endDate) {
          throw new Error(`Step logging is only allowed during the active challenge period (${challenge.start_date} to ${challenge.end_date})`);
        }
        challengeId = challenge.id;
      }

      // Save steps
      const saveSteps = () => {
        return new Promise((resolve, reject) => {
          const query = challengeId 
            ? 'INSERT OR REPLACE INTO steps (user_id, date, count, challenge_id, updated_at) VALUES (?, ?, ?, ?, datetime("now"))'
            : 'INSERT OR REPLACE INTO steps (user_id, date, count, updated_at) VALUES (?, ?, ?, datetime("now"))';
          
          const params = challengeId 
            ? [userId, date, validatedCount, challengeId]
            : [userId, date, validatedCount];

          db.run(query, params, function(err) {
            if (err) return reject(err);
            resolve();
          });
        });
      };

      await saveSteps();

      // Log the action
      await mcpUtils.logAction(
        tokenInfo.id,
        userId,
        'add_steps',
        { date, count: validatedCount, allow_overwrite },
        oldValue,
        validatedCount.toString(),
        wasOverwrite,
        ipAddress,
        userAgent,
        true
      );

      return {
        success: true,
        message: wasOverwrite 
          ? `Steps updated for ${date}: ${oldValue} → ${validatedCount} (overwritten)`
          : `Steps saved for ${date}: ${validatedCount}`,
        date,
        count: validatedCount,
        was_overwrite: wasOverwrite,
        old_count: wasOverwrite ? parseInt(oldValue) : null
      };

    } catch (error) {
      // Log failed action
      await mcpUtils.logAction(
        tokenInfo.id,
        userId,
        'add_steps',
        { date, count, allow_overwrite },
        null,
        null,
        false,
        ipAddress,
        userAgent,
        false,
        error.message
      );

      throw error;
    }
  },

  // Get steps with date filtering
  get_steps: async (params, tokenInfo, ipAddress, userAgent) => {
    const { start_date, end_date } = params;
    const userId = tokenInfo.user_id;

    try {
      let query = 'SELECT date, count, challenge_id, updated_at FROM steps WHERE user_id = ?';
      let queryParams = [userId];

      if (start_date) {
        if (!isValidDate(start_date)) {
          throw new Error('Invalid start_date format. Use YYYY-MM-DD');
        }
        query += ' AND date >= ?';
        queryParams.push(start_date);
      }

      if (end_date) {
        if (!isValidDate(end_date)) {
          throw new Error('Invalid end_date format. Use YYYY-MM-DD');
        }
        query += ' AND date <= ?';
        queryParams.push(end_date);
      }

      query += ' ORDER BY date DESC';

      const getSteps = () => {
        return new Promise((resolve, reject) => {
          db.all(query, queryParams, (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
          });
        });
      };

      const steps = await getSteps();

      // Log the action
      await mcpUtils.logAction(
        tokenInfo.id,
        userId,
        'get_steps',
        { start_date, end_date },
        null,
        null,
        false,
        ipAddress,
        userAgent,
        true
      );

      return {
        success: true,
        steps,
        count: steps.length,
        date_range: {
          start: start_date || 'beginning',
          end: end_date || 'present'
        }
      };

    } catch (error) {
      // Log failed action
      await mcpUtils.logAction(
        tokenInfo.id,
        userId,
        'get_steps',
        { start_date, end_date },
        null,
        null,
        false,
        ipAddress,
        userAgent,
        false,
        error.message
      );

      throw error;
    }
  },

  // Get user profile information
  get_user_profile: async (params, tokenInfo, ipAddress, userAgent) => {
    const userId = tokenInfo.user_id;

    try {
      const getUserInfo = () => {
        return new Promise((resolve, reject) => {
          db.get('SELECT email, name, team_id FROM users WHERE id = ?', [userId], (err, user) => {
            if (err) return reject(err);
            if (!user) return reject(new Error('User not found'));
            resolve(user);
          });
        });
      };

      const getTeamInfo = (teamId) => {
        if (!teamId) return Promise.resolve(null);
        return new Promise((resolve, reject) => {
          db.get('SELECT name FROM teams WHERE id = ?', [teamId], (err, team) => {
            if (err) return reject(err);
            resolve(team);
          });
        });
      };

      const user = await getUserInfo();
      const team = await getTeamInfo(user.team_id);
      const challenge = await getActiveChallenge();

      // Log the action
      await mcpUtils.logAction(
        tokenInfo.id,
        userId,
        'get_user_profile',
        {},
        null,
        null,
        false,
        ipAddress,
        userAgent,
        true
      );

      return {
        success: true,
        user: {
          email: user.email,
          name: user.name,
          team: team ? team.name : null
        },
        token: {
          name: tokenInfo.name,
          permissions: tokenInfo.permissions,
          expires_at: tokenInfo.expires_at
        },
        active_challenge: challenge ? {
          name: challenge.name,
          start_date: challenge.start_date,
          end_date: challenge.end_date,
          reporting_threshold: challenge.reporting_threshold
        } : null
      };

    } catch (error) {
      // Log failed action
      await mcpUtils.logAction(
        tokenInfo.id,
        userId,
        'get_user_profile',
        {},
        null,
        null,
        false,
        ipAddress,
        userAgent,
        false,
        error.message
      );

      throw error;
    }
  }
};

// JSON-RPC 2.0 handler
const handleMCPRequest = async (body, ipAddress, userAgent) => {
  // Validate JSON-RPC 2.0 format
  if (!body.jsonrpc || body.jsonrpc !== '2.0') {
    return {
      jsonrpc: '2.0',
      error: {
        code: -32600,
        message: 'Invalid Request',
        data: 'Missing or invalid jsonrpc version'
      },
      id: body.id || null
    };
  }

  if (!body.method) {
    return {
      jsonrpc: '2.0',
      error: {
        code: -32600,
        message: 'Invalid Request',
        data: 'Missing method'
      },
      id: body.id || null
    };
  }

  // Extract token from params
  const token = body.params?.token;
  if (!token) {
    return {
      jsonrpc: '2.0',
      error: {
        code: -32602,
        message: 'Invalid params',
        data: 'Missing token parameter'
      },
      id: body.id || null
    };
  }

  try {
    // Validate token
    const tokenInfo = await mcpUtils.validateToken(token);
    if (!tokenInfo) {
      return {
        jsonrpc: '2.0',
        error: {
          code: -32001,
          message: 'Authentication failed',
          data: 'Invalid or expired token'
        },
        id: body.id || null
      };
    }

    // Check if method exists
    if (!mcpTools[body.method]) {
      return {
        jsonrpc: '2.0',
        error: {
          code: -32601,
          message: 'Method not found',
          data: `Unknown method: ${body.method}`
        },
        id: body.id || null
      };
    }

    // Check permissions for write operations
    if (['add_steps'].includes(body.method) && tokenInfo.permissions === 'read_only') {
      return {
        jsonrpc: '2.0',
        error: {
          code: -32003,
          message: 'Permission denied',
          data: 'Read-only token cannot perform write operations'
        },
        id: body.id || null
      };
    }

    // Extract method parameters (excluding token)
    const methodParams = { ...body.params };
    delete methodParams.token;

    // Execute method
    const result = await mcpTools[body.method](methodParams, tokenInfo, ipAddress, userAgent);

    return {
      jsonrpc: '2.0',
      result,
      id: body.id
    };

  } catch (error) {
    console.error('MCP method error:', error);
    return {
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Server error',
        data: error.message
      },
      id: body.id || null
    };
  }
};

// MCP capabilities discovery
const getMCPCapabilities = () => {
  return {
    capabilities: {
      tools: [
        {
          name: 'add_steps',
          description: 'Add or update daily step count for a specific date',
          parameters: {
            type: 'object',
            properties: {
              token: { type: 'string', description: 'MCP authentication token' },
              date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Date in YYYY-MM-DD format' },
              count: { type: 'number', minimum: 0, maximum: 70000, description: 'Number of steps (0-70,000)' },
              allow_overwrite: { type: 'boolean', default: false, description: 'Allow overwriting existing step data (default: false)' }
            },
            required: ['token', 'date', 'count']
          }
        },
        {
          name: 'get_steps',
          description: 'Retrieve step history with optional date filtering',
          parameters: {
            type: 'object',
            properties: {
              token: { type: 'string', description: 'MCP authentication token' },
              start_date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Start date filter (optional)' },
              end_date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'End date filter (optional)' }
            },
            required: ['token']
          }
        },
        {
          name: 'get_user_profile',
          description: 'Get user information, token details, and active challenge info',
          parameters: {
            type: 'object',
            properties: {
              token: { type: 'string', description: 'MCP authentication token' }
            },
            required: ['token']
          }
        }
      ]
    },
    server_info: {
      name: 'Step Challenge MCP Server',
      version: '1.0.0',
      description: 'MCP server for step tracking with overwrite protection and comprehensive audit logging'
    }
  };
};

module.exports = {
  mcpUtils,
  handleMCPRequest,
  getMCPCapabilities
};