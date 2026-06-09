import { supabase } from './supabase.js';

// Static UI config (not account data) — mirrors the mock's DATA.roles.
const ROLES = [
  { id: 'owner', label: 'Owner' },
  { id: 'bd', label: 'BD' },
  { id: 'ops', label: 'Ops' },
];

// Humanized "due" label computed fresh from the real date so it never goes stale.
function relativeDue(dateStr) {
  if (!dateStr) return '';
  const due = new Date(`${dateStr}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((due - today) / 86400000);
  if (days === 0) return 'due today';
  if (days < 0) return `${Math.abs(days)} days ago`;
  if (days < 14) return `in ${days} days`;
  return `in ${Math.ceil(days / 7)} wks`;
}

/**
 * Fetches every table for the signed-in user's account (RLS scopes the rows
 * automatically) and reshapes them into the exact object shape the UI
 * components already expect from the old mock `DATA`. Keeping the shape
 * identical means zero component changes — only the data source moved.
 */
export async function loadAccountData(session) {
  const uid = session.user.id;

  const [
    profileRes, accountRes, recurringRes, projectsRes, leadsRes,
    activityRes, ticketsRes, kpisRes, roiRes, libraryRes,
    badgesRes, snapCurRes, snapPastRes, roadmapRes, actionRes,
  ] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', uid).maybeSingle(),
    supabase.from('accounts').select('*').limit(1).maybeSingle(),
    supabase.from('recurring_services').select('*').order('sort'),
    supabase.from('projects').select('*').order('sort'),
    supabase.from('leads').select('*').order('sort'),
    supabase.from('activity').select('*').order('sort'),
    supabase.from('tickets').select('*').order('sort'),
    supabase.from('kpis').select('*').order('sort'),
    supabase.from('roi').select('*').limit(1).maybeSingle(),
    supabase.from('library_resources').select('*').order('sort'),
    supabase.from('account_badges').select('*, badges(*)').order('sort'),
    supabase.from('weekly_snapshots').select('*, weekly_snapshot_items(*)').eq('is_current', true).maybeSingle(),
    supabase.from('weekly_snapshots').select('week_label, pdf_path').eq('is_current', false).order('sort'),
    supabase.from('roadmap_quarters').select('*, roadmap_focuses(*)').order('sort'),
    supabase.from('action_items').select('*').order('sort'),
  ]);

  // Surface a hard failure on the two things the whole shell depends on.
  if (profileRes.error) throw profileRes.error;
  if (accountRes.error) throw accountRes.error;

  const profile = profileRes.data;
  const account = accountRes.data;

  // Signed in but not a member of any account (no invite) → no access.
  // Returning null lets AuthGate show the "no access" screen instead of
  // falling back to mock data.
  if (!profile || !account) return null;
  const roi = roiRes.data;

  const snap = snapCurRes.data;
  const items = snap?.weekly_snapshot_items || [];
  const byKind = (kind) =>
    items
      .filter((i) => i.kind === kind)
      .sort((a, b) => (a.sort || 0) - (b.sort || 0))
      .map((i) => ({ text: i.text, meta: i.meta }));

  return {
    user: {
      id: profile.id,
      name: profile.name || '',
      initials: profile.initials || '',
      role: profile.role || 'owner',
      isStaff: !!profile.is_staff,
      avatarUrl: profile.avatar_url || null,
    },
    account: {
      company: account.company,
      shortName: account.short_name,
      tier: account.tier,
      market: account.market,
      since: account.since,
      goalLabel: account.goal_label || 'boards signed',
      goalCurrent: account.goal_current || 0,
      goalTarget: account.goal_target || 0,
      logoUrl: account.logo_url || null,
    },
    roles: ROLES,
    recurringServices: (recurringRes.data || []).map((r) => ({
      id: r.id, name: r.name, short: r.short, cadence: r.cadence,
      lane: r.lane, color: r.color, lastTouch: r.last_touch, note: r.note,
    })),
    kpis: (kpisRes.data || []).map((k) => ({
      label: k.label, value: k.value, trend: k.trend, up: k.up, icon: k.icon, tone: k.tone,
    })),
    projects: (projectsRes.data || []).map((p) => ({
      id: p.code || p.monday_item_id, title: p.title, phase: p.phase, engines: p.engines || [],
      pct: p.pct, status: p.status,
      due: p.due_label || '', dueRel: p.due_rel || relativeDue(p.due_date),
      owners: p.owners || [], pulse: p.pulse,
    })),
    recentLeads: (leadsRes.data || []).map((l) => ({
      name: l.name, source: l.source, quality: l.quality,
      value: l.value, type: l.type, time: l.time_label,
    })),
    activity: (activityRes.data || []).map((a) => ({
      color: a.color, text: a.text, meta: a.meta,
    })),
    tickets: (ticketsRes.data || []).map((t) => ({
      id: t.code, title: t.title, priority: t.priority, status: t.status,
      agent: t.agent, time: t.time_label, excerpt: t.excerpt,
    })),
    weeklySnapshot: {
      weekLabel: snap?.week_label || '',
      pdf: snap?.pdf_path || '',
      quarterlyHref: snap?.quarterly_href || 'roi',
      summary: {
        waiting: snap?.summary_waiting || 0,
        leads: snap?.summary_leads || 0,
        leadsValue: snap?.leads_value || '',
        completed: snap?.summary_completed || 0,
      },
      waiting: byKind('waiting'),
      completed: byKind('completed'),
      upcoming: byKind('upcoming'),
      past: (snapPastRes.data || []).map((s) => ({ label: s.week_label, file: s.pdf_path })),
    },
    roadmap: (roadmapRes.data || []).map((q) => ({
      q: q.quarter, months: q.months, title: q.title, state: q.state, file: q.pdf_path,
      focuses: (q.roadmap_focuses || [])
        .slice()
        .sort((a, b) => (a.sort || 0) - (b.sort || 0))
        .map((f) => ({ t: f.text, s: f.status })),
    })),
    badges: (badgesRes.data || []).map((ab) => ({
      id: ab.badges?.slug,
      name: ab.badges?.name,
      desc: ab.badges?.description,
      color: ab.badges?.color,
      category: ab.badges?.category,
      state: ab.state,
      pct: ab.pct,
      earned: ab.earned_label,
    })),
    roi: roi
      ? {
          yearLabel: roi.year_label,
          invested: Number(roi.invested),
          contractValue: Number(roi.contract_value),
          boardsSigned: roi.boards_signed,
          ratio: Number(roi.ratio),
          rankingsTracked: roi.rankings_tracked,
          rankingsTop10: roi.rankings_top10,
        }
      : {},
    library: (libraryRes.data || []).map((r) => ({
      lane: r.lane, stage: r.stage, ttl: r.title, meta: r.meta, desc: r.description,
    })),
    actionQueue: (actionRes.data || []).map((a) => ({
      title: a.title, due: a.due_label || '', dueRel: relativeDue(a.due_date),
      zendeskId: a.zendesk_id || null, zendeskUrl: a.zendesk_url || null,
      routeId: a.zendesk_id || a.monday_item_id,
    })),
  };
}
