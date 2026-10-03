import { App, Editor, Notice, Platform, setIcon } from "obsidian";
import { applyBlockTypeAction, BLOCK_MENU_ITEMS, CALLOUT_TYPES, DETECTED_LABELS } from "./blockTypes";
import { ColorKind, findColor, NOTION_COLORS } from "./colors";
import {
	applyCalloutType,
	applyColor,
	clearFormatting,
	detectBlockType,
	insertLink,
	toggleInlineWrap,
} from "./textCommands";
import type NotionToolbarPlugin from "./main";

// Obsidian's built-in "Toggle comment" (Cmd/Ctrl+/), which wraps the selection in
// %%…%% — the same native Markdown comment every other Obsidian feature understands.
const TOGGLE_COMMENT_COMMAND_ID = "editor:toggle-comments";
// "Add comment" from the Notion-style Comments plugin (github.com/jiwooroh/obsidian-document-comments).
export const COMMENT_PLUGIN_COMMAND_ID = "notion-style-comments:add-comment";

type Submenu = "none" | "blocktype" | "color" | "link" | "callout";

export class SelectionToolbar {
	private app: App;
	private plugin: NotionToolbarPlugin;

	private rootEl!: HTMLElement;
	private blockTypeBtn!: HTMLElement;
	private blockTypeLabel!: HTMLElement;
	private colorBtn!: HTMLElement;
	private linkBtn!: HTMLElement;
	private commentBtn!: HTMLElement;
	private customBtn!: HTMLElement;

	private panelEl: HTMLElement | null = null;
	private submenu: Submenu = "none";
	private currentEditor: Editor | null = null;
	private visible = false;
	/** True while a finger/pointer is down on the toolbar or one of its panels. On
	 *  touch devices (iPad) that tap can briefly collapse the DOM selection, which
	 *  would otherwise make the selection watcher hide the toolbar mid-tap. */
	private interacting = false;
	private interactTimer = 0;

	constructor(app: App, plugin: NotionToolbarPlugin) {
		this.app = app;
		this.plugin = plugin;
		this.build();
	}

	public isMenuOpen(): boolean {
		return this.submenu !== "none";
	}

	public isInteracting(): boolean {
		return this.interacting;
	}

	public isVisible(): boolean {
		return this.visible;
	}

	public showForSelection(editor: Editor, rect: DOMRect): void {
		this.currentEditor = editor;
		this.updateBlockLabel(editor);
		this.positionAt(rect);
		this.visible = true;
	}

	public hide(): void {
		if (!this.visible && this.submenu === "none") return;
		this.rootEl.addClass("nst-hidden");
		this.closePanel();
		this.visible = false;
		this.currentEditor = null;
	}

	public destroy(): void {
		document.removeEventListener("mousedown", this.onDocMouseDown, true);
		document.removeEventListener("pointerdown", this.onDocPointerDown, true);
		document.removeEventListener("pointerup", this.onDocPointerUp, true);
		document.removeEventListener("pointercancel", this.onDocPointerUp, true);
		window.clearTimeout(this.interactTimer);
		document.removeEventListener("keydown", this.onKeyDown);
		this.closePanel();
		this.rootEl.remove();
	}

	// ---------- construction ----------

