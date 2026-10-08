// Cal.com embed, loaded lazily. The portal opens Cal's booking dialog (the
// "pop up via element click" flavour, driven programmatically rather than via
// data-cal-* attributes, which is more reliable with React re-renders) after a
// client submits their quarterly prep. embed.js is fetched on FIRST USE, never
// at page load, so clients who never book pay nothing for it.
//
// The bootstrap below is Cal's own snippet, de-minified: a queue-backed global
// `Cal` that buffers calls until embed.js arrives, with per-namespace queues
// (`Cal.ns[namespace]`) so several event types can coexist on one page.

const EMBED_SRC = 'https://app.cal.com/embed/embed.js';
const ORIGIN = 'https://app.cal.com';
const inited = new Set();

function ensureCal() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;
  if (window.Cal) return window.Cal;
  const push = (api, args) => { api.q.push(args); };
  window.Cal = function () {
    const cal = window.Cal;
    const args = arguments;
    if (!cal.loaded) {
      cal.ns = {};
      cal.q = cal.q || [];
      document.head.appendChild(document.createElement('script')).src = EMBED_SRC;
      cal.loaded = true;
    }
    if (args[0] === 'init') {
      const api = function () { push(api, arguments); };
      const namespace = args[1];
      api.q = api.q || [];
      if (typeof namespace === 'string') {
        cal.ns[namespace] = cal.ns[namespace] || api;
        push(cal.ns[namespace], args);
        push(cal, ['initNamespace', namespace]);
      } else push(cal, args);
      return;
    }
    push(cal, args);
  };
  return window.Cal;
}

// Alloy-branded dialog: purple accent in light mode, pink in dark.
const DEFAULT_UI = {
  theme: 'auto',
  hideEventTypeDetails: false,
  layout: 'month_view',
  cssVarsPerTheme: { light: { 'cal-brand': '#381c4f' }, dark: { 'cal-brand': '#d9356e' } },
};

export function initCalNamespace(namespace, ui = {}) {
  const Cal = ensureCal();
  if (!Cal) return null;
  if (!inited.has(namespace)) {
    Cal('init', namespace, { origin: ORIGIN });
    Cal.ns[namespace]('ui', { ...DEFAULT_UI, ...ui });
    inited.add(namespace);
  }
  return Cal.ns[namespace];
}

// Subscribe to a Cal embed event (e.g. 'bookingSuccessful',
// 'bookingSuccessfulV2') for a namespace. Cal keeps every listener it is
// given, so register ONE per namespace+action and route it to the latest
// handler — re-calling with a new handler replaces, never stacks.
const handlers = new Map();
export function onCalEvent(namespace, action, handler) {
  const key = `${namespace}::${action}`;
  const first = !handlers.has(key);
  handlers.set(key, handler);
  if (!first) return true;
  const ns = initCalNamespace(namespace);
  if (!ns) { handlers.delete(key); return false; }
  ns('on', { action, callback: (e) => { const h = handlers.get(key); if (h) h(e && e.detail ? e.detail : e); } });
  return true;
}

// Open the booking dialog for `calLink` (e.g. "alloy/quarterly-meeting").
// `config` prefills the booking form: { name, email, notes, guests, … }.
// Returns false when there is no DOM (tests, SSR).
export function openCalModal({ namespace, calLink, config = {}, ui } = {}) {
  const ns = initCalNamespace(namespace, ui);
  if (!ns) return false;
  ns('modal', { calLink, config });
  return true;
}
