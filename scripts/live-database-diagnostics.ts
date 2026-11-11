// Do not print PostgreSQL messages, details, query parameters, or arbitrary identifiers:
// they can contain credentials or application data.
const knownConstraints = new Set(['payment_intents_pkey','payment_intents_business_key_key','payment_intents_authorize_reference','payment_intents_status_check','wallet_challenges_pkey','wallet_challenges_nonce_key','wallet_sessions_pkey']);
export function diagnostic(error:unknown) {
 const e = error && typeof error === 'object' ? error as {code?:unknown; constraint?:unknown; name?:unknown} : {};
 const sqlstate = typeof e.code === 'string' && /^[0-9A-Z]{5}$/.test(e.code) ? e.code : 'unavailable';
 const constraint = typeof e.constraint === 'string' && knownConstraints.has(e.constraint) ? e.constraint : e.constraint ? 'redacted' : 'unavailable';
 const context = e.name === 'AssertionError' ? 'assertion failed (values suppressed)' : sqlstate !== 'unavailable' ? 'PostgreSQL operation failed (details suppressed)' : 'operation failed (details suppressed)';
 return `SQLSTATE=${sqlstate} constraint=${constraint} context=${context}`;
}
