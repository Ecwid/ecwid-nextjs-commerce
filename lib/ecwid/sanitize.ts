import { ELEMENT_NODE, transform, walk } from 'ultrahtml';
import sanitize from 'ultrahtml/transformers/sanitize';

const DANGEROUS_URL = /^\s*(?:javascript|data|vbscript):/i;
const URL_ATTRIBUTES = ['href', 'src'];

// Drops attributes carrying javascript:/data:/vbscript: URLs, which the
// element/attribute allowlist alone does not catch.
function stripDangerousUrls() {
  return async (node: any) => {
    await walk(node, (n) => {
      if (n.type !== ELEMENT_NODE || !n.attributes) return;
      for (const attr of URL_ATTRIBUTES) {
        const value = n.attributes[attr];
        if (value && DANGEROUS_URL.test(value)) {
          delete n.attributes[attr];
        }
      }
    });
    return node;
  };
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const ALLOWED_ELEMENTS = [
  'a',
  'b',
  'br',
  'blockquote',
  'em',
  'h2',
  'h3',
  'h4',
  'i',
  'li',
  'ol',
  'p',
  'span',
  'strong',
  'u',
  'ul'
];

// Strips scripts, event handlers and unsafe markup from untrusted catalog HTML.
// Edge-runtime safe (pure JS, no DOM). Keep the allowlist narrow.
export async function sanitizeProductHtml(html: string | undefined | null): Promise<string> {
  if (!html) return '';

  try {
    return await transform(html, [
      sanitize({
        allowElements: ALLOWED_ELEMENTS,
        allowAttributes: {
          href: ['a'],
          title: ['a']
        },
        dropElements: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'svg', 'math'],
        allowComments: false,
        allowCustomElements: false,
        allowComponents: false
      }),
      stripDangerousUrls()
    ]);
  } catch {
    // Malformed markup can crash the parser; degrade to inert escaped text.
    return escapeHtml(html);
  }
}
