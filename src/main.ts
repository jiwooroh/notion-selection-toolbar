import { Editor, MarkdownView, Notice, Plugin } from "obsidian";
import { SelectionToolbar } from "./SelectionToolbar";
import { ColorScheme, RecentColor, applyColorScheme, colorsFor, refreshColorOverrides, textColorFromHighlight } from "./colors";
import { NotionToolbarSettingTab } from "./settings";
import { applyColor, selectionHasColorTag, toggleHighlight, toggleInlineWrap } from "./textCommands";

/** The part of an internal Obsidian command object patchFormattingCommand() touches. */
interface EditorCommand {
	editorCallback?: (editor: Editor, ctx: unknown) => unknown;
}

export interface NotionToolbarSettings {
	recentColors: RecentColor[];
	/** Which palette the applied text/highlight colors use (see COLOR_SCHEMES). */
	colorScheme: ColorScheme;
	/** User-customized text colors, keyed by color id — kept separate per theme. A
	 *  customized color's highlight is generated from it (see derivedHighlight). */
	textColorsLight: Record<string, string>;
	textColorsDark: Record<string, string>;
	/** Highlight colors customized directly, from versions before text colors were
	 *  the thing you edit. Converted to text colors on load (migrateHighlightColors)
	 *  and left empty. */
	highlightColorsLight: Record<string, string>;
	highlightColorsDark: Record<string, string>;
	/** Command id the designated custom toolbar button runs, chosen from the command
	 *  palette in settings. Null until the user assigns one. */
	customButtonCommandId: string | null;
	/** Lucide icon name shown on the custom toolbar button. */
	customButtonIcon: string;
	/** What the Comment button does: "auto" uses the Notion-style Comments plugin
	 *  when it's enabled and falls back to a native %% comment otherwise. */
	commentMode: CommentMode;
}

export type CommentMode = "auto" | "plugin" | "native";

const DEFAULT_SETTINGS: NotionToolbarSettings = {
	recentColors: [],
	colorScheme: "notion",
	textColorsLight: {},
	textColorsDark: {},
	highlightColorsLight: {},
	highlightColorsDark: {},
	customButtonCommandId: null,
	customButtonIcon: "sparkles",
	commentMode: "auto",
};

export default class NotionToolbarPlugin extends Plugin {
	settings: NotionToolbarSettings = DEFAULT_SETTINGS;
	private toolbar!: SelectionToolbar;
	private debounceTimer = 0;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.toolbar = new SelectionToolbar(this.app, this);
		this.addSettingTab(new NotionToolbarSettingTab(this.app, this));
		this.refreshColorVars();

		this.patchFormattingCommand("editor:toggle-bold", "**");
		this.patchFormattingCommand("editor:toggle-italics", "*");
		this.patchHighlightCommand();

		// No default hotkey — the user binds their own via Settings → Hotkeys.
		// Same toggleInlineWrap the floating toolbar's own buttons call.
		this.addCommand({
			id: "toggle-strikethrough",
			name: "Toggle strikethrough",
			editorCallback: (editor) => toggleInlineWrap(editor, "~~"),
		});
		this.addCommand({
			id: "toggle-underline",
			name: "Toggle underline",
			editorCallback: (editor) => toggleInlineWrap(editor, "<u>", "</u>"),
		});
		// Explicit default hotkey (unlike the two above) since the user asked for
		// this exact binding specifically, not just "some" hotkey.
		this.addCommand({
			id: "apply-recent-color",
			name: "Apply most recently used color",
			hotkeys: [{ modifiers: ["Mod", "Shift"], key: "h" }],
			editorCallback: (editor) => {
				const recent = this.settings.recentColors[0];
				if (!recent) {
					new Notice("No recently used color yet — pick one from the toolbar first.");
					return;
				}
				applyColor(editor, recent.kind, recent.id);
				void this.pushRecentColor(recent);
			},
		});

