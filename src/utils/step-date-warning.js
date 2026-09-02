const { formatInTimeZone } = require('date-fns-tz');

const EARLY_TODAY_CUTOFF_HOUR = 18;
const TIMEZONE_MAX_LENGTH = 64;

function priorDate(dateString) {
  const date = new Date(`${dateString}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function getClientDateContext(timeZone, now = new Date()) {
  if (typeof timeZone !== 'string' || !timeZone || timeZone.length > TIMEZONE_MAX_LENGTH) return null;
  try {
    return {
      clientDate: formatInTimeZone(now, timeZone, 'yyyy-MM-dd'),
      clientHour: Number(formatInTimeZone(now, timeZone, 'H')),
      clientTime: formatInTimeZone(now, timeZone, 'h:mm a'),
      clientTimezone: timeZone
    };
  } catch (_) {
    return null;
  }
}

// This warning never expands or restricts the globally valid date range. It
// only adds confirmation when a Singapore-authorized date looks surprising in
// the user's local timezone.
function getStepDateWarning(date, context) {
  if (!context?.clientDate || !Number.isInteger(context.clientHour)) return null;

  if (date > context.clientDate) {
    return {
      code: 'date_ahead_of_local_day',
      message: `${date} is later than today in your current timezone. Are you sure these steps belong on ${date}?`,
      local_date: context.clientDate,
      local_time: context.clientTime || null,
      suggested_date: context.clientDate
    };
  }

  if (date === context.clientDate && context.clientHour < EARLY_TODAY_CUTOFF_HOUR) {
    return {
      code: 'early_local_today',
      message: `It’s only ${context.clientTime || 'early'} where you are. Are these steps from today so far, or yesterday’s final total?`,
      local_date: context.clientDate,
      local_time: context.clientTime || null,
      suggested_date: priorDate(context.clientDate)
    };
  }

  return null;
}

module.exports = {
  EARLY_TODAY_CUTOFF_HOUR,
  getClientDateContext,
  getStepDateWarning
};