	private build(): void {
		this.rootEl = createDiv({ cls: ["nst-toolbar", "nst-hidden"] });
		document.body.appendChild(this.rootEl);

		this.rootEl.addEventListener("mousedown", (e) => {
			e.preventDefault();
		});

		this.blockTypeBtn = this.rootEl.createEl("button", {
			cls: "nst-block-btn",
			attr: { type: "button", "aria-label": "Turn into" },
		});
		const blockIcon = this.blockTypeBtn.createSpan({ cls: "nst-block-icon" });
		setIcon(blockIcon, "type");
		this.blockTypeLabel = this.blockTypeBtn.createSpan({ cls: "nst-block-label", text: "Text" });
		const chevron1 = this.blockTypeBtn.createSpan({ cls: "nst-chevron" });
		setIcon(chevron1, "chevron-right");
		this.blockTypeBtn.addEventListener("click", (e) => {
			e.preventDefault();
			this.openPanel("blocktype");
		});

		this.rootEl.createDiv({ cls: "nst-sep-break" });

		// Row 2 (5): color, bold, italic, underline, clear format
		this.colorBtn = this.rootEl.createEl("button", {
			cls: "nst-color-btn",
			attr: { type: "button", "aria-label": "Text & background color" },
		});
		this.colorBtn.createSpan({ cls: "nst-color-a", text: "A" });
		this.colorBtn.addEventListener("click", (e) => {
			e.preventDefault();
			this.openPanel("color");
		});
		this.makeIconButton("bold", "bold", "Bold");
		this.makeIconButton("italic", "italic", "Italic");
		this.makeIconButton("underline", "underline", "Underline");
		this.makeIconButton("clear", "remove-formatting", "Clear formatting");

		this.rootEl.createDiv({ cls: "nst-sep-break" });

		// Row 3 (5): link, strikethrough, code, math, more (command palette)
		this.linkBtn = this.makeIconButton("link", "link", "Link");
		this.makeIconButton("strikethrough", "strikethrough", "Strikethrough");
		this.makeIconButton("inlinecode", "code", "Inline code");
		this.makeIconButton("inlinemath", "sigma", "Inline equation");
		this.makeIconButton("more", "more-horizontal", "More (command palette)");

		this.rootEl.createDiv({ cls: "nst-sep-break" });

		// Row 4: comment, on its own now that "more" moved up into the icon grid.
		this.commentBtn = this.rootEl.createEl("button", {
			cls: "nst-comment-btn",
			attr: { type: "button", "aria-label": "Comment" },
		});
		const commentIcon = this.commentBtn.createSpan({ cls: "nst-comment-icon" });
		setIcon(commentIcon, "message-square");
		this.commentBtn.createSpan({ cls: "nst-comment-label", text: "Comment" });
		this.commentBtn.addEventListener("click", (e) => {
			e.preventDefault();
			this.addComment();
		});

		// Designated custom button — same row as Comment, sized like the other 1x1
		// icon buttons. Its command and icon are configured in the plugin's settings
		// tab, not per-click, so it always does the one thing the user assigned it.
		this.customBtn = this.rootEl.createEl("button", {
			cls: "nst-btn",
			attr: { type: "button" },
		});
		setIcon(this.customBtn, this.plugin.settings.customButtonIcon || "sparkles");
		this.updateCustomButtonTooltip();
		this.customBtn.addEventListener("click", (e) => {
			e.preventDefault();
			this.runCustomButtonCommand();
		});

		document.addEventListener("mousedown", this.onDocMouseDown, true);
		document.addEventListener("pointerdown", this.onDocPointerDown, true);
		document.addEventListener("pointerup", this.onDocPointerUp, true);
		document.addEventListener("pointercancel", this.onDocPointerUp, true);
		document.addEventListener("keydown", this.onKeyDown);
	}

	private makeIconButton(cmd: string, icon: string, title: string): HTMLElement {
		const btn = this.rootEl.createEl("button", {
			cls: "nst-btn",
			attr: { type: "button", "aria-label": title, title, "data-cmd": cmd },
		});
		setIcon(btn, icon);
		btn.addEventListener("click", (e) => {
			e.preventDefault();
			if (cmd === "link") {
				this.openPanel("link");
				return;
			}
			if (cmd === "more") {
				this.openCommandPalette();
				return;
			}
			this.runCommand(cmd);
		});
		return btn;
	}

	// ---------- commands ----------

	private runCommand(cmd: string): void {
		const editor = this.currentEditor;
		if (!editor) return;
		switch (cmd) {
			case "bold":
				toggleInlineWrap(editor, "**");
				break;
			case "italic":
				toggleInlineWrap(editor, "*");
				break;
			case "underline":
				toggleInlineWrap(editor, "<u>", "</u>");
				break;
			case "strikethrough":
				toggleInlineWrap(editor, "~~");
				break;
			case "clear":
				clearFormatting(editor);
				break;
			case "inlinecode":
				toggleInlineWrap(editor, "`");
				break;
			case "inlinemath":
				toggleInlineWrap(editor, "$");
				break;
		}
		this.refreshAfterEdit();
	}

	private openCommandPalette(): void {
		const commands = this.getAppCommands();
		commands?.executeCommandById("command-palette:open");
	}

	private getAppCommands(): { executeCommandById: (id: string) => boolean; commands: Record<string, unknown> } {
		return (
			this.app as unknown as {
				commands: { executeCommandById: (id: string) => boolean; commands: Record<string, unknown> };
			}
		).commands;
	}

