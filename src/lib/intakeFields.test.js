import { describe, it, expect } from 'vitest';
import { normName, indexFields, pick, parseUnits, resolveUnits } from './intakeFields.js';
import { leadToProposalRaw } from './proposalIntake.js';
import { recommendTier, isHighRise, intakeFlags } from './proposalTier.js';

// Every field name and value below is VERBATIM from the live leads table — these
// are forms real boards have actually submitted, not invented variants. The counts
// in comments are how many times each was received.
const lead = (fields) => ({
  id: '1', company: 'Test HOA', name: 'A Person', email: 'a@b.co', phone: '5551234',
  fields: Object.entries(fields).map(([name, value]) => ({ name, value })),
});
const raw = (fields) => leadToProposalRaw(lead(fields));

describe('normName', () => {
  it('folds diacritics so a Portuguese/Spanish form resolves', () => {
    expect(normName('Número de unidades*')).toBe('numero de unidades');
  });
  it('flattens the separators WhatConverts sends', () => {
    expect(normName('how-many-units')).toBe('how many units');
    expect(normName('Number of Units/Homes')).toBe('number of units homes');
    expect(normName('Last Name(Required)')).toBe('last name');
    expect(normName('NUMBER OF UNITS*')).toBe('number of units');
    expect(normName('COMMUNITY / ASSOCIATION NAME *')).toBe('community association name');
  });
});

describe('unit field resolution — the real names', () => {
  // Exact-name lookup found only "number of units"; these all returned homes=0.
  const NAMES = [
    'Number of Units *',        // 156x
    'Number of units*',         // 70x
    'NUMBER OF UNITS*',         // 21x
    'NUMBER OF UNITS',          // 8x
    'Number of Units',          // 42x
    'Number of units',          // 14x
    'Number of Units/Homes',    // 31x  <- was missed
    'HOA Size',                 // 502x <- was missed
    'PORTFOLIO SIZE*',          // 23x  <- was missed
    'how-many-units',           // 1x   <- was missed
    'Número de unidades*',      // 1x   <- was missed
  ];
  it.each(NAMES)('resolves %s', (name) => {
    expect(raw({ [name]: '120' }).homes).toBe(120);
  });

  it('does NOT read the board-member headcount as a door count', () => {
    // "Number of Board Members Attending" (50x) is a real field on a meeting form.
    expect(raw({ 'Number of Board Members Attending': '7' }).homes).toBe(0);
  });

  it('prefers an exact count over a checkbox band when a form sends both', () => {
    const idx = indexFields([
      { name: '(1-50 Units)', value: '(1-50 Units)' },   // WhatConverts artifact
      { name: 'Number of Units *', value: '30' },
    ]);
    const u = resolveUnits(idx);
    expect(u.homes).toBe(30);
    expect(u.approx).toBe(false);
  });
});

