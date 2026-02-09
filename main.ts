import { Plugin, ItemView, WorkspaceLeaf, Notice, MarkdownView } from "obsidian";
import { createRoot, type Root } from "react-dom/client";
import { StrictMode, createElement } from "react";
import { App } from "./src/ui/App";
import type { PersistedSessionState } from "./src/types";
import {
  loadAutoFixSettings,
  RevisionBuddySettingTab,
  type AutoFixSettings,
  DEFAULT_AUTO_FIX_SETTINGS,
} from "./src/settings";
import { requestAutoFix } from "./src/autoFix";
import { applyPatch } from "./src/patchApply";

/** Minimal type for Obsidian editor's CodeMirror view — used only to read doc and coords (no CM bundle). */
interface EditorCM {
  state: { doc: { sliceString: (from: number, to?: number) => string } };
  coordsAtPos(pos: number): { left: number; right: number; top: number; bottom: number } | null;
  dom: HTMLElement;
  scrollDOM: HTMLElement;
}

const HIGHLIGHT_OVERLAY_CLASS = "revision-buddy-highlight-overlay";
const HIGHLIGHT_OVERLAY_ATTR = "data-revision-buddy-overlay";

function getEditorCM(view: MarkdownView): EditorCM | null {
  const cm = (view.editor as unknown as { cm?: EditorCM }).cm;
  return cm && typeof cm.coordsAtPos === "function" && cm.state?.doc ? cm : null;
}

/** Remove all Revision Buddy overlay elements from the workspace and detach scroll listeners. */
function removeAllHighlightOverlays(): void {
  document.querySelectorAll(`[${HIGHLIGHT_OVERLAY_ATTR}]`).forEach((el) => {
    const cleanup = (el as HTMLElement & { _scrollCleanup?: () => void })._scrollCleanup;
    if (cleanup) cleanup();
    el.remove();
  });
}

/** Apply highlight overlays in the editor for the given path/spans. Uses DOM overlay so it works without bundling CodeMirror. */
function applyHighlightOverlays(
  plugin: RevisionBuddyPlugin
): void {
  const { path: highlightPath, spans, focusSpan } = plugin.getHighlightState();
  removeAllHighlightOverlays();
  if (!highlightPath || (spans.length === 0 && !focusSpan)) return;

  plugin.app.workspace.iterateAllLeaves((leaf) => {
    const view = leaf.view;
    if (!(view instanceof MarkdownView) || view.file?.path !== highlightPath) return;
    const cm = getEditorCM(view);
    if (!cm) return;

    const doc = cm.state.doc;
    const text = doc.sliceString(0);
    const overlay = document.createElement("div");
    overlay.className = HIGHLIGHT_OVERLAY_CLASS;
    overlay.setAttribute(HIGHLIGHT_OVERLAY_ATTR, "true");
    overlay.style.pointerEvents = "none";

    const addRect = (pos: number, length: number, focus: boolean) => {
      if (pos < 0 || length <= 0) return;
      const start = cm.coordsAtPos(pos);
      const end = cm.coordsAtPos(pos + length);
      if (!start || !end) return;
      const div = document.createElement("div");
      div.className = focus ? "revision-buddy-focus-highlight" : "revision-buddy-highlight";
      div.style.position = "absolute";
      div.style.left = `${start.left}px`;
      div.style.top = `${start.top}px`;
      div.style.width = `${Math.max(end.right - start.left, 2)}px`;
      div.style.height = `${Math.max(end.bottom - start.top, 2)}px`;
      div.style.borderRadius = "2px";
      overlay.appendChild(div);
    };

    for (const span of spans) {
      if (!span) continue;
      const pos = text.indexOf(span);
      if (pos !== -1) addRect(pos, span.length, span === focusSpan);
    }
    if (focusSpan && !spans.includes(focusSpan)) {
      const pos = text.indexOf(focusSpan);
      if (pos !== -1) addRect(pos, focusSpan.length, true);
    }

    if (overlay.children.length === 0) {
      overlay.remove();
      return;
    }

    const scrollHandler = () => applyHighlightOverlays(plugin);
    cm.scrollDOM.addEventListener("scroll", scrollHandler, { passive: true });
    overlay.dataset.scrollCleanup = "1";
    (overlay as HTMLElement & { _scrollCleanup?: () => void })._scrollCleanup = () => {
      cm.scrollDOM.removeEventListener("scroll", scrollHandler);
    };

    const parent = cm.dom;
    if (parent) {
      parent.style.position = parent.style.position || "relative";
      overlay.style.position = "absolute";
      overlay.style.left = "0";
      overlay.style.top = "0";
      overlay.style.width = "100%";
      overlay.style.height = "100%";
      overlay.style.overflow = "hidden";
      parent.appendChild(overlay);
    }
  });
}

