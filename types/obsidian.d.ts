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
    registerView(type: string, callback: (leaf: WorkspaceLeaf) => ItemView): void;
    loadData<T>(): Promise<T | undefined>;
    saveData(data: unknown): Promise<void>;
  }
}
