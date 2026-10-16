import { App, FuzzySuggestModal, PluginSettingTab, Setting, setIcon } from "obsidian";
import { COLOR_SCHEMES, ColorDef, ColorScheme, colorsFor, derivedHighlight } from "./colors";
import type { CommentMode, NotionToolbarSettings } from "./main";
import type NotionToolbarPlugin from "./main";

type Theme = "light" | "dark";
const TEXT_KEY = { light: "textColorsLight", dark: "textColorsDark" } as const;

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

		new Setting(containerEl)
			.setName("Color scheme")
			.setDesc(
				"The palette for text and highlight colors. Switching recolors colors already in your notes; the notes themselves don't change.",
			)
			.addDropdown((dd) => {
				for (const scheme of COLOR_SCHEMES) dd.addOption(scheme.id, scheme.label);
				dd.setValue(this.plugin.settings.colorScheme).onChange(async (value) => {
					this.plugin.settings.colorScheme = value as ColorScheme;
					await this.plugin.saveSettings();
					this.plugin.refreshColorVars();
					this.display();
				});
			});

		containerEl.createEl("p", {
			text: "Edit each color by its text color, separately for light and dark theme. A customized color's highlight (background) is generated from it automatically, so text and highlight always match. Colors you haven't changed use the scheme's.",
			cls: "setting-item-description",
		});

		this.renderColorSection(containerEl, "Light theme colors", "Used while Obsidian is in light mode.", "light");
		this.renderColorSection(containerEl, "Dark theme colors", "Used while Obsidian is in dark mode.", "dark");

		this.renderCommentSection(containerEl);
		this.renderCustomButtonSection(containerEl);
	}

	private renderCommentSection(containerEl: HTMLElement): void {
		new Setting(containerEl).setName("Comment button").setHeading();
		new Setting(containerEl)
			.setName("Comment style")
			.setDesc(
				"Automatic uses the Notion-style Comments plugin when it's enabled, and native Obsidian comments (%%text%%) otherwise.",
			)
			.addDropdown((dd) =>
				dd
					.addOption("auto", "Automatic")
					.addOption("plugin", "Notion-style Comments plugin")
					.addOption("native", "Native Obsidian comment (%%)")
					.setValue(this.plugin.settings.commentMode)
					.onChange(async (value) => {
						this.plugin.settings.commentMode = value as CommentMode;
						await this.plugin.saveSettings();
					})
			);
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

	private renderColorSection(containerEl: HTMLElement, title: string, desc: string, theme: Theme): void {
		new Setting(containerEl).setName(title).setDesc(desc).setHeading();
		const textKey = TEXT_KEY[theme];
		const dark = theme === "dark";

		for (const c of colorsFor(this.plugin.settings.colorScheme)) {
			const schemeText = dark ? c.fgDark : c.fg;
			const custom = this.plugin.settings[textKey][c.id];
			const text = custom ?? schemeText;
			const highlight = custom ? derivedHighlight(custom, c.id, dark) : dark ? c.bgDark : c.bg;

			const setting = new Setting(containerEl).setName(c.label);
			setting.settingEl.addClass("nst-color-setting");
			// Live sample of this color's text on its highlight, on the theme's page color.
			const page = setting.controlEl.createSpan({ cls: `nst-color-page ${dark ? "mod-dark" : "mod-light"}` });
			const sample = page.createSpan({ cls: "nst-color-sample", text: "Aa" });
			const paint = (fg: string, bg: string) => sample.setCssStyles({ color: fg, backgroundColor: bg });
			paint(text, highlight);

			setting
				.addColorPicker((picker) =>
					// The color picker takes #RRGGBB only.
					picker.setValue(text.slice(0, 7)).onChange(async (value) => {
						this.plugin.settings[textKey] = { ...this.plugin.settings[textKey], [c.id]: value };
						await this.plugin.saveSettings();
						this.plugin.refreshColorVars();
						paint(value, derivedHighlight(value, c.id, dark));
					})
				)
				.addExtraButton((btn) =>
					btn
						.setIcon("rotate-ccw")
						.setTooltip(`Reset to the scheme's color (${schemeText})`)
						.onClick(async () => {
							const { [c.id]: _removed, ...restText } = this.plugin.settings[textKey];
							this.plugin.settings[textKey] = restText;
							await this.plugin.saveSettings();
							this.plugin.refreshColorVars();
							this.display();
						})
				);
		}
	}
}
