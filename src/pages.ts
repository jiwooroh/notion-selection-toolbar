import { App, Editor, FuzzySuggestModal, Notice, TFolder, normalizePath } from "obsidian";

function sanitizeFileName(name: string): string {
	const cleaned = name.replace(/[\\/:*?"<>|#^[\]]/g, "").trim();
	const truncated = cleaned.slice(0, 100).trim();
	return truncated.length > 0 ? truncated : "Untitled";
}

async function uniquePath(app: App, folder: string, base: string): Promise<{ path: string; title: string }> {
	let title = base;
	let n = 1;
	while (app.vault.getAbstractFileByPath(normalizePath(`${folder}/${title}.md`))) {
		n += 1;
		title = `${base} ${n}`;
	}
	return { path: normalizePath(`${folder}/${title}.md`), title };
}

/** Turns the current selection into a new note ("Page"), replacing it with a wikilink. */
export async function turnSelectionIntoPage(app: App, editor: Editor, folder = ""): Promise<void> {
	const selected = editor.getSelection();
	const firstLine = (selected.split("\n")[0] || "Untitled").trim();
	const base = sanitizeFileName(firstLine || "Untitled");
	const { path, title } = await uniquePath(app, folder, base);

	try {
		await app.vault.create(path, selected ? `${selected}\n` : "");
	} catch (e) {
		new Notice(`Could not create page: ${(e as Error).message}`);
		return;
	}
	editor.replaceSelection(`[[${title}]]`);
	editor.focus();
}

export class FolderSuggestModal extends FuzzySuggestModal<TFolder> {
	constructor(app: App, private onChoose: (folder: TFolder) => void) {
		super(app);
		this.setPlaceholder("Choose a folder for the new page…");
	}

	getItems(): TFolder[] {
		const folders: TFolder[] = [];
		const root = this.app.vault.getRoot();
		const walk = (f: TFolder) => {
			folders.push(f);
			for (const child of f.children) {
				if (child instanceof TFolder) walk(child);
			}
		};
		walk(root);
		return folders;
	}

	getItemText(folder: TFolder): string {
		return folder.path === "" ? "/ (Vault root)" : folder.path;
	}

	onChooseItem(folder: TFolder): void {
		this.onChoose(folder);
	}
}
