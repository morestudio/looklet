// Why a request failed. Decided on the server (lib/route.ts), where the AI provider's HTTP status is known, and sent as
// `reason` beside `error`; the browser words it (lib/errors.ts) and reports it (errorReason in lib/analytics.ts).
// No reason = the route's `error` text is written for the user and is shown as is.

export type FailReason = 'safety' | 'ai_busy' | 'ai_rejected' | 'ai_unavailable' | 'server';

const SAFETY_BLOCK = /safety system|safety_violations|moderation_blocked/i;
const OUT_OF_CREDIT = /insufficient_quota|current quota|billing/i; // OpenAI's 429 for an account with no credit

// providerStatus: absent for our own AI messages (lib/ai.ts: Gemini block, mask unsupported), which are shown as written
export function aiFailReason(message: string, providerStatus?: number): FailReason | undefined {
  if (SAFETY_BLOCK.test(message)) return 'safety';
  if (!providerStatus) return undefined;
  // only rate limits and outages pass with time; a bad key, no credit or no model access never do
  if (providerStatus >= 500 || (providerStatus === 429 && !OUT_OF_CREDIT.test(message))) return 'ai_busy';
  if (providerStatus === 400) return 'ai_rejected';
  return 'ai_unavailable';
}
