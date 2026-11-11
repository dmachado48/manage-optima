/** Parse a Portuguese voice note into Quick Log fields. */

export type ParsedVoiceLog = {
  minutes: number | null;
  note: string;
  clientHint: string | null;
};

const HOUR_WORDS: Record<string, number> = {
  meia: 30,
  "meia hora": 30,
  uma: 60,
  "uma hora": 60,
  duas: 120,
  "duas horas": 120,
};

/**
 * Extract duration, optional client mention, and free-text note
 * from phrases like:
 * «No Global Compact meia hora a corrigir o login»
 * «60 minutos no AFS — atualizar plugins»
 */
export function parseVoiceLog(
  transcript: string,
  clientNames: string[] = [],
): ParsedVoiceLog {
  const raw = transcript.trim().replace(/\s+/g, " ");
  if (!raw) {
    return { minutes: null, note: "", clientHint: null };
  }

  let text = raw;
  let minutes: number | null = null;

  // Explicit minutes: "45 minutos", "90 min"
  const minMatch = text.match(
    /\b(\d{1,3})\s*(?:minutos?|mins?|m)\b/i,
  );
  if (minMatch) {
    minutes = Number(minMatch[1]);
    text = text.replace(minMatch[0], " ").replace(/\s+/g, " ").trim();
  }

  // Hours: "1h30", "2h", "1,5 horas"
  if (minutes == null) {
    const hMatch = text.match(
      /\b(\d{1,2})\s*[h:]\s*(\d{1,2})?\b|\b(\d+(?:[.,]\d+)?)\s*horas?\b/i,
    );
    if (hMatch) {
      if (hMatch[3]) {
        minutes = Math.round(Number(hMatch[3].replace(",", ".")) * 60);
      } else {
        const h = Number(hMatch[1] ?? 0);
        const m = Number(hMatch[2] ?? 0);
        minutes = h * 60 + m;
      }
      text = text.replace(hMatch[0], " ").replace(/\s+/g, " ").trim();
    }
  }

  // Word forms
  if (minutes == null) {
    const lower = text.toLowerCase();
    for (const [phrase, mins] of Object.entries(HOUR_WORDS)) {
      if (lower.includes(phrase)) {
        minutes = mins;
        text = text.replace(new RegExp(phrase, "i"), " ").replace(/\s+/g, " ").trim();
        break;
      }
    }
  }

  // Match client name (longest first)
  let clientHint: string | null = null;
  const sorted = [...clientNames].sort((a, b) => b.length - a.length);
  for (const name of sorted) {
    const re = new RegExp(
      `(?:\\b(?:no|na|em|para|cliente)\\s+)?${escapeRegExp(name)}\\b`,
      "i",
    );
    if (re.test(text)) {
      clientHint = name;
      text = text.replace(re, " ").replace(/\s+/g, " ").trim();
      break;
    }
  }

  // Strip leading connectors
  text = text
    .replace(/^(?:a|ao|e|que|de|:|—|-|,)+\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();

  return {
    minutes: minutes != null && minutes > 0 ? minutes : null,
    note: text || raw,
    clientHint,
  };
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function matchClientId(
  clientHint: string | null,
  clients: { id: string; name: string }[],
): string | null {
  if (!clientHint) return null;
  const needle = clientHint.toLowerCase();
  const exact = clients.find((c) => c.name.toLowerCase() === needle);
  if (exact) return exact.id;
  const partial = clients.find(
    (c) =>
      c.name.toLowerCase().includes(needle) ||
      needle.includes(c.name.toLowerCase()),
  );
  return partial?.id ?? null;
}