	private addComment(): void {
		const editor = this.currentEditor;
		if (!editor) return;
		const commands = this.getAppCommands();
		const mode = this.plugin.settings.commentMode;
		const pluginAvailable = !!commands?.commands?.[COMMENT_PLUGIN_COMMAND_ID];

		if (mode === "plugin" || (mode === "auto" && pluginAvailable)) {
			if (!pluginAvailable) {
				new Notice("Install and enable the \"Notion-style Comments\" plugin, or switch the Comment button to native comments in settings.");
				return;
			}
			editor.focus();
			commands.executeCommandById(COMMENT_PLUGIN_COMMAND_ID);
			this.hide();
			return;
		}

		editor.focus();
		const ran = commands?.executeCommandById(TOGGLE_COMMENT_COMMAND_ID);
		if (!ran) toggleInlineWrap(editor, "%%");
		this.refreshAfterEdit();
	}

	private runCustomButtonCommand(): void {
		const id = this.plugin.settings.customButtonCommandId;
		if (!id) {
			new Notice("Set a command for this button in the Notion Toolbar settings.");
			return;
		}
		const commands = this.getAppCommands();
		if (!commands?.commands?.[id]) {
			new Notice("The command assigned to this button is no longer available.");
			return;
		}
		commands.executeCommandById(id);
	}

	/** Called by the settings tab after the user changes the custom button's
	 *  command or icon, so the already-built toolbar picks it up immediately. */
	public refreshCustomButton(): void {
		this.customBtn.empty();
		setIcon(this.customBtn, this.plugin.settings.customButtonIcon || "sparkles");
		this.updateCustomButtonTooltip();
	}

	private updateCustomButtonTooltip(): void {
		const id = this.plugin.settings.customButtonCommandId;
		const commands = this.getAppCommands();
		const entry = id ? (commands?.commands?.[id] as { name?: string } | undefined) : undefined;
		const label = entry?.name ?? "Custom action (unset)";
		this.customBtn.setAttribute("aria-label", label);
		this.customBtn.setAttribute("title", label);
	}

	private applyColorChoice(kind: ColorKind, colorId: string): void {
		const editor = this.currentEditor;
		if (!editor) return;
		// No hex to resolve here anymore — applyColor writes a named class, and the
		// actual color (default or user-customized) comes from the CSS custom
		// properties the plugin keeps in sync (see main.ts / styles.css).
		applyColor(editor, kind, colorId);
		void this.plugin.pushRecentColor({ kind, id: colorId });
		this.closePanel();
		this.refreshAfterEdit();
	}

	// ---------- selection tracking helpers ----------

	private updateBlockLabel(editor: Editor): void {
		const line = editor.getLine(editor.getCursor("head").line);
		const type = detectBlockType(line);
		this.blockTypeLabel.setText(DETECTED_LABELS[type] ?? "Text");
	}

