/** Branded Webiton proposal HTML skeleton (Commercial Phase 4). */

export type ProposalLineItem = {
  description: string;
  amountEur: number;
};

export const WEBITON_PROPOSAL_TEMPLATE_HTML = `<!DOCTYPE html>
<html lang="pt">
<head><meta charset="utf-8" /><title>{{title}}</title></head>
<body style="font-family:Georgia,serif;color:#1a1a1a;max-width:720px;margin:40px auto;padding:0 24px;line-height:1.5">
  <header style="border-bottom:2px solid #1d4ed8;padding-bottom:16px;margin-bottom:32px">
    <p style="margin:0;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#64748b">Webiton</p>
    <h1 style="margin:8px 0 0;font-size:28px">{{title}}</h1>
    <p style="margin:8px 0 0;color:#64748b">Proposta para {{clientName}}</p>
    <p style="margin:4px 0 0;font-size:13px;color:#64748b">Data: {{proposalDate}}</p>
  </header>
  <section>
    <h2 style="font-size:16px;letter-spacing:.06em;text-transform:uppercase;color:#1d4ed8">Âmbito</h2>
    <div>{{scopeHtml}}</div>
  </section>
  <section style="margin-top:32px">
    <h2 style="font-size:16px;letter-spacing:.06em;text-transform:uppercase;color:#1d4ed8">Investimento</h2>
    <p style="font-size:22px;font-weight:bold;margin:0">{{amountEur}} EUR</p>
    <p style="margin:6px 0 0;font-size:13px;color:#64748b">Valores sem IVA</p>
  </section>
  <section style="margin-top:32px">
    <h2 style="font-size:16px;letter-spacing:.06em;text-transform:uppercase;color:#1d4ed8">Próximos passos</h2>
    <ol>
      <li>Rever e validar o âmbito</li>
      <li>Confirmar investimento e calendário</li>
      <li>Kick-off e arranque da entrega</li>
    </ol>
  </section>
  <footer style="margin-top:48px;padding-top:16px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b">
    Webiton · webiton.pt · propostas sem IVA · Optima Desk
  </footer>
</body>
</html>`;

export function fillProposalTemplate(
  html: string,
  vars: {
    title: string;
    clientName: string;
    scopeHtml: string;
    amountEur: string;
    proposalDate: string;
  },
): string {
  return html
    .replaceAll("{{title}}", vars.title)
    .replaceAll("{{clientName}}", vars.clientName)
    .replaceAll("{{scopeHtml}}", vars.scopeHtml)
    .replaceAll("{{amountEur}}", vars.amountEur)
    .replaceAll("{{proposalDate}}", vars.proposalDate);
}

/** Persist line items as `description | 123.45` (one per line). */
export function serializeProposalItems(items: ProposalLineItem[]): string {
  return items
    .map((i) => {
      const desc = i.description.trim().replace(/\s*\|\s*/g, " — ");
      return `${desc} | ${Number(i.amountEur || 0).toFixed(2)}`;
    })
    .filter((l) => l.length > 3)
    .join("\n");
}

export function parseProposalItems(body: string): ProposalLineItem[] {
  const lines = body
    .split("\n")
    .map((l) => l.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean);

  const items: ProposalLineItem[] = [];
  for (const line of lines) {
    const pipe = line.lastIndexOf("|");
    if (pipe === -1) {
      if (line.length > 0) {
        items.push({ description: line, amountEur: 0 });
      }
      continue;
    }
    const description = line.slice(0, pipe).trim();
    const amountRaw = line
      .slice(pipe + 1)
      .trim()
      .replace(/€/g, "")
      .replace(/\s/g, "")
      .replace(",", ".");
    const amountEur = Number(amountRaw);
    if (!description) continue;
    items.push({
      description,
      amountEur: Number.isFinite(amountEur) ? amountEur : 0,
    });
  }
  return items;
}

export function sumProposalItems(items: ProposalLineItem[]): number {
  return Math.round(items.reduce((s, i) => s + (i.amountEur || 0), 0) * 100) / 100;
}

export function proposalItemsToHtml(items: ProposalLineItem[]): string {
  if (items.length === 0) return "<p>—</p>";
  const rows = items
    .map((i) => {
      const amount =
        i.amountEur > 0
          ? `${i.amountEur.toFixed(2)} €`
          : "—";
      return `<tr>
        <td style="padding:8px 0;border-bottom:1px solid #e2e8f0">${escapeHtml(i.description)}</td>
        <td style="padding:8px 0;border-bottom:1px solid #e2e8f0;text-align:right;white-space:nowrap">${amount}</td>
      </tr>`;
    })
    .join("");
  return `<table style="width:100%;border-collapse:collapse;font-size:15px">
    <thead>
      <tr>
        <th style="text-align:left;padding:0 0 8px;font-size:12px;color:#64748b;font-weight:normal">Item</th>
        <th style="text-align:right;padding:0 0 8px;font-size:12px;color:#64748b;font-weight:normal">Valor (s/ IVA)</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

export function scopeLinesToHtml(body: string): string {
  const items = parseProposalItems(body);
  if (items.some((i) => i.amountEur > 0) || items.length > 0) {
    const looksStructured = body.split("\n").some((l) => l.includes("|"));
    if (looksStructured) return proposalItemsToHtml(items);
  }
  const lines = extractScopeLines(body);
  if (lines.length === 0) return `<p>${escapeHtml(body)}</p>`;
  return `<ul>${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join("")}</ul>`;
}

/** Plain scope lines for deliverables / build tasks. */
export function extractScopeLines(body: string, max = 12): string[] {
  const fromItems = parseProposalItems(body)
    .map((i) => i.description)
    .filter((d) => d.length > 3);
  if (fromItems.length > 0 && body.includes("|")) {
    return fromItems.slice(0, max);
  }
  return body
    .split("\n")
    .map((l) => l.replace(/^[-*•]\s*/, "").trim())
    .filter((l) => l.length > 3)
    .slice(0, max);
}

/** Legacy drafts stored scope + HTML as `scope\n\n---\n<html>`. */
export function splitLegacyProposalBody(body: string): {
  scopeText: string;
  html: string;
} {
  const marker = "\n\n---\n";
  const idx = body.indexOf(marker);
  if (idx === -1) {
    const looksHtml = /^\s*</.test(body);
    return looksHtml
      ? { scopeText: "", html: body }
      : { scopeText: body, html: body };
  }
  return {
    scopeText: body.slice(0, idx).trim(),
    html: body.slice(idx + marker.length).trim(),
  };
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
