// Network-free stand-ins for the portal modules the proposal page imports.
// Analytics is a no-op; accept / questions never fire in standalone mode
// (the accept card routes the reader to the portal), but the imports must resolve.
export const track = () => {};
export default track;
const noop = () => Promise.resolve({});
export const acceptProposal = noop;
export const requestProposalChanges = noop;
export const replyOnProposal = noop;
export const notifyProposalSent = noop;
export const isSupabaseConfigured = false;
export const supabase = null;