const REVISION_BUDDY_VIEW_TYPE = "revision-buddy-view";

class RevisionBuddyView extends ItemView {
  private root: Root | null = null;
  private lastInitialText = "";
  private lastPersistKey = "";

  constructor(leaf: WorkspaceLeaf, private plugin: RevisionBuddyPlugin) {
    super(leaf);
    this.containerEl.addClass("revision-buddy-view");
  }

  getViewType(): string {
    return REVISION_BUDDY_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Revision Buddy";
  }

  getIcon(): string {
    return "file-search";
  }

  async onOpen(): Promise<void> {
    // #region agent log
    fetch('http://127.0.0.1:7246/ingest/96b8c0e4-6f21-4b34-aa7b-a6e041b19d43',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'main.ts:onOpen:entry',message:'RevisionBuddyView.onOpen started',data:{},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
    // #endregion
    try {
      const { initialText, persistKey } = await this.getInitialTextAndKey();
      // #region agent log
      fetch('http://127.0.0.1:7246/ingest/96b8c0e4-6f21-4b34-aa7b-a6e041b19d43',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'main.ts:onOpen:afterGetInitial',message:'getInitialTextAndKey result',data:{persistKey,initialTextLen:initialText?.length??0},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
      // #endregion
      this.lastInitialText = initialText;
      this.lastPersistKey = persistKey;
      const persisted = persistKey ? await this.plugin.getPersistedState(persistKey) : null;
      // #region agent log
      fetch('http://127.0.0.1:7246/ingest/96b8c0e4-6f21-4b34-aa7b-a6e041b19d43',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'main.ts:onOpen:afterPersisted',message:'getPersistedState done',data:{hasPersisted:!!persisted},timestamp:Date.now(),hypothesisId:'H2,H4'})}).catch(()=>{});
      // #endregion
      this.root = createRoot(this.contentEl);
      this.renderApp(initialText, persistKey, persisted);
    } catch (err) {
      // #region agent log
      fetch('http://127.0.0.1:7246/ingest/96b8c0e4-6f21-4b34-aa7b-a6e041b19d43',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'main.ts:onOpen:catch',message:'onOpen threw',data:{errMsg:String(err),errName:(err as Error)?.name},timestamp:Date.now(),hypothesisId:'H2,H4'})}).catch(()=>{});
      // #endregion
      console.error("Revision Buddy: failed to open", err);
      this.lastInitialText = "";
      this.lastPersistKey = "";
      this.root = createRoot(this.contentEl);
      this.renderApp("", "", null);
      new Notice("Failed to open: could not load view. Check console for details.");
    }
  }

  async onClose(): Promise<void> {
    this.root?.unmount();
    this.root = null;
  }

  /** Open the source document and jump to the first occurrence of searchText (or fallbackSearchText), selecting it. */
  jumpToInSource(searchText: string, fallbackSearchText?: string): void {
    const path = this.lastPersistKey || (this.app.workspace.getActiveFile()?.extension === "md" ? this.app.workspace.getActiveFile()?.path ?? "" : "");
    if (!path || !searchText) {
      if (!path) new Notice("Open a note first, or open Revision Buddy with a note active.");
      return;
    }
    const file = this.app.vault.getFileByPath(path);
    if (!file) {
      new Notice("Source file not found");
      return;
    }

    const runSelectAndFocus = (): void => {
      let targetLeaf: WorkspaceLeaf | null = null;
      this.app.workspace.iterateAllLeaves((leaf) => {
        const view = leaf.view;
        if (view instanceof MarkdownView && view.file?.path === path) {
          targetLeaf = leaf;
        }
      });
      if (!targetLeaf) return;
      const view = targetLeaf.view as MarkdownView;
      const editor = view.editor;
      const content = editor.getValue();
      const toTry = [searchText];
      if (fallbackSearchText && fallbackSearchText !== searchText) toTry.push(fallbackSearchText);
      let pos = -1;
      let matchedText = "";
      for (const candidate of toTry) {
        if (!candidate) continue;
        const i = content.indexOf(candidate);
        if (i !== -1) {
          pos = i;
          matchedText = candidate;
          break;
        }
      }
      if (pos === -1) {
        new Notice("Text not found in current document");
        return;
      }
      const from = editor.offsetToPos(pos);
      const to = editor.offsetToPos(pos + matchedText.length);
      editor.setSelection(from, to);
      editor.scrollIntoView({ from, to }, true);
      this.app.workspace.setActiveLeaf(targetLeaf, { focus: true });
      this.plugin.refreshHighlightsPublic();
    };

    let targetLeaf: WorkspaceLeaf | null = null;
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.view instanceof MarkdownView && leaf.view.file?.path === path) targetLeaf = leaf;
    });

    if (targetLeaf) {
      this.app.workspace.setActiveLeaf(targetLeaf, { focus: true });
      setTimeout(runSelectAndFocus, 50);
      return;
    }

    const workspace = this.app.workspace as Workspace & { activeLeaf: WorkspaceLeaf | null; getLeaf: (split?: boolean | "split" | "tab") => WorkspaceLeaf };
    const activeLeaf = workspace.activeLeaf;
    let leafToOpen: WorkspaceLeaf;
    if (activeLeaf?.view && (activeLeaf.view as { getViewType?: () => string }).getViewType?.() === REVISION_BUDDY_VIEW_TYPE) {
      leafToOpen = workspace.getLeaf(true);
      workspace.setActiveLeaf(leafToOpen, { focus: true });
    } else {
      leafToOpen = workspace.getLeaf(false);
    }
    const leafWithOpen = leafToOpen as WorkspaceLeaf & { openFile: (file: TFile) => Promise<void> };
    leafWithOpen.openFile(file).then(() => {
      setTimeout(runSelectAndFocus, 150);
    }).catch((err) => {
      new Notice("Failed to open file");
      console.error("Revision Buddy: openFile failed", err);
    });
  }

  private renderApp(initialText: string, persistKey: string, persisted: PersistedSessionState | null): void {
    if (!this.root) return;
    this.root.render(
      createElement(
        StrictMode,
        null,
        createElement(App, {
          initialText,
          persistKey,
          persistedState: persisted,
          onPersistState: (state: PersistedSessionState) => this.plugin.setPersistedState(persistKey, state),
          onExportText: (text: string) => this.plugin.setLastExportedText(text, persistKey),
          onToast: (message: string) => new Notice(message),
          onJumpToInSource: (searchText: string, fallback?: string) => this.jumpToInSource(searchText, fallback),
          onHighlightInSource: (span: string | null) => this.plugin.setFocusHighlight(span),
          onSessionChange: (path: string, spans: string[]) => this.plugin.setHighlightRanges(path || null, spans),
          onQuickRevision: (spanText: string, fallbackSearchText?: string, suggestionContext?: string) => {
            this.jumpToInSource(spanText, fallbackSearchText);
            setTimeout(() => this.plugin.runAutoFixOnSelection(suggestionContext), 400);
          },
          onApplySuggestion: (spanText: string, replacementText: string) =>
            this.plugin.applySuggestionToSource(persistKey, spanText, replacementText),
        })
      )
    );
  }

  private async getInitialTextAndKey(): Promise<{ initialText: string; persistKey: string }> {
    const file = this.app.workspace.getActiveFile();
    if (file && file.extension === "md") {
      try {
        const text = await this.app.vault.read(file);
        return { initialText: text, persistKey: file.path };
      } catch {
        return { initialText: "", persistKey: file.path };
      }
    }
    return { initialText: "", persistKey: "" };
  }
}

