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
	if (isWrapped(text, prefix, suffix)) return text.slice(prefix.length, text.length - suffix.length);
	return prefix + text + suffix;
}

/** True if prefix/suffix wrap the whole of `text` — for an HTML pair, as one
 *  element: `<strong>a</strong> b <strong>c</strong>` starts and ends with the
 *  tags but is two separate ones. */
function isWrapped(text: string, prefix: string, suffix: string): boolean {
	if (text.length < prefix.length + suffix.length || !text.startsWith(prefix) || !text.endsWith(suffix)) {
		return false;
	}
	return !prefix.startsWith("<") || !text.slice(prefix.length, text.length - suffix.length).includes(suffix);
}

// A selection that's exactly one <span>/<mark> from applyColor() (current
// class-based markup or the older inline-style one).
const HTML_WRAP_RE = /^(<(span|mark)\b[^>]*>)([\s\S]*)(<\/\2>)$/;

// Every complete color/highlight tag in a piece of text.
const COLOR_TAG_RE = /<(span|mark) (?:class|style)="[^"]*">[\s\S]*?<\/\1>/g;

/** True if `text` is exactly one color/highlight tag. HTML_WRAP_RE alone also
 *  matches `<span>a</span> and <span>b</span>`, which starts and ends with a tag
 *  but is two of them. */
function isSingleColorTag(text: string): boolean {
	if (!HTML_WRAP_RE.test(text)) return false;
	const first = new RegExp(COLOR_TAG_RE.source).exec(text);
	return !first || (first.index === 0 && first[0].length === text.length);
}

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

/** Rewrites inline Markdown anywhere in `text` (not just wrapping all of it) as
 *  HTML, for content inside a color/highlight tag: `**Aim**: …` → `<strong>Aim</strong>: …`.
 *  Single `_` / `__` are left alone so identifiers like snake_case survive. */
