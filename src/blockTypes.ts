import { App, Editor } from "obsidian";
import {
	makeColumns,
	makeToggleHeading,
	makeToggleList,
	setLineBlockType,
	wrapAsCodeBlock,
	wrapAsMathBlock,
} from "./textCommands";
import { FolderSuggestModal, turnSelectionIntoPage } from "./pages";

export interface BlockMenuItem {
	id: string;
	label: string;
	icon: string;
}

export const BLOCK_MENU_ITEMS: BlockMenuItem[] = [
	{ id: "text", label: "Text", icon: "type" },
	{ id: "heading1", label: "Heading 1", icon: "heading-1" },
	{ id: "heading2", label: "Heading 2", icon: "heading-2" },
	{ id: "heading3", label: "Heading 3", icon: "heading-3" },
	{ id: "heading4", label: "Heading 4", icon: "heading-4" },
	{ id: "page", label: "Page", icon: "file" },
	{ id: "pagein", label: "Page in", icon: "folder-input" },
	{ id: "bulleted", label: "Bulleted list", icon: "list" },
	{ id: "numbered", label: "Numbered list", icon: "list-ordered" },
	{ id: "todo", label: "To-do list", icon: "list-todo" },
	{ id: "toggle", label: "Toggle list", icon: "chevron-right" },
	{ id: "code", label: "Code", icon: "code" },
	{ id: "quote", label: "Quote", icon: "quote" },
	{ id: "callout", label: "Callout", icon: "message-square" },
	{ id: "mathblock", label: "Block equation", icon: "sigma" },
	{ id: "toggleH1", label: "Toggle heading 1", icon: "chevron-right" },
	{ id: "toggleH2", label: "Toggle heading 2", icon: "chevron-right" },
	{ id: "toggleH3", label: "Toggle heading 3", icon: "chevron-right" },
	{ id: "toggleH4", label: "Toggle heading 4", icon: "chevron-right" },
	{ id: "columns2", label: "2 columns", icon: "columns" },
];

export interface CalloutTypeDef {
	id: string;
	label: string;
	icon: string;
}

/** Obsidian's built-in callout types (docs.obsidian.md/Editing+and+formatting/Callouts). */
export const CALLOUT_TYPES: CalloutTypeDef[] = [
	{ id: "note", label: "Note", icon: "pencil" },
	{ id: "abstract", label: "Abstract / Summary", icon: "clipboard-list" },
	{ id: "info", label: "Info", icon: "info" },
	{ id: "todo", label: "Todo", icon: "circle-check" },
	{ id: "tip", label: "Tip / Hint", icon: "flame" },
	{ id: "success", label: "Success / Done", icon: "check" },
	{ id: "question", label: "Question / FAQ", icon: "help-circle" },
	{ id: "warning", label: "Warning / Caution", icon: "alert-triangle" },
	{ id: "failure", label: "Failure / Missing", icon: "x" },
	{ id: "danger", label: "Danger / Error", icon: "zap" },
	{ id: "bug", label: "Bug", icon: "bug" },
	{ id: "example", label: "Example", icon: "list" },
	{ id: "quote", label: "Quote / Cite", icon: "quote" },
];

/** Maps the block-type menu id to the label shown live-detected on the toolbar button. */
export const DETECTED_LABELS: Record<string, string> = {
	text: "Text",
	heading1: "Heading 1",
	heading2: "Heading 2",
	heading3: "Heading 3",
	heading4: "Heading 4",
	bulleted: "Bulleted list",
	numbered: "Numbered list",
	todo: "To-do list",
	quote: "Quote",
	callout: "Callout",
};

export async function applyBlockTypeAction(app: App, editor: Editor, id: string): Promise<void> {
	switch (id) {
		case "text":
		case "heading1":
		case "heading2":
		case "heading3":
		case "heading4":
		case "bulleted":
		case "numbered":
		case "todo":
		case "quote":
		case "callout":
			setLineBlockType(editor, id as any);
			return;
		case "code":
			wrapAsCodeBlock(editor);
			return;
		case "mathblock":
			wrapAsMathBlock(editor);
			return;
		case "toggle":
			makeToggleList(editor);
			return;
		case "toggleH1":
			makeToggleHeading(editor, 1);
			return;
		case "toggleH2":
			makeToggleHeading(editor, 2);
			return;
		case "toggleH3":
			makeToggleHeading(editor, 3);
			return;
		case "toggleH4":
			makeToggleHeading(editor, 4);
			return;
		case "columns2":
			makeColumns(editor, 2);
			return;
		case "page": {
			const active = app.workspace.getActiveFile();
			const folder = active?.parent?.path ?? "";
			await turnSelectionIntoPage(app, editor, folder);
			return;
		}
		case "pagein": {
			new FolderSuggestModal(app, async (folder) => {
				await turnSelectionIntoPage(app, editor, folder.path);
			}).open();
			return;
		}
	}
}
