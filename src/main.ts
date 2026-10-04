import { Editor, MarkdownView, Notice, Plugin } from "obsidian";
import { SelectionToolbar } from "./SelectionToolbar";
import { RecentColor, refreshHighlightColorVars } from "./colors";
import { NotionToolbarSettingTab } from "./settings";
import { applyColor, selectionHasColorTag, toggleInlineWrap } from "./textCommands";

/** The part of an internal Obsidian command object patchBoldCommand() touches. */
interface BoldCommand {
	editorCallback?: (editor: Editor, ctx: unknown) => unknown;
}

export interface NotionToolbarSettings {
	recentColors: RecentColor[];
	/** User-customized hex values for the highlight (background) colors, keyed by color id —
	 *  kept separate per theme so a highlight can look different in light vs dark Obsidian. */
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

		this.patchBoldCommand();

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

	/** Makes Obsidian's own "Toggle bold" (Cmd/Ctrl+B, or whatever it's bound to)
	 *  bold a color/highlight tag — or a selection containing some — with <strong>
	 *  inside the tag(s), like the toolbar's Bold button, instead of `**`, which
	 *  Live Preview doesn't render there.
	 *  Anywhere else the original command runs unchanged. The command looks up
	 *  editorCallback when it runs, so swapping it is enough; restored on unload. */
	private patchBoldCommand(): void {
		const commands = (this.app as unknown as { commands?: { commands?: Record<string, BoldCommand> } })
			.commands?.commands;
		const bold = commands?.["editor:toggle-bold"];
		const original = bold?.editorCallback;
		if (!bold || !original) return;
		bold.editorCallback = (editor, ctx) => {
			if (selectionHasColorTag(editor)) toggleInlineWrap(editor, "**");
			else original.call(bold, editor, ctx);
		};
		this.register(() => {
			bold.editorCallback = original;
		});
	}

	/** Recomputes the `--nst-hl-*` custom properties for the active theme. Call
	 *  after anything that could change which value they should hold: startup,
	 *  a theme switch, or the user editing a highlight color in settings. */
	refreshColorVars(): void {
		refreshHighlightColorVars(this.settings.highlightColorsLight, this.settings.highlightColorsDark);
	}

	/** Re-reads the custom button's command/icon from settings and applies them to the
	 *  already-built toolbar, so changes in the settings tab show up immediately. */
	refreshCustomButton(): void {
		this.toolbar.refreshCustomButton();
	}

	onunload(): void {
		window.clearTimeout(this.debounceTimer);
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
