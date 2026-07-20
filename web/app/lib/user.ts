// Single source of truth for the current operator's identity.
//
// This is a PLACEHOLDER, not real authentication. In production this value
// comes from the authenticated session (SSO / deal-room access control).
// Everything downstream -- review actions and the query audit log -- already
// treats it as the governance "who", so wiring real auth means changing only
// this module, not the call sites.
export const CURRENT_USER = "analyst_001";

// Initials for the header avatar, e.g. "analyst_001" -> "AN".
export function userInitials(id: string): string {
  const letters = id.replace(/[^a-zA-Z]/g, "");
  return (letters.slice(0, 2) || id.slice(0, 2)).toUpperCase();
}
