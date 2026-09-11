const { validateChatIntent } = require('./chat-intent');

class ChatToolError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'ChatToolError';
    this.code = 'CHAT_TOOL_ERROR';
    this.details = details;
  }
}

function assertArguments(args, allowed) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new ChatToolError('Tool arguments must be an object');
  for (const key of Object.keys(args)) {
    if (!allowed.includes(key)) {
      throw new ChatToolError(`Unsupported tool argument: ${key}`, { argument: key });
    }
  }
}

const optionalDate = {
  type: 'string',
  pattern: '^\\d{4}-\\d{2}-\\d{2}$',
  description: 'Calendar date in YYYY-MM-DD format.'
};

const declarations = [
  {
    name: 'get_challenge_info',
    description: 'Get authoritative active challenge dates, status, current day, and countdowns.',
    parameters: { type: 'object', properties: { as_of_date: optionalDate } }
  },
  {
    name: 'get_my_team',
    description: 'Get the authenticated user’s current team name. Use this for direct questions about which team the user belongs to.',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'get_my_steps',
    description: 'Get the authenticated user’s steps and average. Defaults to the active challenge; explicit dates query the user’s own history.',
    parameters: { type: 'object', properties: { start_date: optionalDate, end_date: optionalDate } }
  },
  {
    name: 'get_individual_leaderboard',
    description: 'Get current individual standings. Ranked entries are official; if none are ranked, the first unranked entry with logged activity is the provisional leader by current average.',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'get_team_leaderboard',
    description: 'Get current team standings. Ranked entries are official; if none are ranked, the first unranked entry with logged activity is the provisional leader by current average.',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'calculate_target_average',
    description: 'Calculate the steps per unlogged challenge date needed for the authenticated user to reach a target reported-day average.',
    parameters: {
      type: 'object',
      properties: {
        target_average: { type: 'integer', minimum: 1, maximum: 70000 },
        days: { type: 'integer', minimum: 1, maximum: 366 },
        as_of_date: optionalDate
      },
      required: ['target_average']
    }
  },
  {
    name: 'calculate_overtake',
    description: 'Calculate a challenger’s pace needed to overtake a named participant’s current average. Omit challenger_name when the challenger is the authenticated user; include it for another leaderboard participant.',
    parameters: {
      type: 'object',
      properties: {
        target_name: { type: 'string', minLength: 1, maxLength: 100 },
        challenger_name: { type: 'string', minLength: 1, maxLength: 100 },
        days: { type: 'integer', minimum: 1, maximum: 366 },
        as_of_date: optionalDate
      },
      required: ['target_name']
    }
  },
  {
    name: 'get_my_individual_position',
    description: 'Get the authenticated user’s current individual position, average, reporting status, and gap to the leader without returning the full leaderboard.',
    parameters: {
      type: 'object',
      properties: { as_of_date: optionalDate }
    }
  },
  {
    name: 'calculate_overtake_leader',
    description: 'Calculate the authenticated user’s pace needed to overtake the current individual leader, falling back to the provisional leader when nobody is ranked. Resolves the leader authoritatively; do not look up the leaderboard first.',
    parameters: {
      type: 'object',
      properties: {
        days: { type: 'integer', minimum: 1, maximum: 366 },
        as_of_date: optionalDate
      }
    }
  },
  {
    name: 'get_challenge_outlook',
    description: 'Get a current individual or team standings outlook without predicting certainty.',
    parameters: {
      type: 'object',
      properties: {
        leaderboard: { type: 'string', enum: ['individual', 'team'] },
        as_of_date: optionalDate
      }
    }
  },
  {
    name: 'get_encouragement_context',
    description: 'Get minimal authenticated-user progress context for a supportive response.',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'preview_my_team_rename',
    description: 'Prepare a review to rename only the authenticated user’s current team. Never renames another team and never commits without UI confirmation.',
    parameters: {
      type: 'object',
      properties: {
        new_name: { type: 'string', minLength: 1, maxLength: 128 }
      },
      required: ['new_name']
    }
  },
  {
    name: 'preview_step_entries',
    description: 'Help the authenticated user track steps for one date or many dates. Prepare a review; never save or overwrite without UI confirmation. When the user says today or yesterday, set relative_date to that exact word and omit date so the server resolves it from the trusted browser-local calendar.',
    parameters: {
      type: 'object',
      properties: {
        entries: {
          type: 'array',
          minItems: 1,
          maxItems: 31,
          items: {
            type: 'object',
            properties: {
              date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
              relative_date: {
                type: 'string', enum: ['today', 'yesterday'],
                description: 'Use only when the user explicitly says today or yesterday; omit date.'
              },
              count: { type: 'integer', minimum: 0, maximum: 70000 }
            },
            required: ['count']
          }
        }
      },
      required: ['entries']
    }
  }
];

