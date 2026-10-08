// Zendesk org picker for Admin → Manage Clients → Integrations. Pure: turns
// the org list (from the `admin` fn's `zendesk_orgs`) + the account's current
// id + the other accounts' ids into what the <select> shows and a status line.
//
// The rule that matters: an existing mapping is NEVER dropped by the picker.
// If the saved id isn't in the list (Zendesk renamed/deleted the org, or the
// list didn't load), it stays selected as a "not found" option and only a
// deliberate change replaces it. Saving a client you didn't touch keeps the
// id it had.

export const NOT_CONNECTED = '';

// orgs: null = still loading · [] = none / couldn't load · [{ id, name }]
// usedBy: { [orgId]: 'RISE' } — other accounts already on that org
export function zendeskOrgOptions(orgs, currentId, usedBy = {}) {
  const cur = String(currentId || '').trim();
  const list = Array.isArray(orgs) ? orgs.map((o) => ({ id: String(o.id), name: String(o.name || '') })) : [];
  const byId = Object.fromEntries(list.map((o) => [o.id, o]));
  const options = [{ value: NOT_CONNECTED, label: 'Not connected' }];
  list.forEach((o) => options.push({ value: o.id, label: `${o.name} · ${o.id}${usedBy[o.id] ? ` · used by ${usedBy[o.id]}` : ''}` }));

  let status;
  if (!cur) status = { kind: 'none', text: 'Not connected — the client has no tickets in the portal.' };
  else if (byId[cur]) status = { kind: 'ok', text: `${byId[cur].name}${usedBy[cur] ? ` — also used by ${usedBy[cur]}` : ''}`, name: byId[cur].name };
  else {
    // Keep the saved id selectable — while the list loads, when it fails, and
    // when Zendesk no longer lists it — so it survives a save untouched.
    options.splice(1, 0, { value: cur, label: orgs === null ? cur : `${cur} · not found in Zendesk` });
    status = orgs === null
      ? { kind: 'loading', text: `Checking ${cur} with Zendesk…` }
      : list.length
        ? { kind: 'missing', text: `${cur} isn’t one of Zendesk’s ${list.length} organizations — check it, or pick the right one.` }
        : { kind: 'offline', text: `Couldn’t load Zendesk’s organizations — keeping ${cur} as is.` };
  }
  return { options, status, value: cur };
}

// { orgId: 'RISE' } for every OTHER account that has an org — so the picker can
// flag "used by …" and the status line can warn about a shared org.
export function orgUsage(accounts, exceptAccountId) {
  const used = {};
  (accounts || []).forEach((a) => {
    const id = String(a.zendesk_org_id || '').trim();
    if (!id || a.id === exceptAccountId) return;
    used[id] = used[id] ? `${used[id]}, ${a.short_name || a.company}` : (a.short_name || a.company);
  });
  return used;
}