describe('parseUnits — bands are not counts', () => {
  // THE BUG: "50–100" (en dash) stripped to "50100" and parsed as 50,100 homes,
  // which forced the on-site tier and would print "50,100 homes" to a board.
  it.each([
    ['50–100', 75, [50, 100]],     // 9x
    ['100–200', 150, [100, 200]],  // 8x
    ['200–500', 350, [200, 500]],  // 6x
    ['1-50 Units', 26, [1, 50]],   // 4x + 5x as "(1-50 Units)"
    ['51-100 Units', 76, [51, 100]],
    ['101-200 Units', 151, [101, 200]],
  ])('%s -> %i, marked approximate', (input, homes, band) => {
    const u = parseUnits(input);
    expect(u.homes).toBe(homes);
    expect(u.approx).toBe(true);
    expect(u.band).toEqual(band);
  });

  it('reads "Under 50" (20x) as a band, not as 50 exactly', () => {
    const u = parseUnits('Under 50');
    expect(u.homes).toBe(25);
    expect(u.approx).toBe(true);
    expect(u.band).toEqual([1, 50]);
  });

  it('reads "200+ Units" as an open-ended floor', () => {
    const u = parseUnits('200+ Units');
    expect(u.homes).toBe(200);
    expect(u.approx).toBe(true);
    expect(u.band).toEqual([200, null]);
  });

  it('keeps a plain count exact', () => {
    expect(parseUnits('834')).toMatchObject({ homes: 834, approx: false, band: null });
    expect(parseUnits('1,200')).toMatchObject({ homes: 1200, approx: false });
    expect(parseUnits('12 units')).toMatchObject({ homes: 12, approx: false });
  });

  it('marks a hedged count approximate without losing the number', () => {
    expect(parseUnits('~800')).toMatchObject({ homes: 800, approx: true });
    expect(parseUnits('approx 250')).toMatchObject({ homes: 250, approx: true });
  });

  it('returns 0 for the junk real forms receive, distinguishing empty from unparsed', () => {
    expect(parseUnits('NA')).toMatchObject({ homes: 0, source: 'unparsed' });
    expect(parseUnits('VcpNlRrPmZRhtUmIGOWTTo')).toMatchObject({ homes: 0, source: 'unparsed' });
    expect(parseUnits('')).toMatchObject({ homes: 0, source: 'empty' });
    expect(parseUnits(null)).toMatchObject({ homes: 0, source: 'empty' });
  });

  it('flags an implausible count instead of quietly pricing it', () => {
    // "805400" is a real submitted value (3x).
    expect(parseUnits('805400').implausible).toBe(true);
    expect(parseUnits('834').implausible).toBe(false);
  });
});

describe('community type resolution — this is what made isHighRise dead code', () => {
  // isHighRise only ever reads metaType. metaType came from an exact lookup for
  // "community type", so the 8 real "High-Rise Condominium" submissions arrived on
  // "Type of Association *" and never triggered on-site.
  const NAMES = [
    'Community type',           // 10x
    'COMMUNITY TYPE *',         // 10x
    'Type of Association *',    // 113x <- was missed
    'Property type*',           // 70x  <- was missed
    'PROPERTY TYPE*',           // 21x  <- was missed
    'community-type',           // 40x  <- was missed
    'Tipo de propriedade*',     // 1x   <- was missed
  ];
  it.each(NAMES)('%s reaches the tier logic', (name) => {
    const r = raw({ [name]: 'High-Rise Condominium', 'Number of Units *': '120' });
    expect(r.metaType).toBe('High-Rise Condominium');
    expect(isHighRise(r.metaType)).toBe(true);
    // 120 homes is under the 500 on-site threshold, so ONLY the high-rise rule
    // can produce this — proving the path is live.
    expect(r.tierId).toBe('onsite');
  });

  it('reads a self-labelling option field, which is how "High Rise" arrives', () => {
    const r = raw({ 'High Rise': 'High Rise', 'Number of Units *': '120' });
    expect(r.tierId).toBe('onsite');
  });

  it('does not mistake a service choice for a community type', () => {
    // "Accounting Only", "Onsite" and "Portfolio" arrive as field names the same
    // way "High Rise" does, but they are service selections, not structures.
    for (const n of ['Accounting Only', 'Onsite', 'Portfolio']) {
      expect(raw({ [n]: n, 'Number of Units *': '120' }).metaType).toBe('');
    }
  });
});

describe('management status resolution — the real names', () => {
  const NAMES = [
    'Current management status',                  // 9x
    'CURRENT MANAGEMENT*',                        // 21x <- was missed
    'Current Management *',                       // 20x <- was missed
    'CURRENT MANAGEMENT SITUATION',               // 7x  <- was missed
    'Currently Self-Managed or With a Company?',  // 26x <- was missed
    'Current situation*',                         // 69x <- was missed
  ];
  it.each(NAMES)('resolves %s', (name) => {
    expect(raw({ [name]: 'Self-managed today' }).metaStatus).toBe('Self-managed today');
  });

  it('never reads a management COMPANY NAME as a status', () => {
    // These fields hold "Gibson Associates", "Bad CAM", "Westford" — vendor names.
    // Treated as a status they would land where the tier logic expects an option.
    expect(raw({ 'Leave blank if self-managed': 'Gibson Associates' }).metaStatus).toBe('');
    expect(raw({ 'Current Management Company': 'Property Management Westford' }).metaStatus).toBe('');
  });
});

