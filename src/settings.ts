import type { Plugin } from "obsidian";
import { PluginSettingTab, Setting } from "obsidian";
import type { AutoFixProviderId } from "./autoFix";

export interface AutoFixSettings {
  provider: AutoFixProviderId;
  apiKey: string;
  model: string;
}

export const DEFAULT_AUTO_FIX_SETTINGS: AutoFixSettings = {
  provider: "openai",
  apiKey: "",
  model: "gpt-5-nano",
};

const SETTINGS_KEY = "autoFix";
const LEGACY_SETTINGS_KEY = "quickFix";

export async function loadAutoFixSettings(
  loadData: () => Promise<Record<string, unknown> | undefined>
): Promise<AutoFixSettings> {
  const data = await loadData();
  const raw =
    data && typeof data[SETTINGS_KEY] === "object" && data[SETTINGS_KEY] !== null
      ? (data[SETTINGS_KEY] as Record<string, unknown>)
      : data && typeof data[LEGACY_SETTINGS_KEY] === "object" && data[LEGACY_SETTINGS_KEY] !== null
        ? (data[LEGACY_SETTINGS_KEY] as Record<string, unknown>)
        : {};
  return {
    provider: (raw.provider === "google" ? "google" : "openai") as AutoFixProviderId,
    apiKey: typeof raw.apiKey === "string" ? raw.apiKey : "",
    model:
      typeof raw.model === "string" && raw.model.trim()
        ? raw.model.trim()
        : DEFAULT_AUTO_FIX_SETTINGS.model,
  };
}

export async function saveAutoFixSettings(
  loadData: () => Promise<Record<string, unknown> | undefined>,
  saveData: (data: unknown) => Promise<void>,
  settings: AutoFixSettings
): Promise<void> {
  const data = (await loadData()) as Record<string, unknown> | undefined;
  const next = {
    ...(typeof data === "object" && data !== null ? data : {}),
    [SETTINGS_KEY]: settings,
  };
  await saveData(next);
}

export class RevisionBuddySettingTab extends PluginSettingTab {
  constructor(
    private plugin: Plugin & {
      loadData: () => Promise<Record<string, unknown> | undefined>;
      saveData: (data: unknown) => Promise<void>;
    },
    private getSettings: () => AutoFixSettings,
    private setSettings: (s: AutoFixSettings) => void
  ) {
    super(plugin.app, plugin);
  }

  display(): void {
    this.containerEl.empty();
    const s = this.getSettings();

    this.containerEl.createEl("h2", { text: "Auto-fix (fast LLM layer)" });
    this.containerEl.createEl("p", {
      text: "Line-level “press-button-to-fix” uses a fast, cheap model (e.g. GPT-5 nano, Gemini Flash). Configure provider and API key below.",
      cls: "setting-item-description",
    });

    new Setting(this.containerEl)
      .setName("Provider")
      .setDesc("API to use for auto-fix")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("openai", "OpenAI (e.g. gpt-5-nano, gpt-5-mini)")
          .addOption("google", "Google (e.g. gemini-2.0-flash)")
          .setValue(s.provider)
          .onChange(async (value) => {
            const next = { ...s, provider: value as AutoFixProviderId };
            this.setSettings(next);
            await saveAutoFixSettings(
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
            await saveAutoFixSettings(
              this.plugin.loadData.bind(this.plugin),
              this.plugin.saveData.bind(this.plugin),
              next
            );
          });
        text.inputEl.type = "password";
      });

    new Setting(this.containerEl)
      .setName("Model")
      .setDesc("Model id, e.g. gpt-5-nano, gpt-5-mini, gemini-2.0-flash-exp")
      .addText((text) => {
        text
          .setPlaceholder(s.provider === "openai" ? "gpt-5-nano" : "gemini-2.0-flash")
          .setValue(s.model)
          .onChange(async (value) => {
            const next = {
              ...s,
              model: value.trim() || (s.provider === "openai" ? "gpt-5-nano" : "gemini-2.0-flash"),
            };
            this.setSettings(next);
            await saveAutoFixSettings(
              this.plugin.loadData.bind(this.plugin),
              this.plugin.saveData.bind(this.plugin),
              next
            );
          });
      });
  }
}
