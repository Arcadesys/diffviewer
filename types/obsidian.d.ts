declare module "obsidian" {
  export interface App {
    vault: Vault;
    workspace: Workspace;
  }

  export interface Workspace {
    on(event: string, callback: (...args: unknown[]) => void): EventRef;
    getActiveFile(): TFile | null;
    getLeavesOfType(viewType: string): WorkspaceLeaf[];
    getRightLeaf(replace?: boolean): WorkspaceLeaf | null;
    revealLeaf(leaf: WorkspaceLeaf): Promise<void>;
    setActiveLeaf(leaf: WorkspaceLeaf, options?: { focus?: boolean }): void;
  }

  export class WorkspaceLeaf {
    view: ItemView;
    setViewState(state: { type: string; active?: boolean }): Promise<void>;
  }

  export class ItemView {
    app: App;
    containerEl: HTMLElement;
    contentEl: HTMLElement;
    constructor(leaf: WorkspaceLeaf);
    getViewType(): string;
    getDisplayText(): string;
    getIcon(): string;
    onOpen(): Promise<void>;
    onClose(): Promise<void>;
  }

  export class MarkdownView extends ItemView {
    editor: Editor;
    file: TFile | null;
  }

  export class TAbstractFile {}

  export class TFile extends TAbstractFile {
    path: string;
    basename: string;
    extension: string;
  }

  export class TFolder extends TAbstractFile {
    path: string;
    name: string;
  }

  export interface EditorPosition {
    line: number;
    ch: number;
  }

  export interface Editor {
    getValue(): string;
    getSelection(): string;
    getCursor(side?: "from" | "to"): EditorPosition;
    getLine(line: number): string;
    replaceSelection(replacement: string): void;
    replaceRange(replacement: string, from: EditorPosition, to?: EditorPosition): void;
    offsetToPos(offset: number): EditorPosition;
    setSelection(from: EditorPosition, to: EditorPosition): void;
    scrollIntoView(range: { from: EditorPosition; to: EditorPosition }, center?: boolean): void;
  }

  export interface DataAdapter {
    read(path: string): Promise<string>;
    write(path: string, data: string): Promise<void>;
  }

  export interface Vault {
    adapter: DataAdapter;
    read(file: TFile): Promise<string>;
    modify(file: TFile, data: string): Promise<void>;
  }

  export interface EventRef {}

  export interface Command {
    id: string;
    name: string;
    callback?: () => void;
    editorCallback?: (editor: Editor, view: MarkdownView) => void;
    checkCallback?: (checking: boolean) => boolean;
  }

  export interface PluginManifest {
    id: string;
    name: string;
    version: string;
  }

  export class Notice {
    constructor(message: string, timeout?: number);
  }

  export class Plugin {
    app: App;
    manifest: PluginManifest;
    addCommand(command: Command): void;
    addRibbonIcon(icon: string, title: string, callback: (evt: MouseEvent) => void): HTMLElement;
    addSettingTab(tab: PluginSettingTab): void;
    registerView(type: string, callback: (leaf: WorkspaceLeaf) => ItemView): void;
    loadData<T>(): Promise<T | undefined>;
    saveData(data: unknown): Promise<void>;
  }

  export class PluginSettingTab {
    constructor(plugin: Plugin);
    containerEl: HTMLElement;
    display(): void;
  }

  export class Setting {
    constructor(containerEl: HTMLElement);
    setName(name: string): this;
    setDesc(desc: string): this;
    addText(cb: (text: TextComponent) => void): this;
    addDropdown(cb: (dropdown: DropdownComponent) => void): this;
  }

  export interface TextComponent {
    setPlaceholder(placeholder: string): this;
    setValue(value: string): this;
    getValue(): string;
    onChange(callback: (value: string) => void): this;
    inputEl: HTMLInputElement;
  }

  export interface DropdownComponent {
    setValue(value: string): this;
    getValue(): string;
    onChange(callback: (value: string) => void): this;
  }
}
