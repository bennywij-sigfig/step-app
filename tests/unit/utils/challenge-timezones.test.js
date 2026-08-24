const {
  getCurrentChallengeDay,
  getTotalChallengeDays,
  getChallengeWindow,
  getChallengeStatus,
  getLatestSupportedLocalDate,
  isDateInChallengePeriod
} = require('../../../src/utils/challenge');

const challenge = {
  start_date: '2026-09-01',
  end_date: '2026-09-15'
};

describe('inclusive multi-region challenge timing', () => {
  test('counts calendar days without DST-related errors', () => {
    expect(getTotalChallengeDays(challenge)).toBe(15);
    expect(getTotalChallengeDays({ start_date: '2026-10-30', end_date: '2026-11-03' })).toBe(5);
  });

  test('opens at midnight September 1 in Singapore', () => {
    const window = getChallengeWindow(challenge);
    expect(window.start.toISOString()).toBe('2026-08-31T16:00:00.000Z');
    expect(getChallengeStatus(challenge, new Date('2026-08-31T15:59:59.999Z'))).toBe('upcoming');
    expect(getChallengeStatus(challenge, window.start)).toBe('active');
  });

  test('closes after September 15 finishes in Pacific time', () => {
    const window = getChallengeWindow(challenge);
    expect(window.end.toISOString()).toBe('2026-09-16T06:59:59.999Z');
    expect(getChallengeStatus(challenge, window.end)).toBe('active');
    expect(getChallengeStatus(challenge, new Date('2026-09-16T07:00:00.000Z'))).toBe('ended');
  });

  test('uses Pacific dates for the reporting-day denominator', () => {
    expect(getCurrentChallengeDay(challenge, new Date('2026-08-31T15:59:59.000Z'))).toBe(0);
    expect(getCurrentChallengeDay(challenge, new Date('2026-09-01T06:59:59.000Z'))).toBe(1);
    expect(getCurrentChallengeDay(challenge, new Date('2026-09-01T07:00:00.000Z'))).toBe(1);
    expect(getCurrentChallengeDay(challenge, new Date('2026-09-20T00:00:00.000Z'))).toBe(15);
  });

  test('uses Singapore as the generous supported-date ceiling', () => {
    expect(getLatestSupportedLocalDate(new Date('2026-08-31T16:00:00.000Z'))).toBe('2026-09-01');
  });

  test('enforces both inclusive challenge date boundaries', () => {
    expect(isDateInChallengePeriod('2026-09-01', challenge)).toBe(true);
    expect(isDateInChallengePeriod('2026-09-15', challenge)).toBe(true);
    expect(isDateInChallengePeriod('2026-08-31', challenge)).toBe(false);
    expect(isDateInChallengePeriod('2026-09-16', challenge)).toBe(false);
    expect(isDateInChallengePeriod('not-a-date', challenge)).toBe(false);
  });
});
