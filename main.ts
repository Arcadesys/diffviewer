import { Plugin, ItemView, WorkspaceLeaf, Notice, MarkdownView } from "obsidian";
import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, type PluginValue } from "@codemirror/view";
import { createRoot, type Root } from "react-dom/client";
import { StrictMode, createElement } from "react";
import { App } from "./src/ui/App";
import type { PersistedSessionState } from "./src/types";

/** Return the file path for the editor that owns this EditorView, or null. */
function getFilePathForEditor(app: { workspace: { iterateAllLeaves: (cb: (leaf: WorkspaceLeaf) => void) => void } }, editorView: EditorView): string | null {
  let path: string | null = null;
  app.workspace.iterateAllLeaves((leaf) => {
    const view = leaf.view;
    if (view && "file" in view && view.file && "editor" in view) {
      const mv = view as MarkdownView;
      const cm = (mv.editor as unknown as { cm?: EditorView }).cm;
      if (cm === editorView) {
        path = mv.file?.path ?? null;
      }
    }
  });
  return path;
}

const HIGHLIGHT_MARK = Decoration.mark({ class: "revision-buddy-highlight" });

function createRevisionBuddyHighlightExtension(plugin: RevisionBuddyPlugin): ReturnType<typeof ViewPlugin.fromClass> {
  class RevisionBuddyHighlightPlugin implements PluginValue {
    decorations: DecorationSet;

    constructor(readonly view: EditorView) {
      this.decorations = this.buildDecorations();
    }

    update(): void {
      this.decorations = this.buildDecorations();
    }

    buildDecorations(): DecorationSet {
      const { path: highlightPath, spans } = plugin.getHighlightState();
      if (!highlightPath || !spans.length) return Decoration.none;
      const path = getFilePathForEditor(plugin.app, this.view);
      if (path !== highlightPath) return Decoration.none;
      const doc = this.view.state.doc;
      const text = doc.sliceString(0);
      const builder = new RangeSetBuilder<Decoration>();
      for (const span of spans) {
        if (!span) continue;
        const pos = text.indexOf(span);
        if (pos !== -1) {
          builder.add(pos, pos + span.length, HIGHLIGHT_MARK);
        }
      }
      return builder.finish();
    }
  }
  return ViewPlugin.fromClass(RevisionBuddyHighlightPlugin, {
    decorations: (v) => v.decorations,
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
    const { initialText, persistKey } = await this.getInitialTextAndKey();
    this.lastInitialText = initialText;
    this.lastPersistKey = persistKey;
    const persisted = persistKey ? await this.plugin.getPersistedState(persistKey) : null;
    this.root = createRoot(this.contentEl);
    this.renderApp(initialText, persistKey, persisted);
  }

  async onClose(): Promise<void> {
    this.root?.unmount();
    this.root = null;
  }

  /** Open the source document and jump to the first occurrence of searchText (or fallbackSearchText), selecting it. */
  jumpToInSource(searchText: string, fallbackSearchText?: string): void {
    const path = this.lastPersistKey;
    if (!path || !searchText) return;
    const file = this.app.vault.getFileByPath(path);
    if (!file) {
      new Notice("Source file not found");
      return;
    }
    this.app.workspace.openFile(file).then(() => {
      const workspace = this.app.workspace;
      let targetLeaf: WorkspaceLeaf | null = null;
      workspace.iterateAllLeaves((leaf) => {
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
      workspace.setActiveLeaf(targetLeaf, { focus: true });
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
          onSessionChange: (path: string, spans: string[]) => this.plugin.setHighlightRanges(path || null, spans),
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

  getHighlightState(): { path: string | null; spans: string[] } {
    return { path: this.highlightPath, spans: this.highlightSpans };
  }

  setHighlightRanges(path: string | null, spans: string[]): void {
    this.highlightPath = path ?? null;
    this.highlightSpans = spans ?? [];
    this.refreshHighlightInEditor();
  }

  private refreshHighlightInEditor(): void {
    const path = this.highlightPath;
    if (!path) return;
    this.app.workspace.iterateAllLeaves((leaf) => {
      const view = leaf.view;
      if (view instanceof MarkdownView && view.file?.path === path) {
        const cm = (view.editor as unknown as { cm?: EditorView }).cm;
        if (cm) cm.dispatch({});
      }
    });
  }

  setLastExportedText(text: string, path: string): void {
    this.lastExported = { text, path };
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
    this.registerView(REVISION_BUDDY_VIEW_TYPE, (leaf) => new RevisionBuddyView(leaf, this));
    this.registerEditorExtension(createRevisionBuddyHighlightExtension(this));
    this.addStyles();
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

    this.addRibbonIcon("file-search", "Open Revision Buddy", () => this.activateView());
  }

  async onunload(): Promise<void> {}

  private addStyles(): void {
    this.register(() => {
      document.body.removeClass("revision-buddy-highlights-loaded");
    });
    document.body.addClass("revision-buddy-highlights-loaded");
    const style = document.createElement("style");
    style.textContent = `
      .revision-buddy-highlights-loaded .revision-buddy-highlight {
        background-color: var(--text-selection);
        border-radius: 2px;
        padding: 0 1px;
      }
    `;
    document.head.appendChild(style);
    this.register(() => style.remove());
  }

  private async activateView(): Promise<void> {
    const { workspace } = this.app;
    const leaves = workspace.getLeavesOfType(REVISION_BUDDY_VIEW_TYPE);
    if (leaves.length > 0) {
      workspace.revealLeaf(leaves[0]);
      return;
    }
    const rightLeaf = workspace.getRightLeaf(false);
    if (rightLeaf) {
      await rightLeaf.setViewState({ type: REVISION_BUDDY_VIEW_TYPE });
      workspace.revealLeaf(rightLeaf);
    }
  }
}

