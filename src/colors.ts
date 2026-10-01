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

/** Notion's default text color palette (9 colors + default), as Notion itself
 *  renders it — kept as-is, unchanged from Notion's real values.
 *
 *  The highlight (background) values below are NOT Notion's actual pale
 *  washes — those read as too faint against a typical Obsidian page, so each
 *  bg/bgDark is deliberately deepened (~20% light / ~12% dark blend of the
 *  matching fg hue into Notion's original bg) for better visibility while
 *  keeping the same hue family. These are also the source of truth for the
 *  static `--nst-fg-*`/`--nst-hl-*` defaults hand-written into styles.css —
 *  keep the two in sync if either changes. */
export const NOTION_COLORS: ColorDef[] = [
	{ id: "gray", label: "Gray", fg: "#787774", bg: "#D9D9D6", fgDark: "#9B9B9B", bgDark: "#333333" },
	{ id: "brown", label: "Brown", fg: "#976D57", bg: "#E1D4D0", fgDark: "#A27763", bgDark: "#3C312C" },
	{ id: "orange", label: "Orange", fg: "#CC782F", bg: "#EFD5BC", fgDark: "#CB7B37", bgDark: "#483322" },
	{ id: "yellow", label: "Yellow", fg: "#C29343", bg: "#EFE0BE", fgDark: "#C19138", bgDark: "#483A23" },
	{ id: "green", label: "Green", fg: "#548164", bg: "#CFDCD2", fgDark: "#4F9768", bgDark: "#29382E" },
	{ id: "blue", label: "Blue", fg: "#487CA5", bg: "#C9DBE7", fgDark: "#447ACB", bgDark: "#233240" },
	{ id: "purple", label: "Purple", fg: "#8A67AB", bg: "#E0D7E9", fgDark: "#865DBB", bgDark: "#352B41" },
	{ id: "pink", label: "Pink", fg: "#B35488", bg: "#EBD2DF", fgDark: "#BA4A78", bgDark: "#3F2832" },
	{ id: "red", label: "Red", fg: "#C4554D", bg: "#EFCECC", fgDark: "#BE524B", bgDark: "#442A28" },
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