	private refreshAfterEdit(): void {
		window.setTimeout(() => {
			const editor = this.currentEditor;
			if (!editor || !editor.somethingSelected()) {
				this.hide();
				return;
			}
			const sel = window.getSelection();
			if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
				this.hide();
				return;
			}
			const rect = sel.getRangeAt(0).getBoundingClientRect();
			if (rect.width === 0 && rect.height === 0) {
				this.hide();
				return;
			}
			this.updateBlockLabel(editor);
			this.positionAt(rect);
		}, 0);
	}

	// ---------- positioning ----------

	private positionAt(rect: DOMRect): void {
		const margin = 8;
		this.rootEl.addClass("nst-measuring");
		this.rootEl.removeClass("nst-hidden");
		this.rootEl.setCssStyles({ left: "0px", top: "0px" });
		const toolbarRect = this.rootEl.getBoundingClientRect();

		// On touch devices the OS draws its own Copy/Paste menu above the selection,
		// so go below it there; on desktop prefer above, like Notion.
		const above = rect.top - toolbarRect.height - margin;
		const below = rect.bottom + margin;
		const viewportH = window.visualViewport?.height ?? window.innerHeight;
		let top: number;
		if (Platform.isMobile) {
			top = below + toolbarRect.height <= viewportH - 4 ? below : above;
		} else {
			top = above >= 4 ? above : below;
		}
		top = Math.max(4, top);
		let left = rect.left + rect.width / 2 - toolbarRect.width / 2;
		left = Math.max(4, Math.min(left, window.innerWidth - toolbarRect.width - 4));

		this.rootEl.setCssStyles({ left: `${left}px`, top: `${top}px` });
		this.rootEl.removeClass("nst-measuring");
	}

	/**
	 * Always opens the panel below its anchor button, never above it. If there isn't enough
	 * room to the bottom of the viewport, the panel shrinks (it scrolls internally) instead of
	 * flipping to sit on top of the toolbar/selection.
	 */
	private positionPanel(anchor: HTMLElement): void {
		if (!this.panelEl) return;
		const anchorRect = anchor.getBoundingClientRect();
		this.panelEl.addClass("nst-measuring");
		this.panelEl.setCssStyles({ left: "0px", top: "0px", maxHeight: "" });
		const panelRect = this.panelEl.getBoundingClientRect();

		const top = anchorRect.bottom + 6;
		const available = window.innerHeight - top - 4;
		if (panelRect.height > available) {
			this.panelEl.setCssStyles({ maxHeight: `${Math.max(120, available)}px` });
		}
		let left = anchorRect.left;
		left = Math.max(4, Math.min(left, window.innerWidth - panelRect.width - 4));

		this.panelEl.setCssStyles({ left: `${left}px`, top: `${top}px` });
		this.panelEl.removeClass("nst-measuring");
	}

	// ---------- submenus ----------

	private openPanel(kind: Exclude<Submenu, "none">): void {
		if (this.submenu === kind) {
			this.closePanel();
			return;
		}
		this.closePanel();
		this.submenu = kind;
		this.panelEl = createDiv({ cls: "nst-panel" });
		document.body.appendChild(this.panelEl);

		if (kind === "blocktype") {
			this.buildBlockTypePanel(this.panelEl);
			this.positionPanel(this.blockTypeBtn);
		} else if (kind === "color") {
			this.buildColorPanel(this.panelEl);
			this.positionPanel(this.colorBtn);
		} else if (kind === "callout") {
			this.buildCalloutPanel(this.panelEl);
			this.positionPanel(this.blockTypeBtn);
		} else {
			this.buildLinkPanel(this.panelEl);
			this.positionPanel(this.linkBtn);
		}
	}

	private closePanel(): void {
		this.submenu = "none";
		this.panelEl?.remove();
		this.panelEl = null;
	}

	private buildBlockTypePanel(panelEl: HTMLElement): void {
		panelEl.addClass("nst-panel-list");
		panelEl.addEventListener("mousedown", (e) => e.preventDefault());

		const editor = this.currentEditor;
		const currentType = editor ? detectBlockType(editor.getLine(editor.getCursor("head").line)) : "text";

		for (const item of BLOCK_MENU_ITEMS) {
			const row = panelEl.createDiv({ cls: "nst-panel-item" });
			const iconEl = row.createSpan({ cls: "nst-panel-item-icon" });
			setIcon(iconEl, item.icon);
			row.createSpan({ cls: "nst-panel-item-label", text: item.label });
			if (item.id === currentType) {
				const check = row.createSpan({ cls: "nst-panel-item-check" });
				setIcon(check, "check");
			}
			row.addEventListener("click", async (e) => {
				e.preventDefault();
				if (item.id === "callout") {
					this.openPanel("callout");
					return;
				}
				const ed = this.currentEditor;
				if (!ed) return;
				await applyBlockTypeAction(this.app, ed, item.id);
				this.closePanel();
				this.refreshAfterEdit();
			});
		}
	}

	private buildCalloutPanel(panelEl: HTMLElement): void {
		panelEl.addClass("nst-panel-list");
		panelEl.addEventListener("mousedown", (e) => e.preventDefault());

		for (const type of CALLOUT_TYPES) {
			const row = panelEl.createDiv({ cls: "nst-panel-item" });
			const dot = row.createSpan({ cls: "nst-callout-dot" });
			dot.setCssStyles({ backgroundColor: `rgb(var(--callout-${type.id}))` });
			const iconEl = row.createSpan({ cls: "nst-panel-item-icon" });
			setIcon(iconEl, type.icon);
			row.createSpan({ cls: "nst-panel-item-label", text: type.label });
			row.addEventListener("click", (e) => {
				e.preventDefault();
				const ed = this.currentEditor;
				if (!ed) return;
				applyCalloutType(ed, type.id);
				this.closePanel();
				this.refreshAfterEdit();
			});
		}
	}

	private buildColorPanel(panelEl: HTMLElement): void {
		panelEl.addClass("nst-panel-colors");
		panelEl.addEventListener("mousedown", (e) => e.preventDefault());

		const recent = this.plugin.settings.recentColors;
		if (recent.length > 0) {
			panelEl.createDiv({ cls: "nst-panel-heading", text: "Recently used" });
			const row = panelEl.createDiv({ cls: "nst-swatch-row" });
			for (const rc of recent) {
				row.appendChild(this.makeSwatch(rc.kind, rc.id));
			}
		}

		panelEl.createDiv({ cls: "nst-panel-heading", text: "Text color" });
		const textRow1 = panelEl.createDiv({ cls: "nst-swatch-row" });
		textRow1.appendChild(this.makeSwatch("text", "default"));
		NOTION_COLORS.slice(0, 4).forEach((c) => textRow1.appendChild(this.makeSwatch("text", c.id)));
		const textRow2 = panelEl.createDiv({ cls: "nst-swatch-row" });
		NOTION_COLORS.slice(4, 9).forEach((c) => textRow2.appendChild(this.makeSwatch("text", c.id)));

		panelEl.createDiv({ cls: "nst-panel-heading", text: "Background color" });
		const bgRow1 = panelEl.createDiv({ cls: "nst-swatch-row" });
		bgRow1.appendChild(this.makeSwatch("background", "default"));
		NOTION_COLORS.slice(0, 4).forEach((c) => bgRow1.appendChild(this.makeSwatch("background", c.id)));
		const bgRow2 = panelEl.createDiv({ cls: "nst-swatch-row" });
		NOTION_COLORS.slice(4, 9).forEach((c) => bgRow2.appendChild(this.makeSwatch("background", c.id)));
	}

	private makeSwatch(kind: ColorKind, colorId: string): HTMLElement {
		const def = colorId === "default" ? null : findColor(colorId);
		const btn = createEl("button", {
			cls: "nst-swatch",
			attr: { type: "button", title: def ? def.label : "Default" },
		});
		if (kind === "text") {
			btn.addClass("nst-swatch-text");
			btn.setText("A");
			// References the same CSS variable the applied `nst-fg-*` class uses, so
			// the swatch preview is never out of sync with what clicking it produces.
			btn.setCssStyles({ color: def ? `var(--nst-fg-${def.id})` : "var(--text-normal)" });
		} else {
			btn.addClass("nst-swatch-bg");
			btn.setCssStyles({ backgroundColor: def ? `var(--nst-hl-${def.id})` : "transparent" });
		}
		btn.addEventListener("click", (e) => {
			e.preventDefault();
			this.applyColorChoice(kind, colorId);
		});
		return btn;
	}

	private buildLinkPanel(panelEl: HTMLElement): void {
		panelEl.addClass("nst-panel-link");
		const input = panelEl.createEl("input", {
			cls: "nst-link-input",
			attr: { type: "text", placeholder: "Paste or type a link" },
		}) as HTMLInputElement;
		window.setTimeout(() => input.focus(), 0);

		input.addEventListener("keydown", (e) => {
			e.stopPropagation();
			if (e.key === "Enter") {
				e.preventDefault();
				const url = input.value.trim();
				const editor = this.currentEditor;
				if (editor && url) insertLink(editor, url);
				this.closePanel();
				this.refreshAfterEdit();
			} else if (e.key === "Escape") {
				e.preventDefault();
				this.closePanel();
			}
		});
	}

	// ---------- global dismissal ----------

	private isInsideToolbar(target: EventTarget | null): boolean {
		if (!(target instanceof Node)) return false;
		return this.rootEl.contains(target) || !!this.panelEl?.contains(target);
	}

	private onDocPointerDown = (e: PointerEvent): void => {
		if (!this.isInsideToolbar(e.target)) return;
		window.clearTimeout(this.interactTimer);
		this.interacting = true;
	};

	private onDocPointerUp = (): void => {
		if (!this.interacting) return;
		// Let the click (and the editor.focus() it triggers) settle before the
		// selection watcher is allowed to react again.
		window.clearTimeout(this.interactTimer);
		this.interactTimer = window.setTimeout(() => (this.interacting = false), 400);
	};

	private onDocMouseDown = (e: MouseEvent): void => {
		if (this.submenu === "none") return;
		const target = e.target as Node;
		if (this.panelEl && this.panelEl.contains(target)) return;
		if (this.rootEl.contains(target)) return;
		this.closePanel();
	};

	private onKeyDown = (e: KeyboardEvent): void => {
		if (e.key !== "Escape") return;
		if (this.submenu !== "none") {
			this.closePanel();
		} else if (this.visible) {
			this.hide();
		}
	};
}
