const db = require('../src/database');
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

// Security utilities
const securityUtils = {
  // Enforce user data isolation - critical security control
  enforceUserAccess: (tokenUserId, operationUserId) => {
    if (tokenUserId !== operationUserId) {
      throw new Error('Access denied: Cannot access other users\' data');
    }
  },

  // Validate token scopes for operations
  validateTokenScope: (tokenInfo, requiredScope) => {
    const userScopes = tokenInfo.scopes ? tokenInfo.scopes.split(',') : [];
    const hasScope = userScopes.includes(requiredScope) || userScopes.includes('*');
    
    if (!hasScope) {
      throw new Error(`Insufficient permissions: Required scope '${requiredScope}'`);
    }
  },

  // Prevent prototype pollution by sanitizing object parameters
  sanitizeParams: (params) => {
    if (!params || typeof params !== 'object') return params;
    
    const cleaned = {};
    for (const [key, value] of Object.entries(params)) {
      // Block dangerous prototype properties
      if (['__proto__', 'constructor', 'prototype'].includes(key)) {
        continue;
      }
      cleaned[key] = value;
    }
    return cleaned;
  },

  // Safe error response without information leakage
  createSafeErrorResponse: (error, isDevMode = false) => {
    const safeErrors = {
      'Access denied: Cannot access other users\' data': 'Access denied',
      'Invalid or expired token': 'Authentication failed',
      'Steps already exist': 'Data conflict - use allow_overwrite to replace'
    };

    // Check for date range errors and provide descriptive messages
    if (error.message.includes('Step logging is only allowed during the active challenge period')) {
      return {
        code: -32000,
        message: 'Date outside challenge period',
        data: error.message
      };
    }

    if (error.message.includes('Cannot enter steps for future dates')) {
      return {
        code: -32000,
        message: 'Future date not allowed',
        data: error.message
      };
    }

    if (error.message.includes('Invalid date format')) {
      return {
        code: -32000,
        message: 'Invalid date format',
        data: error.message
      };
    }

    // In production, use safe error messages
    const message = !isDevMode && safeErrors[error.message] 
      ? safeErrors[error.message] 
      : error.message;

    return {
      code: -32000,
      message: 'Server error',
      data: message
    };
  }
};

// Query builder to prevent SQL injection
const queryBuilder = {
  buildStepsQuery: (hasStartDate, hasEndDate) => {
    const conditions = ['user_id = ?'];
    if (hasStartDate) conditions.push('date >= ?');
    if (hasEndDate) conditions.push('date <= ?');
    return `SELECT date, count, challenge_id, updated_at FROM steps WHERE ${conditions.join(' AND ')} ORDER BY date DESC`;
  },

  buildStepsParams: (userId, startDate, endDate) => {
    const params = [userId];
    if (startDate) params.push(startDate);
    if (endDate) params.push(endDate);
    return params;
  }
};

