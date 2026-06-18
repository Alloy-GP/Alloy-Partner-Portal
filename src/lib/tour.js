import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { DATA } from '../data.js';
import { supabase } from './supabase.js';

// Guided dashboard tour. Auto-runs once for clients on first sign-in (App.jsx),
// and is replayable on demand from the profile menu ("View portal tour").
// Steps anchor to [data-tour="..."] hooks on the dashboard so they survive
// styling changes.

const STEPS = [
  {
    popover: {
      title: 'Welcome to your portal 👋',
      description: 'A 30-second tour of your dashboard. You can skip anytime, and replay it later from your profile menu.',
    },
  },
  {
    element: '[data-tour="hero"]',
    popover: {
      title: 'Your account at a glance',
      description: 'Your current goal and progress live here, updated as we execute.',
      side: 'bottom', align: 'start',
    },
  },
  {
    element: '[data-tour="roadmap-cta"]',
    popover: {
      title: 'Your Growth Roadmap',
      description: "Open your roadmap to see the bigger picture — the stage-by-stage journey we're driving in each of your markets, from Foundation all the way to Dominance.",
      side: 'top', align: 'start',
    },
  },
  {
    element: '[data-tour="queue"]',
    popover: {
      title: 'Your action queue',
      description: "Anything waiting on you shows up here — approvals, questions, and to-dos so nothing stalls.",
      side: 'bottom', align: 'start',
    },
  },
  {
    element: '[data-tour="quarterly-playbook"]',
    popover: {
      title: 'Quarterly Playbook',
      description: "This quarter at a glance — what's planned, what we've added, and what's been delivered. Click in for the full breadth of work behind your growth.",
      side: 'bottom', align: 'center',
    },
  },
  {
    element: '[data-tour="snapshot"]',
    popover: {
      title: 'Partnership value',
      description: 'The value this partnership has created — qualified leads, contract value, revenue, and what it adds to your firm.',
      side: 'left', align: 'start',
    },
  },
  {
    element: '[data-tour="nav"]',
    popover: {
      title: 'Get around',
      description: 'Jump to your Pipeline, Roadmap, Inbox, and more from the sidebar.',
      side: 'right', align: 'center',
    },
  },
  {
    popover: {
      title: "You're all set 🎉",
      description: 'That\'s the tour. Replay it anytime from your profile menu (top-right) → View portal tour.',
    },
  },
];

async function markComplete(userId) {
  const ts = new Date().toISOString();
  if (DATA.user) DATA.user.tourCompletedAt = ts;   // don't re-trigger this session
  if (!userId) return;
  try {
    await supabase.from('profiles').update({ tour_completed_at: ts }).eq('id', userId);
  } catch { /* non-critical — local flag still prevents re-nagging this session */ }
}

// Keep only steps whose anchor is actually on screen (skip missing/hidden ones,
// e.g. cards a particular account doesn't have).
function visibleSteps() {
  return STEPS.filter((s) => {
    if (!s.element) return true;
    const el = document.querySelector(s.element);
    return el && el.getBoundingClientRect().width > 0;
  });
}

let active = null;

export function startPortalTour({ userId } = {}) {
  if (active) return;                       // already running
  const steps = visibleSteps();
  if (!steps.length) return;
  active = driver({
    showProgress: true,
    allowClose: true,
    overlayColor: 'rgba(26,15,38,0.55)',
    stagePadding: 6,
    stageRadius: 12,
    nextBtnText: 'Next',
    prevBtnText: 'Back',
    doneBtnText: 'Done',
    popoverClass: 'alloy-tour',
    steps,
    onDestroyed: () => { active = null; markComplete(userId); },
  });
  active.drive();
}
