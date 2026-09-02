const {
  EARLY_TODAY_CUTOFF_HOUR,
  getClientDateContext,
  getStepDateWarning
} = require('../../../src/utils/step-date-warning');

describe('step date soft warnings', () => {
  test('derives date and time from a validated IANA timezone', () => {
    const now = new Date('2026-09-03T00:30:00Z');
    expect(getClientDateContext('America/Los_Angeles', now)).toEqual({
      clientDate: '2026-09-02',
      clientHour: 17,
      clientTime: '5:30 PM',
      clientTimezone: 'America/Los_Angeles'
    });
    expect(getClientDateContext('Asia/Singapore', now)).toEqual({
      clientDate: '2026-09-03',
      clientHour: 8,
      clientTime: '8:30 AM',
      clientTimezone: 'Asia/Singapore'
    });
  });

  test('rejects invalid timezone context instead of trusting a browser date', () => {
    expect(getClientDateContext('Not/A_Timezone', new Date())).toBeNull();
    expect(getClientDateContext('', new Date())).toBeNull();
  });

  test('warns before the local evening cutoff and suggests yesterday', () => {
    const warning = getStepDateWarning('2026-09-02', {
      clientDate: '2026-09-02', clientHour: EARLY_TODAY_CUTOFF_HOUR - 1, clientTime: '5:59 PM'
    });
    expect(warning).toMatchObject({
      code: 'early_local_today', local_date: '2026-09-02', suggested_date: '2026-09-01'
    });
    expect(warning.message).toContain('yesterday’s final total');
  });

  test('does not warn for local today at or after 6 PM', () => {
    expect(getStepDateWarning('2026-09-02', {
      clientDate: '2026-09-02', clientHour: EARLY_TODAY_CUTOFF_HOUR, clientTime: '6:00 PM'
    })).toBeNull();
  });

  test('warns but does not reject a Singapore-authorized date ahead of local today', () => {
    expect(getStepDateWarning('2026-09-03', {
      clientDate: '2026-09-02', clientHour: 17, clientTime: '5:30 PM'
    })).toMatchObject({
      code: 'date_ahead_of_local_day', local_date: '2026-09-02', suggested_date: '2026-09-02'
    });
  });

  test('does not warn for a historical date', () => {
    expect(getStepDateWarning('2026-09-01', {
      clientDate: '2026-09-02', clientHour: 8, clientTime: '8:00 AM'
    })).toBeNull();
  });
});
