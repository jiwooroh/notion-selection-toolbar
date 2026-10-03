import { Editor, EditorPosition } from "obsidian";
import { ColorKind, findColor } from "./colors";

/** Strips one leading block-level marker (heading/list/quote/callout) from a line. */
export function stripBlockMarkers(line: string): string {
	let s = line;
	s = s.replace(/^\s*#{1,6}\s+/, "");
	s = s.replace(/^\s*>\s?\[!\w+\][+-]?\s*/, "");
	s = s.replace(/^\s*>\s?/, "");
	s = s.replace(/^\s*[-*+]\s+\[[ xX]\]\s+/, "");
	s = s.replace(/^\s*[-*+]\s+/, "");
	s = s.replace(/^\s*\d+\.\s+/, "");
	return s;
}

export type DetectedBlockType =
	| "text"
	| "heading1"
	| "heading2"
	| "heading3"
	| "heading4"
	| "bulleted"
	| "numbered"
	| "todo"
	| "quote"
	| "callout";

export function detectBlockType(line: string): DetectedBlockType {
	if (/^\s*#### /.test(line)) return "heading4";
	if (/^\s*### /.test(line)) return "heading3";
	if (/^\s*## /.test(line)) return "heading2";
	if (/^\s*# /.test(line)) return "heading1";
	if (/^\s*>\s?\[!\w+\]/.test(line)) return "callout";
	if (/^\s*>\s?/.test(line)) return "quote";
	if (/^\s*[-*+]\s+\[[ xX]\]\s+/.test(line)) return "todo";
	if (/^\s*[-*+]\s+/.test(line)) return "bulleted";
	if (/^\s*\d+\.\s+/.test(line)) return "numbered";
	return "text";
}

function wholeLineRange(editor: Editor): { start: EditorPosition; end: EditorPosition } {
	const from = editor.getCursor("from");
	const to = editor.getCursor("to");
	return {
		start: { line: from.line, ch: 0 },
		end: { line: to.line, ch: editor.getLine(to.line).length },
	};
}

export type LineBlockType =
	| "text"
	| "heading1"
	| "heading2"
	| "heading3"
	| "heading4"
	| "bulleted"
	| "numbered"
	| "todo"
	| "quote"
	| "callout";

/** Applies a simple per-line block type (headings, lists, quote, callout, plain text). */
export function setLineBlockType(editor: Editor, type: LineBlockType): void {
	const from = editor.getCursor("from");
	const to = editor.getCursor("to");
	let n = 1;
	for (let line = from.line; line <= to.line; line++) {
		const raw = editor.getLine(line);
		const content = stripBlockMarkers(raw);
		let next: string;
		switch (type) {
			case "text":
				next = content;
				break;
			case "heading1":
				next = `# ${content}`;
				break;
			case "heading2":
				next = `## ${content}`;
				break;
			case "heading3":
				next = `### ${content}`;
				break;
			case "heading4":
				next = `#### ${content}`;
				break;
			case "bulleted":
				next = `- ${content}`;
				break;
			case "numbered":
				next = `${n++}. ${content}`;
				break;
			case "todo":
				next = `- [ ] ${content}`;
				break;
			case "quote":
				next = `> ${content}`;
				break;
			case "callout":
				next = line === from.line ? `> [!note] ${content}` : `> ${content}`;
				break;
			default:
				next = raw;
		}
		editor.setLine(line, next);
	}
	editor.focus();
}

/** Applies a callout of a specific Obsidian callout type (note, warning, tip, ...). */
export function applyCalloutType(editor: Editor, calloutType: string): void {
	const from = editor.getCursor("from");
	const to = editor.getCursor("to");
	for (let line = from.line; line <= to.line; line++) {
		const raw = editor.getLine(line);
		const content = stripBlockMarkers(raw);
		const next = line === from.line ? `> [!${calloutType}] ${content}` : `> ${content}`;
		editor.setLine(line, next);
	}
	editor.focus();
}

export function wrapAsCodeBlock(editor: Editor): void {
	const { start, end } = wholeLineRange(editor);
	const text = editor.getRange(start, end);
	editor.replaceRange("```\n" + text + "\n```", start, end);
	editor.focus();
}

export function wrapAsMathBlock(editor: Editor): void {
	const { start, end } = wholeLineRange(editor);
	const text = editor.getRange(start, end);
	editor.replaceRange("$$\n" + text + "\n$$", start, end);
	editor.focus();
}

function summaryContent(editor: Editor, start: EditorPosition, end: EditorPosition): string {
	const raw = editor.getRange(start, end);
	const joined = raw
		.split("\n")
		.map((l) => stripBlockMarkers(l))
		.join(" ")
		.trim();
	return joined.length > 0 ? joined : "Toggle";
}

export function makeToggleList(editor: Editor): void {
	const { start, end } = wholeLineRange(editor);
	const content = summaryContent(editor, start, end);
	const block = `<details class="nst-toggle"><summary>${content}</summary>\n\n</details>`;
	editor.replaceRange(block, start, end);
	editor.setCursor({ line: start.line + 1, ch: 0 });
	editor.focus();
}

export function makeToggleHeading(editor: Editor, level: 1 | 2 | 3 | 4): void {
	const { start, end } = wholeLineRange(editor);
	const content = summaryContent(editor, start, end);
	const block = `<details class="nst-toggle"><summary class="nst-toggle-h${level}">${content}</summary>\n\n</details>`;
	editor.replaceRange(block, start, end);
	editor.setCursor({ line: start.line + 1, ch: 0 });
	editor.focus();
}

export function makeColumns(editor: Editor, columns = 2): void {
	const { start, end } = wholeLineRange(editor);
	const raw = editor.getRange(start, end);
	const cols = [raw, ...Array(Math.max(0, columns - 1)).fill("")];
	const inner = cols.map((c) => `<div class="nst-column">\n\n${c}\n\n</div>`).join("");
	const block = `<div class="nst-columns">\n${inner}\n</div>`;
	editor.replaceRange(block, start, end);
	editor.focus();
}

/** Toggle-wraps a plain string with prefix/suffix (no editor/position awareness) —
 *  the inner-text half of toggleInlineWrap's logic, reused for content trapped
 *  inside an HTML tag below. */
function toggleWrapText(text: string, prefix: string, suffix: string): string {
	if (text.length >= prefix.length + suffix.length && text.startsWith(prefix) && text.endsWith(suffix)) {
		return text.slice(prefix.length, text.length - suffix.length);
	}
	return prefix + text + suffix;
}

// A selection that's exactly one <span>/<mark> from applyColor() (current
// class-based markup or the older inline-style one).
const HTML_WRAP_RE = /^(<(span|mark)\b[^>]*>)([\s\S]*)(<\/\2>)$/;

/** Markdown inline markers and the HTML tag that replaces each one inside a
 *  color/highlight tag. Live Preview renders a raw inline HTML tag as a single
 *  HTML widget, so Markdown inside it (`<span>**x**</span>`) shows up literally
 *  and Markdown around it (`**<span>x</span>**`) doesn't reach the widget —
 *  only real HTML tags render in both Live Preview and Reading view. Longest
 *  marker first so `**` isn't mistaken for two `*`. */
const MD_TO_HTML: [string, string, string][] = [
	["**", "<strong>", "</strong>"],
	["__", "<strong>", "</strong>"],
	["~~", "<s>", "</s>"],
	["*", "<em>", "</em>"],
	["_", "<em>", "</em>"],
	["`", "<code>", "</code>"],
];

/** Rewrites Markdown markers that wrap the whole of `text` (possibly nested,
 *  e.g. `***x***`) as their HTML tags, for content going inside an HTML tag. */
function markdownWrapsToHtml(text: string): string {
	for (const [md, open, close] of MD_TO_HTML) {
		if (text.length > md.length * 2 && text.startsWith(md) && text.endsWith(md)) {
			return open + markdownWrapsToHtml(text.slice(md.length, -md.length)) + close;
		}
	}
	return text;
}

/** HTML equivalent of a Markdown prefix/suffix pair, or the pair unchanged if
 *  it's already HTML (e.g. `<u>`). */
function htmlWrapFor(prefix: string, suffix: string): [string, string] {
	const hit = MD_TO_HTML.find(([md]) => md === prefix && prefix === suffix);
	return hit ? [hit[1], hit[2]] : [prefix, suffix];
}

/** Toggle-wraps the selection with prefix/suffix, undoing the wrap if it's already applied.
 *
 *  When the selection is exactly a color/highlight <span>/<mark>, the formatting goes
 *  INSIDE the tag as real HTML (`**` → `<strong>`, see MD_TO_HTML) instead of
 *  Markdown, which Live Preview doesn't render inside or around an HTML tag. */
export function toggleInlineWrap(editor: Editor, prefix: string, suffix: string = prefix): void {
	const fromPos = editor.getCursor("from");
	const toPos = editor.getCursor("to");
	const selected = editor.getSelection();
	if (!selected) return;

	const htmlWrap = HTML_WRAP_RE.exec(selected);
	if (htmlWrap) {
		const [, open, , inner, close] = htmlWrap;
		const [htmlPrefix, htmlSuffix] = htmlWrapFor(prefix, suffix);
		// Normalize any Markdown already inside (from older versions) to HTML first,
		// so toggling bold off a `<span>**x**</span>` still works.
		const body = markdownWrapsToHtml(inner ?? "");
		const replacement = `${open}${toggleWrapText(body, htmlPrefix, htmlSuffix)}${close}`;
		editor.replaceRange(replacement, fromPos, toPos);
		const fromOff = editor.posToOffset(fromPos);
		editor.setSelection(fromPos, editor.offsetToPos(fromOff + replacement.length));
		editor.focus();
		return;
	}

	const fromOff = editor.posToOffset(fromPos);
	const toOff = editor.posToOffset(toPos);
	const beforeStart = editor.offsetToPos(Math.max(0, fromOff - prefix.length));
	const afterEnd = editor.offsetToPos(toOff + suffix.length);
	const before = editor.getRange(beforeStart, fromPos);
	const after = editor.getRange(toPos, afterEnd);

	if (before === prefix && after === suffix) {
		editor.replaceRange(selected, beforeStart, afterEnd);
		const newTo = editor.offsetToPos(editor.posToOffset(beforeStart) + selected.length);
		editor.setSelection(beforeStart, newTo);
	} else if (
		selected.length >= prefix.length + suffix.length &&
		selected.startsWith(prefix) &&
		selected.endsWith(suffix)
	) {
		const inner = selected.slice(prefix.length, selected.length - suffix.length);
		editor.replaceRange(inner, fromPos, toPos);
		editor.setSelection(fromPos, editor.offsetToPos(fromOff + inner.length));
	} else {
		const wrapped = prefix + selected + suffix;
		editor.replaceRange(wrapped, fromPos, toPos);
		editor.setSelection(
			editor.offsetToPos(fromOff + prefix.length),
			editor.offsetToPos(fromOff + prefix.length + selected.length)
		);
	}
	editor.focus();
}

export function clearFormatting(editor: Editor): void {
	let text = editor.getSelection();
	if (!text) return;
	// Matches both the current class-based color/highlight markup (nst-fg-*/nst-hl-*)
	// and the plugin's older inline-style markup — same attribute flexibility as
	// SPAN_RE/MARK_RE below, so re-clearing text colored by an earlier version works too.
	text = text.replace(/<span (?:class|style)="[^"]*">([\s\S]*?)<\/span>/g, "$1");
	text = text.replace(/<mark (?:class|style)="[^"]*">([\s\S]*?)<\/mark>/g, "$1");
	// Repeat so nested tags (<strong><em>…) all come off, not just the outermost.
	for (let prev = ""; prev !== text; ) {
		prev = text;
		text = text.replace(/<(u|strong|b|em|i|s|code)>([\s\S]*?)<\/\1>/g, "$2");
	}
	text = text.replace(/(\*\*\*|___)([\s\S]*?)\1/g, "$2");
	text = text.replace(/(\*\*|__)([\s\S]*?)\1/g, "$2");
	text = text.replace(/(\*|_)([\s\S]*?)\1/g, "$2");
	text = text.replace(/~~([\s\S]*?)~~/g, "$1");
	text = text.replace(/==([\s\S]*?)==/g, "$1");
	text = text.replace(/`([^`]*?)`/g, "$1");
	text = text
		.split("\n")
		.map((line) => stripBlockMarkers(line))
		.join("\n");
	editor.replaceSelection(text);
	editor.focus();
}

// Matches both the current class-based markup and the plugin's older
// inline-style markup, so re-clicking a color still toggles/unwraps text that
// was colored by an earlier version of the plugin.
const SPAN_RE = /^<span (?:class|style)="[^"]*">([\s\S]*)<\/span>$/;
const MARK_RE = /^<mark (?:class|style)="[^"]*">([\s\S]*)<\/mark>$/;

/**
 * Applies a text or highlight color to the selection as a named CSS class
 * (`nst-fg-<id>` / `nst-hl-<id>`) rather than a baked-in hex value — the
 * actual color comes from CSS custom properties (see styles.css) that switch
 * with the current Obsidian theme and any user override, so already-applied
 * colors update automatically when you change theme instead of being frozen
 * at whatever was current the moment you applied them.
 */
export function applyColor(editor: Editor, kind: ColorKind, colorId: string): void {
	const fromPos = editor.getCursor("from");
	const toPos = editor.getCursor("to");
	const selected = editor.getSelection();
	if (!selected) return;

	let inner = selected;
	const spanMatch = selected.match(SPAN_RE);
	const markMatch = selected.match(MARK_RE);
	if (spanMatch) inner = spanMatch[1];
	else if (markMatch) inner = markMatch[1];

	let replacement: string;
	if (colorId === "default") {
		replacement = inner;
	} else {
		const def = findColor(colorId);
		if (!def) return;
		// Bold/italic/etc. already on the selection must become HTML once it's
		// inside the color tag, or Live Preview shows the raw `**`.
		const body = markdownWrapsToHtml(inner);
		replacement =
			kind === "text"
				? `<span class="nst-fg-${def.id}">${body}</span>`
				: `<mark class="nst-hl-${def.id}">${body}</mark>`;
	}

	editor.replaceRange(replacement, fromPos, toPos);
	const fromOff = editor.posToOffset(fromPos);
	editor.setSelection(fromPos, editor.offsetToPos(fromOff + replacement.length));
	editor.focus();
}

export function insertLink(editor: Editor, url: string): void {
	const selected = editor.getSelection() || "link text";
	editor.replaceSelection(`[${selected}](${url})`);
	editor.focus();
}
