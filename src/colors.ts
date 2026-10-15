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

/** The "Notion" scheme: Notion's text (normal and bold variants) and background
 *  color palettes (9 colors + default), for both light and dark mode. These are
 *  also the source of truth for the static `--nst-fg-*`/`--nst-hl-*` defaults
 *  hand-written into styles.css — keep the two in sync if either changes.
 *  Every scheme uses the same ids/labels in the same order. */
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

/** Apple-style colors: text in the color itself, backgrounds as a translucent
 *  tint of it (15% alpha; light-mode yellow 20%). No
 *  separate bold variant — bold text uses the same color. Mirrored by the
 *  `body.nst-scheme-apple` block in styles.css — keep the two in sync. */
export const APPLE_COLORS: ColorDef[] = [
	{ id: "gray", label: "Gray", fg: "#9898A0", bg: "#9898A026", fgDark: "#A0A0A7", bgDark: "#A0A0A726", fgBold: "#9898A0", fgBoldDark: "#A0A0A7" },
	{ id: "brown", label: "Brown", fg: "#B38C65", bg: "#B38C6526", fgDark: "#B8946F", bgDark: "#B8946F26", fgBold: "#B38C65", fgBoldDark: "#B8946F" },
	{ id: "orange", label: "Orange", fg: "#F09343", bg: "#F0934326", fgDark: "#F09748", bgDark: "#F0974826", fgBold: "#F09343", fgBoldDark: "#F09748" },
	{ id: "yellow", label: "Yellow", fg: "#F4C242", bg: "#F4C24233", fgDark: "#F6CE55", bgDark: "#F6CE5526", fgBold: "#F4C242", fgBoldDark: "#F6CE55" },
	{ id: "green", label: "Green", fg: "#30CF6A", bg: "#30CF6A26", fgDark: "#51DB84", bgDark: "#51DB8426", fgBold: "#30CF6A", fgBoldDark: "#51DB84" },
	{ id: "blue", label: "Blue", fg: "#3869F0", bg: "#3869F026", fgDark: "#598BF8", bgDark: "#598BF826", fgBold: "#3869F0", fgBoldDark: "#598BF8" },
	{ id: "purple", label: "Purple", fg: "#BB3ED9", bg: "#BB3ED926", fgDark: "#CA43EA", bgDark: "#CA43EA26", fgBold: "#BB3ED9", fgBoldDark: "#CA43EA" },
	{ id: "pink", label: "Pink", fg: "#ED358E", bg: "#ED358E26", fgDark: "#F75FA8", bgDark: "#F75FA826", fgBold: "#ED358E", fgBoldDark: "#F75FA8" },
	{ id: "red", label: "Red", fg: "#DE2E21", bg: "#DE2E2126", fgDark: "#EC5F55", bgDark: "#EC5F5526", fgBold: "#DE2E21", fgBoldDark: "#EC5F55" },
];

export type ColorScheme = "notion" | "apple";

export const COLOR_SCHEMES: { id: ColorScheme; label: string; colors: ColorDef[] }[] = [
	{ id: "notion", label: "Notion", colors: NOTION_COLORS },
	{ id: "apple", label: "Apple", colors: APPLE_COLORS },
];

/** The colors of a scheme (Notion if the id is unknown, e.g. from a newer version). */
export function colorsFor(scheme: ColorScheme): ColorDef[] {
	return (COLOR_SCHEMES.find((s) => s.id === scheme) ?? COLOR_SCHEMES[0]).colors;
}

/** Applied colors are class names (`nst-fg-red`) whose values come from CSS
 *  variables, so a scheme is just a `nst-scheme-<id>` class on <body> that
 *  swaps those values — switching recolors every note without touching it.
 *  Notion is the stylesheet's default and needs no class. */
export function applyColorScheme(scheme: ColorScheme): void {
	for (const s of COLOR_SCHEMES) document.body.toggleClass(`nst-scheme-${s.id}`, s.id === scheme && s.id !== "notion");
}

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
