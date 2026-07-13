import {
  AlertTriangle,
  Building2,
  FileText,
  Scale,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";

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
