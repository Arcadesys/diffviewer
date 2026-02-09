/**
 * Auto-fix: fast, cheap LLM layer for line-level "press-button-to-fix" workflows.
 * Designed for models like GPT-5 nano, Gemini Flash, etc.
 */

export type AutoFixProviderId = "openai" | "google";

export interface AutoFixConfig {
  provider: AutoFixProviderId;
  apiKey: string;
  /** Model identifier, e.g. "gpt-5-nano", "gemini-2.0-flash" */
  model: string;
}

export interface AutoFixRequest {
  /** The exact line or selection to fix (will be sent as "from"). */
  text: string;
  /** Optional: surrounding lines or document context for coherence. */
  contextBefore?: string;
  contextAfter?: string;
  /** Optional: hint from a previous review (e.g. suggestion-only finding) so the fast model can try to incorporate it. */
  suggestionHint?: string;
}

/** Successful response: a single minimal edit. */
export interface AutoFixResult {
  ok: true;
  from: string;
  to: string;
}

export interface AutoFixError {
  ok: false;
  reason: string;
}

export type AutoFixResponse = AutoFixResult | AutoFixError;

// --- Apply suggestion with LLM (Option A/B: send edit JSON + original text, get structured JSON back) ---

/** Edit context sent to the LLM when applying Option A/B. */
export interface ApplySuggestionEditJson {
  comment: string;
  patch: { from: string; to: string; span?: string };
  optionLabel: string;
  replacementText: string;
}

export interface ApplySuggestionLLMRequest {
  editJson: ApplySuggestionEditJson;
  originalText: string;
}

/** Expected structured JSON from the LLM: exact span to replace and final replacement text. */
export interface ApplySuggestionLLMResult {
  ok: true;
  from: string;
  to: string;
}

export type ApplySuggestionLLMResponse = ApplySuggestionLLMResult | AutoFixError;
