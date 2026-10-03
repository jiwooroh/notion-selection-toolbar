export interface ColorDef {
	id: string;
	label: string;
	/** Text/highlight color in light theme. */
	fg: string;
	bg: string;
	/** Text/highlight color in dark theme. */
	fgDark: string;
	bgDark: string;
}

/** Notion's default text and background color palettes (9 colors + default),
 *  for both light and dark mode, as Notion itself renders them. These are also
 *  the source of truth for the static `--nst-fg-*`/`--nst-hl-*` defaults
 *  hand-written into styles.css — keep the two in sync if either changes. */
export const NOTION_COLORS: ColorDef[] = [
	{ id: "gray", label: "Gray", fg: "#787774", bg: "#F1F1EF", fgDark: "#9FA4A8", bgDark: "#3C4144" },
	{ id: "brown", label: "Brown", fg: "#9E6B53", bg: "#F4EEEE", fgDark: "#D49675", bgDark: "#4C3E35" },
	{ id: "orange", label: "Orange", fg: "#C86F21", bg: "#FBEDE7", fgDark: "#E98D36", bgDark: "#553B29" },
	{ id: "yellow", label: "Yellow", fg: "#B57E33", bg: "#F4F1E5", fgDark: "#C99D46", bgDark: "#4A3E2C" },
	{ id: "green", label: "Green", fg: "#458262", bg: "#EDF3EB", fgDark: "#72B183", bgDark: "#2F443A" },
	{ id: "blue", label: "Blue", fg: "#347EA9", bg: "#E7F3F8", fgDark: "#66AADA", bgDark: "#2D4156" },
	{ id: "purple", label: "Purple", fg: "#9165B0", bg: "#F4F0F7", fgDark: "#B098D8", bgDark: "#453A5B" },
	{ id: "pink", label: "Pink", fg: "#C14C8A", bg: "#F9EEF3", fgDark: "#DE84D1", bgDark: "#51384D" },
	{ id: "red", label: "Red", fg: "#D34C47", bg: "#FDEBEC", fgDark: "#EA878C", bgDark: "#5E3436" },
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
