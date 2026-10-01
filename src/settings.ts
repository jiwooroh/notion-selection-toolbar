import { App, FuzzySuggestModal, PluginSettingTab, Setting, setIcon } from "obsidian";
import { ColorDef, NOTION_COLORS } from "./colors";
import type { NotionToolbarSettings } from "./main";
import type NotionToolbarPlugin from "./main";

type HighlightMapKey = "highlightColorsLight" | "highlightColorsDark";

interface AppCommandEntry {
	id: string;
	name: string;
}

/** Lists the same command registry the real command palette (Ctrl/Cmd+P) searches,
 *  so "choose a command" here matches what the user sees there. */
function listAppCommands(app: App): AppCommandEntry[] {
	const commands = (app as unknown as { commands: { commands: Record<string, AppCommandEntry> } }).commands
		.commands;
	return Object.values(commands).sort((a, b) => a.name.localeCompare(b.name));
}

class CommandSuggestModal extends FuzzySuggestModal<AppCommandEntry> {
	constructor(app: App, private onChoose: (cmd: AppCommandEntry) => void) {
		super(app);
		this.setPlaceholder("Search for a command…");
	}

	getItems(): AppCommandEntry[] {
		return listAppCommands(this.app);
	}

	getItemText(item: AppCommandEntry): string {
		return item.name;
	}

	onChooseItem(item: AppCommandEntry): void {
		this.onChoose(item);
	}
}

export class NotionToolbarSettingTab extends PluginSettingTab {
	private plugin: NotionToolbarPlugin;

	constructor(app: App, plugin: NotionToolbarPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("p", {
			text: "Text colors stay fixed to Notion's defaults, which already differ between light and dark theme. Highlight (background) colors are customizable, separately for each theme, below.",
			cls: "setting-item-description",
		});

		this.renderHighlightSection(
			containerEl,
			"Light theme highlight colors",
			"Used while Obsidian is in light mode.",
			"highlightColorsLight",
			(c) => c.bg,
		);
		this.renderHighlightSection(
			containerEl,
			"Dark theme highlight colors",
			"Used while Obsidian is in dark mode.",
			"highlightColorsDark",
			(c) => c.bgDark,
		);

		this.renderCustomButtonSection(containerEl);
	}

	private renderCustomButtonSection(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName("Custom toolbar button")
			.setDesc(
				"A designated 1×1 button sits next to Comment in the selection toolbar. Assign it one command from the command palette below; the button always runs that command until you change it.",
			)
			.setHeading();

		new Setting(containerEl)
			.setName("Command")
			.setDesc("The action the button runs when clicked.")
			.addButton((btn) =>
				btn.setButtonText(this.getCommandLabel()).onClick(() => {
					new CommandSuggestModal(this.app, (cmd) => {
						this.plugin.settings.customButtonCommandId = cmd.id;
						void this.plugin.saveSettings();
						this.plugin.refreshCustomButton();
						this.display();
					}).open();
				})
			)
			.addExtraButton((btn) =>
				btn
					.setIcon("x")
					.setTooltip("Clear")
					.onClick(async () => {
						this.plugin.settings.customButtonCommandId = null;
						await this.plugin.saveSettings();
						this.plugin.refreshCustomButton();
						this.display();
					})
			);

		const iconSetting = new Setting(containerEl)
			.setName("Icon")
			.setDesc("Lucide icon name shown on the button, e.g. sparkles, star, zap, bookmark.");
		const preview = iconSetting.controlEl.createSpan({ cls: "nst-icon-preview" });
		setIcon(preview, this.plugin.settings.customButtonIcon || "sparkles");
		iconSetting.addText((text) =>
			text
				.setPlaceholder("sparkles")
				.setValue(this.plugin.settings.customButtonIcon)
				.onChange(async (value) => {
					const icon = value.trim() || "sparkles";
					this.plugin.settings.customButtonIcon = icon;
					await this.plugin.saveSettings();
					preview.empty();
					setIcon(preview, icon);
					this.plugin.refreshCustomButton();
				})
		);
	}

	private getCommandLabel(): string {
		const id = this.plugin.settings.customButtonCommandId;
		if (!id) return "Choose command…";
		const match = listAppCommands(this.app).find((c) => c.id === id);
		return match?.name ?? id;
	}

	private renderHighlightSection(
		containerEl: HTMLElement,
		title: string,
		desc: string,
		key: HighlightMapKey,
		defaultFor: (c: ColorDef) => string,
	): void {
		new Setting(containerEl).setName(title).setDesc(desc).setHeading();

		for (const c of NOTION_COLORS) {
			const themeDefault = defaultFor(c);
			const map = this.plugin.settings[key];
			const current = map[c.id] ?? themeDefault;
			new Setting(containerEl)
				.setName(c.label)
				.addColorPicker((picker) =>
					picker.setValue(current).onChange(async (value) => {
						this.setMap(key, { ...this.plugin.settings[key], [c.id]: value });
						await this.plugin.saveSettings();
						this.plugin.refreshColorVars();
					})
				)
				.addExtraButton((btn) =>
					btn
						.setIcon("rotate-ccw")
						.setTooltip(`Reset to default (${themeDefault})`)
						.onClick(async () => {
							const next = { ...this.plugin.settings[key] };
							delete next[c.id];
							this.setMap(key, next);
							await this.plugin.saveSettings();
							this.plugin.refreshColorVars();
							this.display();
						})
				);
		}
	}

	private setMap(key: HighlightMapKey, value: NotionToolbarSettings[HighlightMapKey]): void {
		this.plugin.settings[key] = value;
	}
}
