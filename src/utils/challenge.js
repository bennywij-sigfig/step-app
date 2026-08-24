const { formatInTimeZone, fromZonedTime, toZonedTime } = require('date-fns-tz');

const PACIFIC_TIMEZONE = 'America/Los_Angeles';
const INDIA_TIMEZONE = 'Asia/Kolkata';
const SINGAPORE_TIMEZONE = 'Asia/Singapore';

// The inclusive global window opens when the first supported region reaches
// the start date and closes when the last supported region finishes the end date.
const CHALLENGE_START_TIMEZONE = SINGAPORE_TIMEZONE;
const CHALLENGE_END_TIMEZONE = PACIFIC_TIMEZONE;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function parseDateOnlyUtc(dateString) {
  if (!DATE_ONLY_PATTERN.test(dateString || '')) return null;
  const [year, month, day] = dateString.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

function differenceInCalendarDays(startDate, endDate) {
  return Math.floor((endDate.getTime() - startDate.getTime()) / 86400000);
}

// Get current Pacific Time (DST-aware). Retained for existing callers.
function getCurrentPacificTime(now = new Date()) {
  return toZonedTime(now, PACIFIC_TIMEZONE);
}

function getTotalChallengeDays(challenge) {
  const start = parseDateOnlyUtc(challenge?.start_date);
  const end = parseDateOnlyUtc(challenge?.end_date);
  if (!start || !end || end < start) return 0;
  return differenceInCalendarDays(start, end) + 1;
}

// Reporting days follow Pacific dates so nobody is marked late before the last
// supported region has reached that challenge day.
function getCurrentChallengeDay(challenge, now = new Date()) {
  const start = parseDateOnlyUtc(challenge?.start_date);
  const currentPacificDate = parseDateOnlyUtc(
    formatInTimeZone(now, PACIFIC_TIMEZONE, 'yyyy-MM-dd')
  );
  const totalDays = getTotalChallengeDays(challenge);

  if (!start || !currentPacificDate || totalDays === 0) {
    return 0;
  }
  if (currentPacificDate < start) {
    // The inclusive window opens in Singapore before Pacific midnight. Show
    // Day 1 during that opening overlap instead of exposing a confusing Day 0.
    return getChallengeStatus(challenge, now) === 'active' ? 1 : 0;
  }

  return Math.min(differenceInCalendarDays(start, currentPacificDate) + 1, totalDays);
}

function getChallengeWindow(challenge) {
  if (!parseDateOnlyUtc(challenge?.start_date) || !parseDateOnlyUtc(challenge?.end_date)) {
    return null;
  }

  const start = fromZonedTime(
    `${challenge.start_date}T00:00:00.000`,
    CHALLENGE_START_TIMEZONE
  );
  const end = fromZonedTime(
    `${challenge.end_date}T23:59:59.999`,
    CHALLENGE_END_TIMEZONE
  );

  if (end < start) return null;
  return { start, end };
}

function getChallengeStatus(challenge, now = new Date()) {
  const window = getChallengeWindow(challenge);
  if (!window) return 'invalid';
  if (now < window.start) return 'upcoming';
  if (now > window.end) return 'ended';
  return 'active';
}

function withChallengeTiming(challenge, now = new Date()) {
  if (!challenge) return null;
  const window = getChallengeWindow(challenge);
  return {
    ...challenge,
    status: getChallengeStatus(challenge, now),
    window_start_utc: window?.start.toISOString() || null,
    window_end_utc: window?.end.toISOString() || null,
    start_timezone: CHALLENGE_START_TIMEZONE,
    end_timezone: CHALLENGE_END_TIMEZONE
  };
}

// Singapore is always the earliest calendar date among the supported regions.
// Using it as the future-entry ceiling gives all regions the most generous,
// consistent interpretation of "today".
function getLatestSupportedLocalDate(now = new Date()) {
  return formatInTimeZone(now, CHALLENGE_START_TIMEZONE, 'yyyy-MM-dd');
}

function isDateInChallengePeriod(date, challenge) {
  return Boolean(
    parseDateOnlyUtc(date) &&
    parseDateOnlyUtc(challenge?.start_date) &&
    parseDateOnlyUtc(challenge?.end_date) &&
    date >= challenge.start_date &&
    date <= challenge.end_date
  );
}

module.exports = {
  getCurrentPacificTime,
  getCurrentChallengeDay,
  getTotalChallengeDays,
  getChallengeWindow,
  getChallengeStatus,
  withChallengeTiming,
  getLatestSupportedLocalDate,
  isDateInChallengePeriod,
  PACIFIC_TIMEZONE,
  INDIA_TIMEZONE,
  SINGAPORE_TIMEZONE,
  CHALLENGE_START_TIMEZONE,
  CHALLENGE_END_TIMEZONE
};