function inlineMarkdownToHtml(text: string): string {
	return text
		.replace(/`([^`]+)`/g, "<code>$1</code>")
		.replace(/\*\*\*(?=\S)([^*]+?)\*\*\*/g, "<strong><em>$1</em></strong>")
		.replace(/\*\*(?=\S)([^*]+?)\*\*/g, "<strong>$1</strong>")
		.replace(/~~(?=\S)([^~]+?)~~/g, "<s>$1</s>")
		.replace(/\*(?=[^\s*])([^*]+?)\*/g, "<em>$1</em>");
}

// Private-use characters marking the selection while a line is rewritten.
const SEL_FROM = "\uE000";
const SEL_TO = "\uE001";

/** Converts Markdown inside every color/highlight tag on the selection's line to
 *  HTML (see inlineMarkdownToHtml), keeping the selection on the same text.
 *  Live Preview shows Markdown inside an HTML tag literally, and formatting on
 *  top of it (`**<strong>Aim</strong>**`) only gets worse, so this runs before
 *  any formatting is applied. */
function normalizeColorTagsOnLine(editor: Editor): void {
	const from = editor.getCursor("from");
	const to = editor.getCursor("to");
	if (from.line !== to.line) return;
	const line = editor.getLine(from.line);
	if (!new RegExp(COLOR_TAG_RE.source).test(line)) return;

	const marked = line.slice(0, from.ch) + SEL_FROM + line.slice(from.ch, to.ch) + SEL_TO + line.slice(to.ch);
	const converted = marked.replace(COLOR_TAG_RE, (tag) => {
		const [, open = "", , inner = "", close = ""] = HTML_WRAP_RE.exec(tag) ?? [];
		return open + inlineMarkdownToHtml(inner) + close;
	});
	if (converted === marked) return;

	const newFrom = converted.indexOf(SEL_FROM);
	const newTo = converted.indexOf(SEL_TO) - 1;
	editor.replaceRange(
		converted.replace(SEL_FROM, "").replace(SEL_TO, ""),
		{ line: from.line, ch: 0 },
		{ line: from.line, ch: line.length }
	);
	editor.setSelection({ line: from.line, ch: newFrom }, { line: from.line, ch: newTo });
}

/** HTML equivalent of a Markdown prefix/suffix pair, or the pair unchanged if
 *  it's already HTML (e.g. `<u>`). */
function htmlWrapFor(prefix: string, suffix: string): [string, string] {
	const hit = MD_TO_HTML.find(([md]) => md === prefix && prefix === suffix);
	return hit ? [hit[1], hit[2]] : [prefix, suffix];
}

// The opening/closing tag of a color or highlight, as written by applyColor().
const OPEN_TAG_BEFORE_RE = /<(span|mark) (?:class|style)="[^"]*">$/;

/** True if the selection is a color/highlight <span>/<mark> — either the whole
 *  tag, or just the text inside it (e.g. selected in Source mode), in which case
 *  the selection is widened to the whole tag so it can be edited as one. */
export function selectColorTag(editor: Editor): boolean {
	const selected = editor.getSelection();
	if (!selected) return false;
	if (isSingleColorTag(selected)) return true;

	const from = editor.getCursor("from");
	const to = editor.getCursor("to");
	if (from.line !== to.line) return false;
	const line = editor.getLine(from.line);
	const open = OPEN_TAG_BEFORE_RE.exec(line.slice(0, from.ch));
	if (!open) return false;
	const close = `</${open[1]}>`;
	if (!line.startsWith(close, to.ch)) return false;
	editor.setSelection(
		{ line: from.line, ch: from.ch - open[0].length },
		{ line: to.line, ch: to.ch + close.length }
	);
	return true;
}

/** Toggle-wraps a selection that mixes color/highlight tags with plain text, e.g.
 *  `<span class="nst-fg-red">a</span> and <span class="nst-fg-red">b</span>`:
 *  each tag gets the HTML form inside it (`<strong>`), each run of plain text
 *  the Markdown form around it (`**and**`, leaving surrounding spaces outside
 *  so the markers stay valid). If every part is already wrapped, all of it is
 *  unwrapped instead. Returns null when the text has no color tag. */
function toggleMixedWrap(text: string, prefix: string, suffix: string): string | null {
	const [htmlPrefix, htmlSuffix] = htmlWrapFor(prefix, suffix);
	type Part = { lead: string; body: string; trail: string; pre: string; suf: string; wrap?: [string, string] };
	const parts: Part[] = [];
	const addPlain = (plain: string) => {
		const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(plain);
		if (m) parts.push({ lead: m[1], body: m[2], trail: m[3], pre: prefix, suf: suffix });
	};
	let last = 0;
	for (const tag of text.matchAll(COLOR_TAG_RE)) {
		const at = tag.index ?? 0;
		addPlain(text.slice(last, at));
		const [, open, , inner, close] = HTML_WRAP_RE.exec(tag[0]) ?? [];
		parts.push({ lead: "", body: markdownWrapsToHtml(inner ?? ""), trail: "", pre: htmlPrefix, suf: htmlSuffix, wrap: [open ?? "", close ?? ""] });
		last = at + tag[0].length;
	}
	if (last === 0) return null;
	addPlain(text.slice(last));

	const filled = parts.filter((p) => p.body);
	const unwrap = filled.every((p) => isWrapped(p.body, p.pre, p.suf));
	return parts
		.map((p) => {
			let body = p.body;
			if (body && unwrap) body = body.slice(p.pre.length, body.length - p.suf.length);
			else if (body && !isWrapped(body, p.pre, p.suf)) body = p.pre + body + p.suf;
			const [open, close] = p.wrap ?? ["", ""];
			return p.lead + open + body + close + p.trail;
		})
		.join("");
}

/** True if the selection is, contains, or sits inside a color/highlight tag —
 *  formatting it then goes inside the tag(s) as HTML. Widens a selection of
 *  exactly a tag's inner text to the whole tag (see selectColorTag). */
export function selectionHasColorTag(editor: Editor): boolean {
	if (selectColorTag(editor)) return true;
	if (isInsideColorTag(editor)) return true;
	return new RegExp(COLOR_TAG_RE.source).test(editor.getSelection());
}

/** True if the selection is part of the text inside one color/highlight tag,
 *  e.g. `static states` in `<mark class="nst-hl-blue">they keep static states</mark>`. */
function isInsideColorTag(editor: Editor): boolean {
	const from = editor.getCursor("from");
	const to = editor.getCursor("to");
	if (from.line !== to.line || from.ch === to.ch) return false;
	const line = editor.getLine(from.line);
	for (const tag of line.matchAll(COLOR_TAG_RE)) {
		const [, open = "", , , close = ""] = HTML_WRAP_RE.exec(tag[0]) ?? [];
		const start = (tag.index ?? 0) + open.length;
		const end = (tag.index ?? 0) + tag[0].length - close.length;
		if (from.ch >= start && to.ch <= end) return true;
	}
	return false;
}

/** Toggle-wraps the selection with prefix/suffix, undoing the wrap if it's already applied.
 *
 *  When the selection is a color/highlight <span>/<mark> (see selectColorTag), the
 *  formatting goes INSIDE the tag as real HTML (`**` → `<strong>`, see MD_TO_HTML)
 *  instead of Markdown, which Live Preview doesn't render inside or around an HTML
 *  tag. A selection mixing tags with plain text is handled part by part (see
 *  toggleMixedWrap). */
export function toggleInlineWrap(editor: Editor, prefix: string, suffix: string = prefix): void {
	normalizeColorTagsOnLine(editor);
	selectColorTag(editor);
	const fromPos = editor.getCursor("from");
	const toPos = editor.getCursor("to");
	const selected = editor.getSelection();
	if (!selected) return;

	const htmlWrap = isSingleColorTag(selected) ? HTML_WRAP_RE.exec(selected) : null;
	if (htmlWrap) {
		const [, open, , inner, close] = htmlWrap;
		const [htmlPrefix, htmlSuffix] = htmlWrapFor(prefix, suffix);
		// Normalize any Markdown already inside (from older versions) to HTML first,
		// so toggling bold off a `<span>**x**</span>` still works.
		const body = markdownWrapsToHtml(inner ?? "");
		// Wrapping all of it makes any same formatting already inside redundant
		// (`<strong><strong>Aim</strong>: …</strong>`), so drop that first.
		const flat = isWrapped(body, htmlPrefix, htmlSuffix)
			? body
			: body.split(htmlPrefix).join("").split(htmlSuffix).join("");
		const replacement = `${open}${toggleWrapText(flat, htmlPrefix, htmlSuffix)}${close}`;
		editor.replaceRange(replacement, fromPos, toPos);
		const fromOff = editor.posToOffset(fromPos);
		editor.setSelection(fromPos, editor.offsetToPos(fromOff + replacement.length));
		editor.focus();
		return;
	}

	const mixed = toggleMixedWrap(selected, prefix, suffix);
	if (mixed !== null) {
		editor.replaceRange(mixed, fromPos, toPos);
		const fromOff = editor.posToOffset(fromPos);
		editor.setSelection(fromPos, editor.offsetToPos(fromOff + mixed.length));
		editor.focus();
		return;
	}

	// Part of the text inside a color tag: wrap just that part, but as HTML.
	if (isInsideColorTag(editor)) {
		const [htmlPrefix, htmlSuffix] = htmlWrapFor(prefix, suffix);
		if (htmlPrefix !== prefix) {
			toggleInlineWrap(editor, htmlPrefix, htmlSuffix);
			return;
		}
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
	text = text.replace(new RegExp(`==${HIGHLIGHT_EMOJI}?([\\s\\S]*?)==`, "gu"), "$1");
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

/** Obsidian 1.14+ colors a Markdown highlight by a leading emoji: `==🟠text==`.
 *  Yellow is Obsidian's default highlight color, so it's written as plain
 *  `==text==`; colors Obsidian doesn't have (gray, brown, pink) stay plugin tags. */
const NATIVE_HIGHLIGHT_EMOJI: Record<string, string> = {
	red: "🔴",
	orange: "🟠",
	yellow: "",
	green: "🟢",
	blue: "🔵",
	purple: "🟣",
};
// Every emoji Obsidian accepts for a highlight color (circles and squares).
const HIGHLIGHT_EMOJI = "(?:🔴|🟥|🟠|🟧|🟡|🟨|🟢|🟩|🔵|🟦|🟣|🟪)";
const NATIVE_HIGHLIGHT_RE = new RegExp(`^==(${HIGHLIGHT_EMOJI})?([\\s\\S]*)==$`, "u");

/** Whether this Obsidian supports colored `==🟠text==` highlights (1.14+): its
 *  stylesheet then defines the per-color highlight variables. */
function nativeHighlightSupported(): boolean {
	return getComputedStyle(document.body).getPropertyValue("--highlight-background-orange").trim() !== "";
}

/** If the selection is the text inside a `==…==` highlight (markers just outside
 *  it, as when selecting in Live Preview), widens it to include them. */
function selectNativeHighlight(editor: Editor): void {
	const from = editor.getCursor("from");
	const to = editor.getCursor("to");
	if (from.line !== to.line || NATIVE_HIGHLIGHT_RE.test(editor.getSelection())) return;
	const line = editor.getLine(from.line);
	const open = new RegExp(`==${HIGHLIGHT_EMOJI}?$`, "u").exec(line.slice(0, from.ch));
	if (!open || !line.startsWith("==", to.ch)) return;
	editor.setSelection({ line: from.line, ch: from.ch - open[0].length }, { line: to.line, ch: to.ch + 2 });
}

/** Undoes inlineMarkdownToHtml for content leaving a color tag for Markdown. */
function inlineHtmlToMarkdown(text: string): string {
	return text
		.replace(/<strong><em>([\s\S]*?)<\/em><\/strong>/g, "***$1***")
		.replace(/<strong>([\s\S]*?)<\/strong>/g, "**$1**")
		.replace(/<em>([\s\S]*?)<\/em>/g, "*$1*")
		.replace(/<s>([\s\S]*?)<\/s>/g, "~~$1~~")
		.replace(/<code>([\s\S]*?)<\/code>/g, "`$1`");
}

/** Applies a highlight color as Obsidian's own `==🟠text==` syntax, so it shows
 *  up and edits like any Obsidian highlight (and in other Markdown apps). Takes
 *  over plain text, an existing `==…==` highlight or a plugin `<mark>`; returns
 *  false for text colored with a plugin `<span>` (or mixed with tags), which
 *  keeps the plugin tag so the text color survives. */
function applyNativeHighlight(editor: Editor, colorId: string): boolean {
	selectColorTag(editor);
	selectNativeHighlight(editor);
	const selected = editor.getSelection();
	let inner: string;
	const native = NATIVE_HIGHLIGHT_RE.exec(selected);
	const mark = isSingleColorTag(selected) ? MARK_RE.exec(selected) : null;
	if (native) inner = native[2] ?? "";
	else if (mark) inner = inlineHtmlToMarkdown(mark[1] ?? "");
	else if (new RegExp(COLOR_TAG_RE.source).test(selected)) return false;
	else inner = selected;

	const emoji = NATIVE_HIGHLIGHT_EMOJI[colorId];
	let replacement: string;
	if (colorId === "default") replacement = inner;
	else if (emoji !== undefined) replacement = `==${emoji}${inner}==`;
	else replacement = `<mark class="nst-hl-${colorId}">${markdownWrapsToHtml(inlineMarkdownToHtml(inner))}</mark>`;

	const fromPos = editor.getCursor("from");
	editor.replaceRange(replacement, fromPos, editor.getCursor("to"));
	const fromOff = editor.posToOffset(fromPos);
	editor.setSelection(fromPos, editor.offsetToPos(fromOff + replacement.length));
	editor.focus();
	return true;
}

/**
 * Applies a text or highlight color to the selection as a named CSS class
 * (`nst-fg-<id>` / `nst-hl-<id>`) rather than a baked-in hex value — the
 * actual color comes from CSS custom properties (see styles.css) that switch
 * with the current Obsidian theme and any user override, so already-applied
 * colors update automatically when you change theme instead of being frozen
 * at whatever was current the moment you applied them.
 */
export function applyColor(editor: Editor, kind: ColorKind, colorId: string): void {
	if (!editor.getSelection()) return;
	if (kind === "background" && nativeHighlightSupported() && applyNativeHighlight(editor, colorId)) return;
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
		const body = markdownWrapsToHtml(inlineMarkdownToHtml(inner));
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

/**
 * Toggles a background (highlight) color on the selection — what Cmd/Ctrl+H does
 * while the plugin is enabled. Removes it if the selection is already that
 * highlight, recolors a different highlight, and wraps text-colored text
 * (`<span class="nst-fg-…">`) instead of replacing it, so the text color stays.
 * A Markdown `==highlight==` selection becomes the plugin's highlight. With no
 * selection it uses the word under the cursor; returns false (nothing done) if
 * there isn't one.
 */
export function toggleHighlight(editor: Editor, colorId: string): boolean {
	if (!editor.getSelection()) {
		// Like Obsidian's own highlight: with just a cursor, act on the word under it.
		const word = editor.wordAt(editor.getCursor());
		if (!word) return false;
		editor.setSelection(word.from, word.to);
	}
	selectColorTag(editor);
	// With Obsidian's own colored highlights, plain text gets its `==text==`
	// (which this plugin colors); only text in plugin color tags is handled here.
	if (nativeHighlightSupported() && !selectionHasColorTag(editor)) return false;
	const fromPos = editor.getCursor("from");
	const toPos = editor.getCursor("to");
	let selected = editor.getSelection();
	const open = `<mark class="nst-hl-${colorId}">`;

	let replacement: string;
	const mark = isSingleColorTag(selected) ? MARK_RE.exec(selected) : null;
	if (mark && selected.startsWith(open)) {
		replacement = mark[1] ?? "";
	} else if (mark) {
		replacement = `${open}${mark[1] ?? ""}</mark>`;
	} else {
		if (isWrapped(selected, "==", "==")) selected = selected.slice(2, -2);
		const body = isSingleColorTag(selected)
			? selected
			: markdownWrapsToHtml(inlineMarkdownToHtml(selected));
		replacement = `${open}${body}</mark>`;
	}

	editor.replaceRange(replacement, fromPos, toPos);
	const fromOff = editor.posToOffset(fromPos);
	editor.setSelection(fromPos, editor.offsetToPos(fromOff + replacement.length));
	editor.focus();
	return true;
}

export function insertLink(editor: Editor, url: string): void {
	const selected = editor.getSelection() || "link text";
	editor.replaceSelection(`[${selected}](${url})`);
	editor.focus();
}
