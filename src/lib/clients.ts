import type { ClientRelation } from "@prisma/client";

export const CLIENT_RELATION_LABELS: Record<ClientRelation, string> = {
  end_client: "Cliente final",
  partner: "Parceiro (subcontratado)",
};

export const CLIENT_RELATION_OPTIONS: {
  value: ClientRelation;
  label: string;
}[] = [
  { value: "end_client", label: CLIENT_RELATION_LABELS.end_client },
  { value: "partner", label: CLIENT_RELATION_LABELS.partner },
];

export function parseClientRelation(raw: unknown): ClientRelation {
  const value = String(raw ?? "").trim();
  if (value === "partner" || value === "end_client") return value;
  return "end_client";
}
