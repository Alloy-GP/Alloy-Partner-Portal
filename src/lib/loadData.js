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
 * Lightweight "who am I": is this a staff member, and (for clients) which
 * account are they locked to. Drives the staff-vs-client branch in AuthGate.
 */
export async function getMe(session) {
  const { data, error } = await supabase
    .from('profiles').select('account_id, is_staff, name, initials, avatar_url, role')
    .eq('id', session.user.id).maybeSingle();
  if (error) throw error;
  if (!data) return null; // signed in but no profile → no access
  return {
    accountId: data.account_id || null,
    isStaff: !!data.is_staff,
    profile: data,
  };
}

/**
 * Fetches every table for a given account and reshapes them into the exact
 * object shape the UI expects from the old mock `DATA`. `accountId` is the
 * account being viewed — a client's own, or any client for staff (RLS allows
 * staff to read all). `me` is the signed-in profile (for DATA.user).
 */
export async function loadAccountData(session, accountId, me) {
  if (!accountId) return null;

  const [
    accountRes, recurringRes, projectsRes, leadsRes,
    activityRes, ticketsRes, kpisRes, roiRes, libraryRes,
    badgesRes, snapCurRes, snapPastRes, roadmapRes, actionRes,
  ] = await Promise.all([
    supabase.from('accounts').select('*').eq('id', accountId).maybeSingle(),
    supabase.from('recurring_services').select('*').eq('account_id', accountId).order('sort'),
    supabase.from('projects').select('*').eq('account_id', accountId).order('sort'),
    supabase.from('leads').select('*').eq('account_id', accountId).order('sort'),
    supabase.from('activity').select('*').eq('account_id', accountId).order('sort'),
    supabase.from('tickets').select('*').eq('account_id', accountId).order('sort'),
    supabase.from('kpis').select('*').eq('account_id', accountId).order('sort'),
    supabase.from('roi').select('*').eq('account_id', accountId).limit(1).maybeSingle(),
    supabase.from('library_resources').select('*').order('sort'),
    supabase.from('account_badges').select('*, badges(*)').eq('account_id', accountId).order('sort'),
    supabase.from('weekly_snapshots').select('*, weekly_snapshot_items(*)').eq('account_id', accountId).eq('is_current', true).maybeSingle(),
    supabase.from('weekly_snapshots').select('week_label, pdf_path').eq('account_id', accountId).eq('is_current', false).order('sort'),
    supabase.from('roadmap_quarters').select('*, roadmap_focuses(*)').eq('account_id', accountId).order('sort'),
    supabase.from('action_items').select('*').eq('account_id', accountId).order('sort'),
  ]);

  if (accountRes.error) throw accountRes.error;

  const profile = (me && me.profile) || {};
  const account = accountRes.data;

  // No such account (bad id / nothing to show) → null so AuthGate can react.
  if (!account) return null;
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
      id: session.user.id,
      name: profile.name || '',
      initials: profile.initials || '',
      role: profile.role || 'owner',
      isStaff: !!profile.is_staff,
      avatarUrl: profile.avatar_url || null,
    },
    account: {
      id: account.id,
      company: account.company,
      shortName: account.short_name,
      tier: account.tier,
      market: account.market,
      since: account.since,
      goalLabel: account.goal_label || 'boards signed',
      goalCurrent: account.goal_current || 0,
      goalTarget: account.goal_target || 0,
      logoUrl: account.logo_url || null,
      // Lifetime WhatConverts tenure (weekly rollup).
      wcQualifiedTotal: account.wc_qualified_total || 0,
      wcQualifiedBySource: account.wc_qualified_by_source || {},
      wcQualifiedByYear: account.wc_qualified_by_year || {},
      wcFirstLeadAt: account.wc_first_lead_at || null,
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
      id: l.wc_lead_id, name: l.name, email: l.email, phone: l.phone, company: l.company, source: l.source,
      quality: l.quality, quotable: l.quotable,
      value: l.value, quoteValue: l.quote_value, salesValue: l.sales_value,
      type: l.type, time: l.time_label, message: l.message, context: l.context,
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
      headline: snap?.headline || '',
      note: snap?.note || '',
      status: snap?.status || '',
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
      lead: byKind('lead'),
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
