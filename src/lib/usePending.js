import React from "react";
import { DATA } from "../data.js";
import { pendingTickets } from "./zendesk.js";

// Live "waiting on you" Zendesk tickets for the current account.
// Returns null while loading, then an array. Shared by every surface that needs
// the pending-ticket count so "in motion" math agrees app-wide.
export function usePending() {
  const [list, setList] = React.useState(null);
  React.useEffect(() => {
    let cancelled = false;
    pendingTickets(DATA.account && DATA.account.id).then((t) => { if (!cancelled) setList(t); });
    return () => { cancelled = true; };
  }, [DATA.account && DATA.account.id]);
  return list;
}
