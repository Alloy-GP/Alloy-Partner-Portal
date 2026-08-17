// ============================================================================
// Resolving an intake form's fields when the form is not one fixed form.
//
// WHY THIS EXISTS. leadToProposalRaw used to look fields up by EXACT normalized
// name ("number of units", "community type", "current management status"), which
// is only ever true of the one CMGT staging form it was written against. Every
// distinct field name in the live leads table was enumerated (190+ of them) and
// the exact-match approach misses, among real submissions:
//
//   units   "HOA Size" (502x), "Number of Units/Homes" (31x), "PORTFOLIO SIZE*",
//           "how-many-units", "Numero de unidades*"        -> homes = 0
//   type    "Type of Association *" (~113x), "Property type*" (~70x),
//           "PROPERTY TYPE*" (21x), "community-type" (40x) -> metaType = ""
//   status  "CURRENT MANAGEMENT*", "Current Management *",
//           "CURRENT MANAGEMENT SITUATION",
//           "Currently Self-Managed or With a Company?"    -> metaStatus = ""
//
// The type miss was the worst of them: isHighRise() only ever sees metaType, so
// the 8 real "High-Rise Condominium" submissions never triggered the on-site
// recommendation that rule exists for. It was dead code in production.
//
// AND THE VALUES VARY TOO. Unit counts arrive as bands, not integers: "50-100"
// (9x), "100-200" (8x), "200-500" (6x), "101-200 Units", "Under 50" (20x),
// "200+ Units". The old parse stripped non-digits and called parseInt, so
// "50-100" became FIFTY THOUSAND ONE HUNDRED homes -- which then forced the
// on-site tier (>=500) and would have printed "50,100 homes" on a board document.
//
// DESIGN. Patterns are ordered most-specific-first and every logical field
// carries explicit EXCLUDES, because a loose pattern is how you silently read
// "Number of Board Members Attending" as a door count. Nothing here guesses at a
// value: a band is resolved to its midpoint and MARKED approximate so staff are
// told to confirm, rather than a range being passed off as an exact count.
// ============================================================================

