// Every error response of our API has the Vercel REST API shape (Stripe's is the same idea):
//   { "error": { "code": "...", "message": "...", ...extra } }
// code     a FailReason (lib/fail-reason.ts) when customers should see it worded by lib/errors.ts, else the status's generic code
// message  without a FailReason: written for the customer (Thai), shown as is; with one: the raw cause (logs, superadmin)
import { FAIL_REASONS, type FailReason } from './fail-reason';

type ApiErrorObject = { code: string; message: string; [extra: string]: unknown };
export type ErrorBody = { error: ApiErrorObject };
type Options = { reason?: FailReason; extra?: Record<string, unknown> };

const STATUS_CODES: Record<number, string> = {
  400: 'bad_request', 401: 'unauthorized', 403: 'forbidden', 404: 'not_found', 409: 'conflict', 413: 'payload_too_large',
  429: 'too_many_requests', 500: 'internal_server_error', 502: 'bad_gateway', 503: 'service_unavailable', 504: 'gateway_timeout',
};

export const errorBody = (status: number, message: string, { reason, extra }: Options = {}): ErrorBody =>
  ({ error: { ...extra, code: reason ?? STATUS_CODES[status] ?? 'error', message } });

export const errorResponse = (status: number, message: string, options?: Options) =>
  Response.json(errorBody(status, message, options), { status });

// browser: the error object of a response body ({} for anything else: a host's HTML error page, an empty body)
export function errorOf(body: unknown): Partial<ApiErrorObject> {
  const e = (body as { error?: unknown } | null)?.error;
  return e && typeof e === 'object' ? (e as Partial<ApiErrorObject>) : {};
}
export const errorMessageOf = (body: unknown) => {
  const { message } = errorOf(body);
  return typeof message === 'string' ? message : undefined;
};

// browser: the FailReason a response names; undefined for a generic code or a body of another shape
export function failReasonOf(body: unknown): FailReason | undefined {
  const { code } = errorOf(body);
  return (FAIL_REASONS as readonly unknown[]).includes(code) ? (code as FailReason) : undefined;
}