const PERSISTED_STATE_KEY = "revision-buddy-state";

export default class RevisionBuddyPlugin extends Plugin {
  private lastExported: { text: string; path: string } | null = null;
  private highlightPath: string | null = null;
  private highlightSpans: string[] = [];
  private focusHighlightSpan: string | null = null;
  private resizeHandler: (() => void) | null = null;
  private resizeDebounceId: ReturnType<typeof setTimeout> | null = null;
  private static readonly RESIZE_DEBOUNCE_MS = 80;

  /** Fast, cheap LLM layer for line-level auto-fix. */
  private autoFixSettings: AutoFixSettings = { ...DEFAULT_AUTO_FIX_SETTINGS };

  getHighlightState(): { path: string | null; spans: string[]; focusSpan: string | null } {
    return { path: this.highlightPath, spans: this.highlightSpans, focusSpan: this.focusHighlightSpan };
  }

  setHighlightRanges(path: string | null, spans: string[]): void {
    this.highlightPath = path ?? null;
    this.highlightSpans = spans ?? [];
    this.refreshHighlightInEditor();
  }

  setFocusHighlight(span: string | null): void {
    this.focusHighlightSpan = span ?? null;
    this.refreshHighlightInEditor();
  }

  private refreshHighlightInEditor(): void {
    applyHighlightOverlays(this);
  }

