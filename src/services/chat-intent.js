const ALLOWED_INTENTS = new Set([
  'record_steps',
  'show_my_steps',
  'individual_leaderboard',
  'team_leaderboard',
  'calculate_overtake',
  'calculate_target_average',
  'challenge_outlook',
  'challenge_info',
  'encouragement',
  'step_chitchat',
  'help'
]);

const ALLOWED_TONES = new Set(['neutral', 'encouraging', 'droll', 'sarcastic', 'annoying']);
const ALLOWED_HELP_REASONS = new Set([
  'missing_date',
  'missing_count',
  'invalid_count',
  'ambiguous_date',
  'unsafe_or_unsupported',
  'general'
]);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

class ChatIntentValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ChatIntentValidationError';
    this.code = 'CHAT_INTENT_INVALID';
  }
}

function invalid(message) {
  throw new ChatIntentValidationError(message);
}

function assertPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    invalid('I had trouble understanding that request. Try rephrasing it with a date and step count.');
  }
}

function optionalDate(value, fieldName) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
    invalid(`I couldn't understand the ${fieldName.replace('_', ' ')}. Try a date such as August 25, 2026.`);
  }
  return value;
}

function validateChatIntent(rawIntent) {
  assertPlainObject(rawIntent);

  const intent = rawIntent.intent;
  if (!ALLOWED_INTENTS.has(intent)) {
    invalid('I can only help with step entries, step history, leaderboards, and overtake calculations.');
  }

  const normalized = {
    intent,
    tone: ALLOWED_TONES.has(rawIntent.tone) ? rawIntent.tone : 'neutral'
  };

  if (intent === 'help') {
    normalized.reason = ALLOWED_HELP_REASONS.has(rawIntent.reason) ? rawIntent.reason : 'general';
  }

  if (intent === 'record_steps') {
    if (!Array.isArray(rawIntent.entries) || rawIntent.entries.length === 0 || rawIntent.entries.length > 31) {
      invalid('Please include between 1 and 31 dates, with a step count for each one.');
    }

    normalized.entries = rawIntent.entries.map((entry, index) => {
      assertPlainObject(entry);
      if (typeof entry.date !== 'string' || !DATE_PATTERN.test(entry.date)) {
        invalid(`I couldn't understand date ${index + 1}. Try a date such as August 25, 2026.`);
      }
      if (!Number.isInteger(entry.count) || entry.count < 0 || entry.count > 70000) {
        invalid(`The step count for ${entry.date || `entry ${index + 1}`} needs to be a whole number between 0 and 70,000.`);
      }
      return { date: entry.date, count: entry.count };
    });
  }

  if (intent === 'show_my_steps') {
    normalized.start_date = optionalDate(rawIntent.start_date, 'start_date');
    normalized.end_date = optionalDate(rawIntent.end_date, 'end_date');
    if (normalized.start_date && normalized.end_date && normalized.start_date > normalized.end_date) {
      invalid('The start date needs to be on or before the end date.');
    }
  }

  if (intent === 'calculate_overtake') {
    if (typeof rawIntent.target_name !== 'string' || rawIntent.target_name.trim().length === 0) {
      invalid('Tell me which participant you want to overtake.');
    }
    normalized.target_name = rawIntent.target_name.trim().slice(0, 100);
  }

  if (intent === 'calculate_target_average') {
    if (!Number.isInteger(rawIntent.target_average) || rawIntent.target_average < 1 || rawIntent.target_average > 70000) {
      invalid('Choose a target daily average between 1 and 70,000 steps.');
    }
    normalized.target_average = rawIntent.target_average;
  }

  if (intent === 'challenge_outlook') {
    normalized.leaderboard = rawIntent.leaderboard === 'team' ? 'team' : 'individual';
    if (rawIntent.as_of_date !== undefined) normalized.as_of_date = optionalDate(rawIntent.as_of_date, 'as_of_date');
  }

  if (intent === 'challenge_info') {
    normalized.as_of_date = optionalDate(rawIntent.as_of_date, 'as_of_date');
  }

  if (intent === 'calculate_overtake' || intent === 'calculate_target_average') {
    if (rawIntent.as_of_date !== undefined) normalized.as_of_date = optionalDate(rawIntent.as_of_date, 'as_of_date');
    if (rawIntent.days !== undefined && rawIntent.days !== null) {
      if (!Number.isInteger(rawIntent.days) || rawIntent.days < 1 || rawIntent.days > 366) {
        invalid('Choose a whole number of days between 1 and 366.');
      }
      normalized.days = rawIntent.days;
    } else {
      normalized.days = null;
    }
  }

  return normalized;
}

module.exports = {
  ALLOWED_INTENTS,
  ALLOWED_TONES,
  ALLOWED_HELP_REASONS,
  ChatIntentValidationError,
  validateChatIntent
};