describe('the board\'s own words survive a differently-named box', () => {
  it.each([
    'In your own words — what does success look like?',
    'Message',
    'TELL US WHAT YOU NEED *',
    "ANYTHING YOU'D LIKE US TO KNOW? (optional)",
    'Anything Else We Should Know?',
    "Tell us what's going on — as much or as little as you'd like",
    'Comments',
  ])('resolves %s', (name) => {
    expect(raw({ [name]: 'Our manager is unresponsive.' }).quote).toBe('Our manager is unresponsive.');
  });

  it('does not pull an email or a referral field into the quote', () => {
    expect(raw({ 'Email Address': 'a@b.co', 'Referral source (leave blank)': 'x' }).quote).toBe('');
  });
});

describe('the whole path on a real range submission', () => {
  const r = raw({
    'Number of Units/Homes': '50–100',
    'Type of Association *': 'Garden-Style Condominium',
    'Currently Self-Managed or With a Company?': 'Currently with a Management Company',
    'Budget range': 'Open — looking for the right fit, not the cheapest',
  });

  it('prices the midpoint rather than 50,100 homes', () => {
    expect(r.homes).toBe(75);
    expect(r.unitsApprox).toBe(true);
  });

  it('recommends full service, not on-site — the old parse forced on-site via scale', () => {
    expect(recommendTier(r).tierId).toBe('full');
    expect(r.tierId).toBe('full');
  });

  it('tells staff the count is a midpoint before anything is sent', () => {
    const f = intakeFlags(r).find((x) => x.code === 'unit-count-approximate');
    expect(f).toBeTruthy();
    expect(f.detail).toContain('midpoint of 50–100');
  });
});

describe('unrecognised budget answers are no longer silent', () => {
  it('flags an answer it cannot map, because the fallback is the DEAREST tier', () => {
    const r = raw({ Budget: 'around $50k a year', 'Number of Units *': '120' });
    expect(recommendTier(r).budgetIntent).toBe('unstated');
    expect(r.tierId).toBe('full');
    expect(intakeFlags(r).map((f) => f.code)).toContain('budget-unrecognized');
  });

  it('stays quiet when the answer IS understood', () => {
    const r = raw({ 'Budget range': 'Tight budget — financial only', 'Number of Units *': '120' });
    expect(intakeFlags(r).map((f) => f.code)).not.toContain('budget-unrecognized');
    expect(r.tierId).toBe('financial');
  });

  it('still reports a missing budget separately from an unreadable one', () => {
    const codes = intakeFlags(raw({ 'Number of Units *': '120' })).map((f) => f.code);
    expect(codes).toContain('no-budget');
    expect(codes).not.toContain('budget-unrecognized');
  });
});

// Every case below was found by an adversarial audit of the first version of this
// module and reproduced by executing it. They are the expensive kind of bug: each
// produced a confident wrong number or put words in a board's mouth, silently.
describe('prose in a unit box must not price an incidental number', () => {
  // "Number of Units *", "HOA Size" and "Number of Units/Homes" are FREE TEXT, so
  // sentences land in them. A bare /\d+/ took the first digit run it found.
  it.each([
    ['built 2015, 41 homes', 41],          // was 2015 -> on-site, $2,500/mo, NO flag
    ['2 buildings, 48 units', 48],         // was 2 -> "Only 2 units", a false statement
    ['Approx 96 units in 2-3 buildings', 96],
    ['48 units, built 1998-2004', 48],     // was 2001 via an unanchored range match
    ['10-12 buildings, 640 units', 640],   // was 11 -> $250/mo instead of on-site
    ['3 buildings with 240 doors', 240],
  ])('%s -> %i doors', (input, homes) => {
    expect(parseUnits(input).homes).toBe(homes);
  });

  it('resolves to nothing when no number is actually counting doors', () => {
    // A year is not a community. 0 raises no-unit-count instead of quoting a year.
    expect(parseUnits('built 2015').homes).toBe(0);
    expect(parseUnits('Built between 2015 - 2019').homes).toBe(0);
    expect(intakeFlags(raw({ 'HOA Size': 'built 2015' })).map((f) => f.code)).toContain('no-unit-count');
  });

  it('reads a band written with words', () => {
    expect(parseUnits('50 to 100')).toMatchObject({ homes: 75, approx: true });
    expect(parseUnits('between 50 and 100')).toMatchObject({ homes: 75, approx: true });
  });

  it('does not let a number scraped from prose outrank a real band', () => {
    const u = resolveUnits(indexFields([
      { name: 'Number of Units *', value: '101-200 Units' },
      { name: 'Number of Units/Homes', value: '3 buildings with 240 doors' },
    ]));
    expect(u.homes).toBe(240);
  });
});