// Field NAMES only. Diacritics folded (Numero de unidades), separators flattened
// (how-many-units, units/homes), WhatConverts' decorations dropped (*, (Required)).
export function normName(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // Numero de unidades
    .toLowerCase()
    .replace(/[‘’`]/g, "'")
    .replace(/[–—−]/g, '-')
    .replace(/\(\s*required\s*\)/g, ' ')
    .replace(/\(\s*optional\s*\)/g, ' ')
    .replace(/[_\-/\\|]+/g, ' ')
    .replace(/[*:?.,!]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Ordered: earlier patterns win. `exclude` is checked first and vetoes the field.
const FIELDS = {
  units: {
    // "PORTFOLIO SIZE" is how many doors a MANAGEMENT COMPANY runs in total, not how
    // big one community is — its real answers are "Under 1,000" and "15,000-40,000".
    // Reading it as a door count would price a company's entire book as one HOA.
    exclude: [/board member/, /attendee/, /zip|postal/, /phone|email/, /budget/, /dues/, /\bstate\b/, /portfolio/],
    match: [
      /number of (units|homes|doors)/,
      /how many (units|homes|doors)/,
      /(hoa|community|association|property) size/,
      /\b(units?|doors?|unidades)\b/,
      /\bhomes?\b/,
    ],
  },
  budget: {
    match: [/\bbudget\b/, /price range/, /investment level/, /orcamento/, /presupuesto/],
  },
  status: {
    // "Leave blank if self-managed" and "Current Management Company" hold a COMPANY
    // NAME ("Gibson Associates", "Bad CAM"), not a status. Reading them as a status
    // would put a vendor's name where the tier logic expects "self-managed".
    exclude: [/leave blank/, /management company/, /company name/],
    match: [
      /current management( status| situation)?/,
      /management status/,
      /currently self.?managed/,
      /current situation/,
      /situacao atual/,
      /situacion actual/,
    ],
  },
  type: {
    exclude: [/name/, /size/],
    match: [
      /community type/,
      /property type/,
      /type of (association|community|property)/,
      /association type/,
      /tipo de (propriedade|propiedad|asociacion|associacao)/,
    ],
    // WhatConverts sometimes sends the CHOSEN OPTION as the field name itself
    // (real examples: "Single Family" 38x, "Townhomes" 38x, "Condominium" 29x,
    // "High Rise" 2x). Last resort, and only for structural descriptions -- the
    // service choices that arrive the same way ("Accounting Only", "Onsite",
    // "Portfolio") are NOT community types and must not land here.
    // Variant-tolerant, because the option text differs per form ("High Rise",
    // "High-Rise Condominium"). Kept to STRUCTURAL words only, and `exclude` above
    // still vetoes anything with "name"/"size" in it. Bare /hoa/ is deliberately
    // absent: it would swallow "HOA *" and "HOA Location".
    selfLabelling: /single family|townhomes?|condominium|condo association|high.?rise|mid.?rise|garden.?style|active adult|mixed.?use|master.?planned|cooperative|\bco.?op\b|commercial/,
  },
  // ONLY the explicit multi-select. This deliberately does NOT include free-text
  // boxes like "WHAT'S PROMPTING THE CONVERSATION?": its answers are prose, and
  // painsFromFrustrations matches bare keywords (/vendor/, /developer/), so prose
  // gets keyword-mined into concerns the board never ticked. Measured: "We have no
  // vendor problems and no delinquency issues — our developer handed the community
  // over in 2014" yielded three concerns on the prospect-facing document plus a
  // false "they ticked developer-controlled" staff flag. Prose belongs in `message`.
  frustrations: {
    match: [/frustration/],
  },
  // The board's own words, which the proposal quotes back to them. Every form has
  // a version of this box and no two name it the same way.
  message: {
    exclude: [/email/, /\bname\b/, /phone/, /leave blank/, /referral/, /website|url/, /how did you hear/],
    // ORDER MATTERS — earlier patterns win. The narrative boxes come first and the
    // "anything else?" catch-alls come LAST, because boards routinely answer those
    // with "No" while the actual story sits in Message. Ranking them higher made a
    // real lead's quote literally "No", which is worse than empty: `quote` is the
    // only narrative the LLM matcher receives, so the match then ran on nothing.
    match: [
      /in your own words/,
      /success look like/,
      /what.?s going on/,
      /what.?s on your mind/,
      /what.?s prompting/,
      /tell us/,
      /^messages?$/,
      /^comments?$/,
      /^notes/,
      /how can we help/,
      /mais alguma coisa/,
      /^mensa(je|gem)$/,
      /anything (else|you|specific)/,
    ],
  },
  services: {
    match: [/services needed/, /how can we help/, /what brings you here/, /services interested/],
  },
  timeline: {
    match: [/engagement timeline/, /\btimeline\b/, /decision timing/, /when do you need/, /how soon/],
  },
  dues: {
    match: [/dues/, /assessment (amount|per)/],
  },
  role: {
    exclude: [/their role/],
    match: [/your role( on the board)?/, /role on the board/, /\brole\b/],
  },
  location: {
    exclude: [/zip|postal|code/, /email/, /property address/],
    match: [/hoa location/, /^city state$/, /^location$/, /^city$/, /^town city$/, /^cidade$/, /^ciudad$/, /\bcity\b/],
  },
  community: {
    exclude: [/your name/, /contact name/, /first|last/, /company url/],
    // normName has already flattened "/" to a space, so
    // "COMMUNITY / ASSOCIATION NAME *" arrives as "community association name".
    match: [
      /(association|community|hoa) name/,
      /name of association/,
      /^hoa$/,
    ],
  },
};

// [{name, value}] -> [{key, name, value}] with normalized names, blanks dropped.
export function indexFields(fields) {
  return (fields || [])
    .filter((f) => f && String(f.value ?? '').trim())
    .map((f) => ({ key: normName(f.name), name: f.name, value: String(f.value).trim() }));
}

// Every field matching a logical name, best match first. Returned rather than
// reduced to one so callers can prefer, say, an exact unit count over a band.
export function candidates(index, logical) {
  const spec = FIELDS[logical];
  if (!spec) return [];
  const allowed = (entry) => !(spec.exclude || []).some((rx) => rx.test(entry.key));
  const out = [];
  const seen = new Set();
  (spec.match || []).forEach((rx, rank) => {
    index.forEach((entry) => {
      if (allowed(entry) && !seen.has(entry) && rx.test(entry.key)) {
        seen.add(entry);
        out.push({ entry, rank });
      }
    });
  });
  if (spec.selfLabelling) {
    index.forEach((entry) => {
      if (allowed(entry) && !seen.has(entry) && spec.selfLabelling.test(entry.key)) {
        seen.add(entry);
        // The NAME carries the answer in this shape, so use it as the value: these
        // checkboxes are frequently submitted as "Yes"/"on", and taking the value
        // gave metaType="Yes", which isHighRise() cannot read.
        out.push({ entry: { ...entry, value: entry.name }, rank: 99 });
      }
    });
  }
  return out.sort((a, b) => a.rank - b.rank).map((o) => o.entry);
}

// First value for a logical field, plus WHICH form field supplied it.
export function pick(index, logical) {
  const [hit] = candidates(index, logical);
  return hit ? { value: hit.value, from: hit.name } : { value: '', from: null };
}

// A community too small for per-home math to mean anything; also the midpoint the
// "Under 50" band lands on, which is deliberate -- it trips the minimum-fee flag.
const IMPLAUSIBLY_LARGE = 25000;

// A band only earns a midpoint if it is narrow enough to mean something.
// "Under 1,000" covers almost every community there is, and its midpoint (500)
// would land exactly on the 500-home on-site threshold — quoting the most expensive
// management model off an answer that carries no information. Refuse those: homes 0
// raises no-unit-count, which asks a human for the real number instead of guessing.
// The ratio test keeps genuinely useful bands ("50-100", "200-500"), and the
// absolute test keeps small ones ("1-50") where the minimum fee decides the price
// anyway, so the width cannot change the answer.
const usableBand = (lo, hi) => hi <= lo * 4 || hi - lo <= 50;

// A submitted unit count -> a number we can price, and how much to trust it.
//
// NEVER returns a bare integer for a band. "50-100" is 75 AND approximate; the
// caller is expected to say so rather than quote a range as though it were a count.
export function parseUnits(raw) {
  const s = String(raw ?? '')
    .replace(/[–—−]/g, '-')      // en dash / em dash / minus
    .replace(/,(?=\d{3}\b)/g, '')               // 1,200 -> 1200
    .toLowerCase()
    .trim();
  const none = (source) => ({ homes: 0, approx: false, band: null, source, implausible: false });
  if (!s) return none('empty');

  const done = (homes, approx, band, source) => ({
    homes, approx, band, source, implausible: homes > IMPLAUSIBLY_LARGE,
  });
  const hedged = /[~≈]|approx|about|around|roughly|\best\b|ish\b/.test(s);

  // Strip the decoration a checkbox label carries, so "(1-50 Units)" and
  // "101-200 Units" are still recognised as the bands they are.
  const core = s
    .replace(/^[("'\s]+/, '')
    .replace(/[)"'\s.]+$/, '')
    .replace(/\s*\b(units?|homes?|doors?|unidades)\b\.?$/, '')
    .trim();

  // ── the value IS a band ─────────────────────────────────────────────────────
  // ANCHORED, deliberately. An unanchored range match read the years out of
  // "48 units, built 1998-2004" as a band and priced the community as 2,001 homes.
  const tooWide = (lo, hi) => ({ homes: 0, approx: false, band: [lo, hi], source: 'wide-band', implausible: false });
  const band = core.replace(/^between\s+/, '').match(/^(\d+)\s*(?:-|to|and)\s*(\d+)$/);
  if (band) {
    const lo = Number(band[1]), hi = Number(band[2]);
    if (hi >= lo) {
      return usableBand(lo, hi) ? done(Math.round((lo + hi) / 2), true, [lo, hi], 'range') : tooWide(lo, hi);
    }
  }
  const under = core.match(/^(?:under|below|up to|less than|fewer than|<)\s*(\d+)$/);
  if (under) {
    const hi = Number(under[1]);
    return usableBand(1, hi) ? done(Math.max(1, Math.round(hi / 2)), true, [1, hi], 'under') : tooWide(1, hi);
  }
  const open = core.match(/^(\d+)\s*\+$/)
    || core.match(/^(?:over|more than|above|at least|>)\s*(\d+)$/)
    || core.match(/^(\d+)\s*or more$/);
  if (open) return done(Number(open[1]), true, [Number(open[1]), null], 'open');

  // ── the value IS a number ───────────────────────────────────────────────────
  const exact = core.match(/^(\d+)$/);
  if (exact) return done(Number(exact[1]), hedged, null, 'number');
  const approxNum = core.match(/^[~≈]?\s*(?:approx|approximately|about|around|roughly|est|est\.)?\s*[~≈]?\s*(\d+)$/);
  if (approxNum) return done(Number(approxNum[1]), true, null, 'number');

  // ── it is prose: take ONLY a number that is actually counting doors ─────────
  // A bare /\d+/ here is what turned "built 2015, 41 homes" into 2,015 homes —
  // on-site tier, $2,500/mo, and approx=false so NOTHING flagged it. Requiring the
  // number to be followed by a unit word gets 41; "built 2015" alone now resolves
  // to nothing, which raises no-unit-count instead of pricing a year.
  const counted = s.match(/(\d+)\s*(?:units?|homes?|doors?|unidades)\b/);
  if (counted) return done(Number(counted[1]), hedged, null, 'in-prose');
  return none('unparsed');
}

// Prefer an exact count over a band, and any count over nothing -- a form can
// carry both a numeric field and a checkbox artifact like "(1-50 Units)".
export function resolveUnits(index) {
  // A stated count beats a count read out of prose, which beats a band. The old
  // rule preferred "exact" outright, so a bogus exact number scraped from prose
  // ("3 buildings with 240 doors" -> 3) beat a perfectly good band on the same lead.
  const RANK = { number: 0, 'in-prose': 1, range: 2, under: 3, open: 4 };
  const all = candidates(index, 'units').map((e) => ({ ...parseUnits(e.value), from: e.name, raw: e.value }));
  const usable = all
    .filter((u) => u.homes > 0)
    .sort((a, b) => (RANK[a.source] ?? 9) - (RANK[b.source] ?? 9));   // stable: field order breaks ties
  return usable[0] || all[0] || { ...parseUnits(''), from: null, raw: '' };
}
