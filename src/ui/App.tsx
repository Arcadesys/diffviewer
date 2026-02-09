import React, { useState, useCallback, useEffect } from "react";
import type { Session, ParseSessionResult, SessionWithMeta, PersistedSessionState } from "../types";
import { parseSessionJson } from "../types";
import { RevisionBuddyObsidianUI } from "./RevisionBuddyObsidianUI";

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: "12px",
    height: "100%",
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    backgroundColor: "var(--background-primary)",
    color: "var(--text-normal)",
    boxSizing: "border-box",
    fontSize: "max(1rem, var(--font-ui-medium))",
    lineHeight: 1.5,
    overflow: "auto",
  },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  label: {
    fontSize: "max(0.9375rem, var(--font-ui-small))",
    color: "var(--text-normal)",
    lineHeight: 1.5,
  },
  textarea: {
    width: "100%",
    minHeight: "120px",
    padding: "8px",
    fontFamily: "var(--font-monospace-theme, var(--font-monospace, monospace))",
    fontSize: "max(1rem, var(--font-ui-medium))",
    lineHeight: 1.5,
    backgroundColor: "var(--background-primary-alt)",
    color: "var(--text-normal)",
    border: "1px solid var(--background-modifier-border)",
    borderRadius: "4px",
    resize: "vertical",
    boxSizing: "border-box",
  },
  button: {
    padding: "8px 14px",
    backgroundColor: "var(--interactive-accent)",
    color: "var(--text-on-accent)",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "max(1rem, var(--font-ui-medium))",
  },
  error: {
    padding: "8px",
    backgroundColor: "var(--background-modifier-error)",
    color: "var(--text-on-accent)",
    borderRadius: "4px",
    fontSize: "max(1rem, var(--font-ui-medium))",
    lineHeight: 1.5,
  },
};

export interface AppProps {
  initialText: string;
  persistKey: string;
  persistedState?: PersistedSessionState | null;
  onPersistState?: (state: PersistedSessionState) => void;
  onExportText?: (text: string) => void;
  onToast?: (message: string) => void;
  onJumpToInSource?: (searchText: string, fallbackSearchText?: string) => void;
  onHighlightInSource?: (span: string | null) => void;
  onSessionChange?: (path: string, spans: string[]) => void;
}

export function App(props: AppProps) {
  const { initialText, persistKey, persistedState, onPersistState, onExportText, onToast, onJumpToInSource, onHighlightInSource, onSessionChange } = props;
  const [rawJson, setRawJson] = useState(persistedState?.rawJson ?? "");
  const [parseResult, setParseResult] = useState<ParseSessionResult | null>(null);

  // Restore session from persisted state when we have one (e.g. after reopen)
  useEffect(() => {
    if (persistedState?.rawJson) {
      const result = parseSessionJson(persistedState.rawJson);
      setParseResult(result);
    }
  }, [persistedState?.rawJson]);

  // Tell the plugin which spans to highlight in the editor when session is loaded
  useEffect(() => {
    if (!onSessionChange) return;
    if (parseResult !== null && "session" in parseResult) {
      const session = (parseResult as SessionWithMeta).session;
      const spans = session.findings
        .map((f) => f.patch.span ?? f.patch.from)
        .filter((s): s is string => Boolean(s));
      onSessionChange(persistKey, spans);
    } else {
      onSessionChange("", []);
    }
  }, [parseResult, persistKey, onSessionChange]);

  const handleLoad = useCallback(() => {
    const result = parseSessionJson(rawJson);
    setParseResult(result);
    if (result !== null && "session" in result && onPersistState) {
      onPersistState({ rawJson, acceptedIndices: [], ignoredIndices: [] });
    }
  }, [rawJson, onPersistState]);

  const withMeta: SessionWithMeta | null =
    parseResult !== null && "session" in parseResult ? (parseResult as SessionWithMeta) : null;
  const session: Session | null = withMeta ? withMeta.session : null;
  const parseError = parseResult !== null && "error" in parseResult ? parseResult.error : null;

  return (
    <div style={styles.container}>
      {!session && (
        <div style={styles.section}>
          <label style={styles.label}>Session JSON (paste from Revision Buddy GPT)</label>
          <textarea
            style={styles.textarea}
            value={rawJson}
            onChange={(e) => setRawJson(e.target.value)}
            placeholder='Paste Session JSON (simple or rb_session_v1)'
            spellCheck={false}
          />
          <button type="button" style={styles.button} onClick={handleLoad}>
            Load
          </button>
        </div>
      )}

      {parseError && <div style={styles.error}>{parseError}</div>}

      {session && withMeta && (
        <RevisionBuddyObsidianUI
          initialText={initialText}
          session={session}
          persistKey={persistKey}
          summary={withMeta.summary}
          doc_comments={withMeta.doc_comments}
          findingMeta={withMeta.findingMeta}
          initialAcceptedIndices={persistedState?.acceptedIndices}
          initialIgnoredIndices={persistedState?.ignoredIndices}
          initialAcceptedOptionByIndex={persistedState?.acceptedOptionByIndex}
          rawJson={rawJson}
          onPersistState={onPersistState}
          onExportText={onExportText}
          onToast={onToast}
          onJumpToInSource={onJumpToInSource}
          onHighlightInSource={onHighlightInSource}
        />
      )}
    </div>
  );
}
