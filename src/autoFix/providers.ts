import type { AutoFixConfig, AutoFixRequest, AutoFixResponse } from "./types";

const AUTO_FIX_SYSTEM = `You are a line-level editor. Given a line or short selection from a document, suggest exactly one minimal edit.
Output only a single JSON object with two keys: "from" (the exact original text) and "to" (the improved text).
Rules: only fix grammar, clarity, or style; do not change meaning. Keep the edit minimal. Preserve formatting and line breaks.
If the text needs no change, set "to" equal to "from".`;

function buildUserMessage(req: AutoFixRequest): string {
  const parts: string[] = [];
  if (req.contextBefore) {
    parts.push("Context before:\n" + req.contextBefore);
  }
  parts.push("Text to fix:\n" + req.text);
  if (req.contextAfter) {
    parts.push("Context after:\n" + req.contextAfter);
  }
  return parts.join("\n\n");
}

function parseJsonFromResponse(raw: string): AutoFixResponse {
  raw = raw.trim();
  // Allow markdown code block
  const codeMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const toParse = codeMatch ? codeMatch[1].trim() : raw;
  let obj: { from?: string; to?: string };
  try {
    obj = JSON.parse(toParse) as { from?: string; to?: string };
  } catch {
    return { ok: false, reason: "Model did not return valid JSON" };
  }
  if (typeof obj.from !== "string" || typeof obj.to !== "string") {
    return { ok: false, reason: "JSON must contain 'from' and 'to' strings" };
  }
  return { ok: true, from: obj.from, to: obj.to };
}

export async function autoFixOpenAI(
  config: AutoFixConfig,
  req: AutoFixRequest
): Promise<AutoFixResponse> {
  if (config.provider !== "openai" || !config.apiKey) {
    return { ok: false, reason: "OpenAI provider requires an API key" };
  }
  const url = "https://api.openai.com/v1/chat/completions";
  const body = {
    model: config.model || "gpt-4o-mini",
    messages: [
      { role: "system", content: AUTO_FIX_SYSTEM },
      { role: "user", content: buildUserMessage(req) },
    ],
    max_tokens: 256,
    temperature: 0.2,
  };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    return { ok: false, reason: `API error ${res.status}: ${errText.slice(0, 200)}` };
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };
  if (data.error?.message) {
    return { ok: false, reason: data.error.message };
  }
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    return { ok: false, reason: "Empty or invalid API response" };
  }
  return parseJsonFromResponse(content);
}

export async function autoFixGoogle(
  config: AutoFixConfig,
  req: AutoFixRequest
): Promise<AutoFixResponse> {
  if (config.provider !== "google" || !config.apiKey) {
    return { ok: false, reason: "Google provider requires an API key" };
  }
  const modelId = (config.model || "gemini-2.0-flash").replace(/^models\//, "");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`;
  const prompt = AUTO_FIX_SYSTEM + "\n\n" + buildUserMessage(req);
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: 256,
      temperature: 0.2,
    },
  };
  const res = await fetch(`${url}?key=${encodeURIComponent(config.apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    return { ok: false, reason: `API error ${res.status}: ${errText.slice(0, 200)}` };
  }
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    error?: { message?: string };
  };
  if (data.error?.message) {
    return { ok: false, reason: data.error.message };
  }
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string") {
    return { ok: false, reason: "Empty or invalid API response" };
  }
  return parseJsonFromResponse(text);
}

export async function requestAutoFix(
  config: AutoFixConfig,
  req: AutoFixRequest
): Promise<AutoFixResponse> {
  if (!config.apiKey?.trim()) {
    return { ok: false, reason: "API key not set" };
  }
  switch (config.provider) {
    case "openai":
      return autoFixOpenAI(config, req);
    case "google":
      return autoFixGoogle(config, req);
    default:
      return { ok: false, reason: `Unknown provider: ${config.provider}` };
  }
}
