import React, { useState, useMemo, useCallback, useEffect } from "react";
import type { Session, Finding, Summary, DocComment, FindingMeta, PersistedSessionState } from "../types";
import { applyPatch } from "../patchApply";

/* Low-vision friendly: larger base sizes, 1.5 line-height, higher contrast (avoid muted for body text). */
const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    flex: 1,
    minHeight: 0,
    backgroundColor: "var(--background-primary)",
    color: "var(--text-normal)",
    fontSize: "max(1.0625rem, var(--font-ui-large))",
    lineHeight: 1.5,
  },
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px 0",
    borderBottom: "1px solid var(--background-modifier-border)",
  },
  list: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    overflow: "auto",
    flex: 1,
    minHeight: 0,
  },
  item: {
    padding: "10px 12px",
    backgroundColor: "var(--background-secondary)",
    borderRadius: "4px",
    cursor: "pointer",
    border: "1px solid var(--background-modifier-border)",
  },
  itemExpanded: {
    padding: "12px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  /** List item when LLM said "good" / no revisions — distinct from items with edits. */
  itemNoRevision: {
    borderLeft: "4px solid var(--interactive-success, #30a14e)",
    backgroundColor: "var(--background-secondary-alt, rgba(46, 160, 67, 0.08))",
  },
  noRevisionBadge: {
    fontSize: "max(0.875rem, var(--font-ui-small))",
    color: "var(--interactive-success, #30a14e)",
    fontWeight: 600,
  },
  comment: {
    fontSize: "max(1.0625rem, var(--font-ui-large))",
    color: "var(--text-normal)",
    lineHeight: 1.5,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  preview: {
    fontSize: "max(1rem, var(--font-ui-medium))",
    fontFamily: "var(--font-monospace-theme, var(--font-monospace, monospace))",
    color: "var(--text-normal)",
    lineHeight: 1.5,
    padding: "8px",
    backgroundColor: "var(--background-primary-alt)",
    borderRadius: "4px",
    overflow: "auto",
  },
  fromTo: {
    marginTop: "4px",
  },
  buttons: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
  },
  btn: {
    padding: "8px 14px",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "max(1rem, var(--font-ui-medium))",
  },
  btnAccept: {
    backgroundColor: "var(--interactive-accent)",
    color: "var(--text-on-accent)",
  },
  btnIgnore: {
    backgroundColor: "var(--background-modifier-border)",
    color: "var(--text-normal)",
  },
  btnCopy: {
    backgroundColor: "var(--interactive-accent)",
    color: "var(--text-on-accent)",
  },
  overlay: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  modalContent: {
    backgroundColor: "var(--background-primary)",
    color: "var(--text-normal)",
    padding: "16px",
    borderRadius: "8px",
    maxWidth: "90%",
    maxHeight: "80%",
    overflow: "auto",
    border: "1px solid var(--background-modifier-border)",
    boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
    fontSize: "max(1rem, var(--font-ui-medium))",
    lineHeight: 1.5,
  },
  toast: {
    padding: "8px",
    backgroundColor: "var(--background-modifier-error)",
    color: "var(--text-on-accent)",
    borderRadius: "4px",
    fontSize: "max(1rem, var(--font-ui-medium))",
    lineHeight: 1.5,
  },
  attachedLabel: {
    fontSize: "max(0.9375rem, var(--font-ui-small))",
    color: "var(--text-normal)",
    lineHeight: 1.5,
    marginBottom: "4px",
  },
  attachedSnippet: {
    fontSize: "max(1rem, var(--font-ui-medium))",
    fontFamily: "var(--font-monospace-theme, var(--font-monospace, monospace))",
    color: "var(--text-normal)",
    lineHeight: 1.5,
    padding: "8px",
    backgroundColor: "var(--background-primary-alt)",
    borderRadius: "4px",
    overflow: "auto",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  highlight: {
    backgroundColor: "var(--text-selection)",
    borderRadius: "2px",
    padding: "0 1px",
  },
  /** Highlight for original text in the "In your note" snippet — clearly shows an edit is available to review. */
  editAvailableHighlight: {
    backgroundColor: "var(--background-modifier-hover)",
    borderLeft: "3px solid var(--interactive-accent)",
    borderRadius: "2px",
    padding: "2px 4px",
    margin: "0 1px",
  },
  summarySection: {
    border: "1px solid var(--background-modifier-border)",
    borderRadius: "4px",
    overflow: "hidden",
  },
  summaryHeader: {
    padding: "10px 12px",
    backgroundColor: "var(--background-secondary)",
    cursor: "pointer",
    fontSize: "max(1rem, var(--font-ui-medium))",
    fontWeight: 600,
    lineHeight: 1.5,
  },
  summaryBody: {
    padding: "12px 14px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    fontSize: "max(1rem, var(--font-ui-medium))",
    lineHeight: 1.5,
    maxHeight: "320px",
    overflowY: "auto",
  },
  summaryParagraph: {
    margin: 0,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  summaryList: {
    margin: 0,
    paddingLeft: "18px",
  },
  summaryListTitle: {
    fontSize: "max(0.9375rem, var(--font-ui-small))",
    color: "var(--text-normal)",
    lineHeight: 1.5,
    marginTop: "4px",
    marginBottom: "2px",
  },
  docCommentsSection: {
    border: "1px solid var(--background-modifier-border)",
    borderRadius: "4px",
    overflow: "hidden",
  },
  docCommentsHeader: {
    padding: "10px 12px",
    backgroundColor: "var(--background-secondary)",
    cursor: "pointer",
    fontSize: "max(1rem, var(--font-ui-medium))",
    fontWeight: 600,
    lineHeight: 1.5,
  },
  docCommentsBody: {
    padding: "10px",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    maxHeight: "400px",
    overflowY: "auto",
  },
  docCommentItem: {
    padding: "10px 12px",
    backgroundColor: "var(--background-primary-alt)",
    borderRadius: "4px",
    fontSize: "max(1rem, var(--font-ui-medium))",
    lineHeight: 1.5,
    maxHeight: "220px",
    overflowY: "auto",
  },
  docCommentItemExpanded: {
    maxHeight: "none",
    minHeight: "120px",
    borderLeft: "3px solid var(--interactive-accent)",
    backgroundColor: "var(--background-secondary)",
  },
  docCommentAgent: {
    fontSize: "max(0.9375rem, var(--font-ui-small))",
    color: "var(--text-normal)",
    lineHeight: 1.5,
    marginBottom: "4px",
  },
  docCommentSeverity: {
    fontSize: "max(0.875rem, var(--font-ui-small))",
    marginLeft: "8px",
  },
  severityImportant: { color: "var(--text-error)" },
  severitySuggestion: { color: "var(--text-accent)" },
  metaLabel: {
    fontSize: "max(0.9375rem, var(--font-ui-small))",
    color: "var(--text-normal)",
    lineHeight: 1.5,
    marginTop: "6px",
    marginBottom: "2px",
  },
  suggestionsList: {
    margin: 0,
    paddingLeft: "18px",
    fontSize: "max(1rem, var(--font-ui-medium))",
    lineHeight: 1.5,
  },
  singleFindingCard: {
    padding: "12px",
    backgroundColor: "var(--background-secondary)",
    borderRadius: "4px",
    border: "1px solid var(--background-modifier-border)",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
  },
  navRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px 0",
    borderBottom: "1px solid var(--background-modifier-border)",
  },
  navLabel: {
    fontSize: "max(0.9375rem, var(--font-ui-small))",
    color: "var(--text-normal)",
    minWidth: "4ch",
  },
  tabBar: {
    display: "flex",
    gap: "0",
    borderBottom: "1px solid var(--background-modifier-border)",
    flexShrink: 0,
  },
  tab: {
    padding: "8px 14px",
    border: "none",
    borderBottom: "2px solid transparent",
    backgroundColor: "transparent",
    color: "var(--text-muted)",
    cursor: "pointer",
    fontSize: "max(0.9375rem, var(--font-ui-small))",
    fontWeight: 500,
  },
  tabActive: {
    color: "var(--text-normal)",
    borderBottomColor: "var(--interactive-accent)",
  },
  tabPanel: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
};

export interface RevisionBuddyObsidianUIProps {
  initialText: string;
  session: Session;
  persistKey: string;
  summary?: Summary;
  doc_comments?: DocComment[];
  findingMeta?: FindingMeta[];
  initialAcceptedIndices?: number[];
  initialIgnoredIndices?: number[];
  /** Persisted: finding index -> option index (string keys from JSON). */
  initialAcceptedOptionByIndex?: Record<string, number>;
  /** Persisted: index of the finding shown in single-comment view. */
  initialSelectedFindingIndex?: number;
  rawJson: string;
  onPersistState?: (state: PersistedSessionState) => void;
  onExportText?: (text: string) => void;
  onToast?: (message: string) => void;
  onJumpToInSource?: (searchText: string, fallbackSearchText?: string) => void;
  onHighlightInSource?: (span: string | null) => void;
  /** When present, suggestion-only findings show "Ask for quick revision" (jump + nano model). */
  onQuickRevision?: (spanText: string, fallbackSearchText?: string, suggestionContext?: string) => void;
  /** Apply a suggestion to the source file (Option A / B from suggestions array). */
  onApplySuggestion?: (spanText: string, replacementText: string) => void | Promise<void>;
}

function getAllAcceptedIndices(acceptedIndices: Set<number>, acceptedOptionByIndex: Record<number, number>): Set<number> {
  const set = new Set(acceptedIndices);
  for (const key of Object.keys(acceptedOptionByIndex)) {
    set.add(Number(key));
  }
  return set;
}

function computeCurrentText(
  initialText: string,
  session: Session,
  acceptedIndices: Set<number>,
  findingMeta: FindingMeta[] | undefined,
  acceptedOptionByIndex: Record<number, number>,
  maxIndex?: number
): string {
  const allAccepted = getAllAcceptedIndices(acceptedIndices, acceptedOptionByIndex);
  const order = [...allAccepted].filter((i) => maxIndex === undefined || i < maxIndex).sort((a, b) => a - b);
  let text = initialText;
  for (const i of order) {
    const finding = session.findings[i];
    if (!finding) continue;
    const meta = findingMeta?.[i];
    const patch =
      meta?.patchOptions && acceptedOptionByIndex[i] !== undefined
        ? meta.patchOptions[acceptedOptionByIndex[i]]?.patch
        : finding.patch;
    if (!patch) continue;
    const result = applyPatch(text, patch);
    if (result.ok) text = result.text;
  }
  return text;
}

/** Text as it would be when we're about to apply the finding at given index (only earlier acceptances applied). */
function getTextForFinding(
  initialText: string,
  session: Session,
  acceptedIndices: Set<number>,
  findingMeta: FindingMeta[] | undefined,
  acceptedOptionByIndex: Record<number, number>,
  findingIndex: number
): string {
  return computeCurrentText(initialText, session, acceptedIndices, findingMeta, acceptedOptionByIndex, findingIndex);
}

/** Return a snippet of text with the match highlighted: { before, match, after } or null if not found. */
function getSnippetWithMatch(text: string, search: string, contextChars = 50): { before: string; match: string; after: string } | null {
  if (!search) return null;
  const pos = text.indexOf(search);
  if (pos === -1) return null;
  const start = Math.max(0, pos - contextChars);
  const end = Math.min(text.length, pos + search.length + contextChars);
  return {
    before: (start > 0 ? "…" : "") + text.slice(start, pos),
    match: text.slice(pos, pos + search.length),
    after: text.slice(pos + search.length, end) + (end < text.length ? "…" : ""),
  };
}

export function RevisionBuddyObsidianUI(props: RevisionBuddyObsidianUIProps) {
  const {
    initialText,
    session,
    persistKey,
    summary,
    doc_comments,
    findingMeta,
    initialAcceptedIndices,
    initialIgnoredIndices,
    initialAcceptedOptionByIndex,
    initialSelectedFindingIndex,
    rawJson,
    onPersistState,
    onExportText,
    onToast,
    onJumpToInSource,
    onHighlightInSource,
    onQuickRevision,
    onApplySuggestion,
  } = props;
  const findings = session.findings;
  const [acceptedIndices, setAcceptedIndices] = useState<Set<number>>(() => new Set(initialAcceptedIndices ?? []));
  const [ignoredIndices, setIgnoredIndices] = useState<Set<number>>(() => new Set(initialIgnoredIndices ?? []));
  const [acceptedOptionByIndex, setAcceptedOptionByIndex] = useState<Record<number, number>>(() => {
    const raw = initialAcceptedOptionByIndex;
    if (!raw || typeof raw !== "object") return {};
    const out: Record<number, number> = {};
    for (const [k, v] of Object.entries(raw)) {
      const idx = Number(k);
      if (Number.isInteger(idx) && Number.isInteger(v)) out[idx] = v;
    }
    return out;
  });
  const [selectedFindingIndex, setSelectedFindingIndex] = useState<number>(() => {
    const n = findings.length;
    if (n === 0) return 0;
    const raw = initialSelectedFindingIndex ?? 0;
    return Math.min(Math.max(0, raw), n - 1);
  });
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  type TabId = "summary" | "comments" | "line-edits";
  const [activeTab, setActiveTab] = useState<TabId>("line-edits");
  const [expandedDocCommentIndex, setExpandedDocCommentIndex] = useState<number | null>(null);

  // Clamp selected index when session has fewer findings (e.g. different file or reload)
  useEffect(() => {
    const n = findings.length;
    if (n === 0) return;
    if (selectedFindingIndex >= n) {
      setSelectedFindingIndex(Math.max(0, n - 1));
    }
  }, [findings.length, selectedFindingIndex]);

  // When presenting a line edit, highlight its associated span in the source editor
  useEffect(() => {
    if (!onHighlightInSource) return;
    if (activeTab !== "line-edits") {
      onHighlightInSource(null);
      return;
    }
    const finding = findings[selectedFindingIndex] ?? null;
    const span = finding ? (finding.patch.span ?? finding.patch.from) : null;
    onHighlightInSource(span && span.length > 0 ? span : null);
  }, [activeTab, selectedFindingIndex, findings, onHighlightInSource]);

  useEffect(() => {
    if (onPersistState) {
      const acceptedOptionByIndexForPersist: Record<string, number> = {};
      for (const [k, v] of Object.entries(acceptedOptionByIndex)) {
        acceptedOptionByIndexForPersist[String(k)] = v;
      }
      onPersistState({
        rawJson,
        acceptedIndices: Array.from(acceptedIndices),
        ignoredIndices: Array.from(ignoredIndices),
        acceptedOptionByIndex: Object.keys(acceptedOptionByIndexForPersist).length > 0 ? acceptedOptionByIndexForPersist : undefined,
        selectedFindingIndex,
      });
    }
  }, [rawJson, acceptedIndices, ignoredIndices, acceptedOptionByIndex, selectedFindingIndex, onPersistState]);

  const showToast = useCallback(
    (msg: string) => {
      if (onToast) onToast(msg);
      else setToastMessage(msg);
    },
    [onToast]
  );

  const currentText = useMemo(
    () => computeCurrentText(initialText, session, acceptedIndices, findingMeta, acceptedOptionByIndex),
    [initialText, session, acceptedIndices, findingMeta, acceptedOptionByIndex]
  );

  const canAcceptFinding = useCallback(
    (index: number) => {
      if (findingMeta && findingMeta[index]?.hasPatch === false) return false;
      return true;
    },
    [findingMeta]
  );

  const handleAccept = useCallback(
    (index: number) => {
      if (!canAcceptFinding(index)) return;
      if (acceptedIndices.has(index) || ignoredIndices.has(index) || acceptedOptionByIndex[index] !== undefined) return;
      const finding = session.findings[index];
      if (!finding) return;
      const textSoFar = computeCurrentText(initialText, session, acceptedIndices, findingMeta, acceptedOptionByIndex);
      const result = applyPatch(textSoFar, finding.patch);
      if (result.ok) {
        setAcceptedIndices((prev) => new Set(prev).add(index));
        setSelectedFindingIndex((i) => Math.min(i + 1, session.findings.length - 1));
      } else {
        showToast(result.reason);
      }
    },
    [session, initialText, acceptedIndices, acceptedOptionByIndex, ignoredIndices, findingMeta, showToast, canAcceptFinding]
  );

  const handleAcceptOption = useCallback(
    (findingIndex: number, optionIndex: number) => {
      if (acceptedIndices.has(findingIndex) || ignoredIndices.has(findingIndex) || acceptedOptionByIndex[findingIndex] !== undefined) return;
      const meta = findingMeta?.[findingIndex];
      const optionPatch = meta?.patchOptions?.[optionIndex]?.patch;
      if (!optionPatch) return;
      const textSoFar = computeCurrentText(initialText, session, acceptedIndices, findingMeta, acceptedOptionByIndex);
      const result = applyPatch(textSoFar, optionPatch);
      if (result.ok) {
        setAcceptedOptionByIndex((prev) => ({ ...prev, [findingIndex]: optionIndex }));
        setAcceptedIndices((prev) => new Set(prev).add(findingIndex));
        setSelectedFindingIndex((i) => Math.min(i + 1, session.findings.length - 1));
      } else {
        showToast(result.reason);
      }
    },
    [session, initialText, acceptedIndices, acceptedOptionByIndex, ignoredIndices, findingMeta, showToast]
  );

  const handleIgnore = useCallback(
    (index: number) => {
      setIgnoredIndices((prev) => new Set(prev).add(index));
      setSelectedFindingIndex((i) => Math.min(i + 1, session.findings.length - 1));
    },
    [session.findings.length]
  );

  const handleCopyText = useCallback(() => {
    navigator.clipboard.writeText(currentText).then(
      () => {
        showToast("Copied revised text to clipboard");
        onExportText?.(currentText);
      },
      () => showToast("Failed to copy")
    );
  }, [currentText, onExportText, showToast]);

  const currentFinding = findings[selectedFindingIndex] ?? null;

  return (
    <div style={styles.container}>
      <div style={styles.toolbar}>
        <button type="button" style={{ ...styles.btn, ...styles.btnCopy }} onClick={handleCopyText}>
          Copy text
        </button>
      </div>

      {toastMessage && (
        <div style={styles.toast} role="alert">
          {toastMessage}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        <div style={styles.tabBar} role="tablist" aria-label="Summary, comments, and line edits">
          {(["summary", "comments", "line-edits"] as const).map((tabId) => (
            <button
              key={tabId}
              type="button"
              role="tab"
              aria-selected={activeTab === tabId}
              aria-controls={`panel-${tabId}`}
              id={`tab-${tabId}`}
              style={{
                ...styles.tab,
                ...(activeTab === tabId ? styles.tabActive : {}),
              }}
              onClick={() => setActiveTab(tabId)}
            >
              {tabId === "summary" ? "Summary" : tabId === "comments" ? "Comments" : "Line edits"}
            </button>
          ))}
        </div>
        <div
          id="panel-summary"
          role="tabpanel"
          aria-labelledby="tab-summary"
          hidden={activeTab !== "summary"}
          style={{ ...styles.tabPanel, ...(activeTab !== "summary" ? { display: "none" } : {}) }}
        >
          {summary && (summary.big_picture || summary.what_improved?.length || summary.top_risks?.length || summary.recommended_next_pass) ? (
            <div style={styles.summarySection}>
              <div style={{ ...styles.summaryBody, maxHeight: "none" }}>
                {summary.big_picture && (
                  <p style={styles.summaryParagraph}>{summary.big_picture}</p>
                )}
                {summary.what_improved && summary.what_improved.length > 0 && (
                  <>
                    <div style={styles.summaryListTitle}>What improved</div>
                    <ul style={styles.summaryList}>
                      {summary.what_improved.map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  </>
                )}
                {summary.top_risks && summary.top_risks.length > 0 && (
                  <>
                    <div style={styles.summaryListTitle}>Top risks</div>
                    <ul style={styles.summaryList}>
                      {summary.top_risks.map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  </>
                )}
                {summary.recommended_next_pass && (
                  <p style={styles.summaryParagraph}>{summary.recommended_next_pass}</p>
                )}
              </div>
            </div>
          ) : (
            <div style={styles.singleFindingCard}>
              <div style={styles.comment}>No summary available.</div>
            </div>
          )}
        </div>
        <div
          id="panel-comments"
          role="tabpanel"
          aria-labelledby="tab-comments"
          hidden={activeTab !== "comments"}
          style={{ ...styles.tabPanel, ...(activeTab !== "comments" ? { display: "none" } : {}) }}
        >
          {doc_comments && doc_comments.length > 0 ? (
            <div style={styles.docCommentsSection}>
              <div style={{ ...styles.docCommentsBody, maxHeight: "none" }}>
                {doc_comments.map((dc, i) => {
                  const isExpanded = expandedDocCommentIndex === i;
                  const handleClick = () => {
                    if (isExpanded) {
                      setExpandedDocCommentIndex(null);
                      onHighlightInSource?.(null);
                    } else {
                      setExpandedDocCommentIndex(i);
                      if (dc.anchor_quote) {
                        onJumpToInSource?.(dc.anchor_quote);
                        onHighlightInSource?.(dc.anchor_quote);
                      } else {
                        onHighlightInSource?.(null);
                      }
                    }
                  };
                  return (
                    <div
                      key={i}
                      style={{
                        ...styles.docCommentItem,
                        ...(isExpanded ? styles.docCommentItemExpanded : {}),
                        cursor: "pointer",
                      }}
                      onClick={handleClick}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === "Enter" && handleClick()}
                    >
                      <div style={styles.docCommentAgent}>
                        {dc.agent_id ?? "Agent"}
                        {dc.severity && (
                          <span
                            style={{
                              ...styles.docCommentSeverity,
                              ...(dc.severity === "important" ? styles.severityImportant : styles.severitySuggestion),
                            }}
                          >
                            {dc.severity}
                          </span>
                        )}
                      </div>
                      {dc.comment && <div style={styles.comment}>{dc.comment}</div>}
                      {dc.rationale && (
                        <div style={{ ...styles.metaLabel, marginTop: "4px" }}>{dc.rationale}</div>
                      )}
                      {dc.confidence && (
                        <div style={styles.metaLabel}>Confidence: {dc.confidence}</div>
                      )}
                      {!dc.anchor_quote ? null : (dc.patch || (dc.suggestions && dc.suggestions.length > 0)) ? (
                        <>
                          <div style={{ ...styles.metaLabel, marginTop: "6px" }}>Recommended edit</div>
                          {dc.patch && (
                            <div style={styles.preview}>
                              <div>from: {dc.patch.from}</div>
                              <div style={styles.fromTo}>to: {dc.patch.to}</div>
                            </div>
                          )}
                          {dc.suggestions && dc.suggestions.length > 0 && (
                            <ul style={styles.suggestionsList}>
                              {dc.suggestions.map((s, si) => (
                                <li key={si}>{s}</li>
                              ))}
                            </ul>
                          )}
                        </>
                      ) : null}
                      <div style={{ ...styles.metaLabel, marginTop: "6px", color: "var(--interactive-accent)" }}>
                        {isExpanded
                          ? "Click to collapse"
                          : dc.anchor_quote
                            ? "Click to expand and go to in document"
                            : "Click to expand"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div style={styles.singleFindingCard}>
              <div style={styles.comment}>No doc comments.</div>
            </div>
          )}
        </div>
        <div
          id="panel-line-edits"
          role="tabpanel"
          aria-labelledby="tab-line-edits"
          hidden={activeTab !== "line-edits"}
          style={{ ...styles.tabPanel, ...(activeTab !== "line-edits" ? { display: "none" } : {}) }}
        >
          {findings.length === 0 ? (
            <div style={styles.singleFindingCard}>
              <div style={styles.comment}>No findings to review.</div>
            </div>
          ) : (
            <>
              <div style={styles.navRow}>
                <button
                  type="button"
                  style={{ ...styles.btn, ...styles.btnIgnore }}
                  onClick={() => setSelectedFindingIndex((i) => Math.max(0, i - 1))}
                  disabled={selectedFindingIndex <= 0}
                  aria-label="Previous finding"
                >
                  Previous
                </button>
                <span style={styles.navLabel} aria-live="polite">
                  {selectedFindingIndex + 1} of {findings.length}
                </span>
                <button
                  type="button"
                  style={{ ...styles.btn, ...styles.btnIgnore }}
                  onClick={() => setSelectedFindingIndex((i) => Math.min(findings.length - 1, i + 1))}
                  disabled={selectedFindingIndex >= findings.length - 1}
                  aria-label="Next finding"
                >
                  Next
                </button>
              </div>
              {currentFinding && (
                <div style={styles.singleFindingCard}>
                  <FindingDetail
                    finding={currentFinding}
                    index={selectedFindingIndex}
                    meta={findingMeta?.[selectedFindingIndex]}
                    attachedSnippet={getSnippetWithMatch(
                      getTextForFinding(initialText, session, acceptedIndices, findingMeta, acceptedOptionByIndex, selectedFindingIndex),
                      currentFinding.patch.span ?? currentFinding.patch.from
                    )}
                    onAccept={() => handleAccept(selectedFindingIndex)}
                    onAcceptOption={
                      findingMeta?.[selectedFindingIndex]?.patchOptions && findingMeta[selectedFindingIndex].patchOptions!.length > 1
                        ? (optionIndex) => handleAcceptOption(selectedFindingIndex, optionIndex)
                        : undefined
                    }
                    acceptedOptionIndex={acceptedOptionByIndex[selectedFindingIndex]}
                    onIgnore={() => handleIgnore(selectedFindingIndex)}
                    onOpenModal={() => {}}
                    onJumpToInSource={
                      onJumpToInSource
                        ? () => {
                            const primary = currentFinding.patch.span ?? currentFinding.patch.from;
                            const fallback = primary !== currentFinding.patch.from ? currentFinding.patch.from : undefined;
                            onJumpToInSource(primary, fallback);
                          }
                        : undefined
                    }
                    onQuickRevision={
                      onQuickRevision && !canAcceptFinding(selectedFindingIndex)
                        ? () => {
                            const primary = currentFinding.patch.span ?? currentFinding.patch.from;
                            const fallback = primary !== currentFinding.patch.from ? currentFinding.patch.from : undefined;
                            const suggestionParts: string[] = [currentFinding.comment];
                            const meta = findingMeta?.[selectedFindingIndex];
                            if (meta?.suggestions?.length) {
                              suggestionParts.push(meta.suggestions.join(" "));
                            }
                            onQuickRevision(primary, fallback, suggestionParts.join("\n\n"));
                          }
                        : undefined
                    }
                    onApplySuggestion={
                      onApplySuggestion && !canAcceptFinding(selectedFindingIndex)
                        ? (replacementText: string) => {
                            const spanText = currentFinding.patch.span ?? currentFinding.patch.from;
                            onApplySuggestion(spanText, replacementText);
                          }
                        : undefined
                    }
                    disabledAccept={
                      acceptedIndices.has(selectedFindingIndex) ||
                      ignoredIndices.has(selectedFindingIndex) ||
                      acceptedOptionByIndex[selectedFindingIndex] !== undefined ||
                      !canAcceptFinding(selectedFindingIndex)
                    }
                    disabledIgnore={acceptedIndices.has(selectedFindingIndex) || ignoredIndices.has(selectedFindingIndex)}
                    showFull
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function FindingDetail({
  finding,
  index,
  meta,
  attachedSnippet,
  onAccept,
  onAcceptOption,
  acceptedOptionIndex,
  onIgnore,
  onOpenModal,
  onJumpToInSource,
  onQuickRevision,
  onApplySuggestion,
  disabledAccept,
  disabledIgnore,
  showFull,
}: {
  finding: Finding;
  index: number;
  meta?: FindingMeta | null;
  attachedSnippet: { before: string; match: string; after: string } | null;
  onAccept: () => void;
  onAcceptOption?: (optionIndex: number) => void;
  acceptedOptionIndex?: number;
  onIgnore: () => void;
  onOpenModal: () => void;
  onJumpToInSource?: () => void;
  onQuickRevision?: () => void;
  onApplySuggestion?: (replacementText: string) => void;
  disabledAccept: boolean;
  disabledIgnore: boolean;
  showFull?: boolean;
}) {
  const comment = showFull ? finding.comment : finding.comment.slice(0, 300) + (finding.comment.length > 300 ? "…" : "");
  const applyable = meta?.hasPatch !== false;
  const isNoRevision = meta?.hasPatch === false;
  const hasMultipleOptions = meta?.patchOptions && meta.patchOptions.length > 1;
  const showSingleAccept = applyable && !hasMultipleOptions;
  // #region agent log
  fetch('http://127.0.0.1:7246/ingest/96b8c0e4-6f21-4b34-aa7b-a6e041b19d43',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'RevisionBuddyObsidianUI.tsx:FindingDetail',message:'detail render',data:{index,applyable,hasMultipleOptions,suggestionsLength:meta?.suggestions?.length ?? 0,patchOptionsLength:meta?.patchOptions?.length ?? 0,disabledAccept,showSingleAccept},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
  // #endregion
  return (
    <>
      {isNoRevision && (
        <div style={{ ...styles.metaLabel, color: "var(--interactive-success, #30a14e)", marginBottom: "6px", fontWeight: 600 }}>
          No edits suggested — this part was approved as-is.
        </div>
      )}
      <div style={styles.comment}>{comment}</div>
      {meta?.rationale && (
        <>
          <div style={styles.metaLabel}>Rationale</div>
          <div style={styles.comment}>{meta.rationale}</div>
        </>
      )}
      {meta?.tradeoff && (
        <>
          <div style={styles.metaLabel}>Tradeoff</div>
          <div style={styles.comment}>{meta.tradeoff}</div>
        </>
      )}
      {meta?.suggestions && meta.suggestions.length > 0 && (
        <>
          <div style={styles.metaLabel}>Suggestions</div>
          {onApplySuggestion && meta.suggestions && meta.suggestions.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ ...styles.metaLabel, marginBottom: "4px" }}>Apply to document:</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {meta.suggestions.map((text, optIdx) => {
                  const label = ["Option A", "Option B", "Option C", "Option D", "Option E"][optIdx] ?? `Option ${optIdx + 1}`;
                  const preview = text.length > 80 ? text.slice(0, 80) + "…" : text;
                  return (
                    <div key={optIdx} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <button
                        type="button"
                        style={{ ...styles.btn, ...styles.btnAccept }}
                        onClick={() => onApplySuggestion(text)}
                        aria-label={label}
                      >
                        {label}
                      </button>
                      <div style={{ ...styles.preview, padding: "6px 8px", fontSize: "max(0.9375rem, var(--font-ui-small))" }}>
                        {preview}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <ul style={styles.suggestionsList}>
              {meta.suggestions.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          )}
        </>
      )}
      {attachedSnippet ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <div style={styles.attachedLabel}>In your note (edit available):</div>
          <div style={styles.attachedSnippet}>
            {attachedSnippet.before}
            <span style={styles.editAvailableHighlight}>{attachedSnippet.match}</span>
            {attachedSnippet.after}
          </div>
        </div>
      ) : (
        <div style={styles.attachedLabel}>Not found in current document (wrong file or already changed).</div>
      )}
      {applyable && !hasMultipleOptions && (
        <div style={styles.preview}>
          <div>from: {finding.patch.from}</div>
          <div style={styles.fromTo}>to: {finding.patch.to}</div>
        </div>
      )}
      {hasMultipleOptions && meta.patchOptions && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={styles.metaLabel}>Choose a fix:</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {meta.patchOptions.map((opt, optIdx) => (
              <div key={optIdx} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <button
                  type="button"
                  style={{ ...styles.btn, ...styles.btnAccept }}
                  onClick={() => onAcceptOption?.(optIdx)}
                  disabled={disabledAccept || acceptedOptionIndex !== undefined}
                  aria-label={opt.label}
                >
                  {opt.label}
                </button>
                <div style={{ ...styles.preview, padding: "6px 8px", fontSize: "max(0.9375rem, var(--font-ui-small))" }}>
                  to: {opt.patch.to.length > 80 ? opt.patch.to.slice(0, 80) + "…" : opt.patch.to}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {!applyable && (
        <div style={styles.metaLabel}>Suggestion only (no patch to apply)</div>
      )}
      <div style={styles.buttons}>
        {onJumpToInSource && (
          <button
            type="button"
            style={{ ...styles.btn, ...styles.btnAccept }}
            onClick={onJumpToInSource}
          >
            Go to in document
          </button>
        )}
        {onQuickRevision && !applyable && (
          <button
            type="button"
            style={{ ...styles.btn, ...styles.btnAccept }}
            onClick={onQuickRevision}
          >
            Ask for quick revision
          </button>
        )}
        {showSingleAccept && (
          <button
            type="button"
            style={{ ...styles.btn, ...styles.btnAccept }}
            onClick={onAccept}
            disabled={disabledAccept}
          >
            Accept
          </button>
        )}
        <button
          type="button"
          style={{ ...styles.btn, ...styles.btnIgnore }}
          onClick={onIgnore}
          disabled={disabledIgnore}
        >
          Mark complete
        </button>
        {!showFull && (
          <button
            type="button"
            style={{ ...styles.btn, ...styles.btnIgnore }}
            onClick={(e) => {
              e.stopPropagation();
              onOpenModal();
            }}
          >
            Open in modal
          </button>
        )}
      </div>
    </>
  );
}
