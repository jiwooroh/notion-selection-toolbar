export interface ColorDef {
	id: string;
	label: string;
	/** Text/highlight color in light theme. */
	fg: string;
	bg: string;
	/** Text/highlight color in dark theme. */
	fgDark: string;
	bgDark: string;
	/** Text color for bold text, in light / dark theme. */
	fgBold: string;
	fgBoldDark: string;
}

/** Notion's text (normal and bold variants) and background color palettes
 *  (9 colors + default), for both light and dark mode. These are also
 *  the source of truth for the static `--nst-fg-*`/`--nst-hl-*` defaults
 *  hand-written into styles.css — keep the two in sync if either changes. */
export const NOTION_COLORS: ColorDef[] = [
	{ id: "gray", label: "Gray", fg: "#888784", bg: "#F1F1EF", fgDark: "#8F8F8F", bgDark: "#2F2F2F", fgBold: "#787774", fgBoldDark: "#9B9B9B" },
	{ id: "brown", label: "Brown", fg: "#976D57", bg: "#F3EEEE", fgDark: "#B28773", bgDark: "#46332A", fgBold: "#976D57", fgBoldDark: "#B28773" },
	{ id: "orange", label: "Orange", fg: "#D1873F", bg: "#F8ECDF", fgDark: "#AD774D", bgDark: "#573C27", fgBold: "#CC782F", fgBoldDark: "#BD8052" },
	{ id: "yellow", label: "Yellow", fg: "#C29343", bg: "#FAF3DE", fgDark: "#C29A56", bgDark: "#53442C", fgBold: "#C29343", fgBoldDark: "#C29A56" },
	{ id: "green", label: "Green", fg: "#679176", bg: "#EEF3EC", fgDark: "#5C8C6B", bgDark: "#2A3C31", fgBold: "#548164", fgBoldDark: "#659C75" },
	{ id: "blue", label: "Blue", fg: "#487CA5", bg: "#E9F3F7", fgDark: "#6786C4", bgDark: "#1E394C", fgBold: "#487CA5", fgBoldDark: "#6786C4" },
	{ id: "purple", label: "Purple", fg: "#8A67AB", bg: "#F6F3F9", fgDark: "#956ACD", bgDark: "#3A2E47", fgBold: "#8A67AB", fgBoldDark: "#956ACD" },
	{ id: "pink", label: "Pink", fg: "#B75D8F", bg: "#F8F1F5", fgDark: "#B85A8C", bgDark: "#492E3B", fgBold: "#B35488", fgBoldDark: "#C25F94" },
	{ id: "red", label: "Red", fg: "#C4554D", bg: "#FAECEC", fgDark: "#CF5D57", bgDark: "#4D302B", fgBold: "#C4554D", fgBoldDark: "#CF5D57" },
];

export type ColorKind = "text" | "background";

export interface RecentColor {
	kind: ColorKind;
	id: string; // color id, or "default"
}

export function findColor(id: string): ColorDef | undefined {
	return NOTION_COLORS.find((c) => c.id === id);
}

/** Obsidian stamps the current theme as a class on <body>. */
export function isDarkTheme(): boolean {
	return document.body.classList.contains("theme-dark");
}

/** Picks the user's custom highlight-color overrides for whichever theme is
 *  currently active — light and dark are stored separately so a highlight can
 *  be customized differently per theme. */
export function activeHighlightMap(
	light: Record<string, string>,
	dark: Record<string, string>,
): Record<string, string> {
	return isDarkTheme() ? dark : light;
}

/**
 * Applied text/highlight colors are written as named classes (`nst-fg-<id>` /
 * `nst-hl-<id>`), not baked-in hex — the actual color comes from `--nst-fg-*` /
 * `--nst-hl-*` CSS custom properties. styles.css defines their defaults for
 * both themes; this only needs to set an *inline* override on <body> for
 * highlight colors the user has customized (text colors aren't customizable),
 * clearing it when there's no override so the CSS default takes back over.
 * That's what makes already-applied colors update live when the theme
 * changes or a custom color is edited, instead of freezing at apply-time.
 */
export function refreshHighlightColorVars(
	highlightColorsLight: Record<string, string>,
	highlightColorsDark: Record<string, string>,
): void {
	const active = activeHighlightMap(highlightColorsLight, highlightColorsDark);
	for (const def of NOTION_COLORS) {
		const custom = active[def.id];
		// An empty value removes the inline override so the CSS default applies.
		document.body.setCssProps({ [`--nst-hl-${def.id}`]: custom ?? "" });
	}
}
