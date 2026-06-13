// The Alloy Growth System — every piece of work ladders up to one of three
// growth engines, on top of the Equip (Core) foundation.
//   reach  → attract demand          match → convert to signed boards
//   retain → keep & grow clients     equip → build their team + delivery (Core)
export const ENGINES = {
  reach:  { label: "Reach",  color: "#2a6391" },
  match:  { label: "Match",  color: "#d9356e" },
  retain: { label: "Retain", color: "#2c8a6e" },
  equip:  { label: "Equip",  color: "#b8881a" },
};
export const ENGINE_ORDER = ["reach", "match", "retain", "equip"];

// Monday work category ("phase") → its primary engine. This is the fallback used
// when a project carries no explicit `engines` tag. Most categories map cleanly
// to one engine; the cross-cutting ones (Content, Web Dev, Design, Email, Video,
// Strategy) take their *primary* here and can be refined per-item in Monday later.
// Move a category between engines by editing one line.
export const ENGINE_BY_CATEGORY = {
  "SEO & Technical": "reach",
  "Local & GBP": "reach",
  "Social Media": "reach",
  "Paid Media": "reach",
  "Content & Copy": "reach",
  "Web Development": "reach",
  "Video Production": "reach",
  "Sales Enablement": "match",
  "Design & Assets": "match",
  "Email & Newsletter": "match",
  "Strategy & Reporting": "retain",
  "Client Retention": "retain",
  "Education & Training": "equip",
  "Foundation & Onboarding": "equip",
  "Operations": "equip",
};

// Case-insensitive category lookup so "Design & Assets" / "Design & assets" both hit.
const _CAT_LOOKUP = Object.fromEntries(
  Object.entries(ENGINE_BY_CATEGORY).map(([k, v]) => [k.toLowerCase().trim(), v])
);

function normalizeEngine(e) {
  const k = String(e || "").trim().toLowerCase();
  return ENGINES[k] ? k : null;
}

// Engine(s) a project serves, as an array (work can serve more than one).
// Real Monday `engines` tags win; otherwise fall back to the category map.
// The day Monday starts sending tags, this upgrades per-item with zero rework.
export function enginesOf(project) {
  if (project && Array.isArray(project.engines) && project.engines.length) {
    const tagged = project.engines.map(normalizeEngine).filter(Boolean);
    if (tagged.length) return tagged;
  }
  const fromCat = _CAT_LOOKUP[String(project && project.phase || "").toLowerCase().trim()];
  return fromCat ? [fromCat] : [];
}
