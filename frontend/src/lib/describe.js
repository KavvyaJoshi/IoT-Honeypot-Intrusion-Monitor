/**
 * Plain-language one-liners for events, so people can scan the feed without decoding
 * categories, rule ids and HTTP details. The technical detail stays one click away.
 */
const CATEGORY_SENTENCES = {
  normal: (e) => `Normal visit to ${e.path}`,
  'excessive-requests': () => 'Sent too many requests too quickly',
  'repeated-failed-login': () => 'Kept failing to log in (possible password guessing)',
  'suspicious-path': (e) => `Looked for a sensitive-looking page (${e.path})`,
  'malformed-request': () => 'Sent a broken or unusual request',
  'route-enumeration': () => 'Guessed lots of pages that do not exist',
  'traffic-anomaly': () => 'Unusual spike in overall traffic',
  'active-enforcement': () => 'Kept sending requests while already limited',
  'api-rate-limit': () => 'Hit the dashboard API rate limit (HTTP 429)',
};

export function describeEvent(event) {
  const sentence = CATEGORY_SENTENCES[event.category];
  return sentence ? sentence(event) : `${event.method} ${event.path}`;
}

const ACTION_OUTCOMES = {
  allowed: 'No action needed',
  logged: 'Logged for review',
  'rate-limited': 'Slowed down',
  blocked: 'Blocked',
};

export function describeOutcome(event) {
  return ACTION_OUTCOMES[event.actionTaken] ?? event.actionTaken;
}

/** Who did it, in human terms. */
export function describeSource(event) {
  if (event.sourceType === 'backend') return `Client ${event.sourceIdentifier}`;
  return event.sourceIdentifier;
}