// Helper functions for date validation and timezone handling
function isValidDate(dateString) {
  if (!dateString || !/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return false;
  
  const date = new Date(dateString + 'T00:00:00');
  if (!(date instanceof Date) || isNaN(date)) return false;
  
  // Reasonable date range validation (1900-2100)
  const year = date.getFullYear();
  return year >= 1900 && year <= 2100;
}

function getCurrentPacificTime() {
  return new Date().toLocaleString("en-US", {timeZone: "America/Los_Angeles"});
}

function validateNumericInput(value, fieldName, min = 0, max = 70000) {
  // Handle null, undefined, empty string
  if (value === null || value === undefined || value === '') {
    throw new Error(`${fieldName} is required`);
  }

  // Handle string numbers with enhanced validation
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) {
      throw new Error(`${fieldName} must be a valid number`);
    }
    // Prevent integer overflow
    if (trimmed.length > 10) {
      throw new Error(`${fieldName} is too large`);
    }
    value = parseInt(trimmed, 10);
  }

  // Type check and NaN validation
  if (typeof value !== 'number' || isNaN(value)) {
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

// Standard MCP Methods Implementation
const mcpMethods = {
  // MCP initialization method
  initialize: async (params) => {
    const { capabilities, clientInfo, protocolVersion } = params || {};
    
    return {
      protocolVersion: "2025-03-26",
      capabilities: {
        tools: {}
      },
      serverInfo: {
        name: "Step Challenge MCP Server",
        version: "2.0.0"
      }
    };
  },

  // MCP tools list method
  tools_list: async (params) => {
    return {
      tools: [
        {
          name: "add_steps",
          description: "Record daily step count for fitness tracking. Use this when user wants to log their steps for a specific date. CRITICAL SAFETY: Never automatically overwrite existing data. If data exists, show user the conflict and ask for explicit confirmation before using allow_overwrite=true. Authentication via Authorization header.",
          inputSchema: {
            type: "object",
            properties: {
              date: {
                type: "string",
                pattern: "^\\d{4}-\\d{2}-\\d{2}$",
                description: "Target date for step count in YYYY-MM-DD format ONLY. Examples: \"2025-07-30\", \"2025-12-25\". NEVER use \"today\" - always convert to actual date like \"2025-07-30\"."
              },
              count: {
                type: "number",
                minimum: 0,
                maximum: 70000,
                description: "Number of steps taken (0-70,000). Typical daily counts: sedentary 2000-5000, active 7500-10000, very active 10000+"
              },
              allow_overwrite: {
                type: "boolean",
                default: false,
                description: "DANGER: Only set to true after explicit user confirmation. NEVER set this automatically. User must explicitly agree to overwrite their existing data."
              }
            },
            required: ["date", "count"]
          }
        },
        {
          name: "get_steps",
          description: "Retrieve step history and progress data. Use this to show user their step counts, analyze trends, check goal progress, or generate reports. Authentication via Authorization header.",
          inputSchema: {
            type: "object",
            properties: {
              start_date: {
                type: "string",
                pattern: "^\\d{4}-\\d{2}-\\d{2}$",
                description: "Optional: Start date for date range filter in YYYY-MM-DD format. Omit to get all history."
              },
              end_date: {
                type: "string",
                pattern: "^\\d{4}-\\d{2}-\\d{2}$",
                description: "Optional: End date for date range filter in YYYY-MM-DD format. Omit to get all history."
              }
            },
            required: []
          }
        },
        {
          name: "get_user_profile",
          description: "Get comprehensive user information including profile details, active challenges, team information, and account status. Use this first to understand user context. Authentication via Authorization header.",
          inputSchema: {
            type: "object",
            properties: {},
            required: []
          }
        }
      ]
    };
  },

  // MCP tools call method
  tools_call: async (toolName, args, tokenInfo, ipAddress, userAgent) => {
    switch (toolName) {
      case 'add_steps':
        const addResult = await stepTools.add_steps(args, tokenInfo, ipAddress, userAgent);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(addResult, null, 2)
            }
          ]
        };
      
      case 'get_steps':
        const getResult = await stepTools.get_steps(args, tokenInfo, ipAddress, userAgent);
        return {
          content: [
            {
              type: "text", 
              text: JSON.stringify(getResult, null, 2)
            }
          ]
        };
      
      case 'get_user_profile':
        const profileResult = await stepTools.get_user_profile(args, tokenInfo, ipAddress, userAgent);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(profileResult, null, 2)
            }
          ]
        };
      
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }
};

