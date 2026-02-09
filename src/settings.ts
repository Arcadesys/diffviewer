import type { Plugin } from "obsidian";
import { PluginSettingTab, Setting } from "obsidian";
import type { QuickFixProviderId } from "./quickFix";

export interface QuickFixSettings {
  provider: QuickFixProviderId;
  apiKey: string;
  model: string;
}

export const DEFAULT_QUICK_FIX_SETTINGS: QuickFixSettings = {
  provider: "openai",
  apiKey: "",
  model: "gpt-4o-mini",
};

const SETTINGS_KEY = "quickFix";

export async function loadQuickFixSettings(
  loadData: () => Promise<Record<string, unknown> | undefined>
): Promise<QuickFixSettings> {
  const data = await loadData();
  const raw = data && typeof data[SETTINGS_KEY] === "object" && data[SETTINGS_KEY] !== null
    ? (data[SETTINGS_KEY] as Record<string, unknown>)
    : {};
  return {
    provider: (raw.provider === "google" ? "google" : "openai") as QuickFixProviderId,
    apiKey: typeof raw.apiKey === "string" ? raw.apiKey : "",
    model: typeof raw.model === "string" && raw.model.trim() ? raw.model.trim() : DEFAULT_QUICK_FIX_SETTINGS.model,
  };
}

export async function saveQuickFixSettings(
  loadData: () => Promise<Record<string, unknown> | undefined>,
  saveData: (data: unknown) => Promise<void>,
  settings: QuickFixSettings
): Promise<void> {
  const data = (await loadData()) as Record<string, unknown> | undefined;
  const next = { ...(typeof data === "object" && data !== null ? data : {}), [SETTINGS_KEY]: settings };
  await saveData(next);
}

export class RevisionBuddySettingTab extends PluginSettingTab {
  constructor(
    private plugin: Plugin & {
      loadData: () => Promise<Record<string, unknown> | undefined>;
      saveData: (data: unknown) => Promise<void>;
    },
    private getSettings: () => QuickFixSettings,
    private setSettings: (s: QuickFixSettings) => void
  ) {
    super(plugin.app, plugin);
  }

  display(): void {
    this.containerEl.empty();
    const s = this.getSettings();

    this.containerEl.createEl("h2", { text: "Quick fix (fast LLM layer)" });
    this.containerEl.createEl("p", {
      text: "Line-level “press-button-to-fix” uses a fast, cheap model (e.g. Haiku 4.5, Gemini Flash). Configure provider and API key below.",
      cls: "setting-item-description",
    });

    new Setting(this.containerEl)
      .setName("Provider")
      .setDesc("API to use for quick fix")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("openai", "OpenAI (e.g. gpt-4o-mini, gpt-4.5-haiku)")
          .addOption("google", "Google (e.g. gemini-2.0-flash)")
          .setValue(s.provider)
          .onChange(async (value) => {
            const next = { ...s, provider: value as QuickFixProviderId };
            this.setSettings(next);
            await saveQuickFixSettings(
              this.plugin.loadData.bind(this.plugin),
              this.plugin.saveData.bind(this.plugin),
              next
            );
          });
      });

    new Setting(this.containerEl)
      .setName("API key")
      .setDesc("API key for the selected provider (stored locally)")
      .addText((text) => {
        text
          .setPlaceholder(s.provider === "openai" ? "sk-…" : "AIza…")
          .setValue(s.apiKey)
          .onChange(async (value) => {
            const next = { ...s, apiKey: value };
            this.setSettings(next);
            await saveQuickFixSettings(
              this.plugin.loadData.bind(this.plugin),
              this.plugin.saveData.bind(this.plugin),
              next
            );
          });
        text.inputEl.type = "password";
      });

    new Setting(this.containerEl)
      .setName("Model")
      .setDesc("Model id, e.g. gpt-4o-mini, gpt-4.5-haiku, gemini-2.0-flash-exp")
      .addText((text) => {
        text
          .setPlaceholder(s.provider === "openai" ? "gpt-4o-mini" : "gemini-2.0-flash")
          .setValue(s.model)
          .onChange(async (value) => {
            const next = { ...s, model: value.trim() || (s.provider === "openai" ? "gpt-4o-mini" : "gemini-2.0-flash") };
            this.setSettings(next);
            await saveQuickFixSettings(
              this.plugin.loadData.bind(this.plugin),
              this.plugin.saveData.bind(this.plugin),
              next
            );
          });
      });
  }
}