function createChatToolRegistry({ service }) {
  async function execute(name, rawArgs = {}, context) {
    const userId = context?.userId;
    const currentDate = context?.currentDate;
    if (!userId) throw new ChatToolError('Authenticated user context is required');

    switch (name) {
      case 'get_challenge_info': {
        assertArguments(rawArgs, ['as_of_date']);
        const intent = validateChatIntent({
          intent: 'challenge_info', tone: 'neutral', as_of_date: rawArgs.as_of_date || currentDate
        });
        return service.executeIntent(userId, intent);
      }
      case 'get_my_team':
        assertArguments(rawArgs, []);
        return service.getMyTeam(userId);
      case 'get_my_steps': {
        assertArguments(rawArgs, ['start_date', 'end_date']);
        const intent = validateChatIntent({ intent: 'show_my_steps', tone: 'neutral', ...rawArgs });
        return service.executeIntent(userId, intent);
      }
      case 'get_individual_leaderboard':
        assertArguments(rawArgs, []);
        return service.executeIntent(userId, { intent: 'individual_leaderboard', tone: 'neutral' });
      case 'get_team_leaderboard':
        assertArguments(rawArgs, []);
        return service.executeIntent(userId, { intent: 'team_leaderboard', tone: 'neutral' });
      case 'calculate_target_average': {
        assertArguments(rawArgs, ['target_average', 'days', 'as_of_date']);
        const intent = validateChatIntent({
          intent: 'calculate_target_average', tone: 'neutral',
          ...rawArgs, as_of_date: rawArgs.as_of_date || currentDate
        });
        return service.executeIntent(userId, intent);
      }
      case 'calculate_overtake': {
        assertArguments(rawArgs, ['target_name', 'challenger_name', 'days', 'as_of_date']);
        const intent = validateChatIntent({
          intent: 'calculate_overtake', tone: 'neutral',
          ...rawArgs, as_of_date: rawArgs.as_of_date || currentDate
        });
        return service.executeIntent(userId, intent);
      }
      case 'get_my_individual_position': {
        assertArguments(rawArgs, ['as_of_date']);
        const intent = validateChatIntent({
          intent: 'challenge_outlook', tone: 'neutral', leaderboard: 'individual',
          as_of_date: rawArgs.as_of_date || currentDate
        });
        return service.executeIntent(userId, intent);
      }
      case 'calculate_overtake_leader': {
        assertArguments(rawArgs, ['days', 'as_of_date']);
        const validated = validateChatIntent({
          intent: 'calculate_overtake', tone: 'neutral', target_name: 'current leader',
          ...rawArgs, as_of_date: rawArgs.as_of_date || currentDate
        });
        return service.calculateOvertakeLeader(userId, validated.days, validated.as_of_date);
      }
      case 'get_challenge_outlook': {
        assertArguments(rawArgs, ['leaderboard', 'as_of_date']);
        if (rawArgs.leaderboard !== undefined && !['individual', 'team'].includes(rawArgs.leaderboard)) {
          throw new ChatToolError('leaderboard must be individual or team');
        }
        const intent = validateChatIntent({
          intent: 'challenge_outlook', tone: 'neutral',
          leaderboard: rawArgs.leaderboard || 'individual',
          as_of_date: rawArgs.as_of_date || currentDate
        });
        return service.executeIntent(userId, intent);
      }
      case 'get_encouragement_context':
        assertArguments(rawArgs, []);
        return service.executeIntent(userId, { intent: 'encouragement', tone: 'neutral' });
      case 'preview_my_team_rename': {
        assertArguments(rawArgs, ['new_name']);
        if (typeof rawArgs.new_name !== 'string') throw new ChatToolError('new_name must be text');
        return service.previewTeamRename(userId, rawArgs.new_name);
      }
      case 'preview_step_entries': {
        assertArguments(rawArgs, ['entries']);
        if (!Array.isArray(rawArgs.entries)) throw new ChatToolError('entries must be an array');
        const entries = rawArgs.entries.map(entry => {
          assertArguments(entry, ['date', 'relative_date', 'count']);
          if (entry.date && entry.relative_date) {
            throw new ChatToolError('Use either date or relative_date, not both');
          }
          let date = entry.date;
          if (entry.relative_date !== undefined) {
            if (!['today', 'yesterday'].includes(entry.relative_date)) {
              throw new ChatToolError('relative_date must be today or yesterday');
            }
            date = context?.clientDate || currentDate;
            if (entry.relative_date === 'yesterday') {
              const priorDate = new Date(`${date}T00:00:00Z`);
              priorDate.setUTCDate(priorDate.getUTCDate() - 1);
              date = priorDate.toISOString().slice(0, 10);
            }
          }
          return { date, count: entry.count };
        });
        const intent = validateChatIntent({ intent: 'record_steps', tone: 'neutral', entries });
        const preview = await service.previewEntries(userId, intent.entries, context);
        return { kind: 'step_preview', ...preview };
      }
      default:
        throw new ChatToolError(`Unknown Trotter tool: ${name}`, { requestedTool: name });
    }
  }

  return { declarations, execute };
}

module.exports = {
  ChatToolError,
  createChatToolRegistry
};