		this.registerDomEvent(document, "selectionchange", this.scheduleEvaluate);
		// Re-check rather than hide on resize: on iPad the on-screen keyboard and
		// shortcut bar resize the window right as a selection is made, which used to
		// hide the toolbar immediately after it appeared.
		this.registerDomEvent(window, "resize", this.scheduleEvaluate);
		const vv = window.visualViewport;
		if (vv) {
			vv.addEventListener("resize", this.scheduleEvaluate);
			this.register(() => vv.removeEventListener("resize", this.scheduleEvaluate));
		}
		this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.toolbar.hide()));
		this.registerEvent(this.app.workspace.on("file-open", () => this.toolbar.hide()));
		// Fires on theme/appearance changes (light↔dark, snippet toggles, …) — keep
		// the highlight-color CSS variables in sync so already-applied highlights
		// re-render in the new theme's colors instead of staying frozen.
		this.registerEvent(this.app.workspace.on("css-change", () => this.refreshColorVars()));
	}

	/** Makes Obsidian's own "Toggle bold" / "Toggle italics" (Cmd/Ctrl+B / I, or
	 *  whatever they're bound to) format a color/highlight tag — or a selection
	 *  containing or inside one — with <strong> / <em> inside the tag, like the
	 *  toolbar's buttons, instead of `**` / `*`, which Live Preview doesn't render
	 *  there. Anywhere else the original command runs unchanged. */
	private patchFormattingCommand(id: string, marker: string): void {
		this.patchEditorCommand(id, (editor) => {
			if (!selectionHasColorTag(editor)) return false;
			toggleInlineWrap(editor, marker);
			return true;
		});
	}

	/** Makes Obsidian's own "Toggle highlight" (Cmd/Ctrl+H, or whatever it's bound
	 *  to) apply this plugin's yellow highlight instead of `==text==`, toggling it
	 *  off when the selection already has it. With no selection it uses the word
	 *  under the cursor; with neither, Obsidian's command runs as usual. */
	private patchHighlightCommand(): void {
		this.patchEditorCommand("editor:toggle-highlight", (editor) => {
			if (!toggleHighlight(editor, "yellow")) return false;
			void this.pushRecentColor({ kind: "background", id: "yellow" });
			return true;
		});
	}

	/** Swaps an Obsidian editor command's editorCallback for `handle`, falling back
	 *  to the original when `handle` returns false. The command looks up
	 *  editorCallback when it runs, so swapping it is enough; restored on unload. */
	private patchEditorCommand(id: string, handle: (editor: Editor) => boolean): void {
		const commands = (this.app as unknown as { commands?: { commands?: Record<string, EditorCommand> } })
			.commands?.commands;
		const command = commands?.[id];
		const original = command?.editorCallback;
		if (!command || !original) return;
		command.editorCallback = (editor, ctx) => {
			if (!handle(editor)) original.call(command, editor, ctx);
		};
		this.register(() => {
			command.editorCallback = original;
		});
	}

	/** Applies the color scheme and recomputes the color custom properties
	 *  for the active theme. Call after anything that could change which value
	 *  they should hold: startup, a theme switch, the user switching scheme or
	 *  editing a color in settings. */
	refreshColorVars(): void {
		applyColorScheme(this.settings.colorScheme);
		refreshColorOverrides(this.settings);
	}

	/** Re-reads the custom button's command/icon from settings and applies them to the
	 *  already-built toolbar, so changes in the settings tab show up immediately. */
	refreshCustomButton(): void {
		this.toolbar.refreshCustomButton();
	}

	onunload(): void {
		window.clearTimeout(this.debounceTimer);
		applyColorScheme("notion");
		refreshColorOverrides({ textColorsLight: {}, textColorsDark: {} });
		this.toolbar.destroy();
	}

	private scheduleEvaluate = (): void => {
		window.clearTimeout(this.debounceTimer);
		this.debounceTimer = window.setTimeout(() => this.evaluateSelection(), 120);
	};

	private evaluateSelection(): void {
		if (this.toolbar.isMenuOpen() || this.toolbar.isInteracting()) return;

		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view || view.getMode() !== "source") {
			this.toolbar.hide();
			return;
		}

		const editor: Editor = view.editor;
		if (!editor.somethingSelected()) {
			this.toolbar.hide();
			return;
		}

		const sel = window.getSelection();
		if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
			this.toolbar.hide();
			return;
		}

		const rect = sel.getRangeAt(0).getBoundingClientRect();
		if (rect.width === 0 && rect.height === 0) {
			this.toolbar.hide();
			return;
		}

		this.toolbar.showForSelection(editor, rect);
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		if (this.migrateHighlightColors()) await this.saveSettings();
	}

	/** Older versions customized highlight colors directly; now you edit the text
	 *  color and the highlight follows it. Converts each such highlight into a
	 *  text color of the same hue (textColorFromHighlight) unless that color
	 *  already has a text color. Returns whether anything changed. */
	private migrateHighlightColors(): boolean {
		const colors = colorsFor(this.settings.colorScheme);
		let changed = false;
		for (const [hlKey, textKey, dark] of [
			["highlightColorsLight", "textColorsLight", false],
			["highlightColorsDark", "textColorsDark", true],
		] as const) {
			for (const [id, highlight] of Object.entries(this.settings[hlKey])) {
				const def = colors.find((c) => c.id === id);
				if (def && !this.settings[textKey][id]) {
					this.settings[textKey] = {
						...this.settings[textKey],
						[id]: textColorFromHighlight(highlight, dark ? def.fgDark : def.fg),
					};
				}
				changed = true;
			}
			this.settings[hlKey] = {};
		}
		return changed;
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	async pushRecentColor(rc: RecentColor): Promise<void> {
		const filtered = this.settings.recentColors.filter((c) => !(c.kind === rc.kind && c.id === rc.id));
		filtered.unshift(rc);
		this.settings.recentColors = filtered.slice(0, 5);
		await this.saveSettings();
	}
}
