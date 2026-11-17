// Why a request failed. Decided on the server (lib/route.ts), where the AI provider's HTTP status is known, and sent as
// the error `code` (lib/api-error.ts); the browser words it (lib/errors.ts) and reports it (errorReason in lib/analytics.ts).
// No reason = the route's `message` is written for the user and is shown as is.
// unexpected_error, not internal_server_error: that is the generic code of any 500, including routes' own Thai messages

export const FAIL_REASONS = ['safety', 'ai_busy', 'ai_rejected', 'ai_unavailable', 'unexpected_error'] as const;
export type FailReason = (typeof FAIL_REASONS)[number];

const SAFETY_BLOCK = /safety system|safety_violations|moderation_blocked/i;
const OUT_OF_CREDIT = /insufficient_quota|current quota|billing/i; // no credit: OpenAI sends it as a 429 or a 400 (billing_hard_limit_reached)

// providerStatus: absent for our own AI messages (lib/ai.ts: Gemini block, mask unsupported), which are shown as written
export function aiFailReason(message: string, providerStatus?: number): FailReason | undefined {
  if (SAFETY_BLOCK.test(message)) return 'safety';
  if (!providerStatus) return undefined;
  if (OUT_OF_CREDIT.test(message)) return 'ai_unavailable';
  // only rate limits and outages pass with time; a bad key or no model access never do
  if (providerStatus >= 500 || providerStatus === 429) return 'ai_busy';
  if (providerStatus === 400) return 'ai_rejected';
  return 'ai_unavailable';
}
