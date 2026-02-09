/**
 * Fast, cheap LLM layer for line-level "press-button-to-fix" workflows.
 * Designed for models like Claude Haiku 4.5, Gemini Flash 3, etc.
 */

export type QuickFixProviderId = "openai" | "google";

export interface QuickFixConfig {
  provider: QuickFixProviderId;
  apiKey: string;
  /** Model identifier, e.g. "gpt-4.5-haiku", "gemini-2.0-flash-exp" */
  model: string;
}

export interface QuickFixRequest {
  /** The exact line or selection to fix (will be sent as "from"). */
  text: string;
  /** Optional: surrounding lines or document context for coherence. */
  contextBefore?: string;
  contextAfter?: string;
}

/** Successful response: a single minimal edit. */
export interface QuickFixResult {
  ok: true;
  from: string;
  to: string;
}

export interface QuickFixError {
  ok: false;
  reason: string;
}

export type QuickFixResponse = QuickFixResult | QuickFixError;
