/**
 * Minimal schema for Revision Buddy Session JSON (Custom GPT output).
 * Supports simple format and rb_session_v1.
 */

export interface Patch {
  from: string;
  to: string;
  span?: string;
}

export interface Finding {
  id?: string;
  comment: string;
  patch: Patch;
  severity?: string;
}

export interface Session {
  session_id: string;
  findings: Finding[];
}

// --- rb_session_v1 schema ---

export interface Summary {
  big_picture?: string;
  what_improved?: string[];
  top_risks?: string[];
  recommended_next_pass?: string;
}

export interface DocComment {
  agent_id?: string;
  severity?: string;
  comment?: string;
  rationale?: string;
  confidence?: string;
  /** Quote from the document to jump to when the user clicks this comment. */
  anchor_quote?: string;
  /** Recommended edit (non–first-level doc comments should have this). Edit should change formatting (to !== from). */
  patch?: { from: string; to: string };
  /** Alternative text suggestions when no concrete patch is provided. */
  suggestions?: string[];
}

export interface FindingLocation {
  type?: string;
  anchor_quote?: string;
}

export interface FindingPatchV1 {
  type?: string;
  from?: string;
  to?: string;
  risk?: string;
}

/** One alternative replacement for a finding; shared from/span come from the finding. */
export interface FindingPatchOptionV1 {
  label?: string;
  to: string;
}

export interface FindingV1 {
  finding_id?: string;
  agent_id?: string;
  severity?: string;
  location?: FindingLocation;
  comment?: string;
  rationale?: string;
  tradeoff?: string;
  confidence?: string;
  tags?: string[];
  suggestions?: string[];
  patch?: FindingPatchV1;
  /** Multiple fix options (Option A / Option B); each has `to`, shared from/span from location or patch. */
  patch_options?: FindingPatchOptionV1[];
}

export interface RbSessionV1 {
  protocol_version?: string;
  session_id?: string;
  tone?: string;
  verbosity?: string;
  summary?: Summary;
  doc_comments?: DocComment[];
  findings?: FindingV1[];
}

/** One clickable option with a full patch (same from/span, different to). */
export interface PatchOption {
  label: string;
  patch: Patch;
}

// Extended metadata per finding (from v1 normalization).
export interface FindingMeta {
  rationale?: string;
  tradeoff?: string;
  suggestions?: string[];
  agent_id?: string;
  tags?: string[];
  /** If false, finding is suggestion-only (no Accept). */
  hasPatch?: boolean;
  /** When present with length > 1, UI shows Option A / Option B etc.; each has a full patch. */
  patchOptions?: PatchOption[];
}

export interface SessionWithMeta {
  session: Session;
  summary?: Summary;
  doc_comments?: DocComment[];
  findingMeta?: FindingMeta[];
}

export type ParseSessionResult = SessionWithMeta | { error: string };

/** Persisted per-file state so session and accept/ignore progress survive quit/reopen. */
export interface PersistedSessionState {
  rawJson: string;
  acceptedIndices: number[];
  ignoredIndices: number[];
  /** For multi-option findings: finding index -> chosen option index. Persist as string-keyed record. */
  acceptedOptionByIndex?: Record<string, number>;
}

function isRbSessionV1(obj: Record<string, unknown>): boolean {
  return (
    obj.protocol_version === "rb_session_v1" ||
    (typeof obj.summary === "object" && obj.summary !== null && Array.isArray(obj.doc_comments))
  );
}

function parseSimpleFormat(obj: Record<string, unknown>): ParseSessionResult {
  if (typeof obj.session_id !== "string") {
    return { error: "Missing or invalid session_id (must be a string)" };
  }
  if (!Array.isArray(obj.findings)) {
    return { error: "Missing or invalid findings (must be an array)" };
  }
  const findings: Finding[] = [];
  for (let i = 0; i < obj.findings.length; i++) {
    const f = obj.findings[i];
    if (f === null || typeof f !== "object" || Array.isArray(f)) {
      return { error: `findings[${i}] must be an object` };
    }
    const finding = f as Record<string, unknown>;
    const patch = finding.patch;
    if (patch === null || typeof patch !== "object" || Array.isArray(patch)) {
      return { error: `findings[${i}].patch must be an object` };
    }
    const p = patch as Record<string, unknown>;
    if (typeof p.from !== "string" || typeof p.to !== "string") {
      return { error: `findings[${i}].patch must have from and to (strings)` };
    }
    findings.push({
      id: typeof finding.id === "string" ? finding.id : undefined,
      comment: typeof finding.comment === "string" ? finding.comment : "",
      patch: {
        from: p.from,
        to: p.to,
        span: typeof p.span === "string" ? p.span : undefined,
      },
      severity: typeof finding.severity === "string" ? finding.severity : undefined,
    });
  }
  return { session: { session_id: obj.session_id, findings } };
}

