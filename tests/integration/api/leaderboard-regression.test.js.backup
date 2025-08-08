/**
 * Leaderboard Functionality Regression Tests
 * Comprehensive tests for leaderboard calculation accuracy and edge cases
 * 
 * Test Coverage:
 * - Individual leaderboard ranking calculations (steps per day averages)
 * - Team leaderboard aggregation accuracy  
 * - Ranked vs unranked user separation (reporting threshold logic)
 * - Team member disclosure functionality
 * - Multi-challenge leaderboard handling
 * - Empty leaderboard states (new challenges, no participants)
 * - Tie-breaking scenarios in rankings
 * - Large dataset performance (many users/teams)
 * - Cross-challenge data isolation
 * - Team assignment changes and leaderboard impact
 */

const { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } = require('@jest/globals');
const request = require('supertest');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { 
  createTestDatabase, 
  cleanupTestDatabase, 
  createTestUser,
  createTestAdmin,
  createTestSteps,
  createTestChallenge,
  createTestTeam,
  wait,
  generateRandomEmail,
  generateRandomSteps,
  expectValidApiResponse,
  expectValidErrorResponse
} = require('../../environments/shared/test-helpers');

describe('Leaderboard Functionality Regression Tests', () => {
  let app;
  let testDbPath;
  let db;
  let agent;

  beforeAll(async () => {
    // Don't suppress console output to see errors
    // suppressConsole();
    
    // Set up test environment
    process.env.NODE_ENV = 'test';
    process.env.DISABLE_RATE_LIMITING = 'true';
    process.env.SESSION_SECRET = 'test-session-secret';
    process.env.CSRF_SECRET = 'test-csrf-secret';
  });

  afterAll(async () => {
    restoreConsole();
    
    // Close the app properly at the end of all tests
    if (app && app.close) {
      await new Promise(resolve => {
        setTimeout(() => {
          app.close(resolve);
        }, 100);
      });
    }
  });

  beforeEach(async () => {
    // Ensure clean state by waiting a moment before starting
    await wait(100);
    
    // Create fresh test database for each test
    testDbPath = await createTestDatabase();
    process.env.DB_PATH = testDbPath;
    
    // Set test environment to prevent admin user creation in database.js
    process.env.TEST_DB_INIT = 'true';
    
    // Clear require cache to get fresh app instance
    delete require.cache[require.resolve('../../../src/server.js')];
    delete require.cache[require.resolve('../../../src/database.js')];
    
    // Import app after setting environment
    app = require('../../../src/server.js');
    
    // Reinitialize database connection for the new test database
    if (app.reinitializeDatabase) {
      app.reinitializeDatabase();
    }
    
    // Wait for app to initialize completely
    await wait(300);

    // Create direct database connection for data setup
    db = new sqlite3.Database(testDbPath);

    // Create agent for HTTP requests
    agent = request.agent(app);
  });

  afterEach(async () => {
    // Close test database connection first
    if (db) {
      await new Promise((resolve) => {
        db.close((err) => {
          if (err) console.log('Error closing test db:', err);
          resolve();
        });
      });
      db = null;
    }
    
    // Don't close Express server between tests to avoid database race conditions
    // if (app && app.close) {
    //   await new Promise(resolve => app.close(resolve));
    // }
    app = null;
    
    // Wait longer for all connections to close and cleanup to complete
    await wait(300);
    
    // Clean up test database file
    cleanupTestDatabase(testDbPath);
    
    // Clear environment variables
    delete process.env.DB_PATH;
    delete process.env.TEST_DB_INIT;
    
    // Force garbage collection of require cache
    Object.keys(require.cache).forEach(key => {
      if (key.includes('step-app-expt')) {
        delete require.cache[key];
      }
    });
  });

  // Helper function to create authenticated session
  async function createAuthenticatedSession(email = null) {
    const testEmail = email || generateRandomEmail();
    const sessionAgent = request.agent(app);
    
    // Use development endpoint to get magic link
    const magicResponse = await sessionAgent
      .post('/dev/get-magic-link')
      .send({ email: testEmail })
      .expect(200);
    
    expect(magicResponse.body).toHaveProperty('magicLink');
    
    // Extract token from magic link URL
    const magicUrl = new URL(magicResponse.body.magicLink);
    const token = magicUrl.searchParams.get('token');
    
    // Use the token to authenticate
    await sessionAgent
      .get(`/auth/login?token=${token}`)
      .expect(302);
    
    // Get CSRF token
    const csrfResponse = await sessionAgent
      .get('/api/csrf-token')
      .expect(200);
    
    const csrfToken = csrfResponse.body.csrfToken;
    
    return { agent: sessionAgent, csrfToken, email: testEmail };
  }

  // Helper function to create user with team in database
  async function createUserInDatabase(userData) {
    return new Promise((resolve, reject) => {
      const { email, name, team, is_admin = 0 } = userData;
      db.run(
        `INSERT INTO users (email, name, team, is_admin) VALUES (?, ?, ?, ?)`,
        [email, name, team, is_admin ? 1 : 0],
        function(err) {
          if (err) return reject(err);
          resolve(this.lastID);
        }
      );
    });
  }

  // Helper function to create challenge in database
  async function createChallengeInDatabase(challengeData) {
    return new Promise((resolve, reject) => {
      const { name, start_date, end_date, is_active = 1, reporting_threshold = 70 } = challengeData;
      db.run(
        `INSERT INTO challenges (name, start_date, end_date, is_active, reporting_threshold) VALUES (?, ?, ?, ?, ?)`,
        [name, start_date, end_date, is_active ? 1 : 0, reporting_threshold],
        function(err) {
          if (err) return reject(err);
          resolve(this.lastID);
        }
      );
    });
  }

  // Helper function to create steps in database
  async function createStepsInDatabase(stepsData) {
    return new Promise((resolve, reject) => {
      const { user_id, date, count, challenge_id } = stepsData;
      db.run(
        `INSERT OR REPLACE INTO steps (user_id, date, count, challenge_id) VALUES (?, ?, ?, ?)`,
        [user_id, date, count, challenge_id],
        function(err) {
          if (err) return reject(err);
          resolve(this.lastID);
        }
      );
    });
  }

  // Helper function to get user ID by email
  async function getUserIdByEmail(email) {
    return new Promise((resolve, reject) => {
      db.get(`SELECT id FROM users WHERE email = ?`, [email], (err, row) => {
        if (err) return reject(err);
        resolve(row ? row.id : null);
      });
    });
  }

  describe('Individual Leaderboard Calculation Accuracy', () => {
    test('should calculate correct steps per day averages for individual users', async () => {
      // Create test users first
      const user1Id = await createUserInDatabase({
        email: 'user1@test.com',
        name: 'User One',
        team: 'Team Alpha'
      });

      const user2Id = await createUserInDatabase({
        email: 'user2@test.com',
        name: 'User Two',
        team: 'Team Beta'
      });

      // Create a multi-day challenge to test reporting rates properly
      const today = '2025-08-06'; // Current test date
      const yesterday = '2025-08-05';
      const challengeId = await createChallengeInDatabase({
        name: 'Multi-Day Test Challenge',
        start_date: yesterday,
        end_date: '2025-08-31',
        is_active: 1,
        reporting_threshold: 70
      });

      // Add steps for User 1: good reporter (logged both days = 100% rate)
      await createStepsInDatabase({ user_id: user1Id, date: yesterday, count: 10000, challenge_id: challengeId });
      await createStepsInDatabase({ user_id: user1Id, date: today, count: 12000, challenge_id: challengeId });
      // User 1: 2/2 days = 100% reporting rate, should be ranked

      // Add steps for User 2: poor reporter (logged only 1 day = 50% rate < 70%)
      await createStepsInDatabase({ user_id: user2Id, date: yesterday, count: 8000, challenge_id: challengeId });
      // User 2: 1/2 days = 50% reporting rate, should be unranked

      // Create authenticated session
      const { agent, csrfToken } = await createAuthenticatedSession('user1@test.com');

      // Get individual leaderboard
      const response = await agent
        .get('/api/leaderboard')
        .expect(200);

      expect(response.body).toHaveProperty('type', 'challenge');
      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveProperty('ranked');
      expect(response.body.data).toHaveProperty('unranked');

      // User 1 should be ranked (100% >= 70% threshold)
      const rankedUsers = response.body.data.ranked;
      expect(rankedUsers.length).toBe(1);
      expect(rankedUsers[0]).toHaveProperty('name', 'User One');
      expect(Math.round(rankedUsers[0].steps_per_day_reported)).toBe(11000); // (10000+12000)/2 = 11000
      expect(rankedUsers[0].days_logged).toBe(2);
      expect(rankedUsers[0].personal_reporting_rate).toBe(100);

      // User 2 should be unranked (50% < 70% threshold)
      const unrankedUsers = response.body.data.unranked;
      expect(unrankedUsers.length).toBe(1);
      expect(unrankedUsers[0]).toHaveProperty('name', 'User Two');
      expect(unrankedUsers[0].days_logged).toBe(1);
      expect(unrankedUsers[0].personal_reporting_rate).toBe(50);
    });

    test('should handle edge case of zero steps correctly', async () => {
      const challengeId = await createChallengeInDatabase({
        name: 'Zero Steps Challenge',
        start_date: '2025-08-01',
        end_date: '2025-08-31',
        is_active: 1,
        reporting_threshold: 0 // 0% threshold to include all users
      });

      const userId = await createUserInDatabase({
        email: 'zero@test.com',
        name: 'Zero Steps User',
        team: 'Team Zero'
      });

      // Add zero step entry
      await createStepsInDatabase({ user_id: userId, date: '2025-08-01', count: 0, challenge_id: challengeId });

      const { agent } = await createAuthenticatedSession('zero@test.com');

      const response = await agent
        .get('/api/leaderboard')
        .expect(200);

      // User should appear in ranked (0% threshold)
      const rankedUsers = response.body.data.ranked;
      expect(rankedUsers.length).toBe(1);
      expect(rankedUsers[0].name).toBe('Zero Steps User');
      expect(rankedUsers[0].steps_per_day_reported).toBe(0);
      expect(rankedUsers[0].days_logged).toBe(1);
    });

    test('should correctly sort users by steps per day average', async () => {
      const challengeId = await createChallengeInDatabase({
        name: 'Sorting Test',
        start_date: '2025-08-01',
        end_date: '2025-08-31',
        is_active: 1,
        reporting_threshold: 50
      });

      // Create multiple users with known averages
      const users = [
        { email: 'high@test.com', name: 'High Performer', team: 'Team A', avg: 15000 },
        { email: 'medium@test.com', name: 'Medium Performer', team: 'Team B', avg: 10000 },
        { email: 'low@test.com', name: 'Low Performer', team: 'Team C', avg: 5000 }
      ];

      for (const user of users) {
        const userId = await createUserInDatabase(user);
        // Give each user 3 days of consistent data
        await createStepsInDatabase({ user_id: userId, date: '2025-08-01', count: user.avg, challenge_id: challengeId });
        await createStepsInDatabase({ user_id: userId, date: '2025-08-02', count: user.avg, challenge_id: challengeId });
        await createStepsInDatabase({ user_id: userId, date: '2025-08-03', count: user.avg, challenge_id: challengeId });
      }

      const { agent } = await createAuthenticatedSession('high@test.com');

      const response = await agent
        .get('/api/leaderboard')
        .expect(200);

      const rankedUsers = response.body.data.ranked;
      expect(rankedUsers.length).toBe(3);

      // Should be sorted by steps per day DESC
      expect(rankedUsers[0].name).toBe('High Performer');
      expect(Math.round(rankedUsers[0].steps_per_day_reported)).toBe(15000);
      
      expect(rankedUsers[1].name).toBe('Medium Performer');
      expect(Math.round(rankedUsers[1].steps_per_day_reported)).toBe(10000);
      
      expect(rankedUsers[2].name).toBe('Low Performer');
      expect(Math.round(rankedUsers[2].steps_per_day_reported)).toBe(5000);
    });
  });

  describe('Team Leaderboard Aggregation Accuracy', () => {
    test('should correctly aggregate team steps and calculate averages', async () => {
      const challengeId = await createChallengeInDatabase({
        name: 'Team Challenge',
        start_date: '2025-08-01',
        end_date: '2025-08-31',
        is_active: 1,
        reporting_threshold: 70
      });

      // Create Team Alpha with 2 members
      const user1Id = await createUserInDatabase({
        email: 'alpha1@test.com',
        name: 'Alpha Member 1',
        team: 'Team Alpha'
      });
      const user2Id = await createUserInDatabase({
        email: 'alpha2@test.com',
        name: 'Alpha Member 2',
        team: 'Team Alpha'
      });

      // Create Team Beta with 1 member
      const user3Id = await createUserInDatabase({
        email: 'beta1@test.com',
        name: 'Beta Member 1',
        team: 'Team Beta'
      });

      // Add steps for Team Alpha members
      // Alpha Member 1: 3 days, 10000 avg
      await createStepsInDatabase({ user_id: user1Id, date: '2025-08-01', count: 10000, challenge_id: challengeId });
      await createStepsInDatabase({ user_id: user1Id, date: '2025-08-02', count: 10000, challenge_id: challengeId });
      await createStepsInDatabase({ user_id: user1Id, date: '2025-08-03', count: 10000, challenge_id: challengeId });

      // Alpha Member 2: 2 days, 8000 avg
      await createStepsInDatabase({ user_id: user2Id, date: '2025-08-01', count: 8000, challenge_id: challengeId });
      await createStepsInDatabase({ user_id: user2Id, date: '2025-08-02', count: 8000, challenge_id: challengeId });

      // Beta Member 1: 3 days, 12000 avg
      await createStepsInDatabase({ user_id: user3Id, date: '2025-08-01', count: 12000, challenge_id: challengeId });
      await createStepsInDatabase({ user_id: user3Id, date: '2025-08-02', count: 12000, challenge_id: challengeId });
      await createStepsInDatabase({ user_id: user3Id, date: '2025-08-03', count: 12000, challenge_id: challengeId });

      const { agent } = await createAuthenticatedSession('alpha1@test.com');

      const response = await agent
        .get('/api/team-leaderboard')
        .expect(200);

      expect(response.body).toHaveProperty('type', 'challenge');
      expect(response.body.data).toHaveProperty('ranked');

      const rankedTeams = response.body.data.ranked;
      
      // Both teams should be ranked (reporting rates > 70%)
      expect(rankedTeams.length).toBe(2);

      // Team Beta should be first (higher average per day reported)
      const betaTeam = rankedTeams.find(team => team.team === 'Team Beta');
      expect(betaTeam).toBeDefined();
      expect(betaTeam.member_count).toBe(1);
      expect(Math.round(betaTeam.team_steps_per_day_reported)).toBe(12000);
      expect(betaTeam.team_entries).toBe(3);

      // Team Alpha should be second
      const alphaTeam = rankedTeams.find(team => team.team === 'Team Alpha');
      expect(alphaTeam).toBeDefined();
      expect(alphaTeam.member_count).toBe(2);
      // Alpha team average: (10000*3 + 8000*2) / 5 entries = 46000 / 5 = 9200
      expect(Math.round(alphaTeam.team_steps_per_day_reported)).toBe(9200);
      expect(alphaTeam.team_entries).toBe(5);
    });

    test('should calculate team reporting rates correctly', async () => {
      const challengeId = await createChallengeInDatabase({
        name: 'Team Reporting Challenge',
        start_date: '2025-08-01',
        end_date: '2025-08-03', // 3-day challenge
        is_active: 1,
        reporting_threshold: 75
      });

      // Create team with mixed reporting patterns
      const user1Id = await createUserInDatabase({
        email: 'report1@test.com',
        name: 'Good Reporter',
        team: 'Mixed Team'
      });
      const user2Id = await createUserInDatabase({
        email: 'report2@test.com',
        name: 'Poor Reporter',
        team: 'Mixed Team'
      });

      // Good Reporter: 3/3 days (100%)
      await createStepsInDatabase({ user_id: user1Id, date: '2025-08-01', count: 8000, challenge_id: challengeId });
      await createStepsInDatabase({ user_id: user1Id, date: '2025-08-02', count: 8000, challenge_id: challengeId });
      await createStepsInDatabase({ user_id: user1Id, date: '2025-08-03', count: 8000, challenge_id: challengeId });

      // Poor Reporter: 1/3 days (33.33%)
      await createStepsInDatabase({ user_id: user2Id, date: '2025-08-01', count: 6000, challenge_id: challengeId });

      const { agent } = await createAuthenticatedSession('report1@test.com');

      const response = await agent
        .get('/api/team-leaderboard')
        .expect(200);

      const allTeams = [...response.body.data.ranked, ...response.body.data.unranked];
      const mixedTeam = allTeams.find(team => team.team === 'Mixed Team');
      
      expect(mixedTeam).toBeDefined();
      expect(mixedTeam.member_count).toBe(2);
      expect(mixedTeam.team_entries).toBe(4); // 3 + 1 entries
      
      // Team reporting rate: 4 entries / (2 members * 3 days) * 100 = 66.67%
      expect(Math.round(mixedTeam.team_reporting_rate * 100) / 100).toBe(66.67);
      
      // Should be unranked (66.67% < 75% threshold)
      expect(response.body.data.unranked).toContain(mixedTeam);
    });
  });

  describe('Ranked vs Unranked User Separation', () => {
    test('should correctly separate users based on reporting threshold', async () => {
      const challengeId = await createChallengeInDatabase({
        name: 'Threshold Test',
        start_date: '2025-08-01',
        end_date: '2025-08-05', // 5-day challenge
        is_active: 1,
        reporting_threshold: 60 // 60% threshold (3/5 days minimum)
      });

      // User scenarios
      const users = [
        { email: 'perfect@test.com', name: 'Perfect Reporter', days: 5 }, // 100% - ranked
        { email: 'good@test.com', name: 'Good Reporter', days: 4 },     // 80% - ranked
        { email: 'meet@test.com', name: 'Meets Threshold', days: 3 },   // 60% - ranked
        { email: 'below@test.com', name: 'Below Threshold', days: 2 },  // 40% - unranked
        { email: 'poor@test.com', name: 'Poor Reporter', days: 1 }      // 20% - unranked
      ];

      for (const user of users) {
        const userId = await createUserInDatabase({
          email: user.email,
          name: user.name,
          team: 'Test Team'
        });

        // Add steps for the specified number of days
        for (let day = 1; day <= user.days; day++) {
          await createStepsInDatabase({
            user_id: userId,
            date: `2025-08-0${day}`,
            count: 8000,
            challenge_id: challengeId
          });
        }
      }

      const { agent } = await createAuthenticatedSession('perfect@test.com');

      const response = await agent
        .get('/api/leaderboard')
        .expect(200);

      // Should have 3 ranked users (>= 60%)
      expect(response.body.data.ranked.length).toBe(3);
      const rankedNames = response.body.data.ranked.map(u => u.name);
      expect(rankedNames).toContain('Perfect Reporter');
      expect(rankedNames).toContain('Good Reporter');
      expect(rankedNames).toContain('Meets Threshold');

      // Should have 2 unranked users (< 60%)
      expect(response.body.data.unranked.length).toBe(2);
      const unrankedNames = response.body.data.unranked.map(u => u.name);
      expect(unrankedNames).toContain('Below Threshold');
      expect(unrankedNames).toContain('Poor Reporter');
    });

    test('should handle 0% threshold (all users ranked)', async () => {
      const challengeId = await createChallengeInDatabase({
        name: 'Zero Threshold Test',
        start_date: '2025-08-01',
        end_date: '2025-08-03',
        is_active: 1,
        reporting_threshold: 0 // 0% threshold - everyone ranked
      });

      const userId = await createUserInDatabase({
        email: 'any@test.com',
        name: 'Any User',
        team: 'Test Team'
      });

      // Add just one day of steps
      await createStepsInDatabase({
        user_id: userId,
        date: '2025-08-01',
        count: 5000,
        challenge_id: challengeId
      });

      const { agent } = await createAuthenticatedSession('any@test.com');

      const response = await agent
        .get('/api/leaderboard')
        .expect(200);

      // All users should be ranked with 0% threshold
      expect(response.body.data.ranked.length).toBe(1);
      expect(response.body.data.unranked.length).toBe(0);
      expect(response.body.data.ranked[0].name).toBe('Any User');
    });

    test('should handle 100% threshold (only perfect reporters ranked)', async () => {
      const challengeId = await createChallengeInDatabase({
        name: 'Perfect Threshold Test',
        start_date: '2025-08-01',
        end_date: '2025-08-03',
        is_active: 1,
        reporting_threshold: 100 // 100% threshold - only perfect reporters ranked
      });

      const perfectUserId = await createUserInDatabase({
        email: 'perfect@test.com',
        name: 'Perfect User',
        team: 'Team Perfect'
      });

      const almostUserId = await createUserInDatabase({
        email: 'almost@test.com',
        name: 'Almost Perfect',
        team: 'Team Almost'
      });

      // Perfect user: 3/3 days
      for (let day = 1; day <= 3; day++) {
        await createStepsInDatabase({
          user_id: perfectUserId,
          date: `2025-08-0${day}`,
          count: 8000,
          challenge_id: challengeId
        });
      }

      // Almost perfect user: 2/3 days (66.67%)
      await createStepsInDatabase({ user_id: almostUserId, date: '2025-08-01', count: 8000, challenge_id: challengeId });
      await createStepsInDatabase({ user_id: almostUserId, date: '2025-08-02', count: 8000, challenge_id: challengeId });

      const { agent } = await createAuthenticatedSession('perfect@test.com');

      const response = await agent
        .get('/api/leaderboard')
        .expect(200);

      // Only perfect reporter should be ranked
      expect(response.body.data.ranked.length).toBe(1);
      expect(response.body.data.ranked[0].name).toBe('Perfect User');
      
      // Almost perfect should be unranked
      expect(response.body.data.unranked.length).toBe(1);
      expect(response.body.data.unranked[0].name).toBe('Almost Perfect');
    });
  });

  describe('Multi-Challenge Data Isolation', () => {
    test('should only show data from active challenge', async () => {
      // Create first challenge (inactive)
      const challenge1Id = await createChallengeInDatabase({
        name: 'Old Challenge',
        start_date: '2025-07-01',
        end_date: '2025-07-31',
        is_active: 0
      });

      // Create second challenge (active)
      const challenge2Id = await createChallengeInDatabase({
        name: 'Current Challenge',
        start_date: '2025-08-01',
        end_date: '2025-08-31',
        is_active: 1,
        reporting_threshold: 50
      });

      const userId = await createUserInDatabase({
        email: 'multi@test.com',
        name: 'Multi Challenge User',
        team: 'Test Team'
      });

      // Add steps to old challenge
      await createStepsInDatabase({
        user_id: userId,
        date: '2025-07-15',
        count: 15000,
        challenge_id: challenge1Id
      });

      // Add different steps to current challenge
      await createStepsInDatabase({
        user_id: userId,
        date: '2025-08-01',
        count: 8000,
        challenge_id: challenge2Id
      });

      const { agent } = await createAuthenticatedSession('multi@test.com');

      const response = await agent
        .get('/api/leaderboard')
        .expect(200);

      // Should only see current challenge data
      expect(response.body.type).toBe('challenge');
      const rankedUsers = response.body.data.ranked;
      expect(rankedUsers.length).toBe(1);
      expect(rankedUsers[0].name).toBe('Multi Challenge User');
      
      // Should show current challenge steps (8000), not old challenge (15000)
      expect(Math.round(rankedUsers[0].steps_per_day_reported)).toBe(8000);
      expect(rankedUsers[0].days_logged).toBe(1);
    });

    test('should handle cross-challenge team membership changes', async () => {
      const challenge1Id = await createChallengeInDatabase({
        name: 'Team Change Challenge 1',
        start_date: '2025-08-01',
        end_date: '2025-08-31',
        is_active: 1,
        reporting_threshold: 50
      });

      // Create user initially on Team Alpha
      const userId = await createUserInDatabase({
        email: 'switcher@test.com',
        name: 'Team Switcher',
        team: 'Team Alpha'
      });

      // Add steps while on Team Alpha
      await createStepsInDatabase({
        user_id: userId,
        date: '2025-08-01',
        count: 10000,
        challenge_id: challenge1Id
      });

      // Switch user to Team Beta (simulate team change)
      await new Promise((resolve, reject) => {
        db.run(`UPDATE users SET team = ? WHERE id = ?`, ['Team Beta', userId], (err) => {
          if (err) return reject(err);
          resolve();
        });
      });

      const { agent } = await createAuthenticatedSession('switcher@test.com');

      // Check individual leaderboard - should show current team
      const individualResponse = await agent
        .get('/api/leaderboard')
        .expect(200);

      const user = individualResponse.body.data.ranked[0];
      expect(user.name).toBe('Team Switcher');
      expect(user.team).toBe('Team Beta'); // Should show current team

      // Check team leaderboard - steps should count for current team
      const teamResponse = await agent
        .get('/api/team-leaderboard')
        .expect(200);

      const teams = [...teamResponse.body.data.ranked, ...teamResponse.body.data.unranked];
      const betaTeam = teams.find(t => t.team === 'Team Beta');
      const alphaTeam = teams.find(t => t.team === 'Team Alpha');

      expect(betaTeam).toBeDefined();
      expect(betaTeam.member_count).toBe(1);
      expect(betaTeam.total_steps).toBe(10000);

      // Team Alpha should not exist or have no steps
      expect(alphaTeam).toBeUndefined();
    });
  });

  describe('Empty Leaderboard States', () => {
    test('should handle new challenge with no participants', async () => {
      const challengeId = await createChallengeInDatabase({
        name: 'Empty Challenge',
        start_date: '2025-08-01',
        end_date: '2025-08-31',
        is_active: 1,
        reporting_threshold: 70
      });

      // Create user but don't add any steps
      const userId = await createUserInDatabase({
        email: 'nodata@test.com',
        name: 'No Data User',
        team: 'Empty Team'
      });

      const { agent } = await createAuthenticatedSession('nodata@test.com');

      const response = await agent
        .get('/api/leaderboard')
        .expect(200);

      // Should return empty leaderboard structure
      expect(response.body.type).toBe('challenge');
      expect(response.body.challenge_active).toBe(true);
      expect(response.body.data.ranked).toEqual([]);
      expect(response.body.data.unranked).toEqual([]);
    });

    test('should handle challenge with participants but no qualifying users', async () => {
      const challengeId = await createChallengeInDatabase({
        name: 'No Qualify Challenge',
        start_date: '2025-08-01',
        end_date: '2025-08-10', // 10-day challenge
        is_active: 1,
        reporting_threshold: 90 // Very high threshold
      });

      const userId = await createUserInDatabase({
        email: 'lowreport@test.com',
        name: 'Low Reporter',
        team: 'Low Team'
      });

      // Add minimal steps (1/10 days = 10% < 90% threshold)
      await createStepsInDatabase({
        user_id: userId,
        date: '2025-08-01',
        count: 5000,
        challenge_id: challengeId
      });

      const { agent } = await createAuthenticatedSession('lowreport@test.com');

      const response = await agent
        .get('/api/leaderboard')
        .expect(200);

      // Should have empty ranked, but user in unranked
      expect(response.body.data.ranked).toEqual([]);
      expect(response.body.data.unranked.length).toBe(1);
      expect(response.body.data.unranked[0].name).toBe('Low Reporter');
    });

    test('should handle all-time leaderboard with no data', async () => {
      // Ensure no active challenge
      await new Promise((resolve, reject) => {
        db.run(`UPDATE challenges SET is_active = 0`, (err) => {
          if (err) return reject(err);
          resolve();
        });
      });

      // Create user with no steps
      const userId = await createUserInDatabase({
        email: 'nosteps@test.com',
        name: 'No Steps User',
        team: 'No Steps Team'
      });

      const { agent } = await createAuthenticatedSession('nosteps@test.com');

      const response = await agent
        .get('/api/leaderboard')
        .expect(200);

      // Should return all-time leaderboard with empty data
      expect(response.body.type).toBe('all_time');
      expect(response.body.challenge_active).toBe(false);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data).toEqual([]);
    });
  });

  describe('Tie-Breaking Scenarios', () => {
    test('should handle ties in steps per day with name-based tie breaking', async () => {
      const challengeId = await createChallengeInDatabase({
        name: 'Tie Breaker Challenge',
        start_date: '2025-08-01',
        end_date: '2025-08-31',
        is_active: 1,
        reporting_threshold: 50
      });

      // Create users with identical averages but different names
      const users = [
        { email: 'zebra@test.com', name: 'Zebra User', team: 'Team Z' },
        { email: 'alpha@test.com', name: 'Alpha User', team: 'Team A' },
        { email: 'beta@test.com', name: 'Beta User', team: 'Team B' }
      ];

      for (const user of users) {
        const userId = await createUserInDatabase(user);
        // Give all users identical step patterns
        await createStepsInDatabase({ user_id: userId, date: '2025-08-01', count: 8000, challenge_id: challengeId });
        await createStepsInDatabase({ user_id: userId, date: '2025-08-02', count: 8000, challenge_id: challengeId });
      }

      const { agent } = await createAuthenticatedSession('alpha@test.com');

      const response = await agent
        .get('/api/leaderboard')
        .expect(200);

      const rankedUsers = response.body.data.ranked;
      expect(rankedUsers.length).toBe(3);

      // All should have same steps per day
      rankedUsers.forEach(user => {
        expect(Math.round(user.steps_per_day_reported)).toBe(8000);
      });

      // Should be sorted alphabetically by name for tie-breaking
      expect(rankedUsers[0].name).toBe('Alpha User');
      expect(rankedUsers[1].name).toBe('Beta User');
      expect(rankedUsers[2].name).toBe('Zebra User');
    });

    test('should handle team ties with team name tie-breaking', async () => {
      const challengeId = await createChallengeInDatabase({
        name: 'Team Tie Challenge',
        start_date: '2025-08-01',
        end_date: '2025-08-31',
        is_active: 1,
        reporting_threshold: 50
      });

      // Create identical teams with same performance
      const teamConfigs = [
        { team: 'Team Zebra', email: 'z@test.com', name: 'Z User' },
        { team: 'Team Alpha', email: 'a@test.com', name: 'A User' }
      ];

      for (const config of teamConfigs) {
        const userId = await createUserInDatabase(config);
        // Identical step patterns
        await createStepsInDatabase({ user_id: userId, date: '2025-08-01', count: 10000, challenge_id: challengeId });
        await createStepsInDatabase({ user_id: userId, date: '2025-08-02', count: 10000, challenge_id: challengeId });
      }

      const { agent } = await createAuthenticatedSession('a@test.com');

      const response = await agent
        .get('/api/team-leaderboard')
        .expect(200);

      const rankedTeams = response.body.data.ranked;
      expect(rankedTeams.length).toBe(2);

      // Both teams should have identical performance
      rankedTeams.forEach(team => {
        expect(Math.round(team.team_steps_per_day_reported)).toBe(10000);
      });

      // Should be sorted alphabetically by team name for tie-breaking
      expect(rankedTeams[0].team).toBe('Team Alpha');
      expect(rankedTeams[1].team).toBe('Team Zebra');
    });
  });

  describe('Large Dataset Performance', () => {
    test('should handle many users efficiently', async () => {
      const challengeId = await createChallengeInDatabase({
        name: 'Large Dataset Challenge',
        start_date: '2025-08-01',
        end_date: '2025-08-31',
        is_active: 1,
        reporting_threshold: 70
      });

      const startTime = Date.now();

      // Create 50 users with varying performance
      const userPromises = [];
      for (let i = 1; i <= 50; i++) {
        const userId = await createUserInDatabase({
          email: `user${i}@test.com`,
          name: `User ${i}`,
          team: `Team ${Math.ceil(i / 5)}` // 10 teams of 5 members each
        });

        // Add varying amounts of step data
        const daysToAdd = Math.min(i, 10); // Some users have more data than others
        for (let day = 1; day <= daysToAdd; day++) {
          const stepCount = Math.floor(Math.random() * 15000) + 5000; // 5000-20000 steps
          await createStepsInDatabase({
            user_id: userId,
            date: `2025-08-${String(day).padStart(2, '0')}`,
            count: stepCount,
            challenge_id: challengeId
          });
        }
      }

      const { agent } = await createAuthenticatedSession('user1@test.com');

      // Test individual leaderboard performance
      const individualStart = Date.now();
      const individualResponse = await agent
        .get('/api/leaderboard')
        .expect(200);
      const individualTime = Date.now() - individualStart;

      // Test team leaderboard performance
      const teamStart = Date.now();
      const teamResponse = await agent
        .get('/api/team-leaderboard')
        .expect(200);
      const teamTime = Date.now() - teamStart;

      const totalTime = Date.now() - startTime;

      // Performance assertions
      expect(individualTime).toBeLessThan(5000); // Should complete in under 5 seconds
      expect(teamTime).toBeLessThan(5000);

      // Verify data integrity
      const totalUsers = individualResponse.body.data.ranked.length + individualResponse.body.data.unranked.length;
      expect(totalUsers).toBe(50);

      const totalTeams = teamResponse.body.data.ranked.length + teamResponse.body.data.unranked.length;
      expect(totalTeams).toBe(10);

      console.log(`Large dataset test completed in ${totalTime}ms (Individual: ${individualTime}ms, Team: ${teamTime}ms)`);
    });
  });

  describe('Edge Cases and Boundary Conditions', () => {
    test('should handle users with no team assignment', async () => {
      const challengeId = await createChallengeInDatabase({
        name: 'No Team Challenge',
        start_date: '2025-08-01',
        end_date: '2025-08-31',
        is_active: 1,
        reporting_threshold: 50
      });

      // Create user with null team
      const userId = await createUserInDatabase({
        email: 'noteam@test.com',
        name: 'No Team User',
        team: null
      });

      await createStepsInDatabase({
        user_id: userId,
        date: '2025-08-01',
        count: 8000,
        challenge_id: challengeId
      });

      const { agent } = await createAuthenticatedSession('noteam@test.com');

      // Individual leaderboard should work
      const individualResponse = await agent
        .get('/api/leaderboard')
        .expect(200);

      expect(individualResponse.body.data.ranked.length).toBe(1);
      expect(individualResponse.body.data.ranked[0].name).toBe('No Team User');

      // Team leaderboard should not include user without team
      const teamResponse = await agent
        .get('/api/team-leaderboard')
        .expect(200);

      const allTeams = [...teamResponse.body.data.ranked, ...teamResponse.body.data.unranked];
      expect(allTeams.length).toBe(0);
    });

    test('should handle floating point precision in averages', async () => {
      const challengeId = await createChallengeInDatabase({
        name: 'Precision Challenge',
        start_date: '2025-08-01',
        end_date: '2025-08-31',
        is_active: 1,
        reporting_threshold: 50
      });

      const userId = await createUserInDatabase({
        email: 'precision@test.com',
        name: 'Precision User',
        team: 'Precision Team'
      });

      // Add steps that create non-integer averages
      await createStepsInDatabase({ user_id: userId, date: '2025-08-01', count: 10001, challenge_id: challengeId });
      await createStepsInDatabase({ user_id: userId, date: '2025-08-02', count: 10002, challenge_id: challengeId });
      await createStepsInDatabase({ user_id: userId, date: '2025-08-03', count: 10003, challenge_id: challengeId });
      // Average: 10002 steps/day

      const { agent } = await createAuthenticatedSession('precision@test.com');

      const response = await agent
        .get('/api/leaderboard')
        .expect(200);

      const user = response.body.data.ranked[0];
      expect(user.name).toBe('Precision User');
      
      // Check that average is calculated correctly
      const expectedAverage = (10001 + 10002 + 10003) / 3;
      expect(Math.abs(user.steps_per_day_reported - expectedAverage)).toBeLessThan(0.01);
    });

    test('should handle maximum integer values', async () => {
      const challengeId = await createChallengeInDatabase({
        name: 'Max Value Challenge',
        start_date: '2025-08-01',
        end_date: '2025-08-31',
        is_active: 1,
        reporting_threshold: 50
      });

      const userId = await createUserInDatabase({
        email: 'maxval@test.com',
        name: 'Max Value User',
        team: 'Max Team'
      });

      // Add maximum allowed step count
      await createStepsInDatabase({
        user_id: userId,
        date: '2025-08-01',
        count: 70000, // Maximum allowed by validation
        challenge_id: challengeId
      });

      const { agent } = await createAuthenticatedSession('maxval@test.com');

      const response = await agent
        .get('/api/leaderboard')
        .expect(200);

      const user = response.body.data.ranked[0];
      expect(user.name).toBe('Max Value User');
      expect(user.steps_per_day_reported).toBe(70000);
      expect(user.total_steps).toBe(70000);
    });
  });

  describe('Authentication and Security', () => {
    test('should require authentication for leaderboard access', async () => {
      const response = await agent
        .get('/api/leaderboard')
        .expect(401);

      expect(response.body).toHaveProperty('error');
      expectValidErrorResponse(response.body, 'Authentication required');
    });

    test('should require authentication for team leaderboard access', async () => {
      const response = await agent
        .get('/api/team-leaderboard')
        .expect(401);

      expect(response.body).toHaveProperty('error');
      expectValidErrorResponse(response.body, 'Authentication required');
    });

    test('should only show data for authenticated user context', async () => {
      const challengeId = await createChallengeInDatabase({
        name: 'Security Challenge',
        start_date: '2025-08-01',
        end_date: '2025-08-31',
        is_active: 1,
        reporting_threshold: 50
      });

      // Create user who should appear in leaderboard
      const userId = await createUserInDatabase({
        email: 'security@test.com',
        name: 'Security User',
        team: 'Security Team'
      });

      await createStepsInDatabase({
        user_id: userId,
        date: '2025-08-01',
        count: 8000,
        challenge_id: challengeId
      });

      const { agent } = await createAuthenticatedSession('security@test.com');

      const response = await agent
        .get('/api/leaderboard')
        .expect(200);

      // User should see the leaderboard data
      expect(response.body.data.ranked.length + response.body.data.unranked.length).toBeGreaterThan(0);

      // Verify response structure is safe
      const responseText = JSON.stringify(response.body);
      expect(responseText).not.toContain('password');
      expect(responseText).not.toContain('token');
      expect(responseText).not.toContain('secret');
    });
  });
});

// Console suppression utilities
let originalConsole;

function suppressConsole() {
  originalConsole = {
    log: console.log,
    error: console.error,
    warn: console.warn,
    info: console.info
  };
  
  console.log = () => {};
  console.error = () => {};
  console.warn = () => {};
  console.info = () => {};
}

function restoreConsole() {
  if (originalConsole) {
    console.log = originalConsole.log;
    console.error = originalConsole.error;
    console.warn = originalConsole.warn;
    console.info = originalConsole.info;
  }
}