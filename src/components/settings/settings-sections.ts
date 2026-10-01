export type SettingsSection =
  | "contracts"
  | "interventions"
  | "goals"
  | "vat"
  | "company"
  | "rates"
  | "proposals"
  | "time"
  | "locale";

export type SettingsNavGroup = {
  id: string;
  label: string;
  items: { id: SettingsSection; label: string }[];
};

export const SETTINGS_NAV: SettingsNavGroup[] = [
  {
    id: "ops",
    label: "Operações",
    items: [
      { id: "contracts", label: "Contratos / packs" },
      { id: "interventions", label: "Intervenções" },
    ],
  },
  {
    id: "finance",
    label: "Revenue",
    items: [{ id: "goals", label: "Pulse" }],
  },
  {
    id: "platform",
    label: "Plataforma",
    items: [
      { id: "vat", label: "IVA e preços" },
      { id: "company", label: "Empresa" },
      { id: "rates", label: "Tarifas" },
      { id: "proposals", label: "Propostas" },
      { id: "time", label: "Tempo" },
      { id: "locale", label: "Localização" },
    ],
  },
];

export const SETTINGS_SECTION_LABELS: Record<SettingsSection, string> = {
  contracts: "Contratos / packs",
  interventions: "Intervenções",
  goals: "Pulse",
  vat: "IVA e preços",
  company: "Empresa",
  rates: "Tarifas",
  proposals: "Propostas",
  time: "Tempo",
  locale: "Localização",
};

const ALL_SECTIONS = new Set<string>(
  SETTINGS_NAV.flatMap((g) => g.items.map((i) => i.id)),
);

export function parseSettingsSection(
  raw: string | undefined | null,
): SettingsSection {
  if (raw === "platform") return "vat";
  if (raw && ALL_SECTIONS.has(raw)) return raw as SettingsSection;
  return "contracts";
}

export function groupIdForSection(section: SettingsSection): string {
  return (
    SETTINGS_NAV.find((g) => g.items.some((i) => i.id === section))?.id ??
    "ops"
  );
}
