// Maps provider HTTP failures to the one error set (§9.1). Messages carry the provider, status and
// error type only, never request content (§10.3).
import { ProviderError } from "@gw/shared";
import { retryAfterSeconds } from "./types";

export interface HttpFailure {
  provider: string;
  status: number | undefined;
  /** Provider error type, e.g. "overloaded_error", when the body names one. */
  type?: string | null;
  headers?: { get(name: string): string | null };
  /** Treat a 429 without retry-after as the account's spend cap (Anthropic, §7.8). */
  spendCapWithoutRetryAfter?: boolean;
  /** A 429 whose body says the credit or quota is used up. */
  quotaExhausted?: boolean;
}

export function mapHttpFailure(f: HttpFailure): ProviderError {
  const label = `${f.provider} ${f.status ?? "stream"}${f.type ? ` ${f.type}` : ""}`;
  const status = f.status;
  if (status === 429 || f.type === "rate_limit_error") {
    const retryAfter = retryAfterSeconds(f.headers);
    if (f.quotaExhausted || (retryAfter === null && f.spendCapWithoutRetryAfter)) {
      return new ProviderError("spend_cap", `${label}: spend cap or credit limit reached`);
    }
    return new ProviderError("rate_limited", label, retryAfter);
  }
  if (status === 401 || status === 403 || f.type === "authentication_error" || f.type === "permission_error") {
    return new ProviderError("auth", label);
  }
  if (status === 529 || status === 503 || status === 500 || status === 502 || status === 504 || f.type === "overloaded_error" || f.type === "api_error") {
    return new ProviderError("overloaded", label);
  }
  if (status === 408) return new ProviderError("network", label);
  if (status === undefined) return new ProviderError("network", label);
  return new ProviderError("invalid_request", label);
}