describe('the narrative box beats the "anything else?" box', () => {
  const story = 'Our manager has not returned a call in three weeks and the reserve study is two years overdue.';

  it('does not persist "No" as the board\'s own words', () => {
    // Boards answer "Anything else?" with "No" while the real story sits in Message.
    // quote is the ONLY narrative the matcher receives, so "No" ran it on nothing.
    expect(raw({ 'Message *': story, 'Anything else?': 'No' }).quote).toBe(story);
    expect(raw({ 'HOW CAN WE HELP? *': 'We need help with collections.', 'Anything else?': 'nope' }).quote)
      .toBe('We need help with collections.');
  });

  it('still uses the anything-box when it is the only one', () => {
    expect(raw({ 'ANYTHING ELSE WE SHOULD KNOW?': 'Roof failing.' }).quote).toBe('Roof failing.');
  });
});

describe('free-text prose is never mined into board-facing concerns', () => {
  // painsFromFrustrations matches bare keywords (/vendor/, /developer/), so feeding
  // it prose invented concerns the board never ticked — on the PROSPECT's document,
  // and as a false "they ticked developer-controlled" flag to staff. Note the prose
  // below DENIES each problem and still produced three concerns.
  const prose = 'We have no vendor problems and no delinquency issues - our developer handed the community over in 2014.';
  const r = raw({ "WHAT'S PROMPTING THE CONVERSATION?": prose, 'Number of Units *': '120' });

  it('takes no concerns from a free-text answer', () => {
    expect(r.selectedPains).toEqual([]);
  });
  it('routes that prose to the quote, where it belongs', () => {
    expect(r.quote).toBe(prose);
  });
  it('invents no contradiction flag from it', () => {
    expect(intakeFlags(r).map((f) => f.code)).not.toContain('developer-vs-status');
  });
  it('STILL reads the explicit multi-select, which is the real signal', () => {
    const ticked = raw({
      Frustrations: 'Delinquency creeping up — collections aren’t working, Manager turnover',
      'Number of Units *': '120',
    });
    expect(ticked.selectedPains).toEqual(['delinquency', 'manager-turnover']);
  });
});

describe('a self-labelling checkbox answered "Yes"', () => {
  it('uses the field NAME as the type, not the value', () => {
    // metaType="Yes" is unreadable by isHighRise, so the high-rise never tiered.
    const r = raw({ 'High Rise': 'Yes', 'Number of Units *': '120' });
    expect(r.metaType).toBe('High Rise');
    expect(isHighRise(r.metaType)).toBe(true);
    expect(r.tierId).toBe('onsite');
  });

  it('keeps the exclude guards intact after broadening the pattern', () => {
    expect(raw({ 'HOA Location': 'Austin, TX' }).metaType).toBe('');
    expect(raw({ 'HOA Size': '240' }).metaType).toBe('');
    expect(raw({ 'HOA Size': '240' }).homes).toBe(240);
  });
});

describe('pick reports WHICH field answered', () => {
  it('names the source field, so a number on screen is attributable', () => {
    const idx = indexFields([{ name: 'HOA Size', value: '240' }]);
    expect(pick(idx, 'units')).toEqual({ value: '240', from: 'HOA Size' });
  });
  it('returns empty rather than throwing on a lead with no fields', () => {
    expect(pick(indexFields(null), 'units')).toEqual({ value: '', from: null });
    expect(leadToProposalRaw({ id: '1' }).homes).toBe(0);
  });
});
