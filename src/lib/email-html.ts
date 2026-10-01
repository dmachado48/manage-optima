import "server-only";

import { htmlToText } from "html-to-text";
import sanitizeHtml from "sanitize-html";

const ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "ul",
  "ol",
  "li",
  "blockquote",
  "a",
  "h1",
  "h2",
  "h3",
  "pre",
  "code",
  "hr",
];

export function cleanEmailHtml(html: string | false | null | undefined) {
  if (!html) return null;
  const cleaned = sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ["href", "target", "rel"],
      "*": ["style"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedStyles: {
      "*": {
        color: [/^#[0-9a-f]{3,8}$/i, /^rgb\(/i],
        "background-color": [/^#[0-9a-f]{3,8}$/i, /^rgb\(/i],
        "font-weight": [/^(normal|bold|[1-9]00)$/],
        "font-style": [/^(normal|italic)$/],
        "text-align": [/^(left|right|center|justify)$/],
        "text-decoration": [/^(none|underline|line-through)$/],
      },
    },
    transformTags: {
      a: (_tagName, attribs) => ({
        tagName: "a",
        attribs: {
          ...attribs,
          target: "_blank",
          rel: "noopener noreferrer",
        },
      }),
    },
  }).trim();

  return cleaned || null;
}

export function emailTextFromHtml(html: string): string {
  return htmlToText(html, {
    wordwrap: false,
    selectors: [
      { selector: "a", options: { hideLinkHrefIfSameAsText: true } },
      { selector: "img", format: "skip" },
    ],
  }).trim();
}

export function outboundEmailHtml(content: string): string {
  return `<!doctype html>
<html lang="pt">
  <body style="margin:0;padding:24px;background:#f5f5f5;color:#171717;font-family:Arial,sans-serif">
    <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e5e5e5;border-radius:10px;padding:24px">
      ${content}
      <hr style="margin:24px 0 12px;border:0;border-top:1px solid #e5e5e5">
      <p style="margin:0;color:#737373;font-size:12px">Webiton · Suporte</p>
    </div>
  </body>
</html>`;
}