// Step Tools Implementation (called by MCP tools/call)
const stepTools = {
  // Add or update steps with overwrite protection
  add_steps: async (params, tokenInfo, ipAddress, userAgent) => {
    const sanitizedParams = securityUtils.sanitizeParams(params);
    const { date, count, allow_overwrite = false, target_user_id } = sanitizedParams;
    const tokenUserId = tokenInfo.user_id;

    try {
      // CRITICAL: Enforce user data isolation
      const operationUserId = target_user_id || tokenUserId;
      securityUtils.enforceUserAccess(tokenUserId, operationUserId);

      // Validate token scope for write operations
      securityUtils.validateTokenScope(tokenInfo, 'steps:write');

      // Validate inputs
      if (!date) {
        throw new Error('Date is required');
      }

      // Check for common invalid date formats
      if (date === 'today' || date === 'yesterday' || date === 'tomorrow') {
        throw new Error(`Invalid date format: "${date}". You must use YYYY-MM-DD format only. Convert relative dates to actual dates first (e.g., "today" → "2025-07-30").`);
      }

      const validatedCount = validateNumericInput(count, 'Step count', 0, 70000);

      if (!isValidDate(date)) {
        throw new Error('Invalid date format. Use YYYY-MM-DD format only (e.g., "2025-07-30").');
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
      const existingSteps = await getExistingSteps(operationUserId, date);
      let wasOverwrite = false;
      let oldValue = null;

      if (existingSteps && !allow_overwrite) {
        return {
          success: false,
          error: "DATA_CONFLICT",
          message: `Steps already exist for ${date}`,
          existing_data: {
            date: date,
            count: existingSteps.count,
            message: `You already have ${existingSteps.count} steps recorded for ${date}.`
          },
          requires_confirmation: true,
          confirmation_instructions: "To overwrite this data, the user must explicitly confirm they want to replace their existing steps. Only then should you call add_steps again with allow_overwrite=true.",
          user_prompt_required: `Ask the user: "You already have ${existingSteps.count} steps for ${date}. Do you want to replace this with ${validatedCount} steps? This will permanently delete your previous data."`
        };
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
            ? [operationUserId, date, validatedCount, challengeId]
            : [operationUserId, date, validatedCount];

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
        tokenUserId,
        'add_steps',
        { date, count: validatedCount, allow_overwrite, target_user_id: operationUserId },
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
          ? `⚠️ DATA OVERWRITTEN: Steps for ${date} have been replaced. Previous value: ${oldValue} steps → New value: ${validatedCount} steps. The user's original data has been permanently replaced.`
          : `✅ Steps saved for ${date}: ${validatedCount} steps`,
        date,
        count: validatedCount,
        was_overwrite: wasOverwrite,
        old_count: wasOverwrite ? parseInt(oldValue) : null,
        warning: wasOverwrite ? "OVERWRITE_OCCURRED" : null
      };

    } catch (error) {
      // Log failed action
      await mcpUtils.logAction(
        tokenInfo.id,
        tokenUserId,
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
    const sanitizedParams = securityUtils.sanitizeParams(params);
    const { start_date, end_date, target_user_id } = sanitizedParams;
    const tokenUserId = tokenInfo.user_id;

    try {
      // CRITICAL: Enforce user data isolation
      const operationUserId = target_user_id || tokenUserId;
      securityUtils.enforceUserAccess(tokenUserId, operationUserId);

      // Validate token scope for read operations
      securityUtils.validateTokenScope(tokenInfo, 'steps:read');

      // Validate date inputs
      if (start_date && !isValidDate(start_date)) {
        throw new Error('Invalid start_date format. Use YYYY-MM-DD');
      }
      if (end_date && !isValidDate(end_date)) {
        throw new Error('Invalid end_date format. Use YYYY-MM-DD');
      }

      // Use safe query builder to prevent SQL injection
      const query = queryBuilder.buildStepsQuery(!!start_date, !!end_date);
      const queryParams = queryBuilder.buildStepsParams(operationUserId, start_date, end_date);

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
        tokenUserId,
        'get_steps',
        { start_date, end_date, target_user_id: operationUserId },
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
        tokenUserId,
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
    const sanitizedParams = securityUtils.sanitizeParams(params);
    const { target_user_id } = sanitizedParams;
    const tokenUserId = tokenInfo.user_id;
    
    // CRITICAL: Enforce user data isolation - define outside try block for catch access
    const operationUserId = target_user_id || tokenUserId;

    try {
      securityUtils.enforceUserAccess(tokenUserId, operationUserId);

      // Validate token scope for profile read operations
      securityUtils.validateTokenScope(tokenInfo, 'profile:read');

      const getUserInfo = () => {
        return new Promise((resolve, reject) => {
          db.get('SELECT email, name, team FROM users WHERE id = ?', [operationUserId], (err, user) => {
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
      const challenge = await getActiveChallenge();

      // Log the action
      await mcpUtils.logAction(
        tokenInfo.id,
        tokenUserId,
        'get_user_profile',
        { target_user_id: operationUserId },
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
          team: user.team || null
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
        tokenUserId,
        'get_user_profile',
        { target_user_id: operationUserId },
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
const handleMCPRequest = async (body, ipAddress, userAgent, authHeader = null) => {
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

  // Handle standard MCP methods that don't require authentication
  if (body.method === 'initialize') {
    try {
      const result = await mcpMethods.initialize(body.params);
      return {
        jsonrpc: '2.0',
        result: result,
        id: body.id || null
      };
    } catch (error) {
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
  }

  if (body.method === 'tools/list') {
    try {
      const result = await mcpMethods.tools_list(body.params);
      return {
        jsonrpc: '2.0',
        result: result,
        id: body.id || null
      };
    } catch (error) {
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
  }

  // Handle tools/call - requires authentication via Bearer token in headers or token in arguments
  if (body.method === 'tools/call') {
    const toolName = body.params?.name;
    const toolArgs = body.params?.arguments || {};
    
    // Extract token from Bearer header or tool arguments
    let token = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7); // Remove 'Bearer ' prefix
    } else if (toolArgs.token) {
      token = toolArgs.token; // Backward compatibility
    }

    if (!token) {
      return {
        jsonrpc: '2.0',
        error: {
          code: -32602,
          message: 'Invalid params',
          data: 'Missing authentication token in Authorization header or tool arguments'
        },
        id: body.id || null
      };
    }

    // Validate token
    let tokenInfo;
    try {
      tokenInfo = await mcpUtils.validateToken(token);
      if (!tokenInfo) {
        return {
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Server error',
            data: 'Invalid or expired token'
          },
          id: body.id || null
        };
      }
    } catch (error) {
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

    // Check permissions for write operations
    if (['add_steps'].includes(toolName) && tokenInfo.permissions === 'read_only') {
      return {
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Server error',
          data: 'Insufficient permissions. This token is read-only.'
        },
        id: body.id || null
      };
    }

    try {
      // Clean tool arguments - remove token since it's now handled via headers
      const cleanArgs = { ...toolArgs };
      delete cleanArgs.token;
      
      const result = await mcpMethods.tools_call(toolName, cleanArgs, tokenInfo, ipAddress, userAgent);
      return {
        jsonrpc: '2.0',
        result: result,
        id: body.id || null
      };
    } catch (error) {
      console.error('MCP tool call error:', error);
      const errorResponse = securityUtils.createSafeErrorResponse(error, false);
      return {
        jsonrpc: '2.0',
        error: errorResponse,
        id: body.id || null
      };
    }
  }

  // Unknown method
  return {
    jsonrpc: '2.0',
    error: {
      code: -32601,
      message: 'Method not found',
      data: `Unknown method: ${body.method}`
    },
    id: body.id || null
  };
};

// MCP capabilities discovery - optimized for LLM understanding
const getMCPCapabilities = () => {
  return {
    capabilities: {
      tools: [
        {
          name: 'add_steps',
          description: 'Record daily step count for fitness tracking. Use this when user wants to log their steps for a specific date. CRITICAL SAFETY: Never automatically overwrite existing data. If data exists, show user the conflict and ask for explicit confirmation before using allow_overwrite=true.',
          parameters: {
            type: 'object',
            properties: {
              token: { 
                type: 'string', 
                description: 'User authentication token (provided during setup)' 
              },
              date: { 
                type: 'string', 
                pattern: '^\\d{4}-\\d{2}-\\d{2}$', 
                description: 'Target date for step count in YYYY-MM-DD format ONLY. Examples: "2025-07-30", "2025-12-25". NEVER use "today" - always convert to actual date like "2025-07-30".' 
              },
              count: { 
                type: 'number', 
                minimum: 0, 
                maximum: 70000, 
                description: 'Number of steps taken (0-70,000). Typical daily counts: sedentary 2000-5000, active 7500-10000, very active 10000+' 
              },
              allow_overwrite: { 
                type: 'boolean', 
                default: false, 
                description: 'DANGER: Only set to true after explicit user confirmation. NEVER set this automatically. User must explicitly agree to overwrite their existing data.' 
              }
            },
            required: ['token', 'date', 'count'],
            examples: [
              {
                description: 'Log 8500 steps for July 30th, 2025',
                params: { token: 'user_token', date: '2025-07-30', count: 8500 }
              },
              {
                description: 'Update steps for July 29th, 2025 to 12000 (with user confirmation)',
                params: { token: 'user_token', date: '2025-07-29', count: 12000, allow_overwrite: true }
              }
            ]
          }
        },
        {
          name: 'get_steps',
          description: 'Retrieve step history and progress data. Use this to show user their step counts, analyze trends, check goal progress, or generate reports.',
          parameters: {
            type: 'object',
            properties: {
              token: { 
                type: 'string', 
                description: 'User authentication token (provided during setup)' 
              },
              start_date: { 
                type: 'string', 
                pattern: '^\\d{4}-\\d{2}-\\d{2}$', 
                description: 'Optional: Start date for date range filter in YYYY-MM-DD format. Omit to get all history.' 
              },
              end_date: { 
                type: 'string', 
                pattern: '^\\d{4}-\\d{2}-\\d{2}$', 
                description: 'Optional: End date for date range filter in YYYY-MM-DD format. Omit to get all history.' 
              }
            },
            required: ['token'],
            examples: [
              {
                description: 'Get all step history',
                params: { token: 'user_token' }
              },
              {
                description: 'Get last 7 days of steps',
                params: { token: 'user_token', start_date: '2025-01-23', end_date: '2025-01-30' }
              }
            ]
          }
        },
        {
          name: 'get_user_profile',
          description: 'Get comprehensive user information including profile details, active challenges, team information, and account status. Use this first to understand user context.',
          parameters: {
            type: 'object',
            properties: {
              token: { 
                type: 'string', 
                description: 'User authentication token (provided during setup)' 
              }
            },
            required: ['token'],
            examples: [
              {
                description: 'Get user profile and challenge info',
                params: { token: 'user_token' }
              }
            ]
          }
        }
      ]
    },
    server_info: {
      name: 'Step Challenge Remote MCP Server',
      version: '2.0.0',
      description: 'Remote MCP server for corporate step tracking challenges. Supports individual step logging, progress tracking, team challenges, and goal monitoring with enterprise security.',
      usage_hints: {
        common_workflows: [
          'Start by calling get_user_profile to understand user context and active challenges',
          'Use add_steps to log daily step counts with date and count',
          'Use get_steps to retrieve history, analyze trends, or check goal progress',
          'CRITICAL: If add_steps returns requires_confirmation=true, ask user for explicit permission before overwriting',
          'NEVER automatically use allow_overwrite=true without user confirmation',
          'Provide meaningful summaries and progress analysis based on retrieved data'
        ],
        date_handling: [
          'Dates must ALWAYS be in YYYY-MM-DD format - NEVER use "today", "yesterday", etc.',
          'Convert relative dates to actual dates: "today" → "2025-07-30", "yesterday" → "2025-07-29"',
          'Examples of correct dates: "2025-07-30", "2025-12-25", "2025-01-15"',
          'Step counts typically range from 2000 (sedentary) to 15000+ (very active)',
          'Corporate challenges often have goals like 8000-10000 steps per day'
        ]
      }
    }
  };
};

module.exports = {
  mcpUtils,
  handleMCPRequest,
  getMCPCapabilities
};