import {
  AlertTriangle,
  Building2,
  FileText,
  Scale,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";

// Fixed icon-size tiers, tied to context rather than chosen ad hoc per call
// site (previously the same icon, e.g. Sparkles, appeared at 3 unrelated
// sizes across the app with no rule).
export const ICON_INLINE = "h-3 w-3"; // inline-in-text, chip decorations
export const ICON_DEFAULT = "h-3.5 w-3.5"; // panel headers, buttons, list icons
export const ICON_AVATAR = "h-5 w-5"; // avatars, empty-state hero icons

// Map a workstream to its icon. Falls back to a neutral document glyph.
const WORKSTREAM_ICONS: Record<string, LucideIcon> = {
  financial: TrendingUp,
  commercial: Scale,
  operational: Users,
};

export function workstreamIcon(workstream: string): LucideIcon {
  return WORKSTREAM_ICONS[workstream] ?? FileText;
}

// Map a finding kind to its icon.
const KIND_ICONS: Record<string, LucideIcon> = {
  customer_concentration: TrendingUp,
  contract_clause: Scale,
  personnel_event: Users,
};

export function kindIcon(kind: string): LucideIcon {
  return KIND_ICONS[kind] ?? FileText;
}

export { AlertTriangle, Building2 };