function parseRbSessionV1Format(obj: Record<string, unknown>): ParseSessionResult {
  const sessionId = typeof obj.session_id === "string" ? obj.session_id : "unknown";
  const rawFindings = Array.isArray(obj.findings) ? obj.findings : [];
  const findings: Finding[] = [];
  const findingMeta: FindingMeta[] = [];

  for (let i = 0; i < rawFindings.length; i++) {
    const f = rawFindings[i];
    if (f === null || typeof f !== "object" || Array.isArray(f)) continue;
    const finding = f as Record<string, unknown>;
    const loc = finding.location as Record<string, unknown> | undefined;
    const anchor = loc && typeof loc.anchor_quote === "string" ? loc.anchor_quote : "";
    const patchObj = finding.patch as Record<string, unknown> | undefined;
    const hasSinglePatch = patchObj && typeof patchObj.from === "string" && typeof patchObj.to === "string";
    const rawPatchOptions = Array.isArray(finding.patch_options) ? finding.patch_options : [];

    const fromStr =
      hasSinglePatch && patchObj
        ? (patchObj.from as string)
        : anchor || "";
    const spanStr =
      hasSinglePatch && patchObj && typeof patchObj.span === "string"
        ? (patchObj.span as string)
        : anchor || undefined;

    let patch: Patch;
    if (hasSinglePatch && patchObj) {
      patch = {
        from: patchObj.from as string,
        to: patchObj.to as string,
        span: spanStr,
      };
    } else {
      patch = { from: fromStr, to: fromStr, span: spanStr };
    }

    const patchOptions: { label: string; patch: Patch }[] = [];
    if (rawPatchOptions.length > 0 && fromStr) {
      const optionLabels = ["Option A", "Option B", "Option C", "Option D", "Option E"];
      for (let o = 0; o < rawPatchOptions.length; o++) {
        const opt = rawPatchOptions[o];
        if (opt === null || typeof opt !== "object" || Array.isArray(opt)) continue;
        const toVal = (opt as Record<string, unknown>).to;
        if (typeof toVal !== "string") continue;
        const label =
          typeof (opt as Record<string, unknown>).label === "string"
            ? ((opt as Record<string, unknown>).label as string)
            : optionLabels[o] ?? `Option ${o + 1}`;
        patchOptions.push({
          label,
          patch: { from: fromStr, to: toVal, span: spanStr },
        });
      }
    }

    if (patchOptions.length > 0 && !hasSinglePatch) {
      patch = patchOptions[0].patch;
    }

    findings.push({
      id: typeof finding.finding_id === "string" ? finding.finding_id : undefined,
      comment: typeof finding.comment === "string" ? finding.comment : "",
      patch,
      severity: typeof finding.severity === "string" ? finding.severity : undefined,
    });

    const suggestions: string[] = [];
    if (Array.isArray(finding.suggestions)) {
      for (const s of finding.suggestions) {
        if (typeof s === "string") suggestions.push(s);
      }
    }
    const tags: string[] = [];
    if (Array.isArray(finding.tags)) {
      for (const t of finding.tags) {
        if (typeof t === "string") tags.push(t);
      }
    }
    const hasPatch = hasSinglePatch || patchOptions.length > 0;
    findingMeta.push({
      rationale: typeof finding.rationale === "string" ? finding.rationale : undefined,
      tradeoff: typeof finding.tradeoff === "string" ? finding.tradeoff : undefined,
      suggestions: suggestions.length ? suggestions : undefined,
      agent_id: typeof finding.agent_id === "string" ? finding.agent_id : undefined,
      tags: tags.length ? tags : undefined,
      hasPatch,
      patchOptions: patchOptions.length > 1 ? patchOptions : undefined,
    });
  }

  const summary: Summary | undefined =
    obj.summary !== null && typeof obj.summary === "object" && !Array.isArray(obj.summary)
      ? (obj.summary as Summary)
      : undefined;

  const docComments: DocComment[] = [];
  if (Array.isArray(obj.doc_comments)) {
    for (const dc of obj.doc_comments) {
      if (dc === null || typeof dc !== "object" || Array.isArray(dc)) continue;
      const d = dc as Record<string, unknown>;
      const patchObj = d.patch as Record<string, unknown> | undefined;
      const hasPatch =
        patchObj &&
        typeof patchObj.from === "string" &&
        typeof patchObj.to === "string" &&
        (patchObj.to as string) !== (patchObj.from as string);
      const suggestions: string[] = [];
      if (Array.isArray(d.suggestions)) {
        for (const s of d.suggestions) {
          if (typeof s === "string") suggestions.push(s);
        }
      }
      docComments.push({
        agent_id: typeof d.agent_id === "string" ? d.agent_id : undefined,
        severity: typeof d.severity === "string" ? d.severity : undefined,
        comment: typeof d.comment === "string" ? d.comment : undefined,
        rationale: typeof d.rationale === "string" ? d.rationale : undefined,
        confidence: typeof d.confidence === "string" ? d.confidence : undefined,
        anchor_quote: typeof d.anchor_quote === "string" ? d.anchor_quote : undefined,
        patch: hasPatch ? { from: patchObj!.from as string, to: patchObj!.to as string } : undefined,
        suggestions: suggestions.length ? suggestions : undefined,
      });
    }
  }

  return {
    session: { session_id: sessionId, findings },
    summary: summary ?? undefined,
    doc_comments: docComments.length ? docComments : undefined,
    findingMeta: findingMeta.length ? findingMeta : undefined,
  };
}

export function parseSessionJson(raw: string): ParseSessionResult {
  const trimmed = raw.trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { error: "Invalid JSON" };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { error: "Expected a JSON object" };
  }
  const obj = parsed as Record<string, unknown>;

  if (isRbSessionV1(obj)) {
    return parseRbSessionV1Format(obj);
  }
  return parseSimpleFormat(obj);
}