  private onResize(): void {
    if (this.resizeDebounceId !== null) clearTimeout(this.resizeDebounceId);
    this.resizeDebounceId = setTimeout(() => {
      this.resizeDebounceId = null;
      this.refreshHighlightInEditor();
    }, RevisionBuddyPlugin.RESIZE_DEBOUNCE_MS);
  }

  /** Public so the Revision Buddy view can refresh highlights after jump-to (MVP). */
  refreshHighlightsPublic(): void {
    this.refreshHighlightInEditor();
  }

  /**
   * Run the fast (nano) auto-fix model on the current editor selection (or current line).
   * Used by "Ask for quick revision" from suggestion-only findings.
   */
  async runAutoFixOnSelection(suggestionHint?: string): Promise<void> {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) {
      new Notice("Open a note and go to the text first");
      return;
    }
    const editor = view.editor;
    let text = editor.getSelection();
    let replaceBySelection = true;
    if (!text.trim()) {
      const cursor = editor.getCursor();
      const line = editor.getLine(cursor.line);
      if (!line.trim()) {
        new Notice("Select text or place cursor on a line to fix");
        return;
      }
      text = line;
      replaceBySelection = false;
    }
    const config = {
      provider: this.autoFixSettings.provider,
      apiKey: this.autoFixSettings.apiKey,
      model: this.autoFixSettings.model || (this.autoFixSettings.provider === "openai" ? "gpt-5-nano" : "gemini-2.0-flash"),
    };
    if (!config.apiKey.trim()) {
      new Notice("Set Auto-fix API key in Settings → Revision Buddy");
      return;
    }
    new Notice("Quick revision…");
    const cursor = editor.getCursor();
    const lineNum = cursor.line;
    try {
      const res = await requestAutoFix(config, { text, suggestionHint: suggestionHint?.trim() || undefined });
      if (res.ok) {
        const toUse = res.to;
        if (replaceBySelection) {
          editor.replaceSelection(toUse);
        } else {
          const from = { line: lineNum, ch: 0 };
          const to = { line: lineNum, ch: editor.getLine(lineNum).length };
          editor.replaceRange(toUse, from, to);
        }
        new Notice("Quick revision applied");
      } else {
        new Notice(res.reason);
      }
    } catch (err) {
      new Notice(String((err as Error)?.message ?? err));
    }
  }

  setLastExportedText(text: string, path: string): void {
    this.lastExported = { text, path };
  }

  /**
   * Apply a suggestion as a replacement in the source file: find spanText, replace with replacementText.
   * Uses same single-occurrence rule as patchApply. Returns true if applied.
   */
  async applySuggestionToSource(filePath: string, spanText: string, replacementText: string): Promise<boolean> {
    if (!filePath?.trim() || !spanText) {
      new Notice("No file or span to apply");
      return false;
    }
    const file = this.app.vault.getFileByPath(filePath);
    if (!file) {
      new Notice("Source file not found");
      return false;
    }
    try {
      const text = await this.app.vault.read(file);
      const result = applyPatch(text, {
        from: spanText,
        to: replacementText,
        span: spanText,
      });
      if (!result.ok) {
        new Notice(result.reason);
        return false;
      }
      await this.app.vault.modify(file, result.text);
      new Notice("Applied to document");
      return true;
    } catch (err) {
      new Notice(String((err as Error)?.message ?? err));
      return false;
    }
  }

  async getPersistedState(persistKey: string): Promise<PersistedSessionState | null> {
    if (!persistKey) return null;
    const data = await this.loadData();
    const map = (data && typeof data === "object" && (data as Record<string, unknown>)[PERSISTED_STATE_KEY]) as Record<string, PersistedSessionState> | undefined;
    if (!map || typeof map !== "object") return null;
    const state = map[persistKey];
    if (!state || typeof state.rawJson !== "string" || !Array.isArray(state.acceptedIndices) || !Array.isArray(state.ignoredIndices)) return null;
    return state;
  }

  async setPersistedState(persistKey: string, state: PersistedSessionState): Promise<void> {
    if (!persistKey) return;
    const data = (await this.loadData()) as Record<string, unknown> | undefined;
    const map = (data && typeof data === "object" && data[PERSISTED_STATE_KEY]) as Record<string, PersistedSessionState> | undefined ?? {};
    const next = { ...map, [persistKey]: state };
    await this.saveData({ ...(typeof data === "object" && data !== null ? data : {}), [PERSISTED_STATE_KEY]: next });
  }

  async onload(): Promise<void> {
    this.autoFixSettings = await loadAutoFixSettings(this.loadData.bind(this));
    this.registerView(REVISION_BUDDY_VIEW_TYPE, (leaf) => new RevisionBuddyView(leaf, this));
    this.addStyles();
    this.resizeHandler = () => this.onResize();
    window.addEventListener("resize", this.resizeHandler);
    this.addSettingTab(
      new RevisionBuddySettingTab(
        this as Plugin & { loadData: () => Promise<Record<string, unknown> | undefined>; saveData: (data: unknown) => Promise<void> },
        () => this.autoFixSettings,
        (s) => { this.autoFixSettings = s; }
      )
    );
    this.addCommand({
      id: "open-revision-buddy",
      name: "Open Revision Buddy",
      callback: () => this.activateView(),
    });

    this.addCommand({
      id: "paste-session-json",
      name: "Paste Session JSON",
      callback: () => {
        this.activateView().then(() => {
          navigator.clipboard.readText().then((text) => {
            // Focus is in the view; the user can paste into the textarea. We don't inject
            // programmatically into React state here; user can Cmd+V in the textarea.
            new Notice("Paste into the Session JSON field in the panel");
          }).catch(() => {});
        });
      },
    });

    this.addCommand({
      id: "auto-fix-selection",
      name: "Auto-fix selection",
      editorCallback: (editor, view) => {
        let text = editor.getSelection();
        let replaceBySelection = true; // if false, we'll use replaceRange for the current line
        if (!text.trim()) {
          const cursor = editor.getCursor();
          const line = editor.getLine(cursor.line);
          if (!line.trim()) {
            new Notice("Select text or place cursor on a line to fix");
            return;
          }
          text = line;
          replaceBySelection = false;
        }
        const config = {
          provider: this.autoFixSettings.provider,
          apiKey: this.autoFixSettings.apiKey,
          model: this.autoFixSettings.model || (this.autoFixSettings.provider === "openai" ? "gpt-5-nano" : "gemini-2.0-flash"),
        };
        if (!config.apiKey.trim()) {
          new Notice("Set Auto-fix API key in Settings → Revision Buddy");
          return;
        }
        new Notice("Auto-fix…");
        const cursor = editor.getCursor();
        const lineNum = cursor.line;
        requestAutoFix(config, { text })
          .then((res) => {
            if (res.ok) {
              const toUse = res.to;
              if (replaceBySelection) {
                editor.replaceSelection(toUse);
              } else {
                const from = { line: lineNum, ch: 0 };
                const to = { line: lineNum, ch: editor.getLine(lineNum).length };
                editor.replaceRange(toUse, from, to);
              }
              new Notice("Auto-fix applied");
            } else {
              new Notice(res.reason);
            }
          })
          .catch((err) => {
            new Notice(String(err?.message ?? err));
          });
      },
    });

    this.addRibbonIcon("file-search", "Open Revision Buddy", () => this.activateView());
  }

  async onunload(): Promise<void> {
    if (this.resizeDebounceId !== null) {
      clearTimeout(this.resizeDebounceId);
      this.resizeDebounceId = null;
    }
    if (this.resizeHandler) {
      window.removeEventListener("resize", this.resizeHandler);
      this.resizeHandler = null;
    }
    removeAllHighlightOverlays();
  }

  private addStyles(): void {
    this.register(() => {
      document.body.removeClass("revision-buddy-highlights-loaded");
    });
    document.body.addClass("revision-buddy-highlights-loaded");
    const style = document.createElement("style");
    style.textContent = `
      /* Low-vision friendly: readable base size and line height in the sidebar */
      .revision-buddy-view {
        font-size: max(16px, var(--font-ui-medium, 1rem));
        line-height: 1.5;
      }
      .revision-buddy-highlights-loaded .revision-buddy-highlight-overlay {
        pointer-events: none;
        z-index: 5;
      }
      .revision-buddy-highlights-loaded .revision-buddy-highlight {
        background-color: var(--text-selection);
        border-radius: 2px;
      }
      .revision-buddy-highlights-loaded .revision-buddy-focus-highlight {
        background-color: var(--interactive-accent);
        color: var(--text-on-accent);
        border-radius: 2px;
      }
    `;
    document.head.appendChild(style);
    this.register(() => style.remove());
  }

  private async activateView(): Promise<void> {
    const workspace = this.app.workspace as Workspace & { getRightLeaf: (replace?: boolean) => WorkspaceLeaf | null; getLeaf: (split?: boolean | "split" | "tab") => WorkspaceLeaf };
    const leaves = workspace.getLeavesOfType(REVISION_BUDDY_VIEW_TYPE);
    const rightLeaf = workspace.getRightLeaf(false);
    // #region agent log
    fetch('http://127.0.0.1:7246/ingest/96b8c0e4-6f21-4b34-aa7b-a6e041b19d43',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'main.ts:activateView:entry',message:'activateView called',data:{leavesCount:leaves.length,hasRightLeaf:!!rightLeaf,hasGetLeaf:typeof (workspace as { getLeaf?: unknown }).getLeaf},timestamp:Date.now(),hypothesisId:'H1,H3'})}).catch(()=>{});
    // #endregion
    if (leaves.length > 0) {
      workspace.revealLeaf(leaves[0]);
      return;
    }
    const leaf = rightLeaf ?? workspace.getLeaf(true);
    // #region agent log
    fetch('http://127.0.0.1:7246/ingest/96b8c0e4-6f21-4b34-aa7b-a6e041b19d43',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'main.ts:activateView:beforeSetViewState',message:'about to setViewState',data:{usedRightLeaf:!!rightLeaf},timestamp:Date.now(),hypothesisId:'H1,H3'})}).catch(()=>{});
    // #endregion
    try {
      await leaf.setViewState({ type: REVISION_BUDDY_VIEW_TYPE });
      workspace.revealLeaf(leaf);
    } catch (err) {
      // #region agent log
      fetch('http://127.0.0.1:7246/ingest/96b8c0e4-6f21-4b34-aa7b-a6e041b19d43',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'main.ts:activateView:catch',message:'activateView setViewState threw',data:{errMsg:String(err)},timestamp:Date.now(),hypothesisId:'H1,H3'})}).catch(()=>{});
      // #endregion
      new Notice("Failed to open Revision Buddy");
      console.error("Revision Buddy: failed to open view", err);
    }
  }
}

