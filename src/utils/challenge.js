const { fromZonedTime, toZonedTime, format } = require('date-fns-tz');

const PACIFIC_TIMEZONE = 'America/Los_Angeles';

// Get current Pacific Time (DST-aware)
function getCurrentPacificTime() {
  const nowUTC = new Date();
  return toZonedTime(nowUTC, PACIFIC_TIMEZONE);
}

// Calculate current challenge day using Pacific Time
function getCurrentChallengeDay(challenge) {
  try {
    const nowPacific = getCurrentPacificTime();
    
    // Parse challenge dates in Pacific time
    const startPacific = new Date(challenge.start_date + 'T00:00:00');
    const endPacific = new Date(challenge.end_date + 'T23:59:59');
    
    // Before challenge starts
    if (nowPacific < startPacific) {
      return 0;
    }
    
    // After challenge ends - return final day number
    if (nowPacific > endPacific) {
      return Math.floor((endPacific - startPacific) / (1000 * 60 * 60 * 24)) + 1;
    }
    
    // During challenge - calculate current day
    return Math.floor((nowPacific - startPacific) / (1000 * 60 * 60 * 24)) + 1;
  } catch (error) {
    console.error('Error calculating challenge day:', error);
    return 0;
  }
}

// Get total days in challenge
function getTotalChallengeDays(challenge) {
  try {
    const startPacific = new Date(challenge.start_date + 'T00:00:00');
    const endPacific = new Date(challenge.end_date + 'T23:59:59');
    return Math.floor((endPacific - startPacific) / (1000 * 60 * 60 * 24)) + 1;
  } catch (error) {
    console.error('Error calculating total challenge days:', error);
    return 0;
  }
}

module.exports = {
  getCurrentPacificTime,
  getCurrentChallengeDay,
  getTotalChallengeDays,
  PACIFIC_TIMEZONE,
};