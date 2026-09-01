const MAX_TEAM_NAME_GRAPHEMES = 32;
const MAX_TEAM_NAME_BYTES = 128;

class TeamNameValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TeamNameValidationError';
    this.code = 'TEAM_NAME_INVALID';
  }
}

function graphemeCount(value) {
  if (typeof Intl.Segmenter === 'function') {
    return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value)].length;
  }
  return Array.from(value).length;
}

function normalizeTeamName(value) {
  if (typeof value !== 'string') throw new TeamNameValidationError('Team name must be text');
  const unicode = value.normalize('NFC');
  if (/[\p{Cc}\p{Cs}\u2028\u2029]/u.test(unicode)) {
    throw new TeamNameValidationError('Team name contains unsupported control characters');
  }
  const normalized = unicode.replace(/\p{Zs}+/gu, ' ').trim();
  if (!normalized) throw new TeamNameValidationError('Team name is required');
  if (/[<>]/u.test(normalized)) {
    throw new TeamNameValidationError('Team name cannot contain markup characters');
  }
  // Block invisible/spoofing controls while allowing U+200D, which is required
  // for ordinary joined emoji such as family and profession emoji.
  if (/[\u061C\u200B\u200C\u200E\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/u.test(normalized)) {
    throw new TeamNameValidationError('Team name contains unsupported invisible characters');
  }
  if (graphemeCount(normalized) > MAX_TEAM_NAME_GRAPHEMES) {
    throw new TeamNameValidationError(`Team name must be ${MAX_TEAM_NAME_GRAPHEMES} characters or fewer`);
  }
  if (Buffer.byteLength(normalized, 'utf8') > MAX_TEAM_NAME_BYTES) {
    throw new TeamNameValidationError(`Team name must be ${MAX_TEAM_NAME_BYTES} UTF-8 bytes or fewer`);
  }
  return normalized;
}

function teamNameKey(value) {
  if (typeof value !== 'string') throw new TeamNameValidationError('Team name must be text');
  return value.normalize('NFKC').replace(/\p{Zs}+/gu, ' ').trim().toLocaleLowerCase('en-US');
}

module.exports = {
  MAX_TEAM_NAME_GRAPHEMES,
  MAX_TEAM_NAME_BYTES,
  TeamNameValidationError,
  normalizeTeamName,
  teamNameKey,
  graphemeCount
};
