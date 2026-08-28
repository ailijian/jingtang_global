const PUBLIC_TEXT_ATTRIBUTES = new Set(["alt", "aria-label", "content", "title"]);

function decodeHtmlEntities(value: string): string {
  return value.replace(
    /&(#(?:x[0-9a-f]+|[0-9]+)|amp|apos|gt|lt|nbsp|quot);/gi,
    (entity, name: string) => {
      const normalized = name.toLowerCase();
      if (normalized.startsWith("#x")) {
        return String.fromCodePoint(Number.parseInt(normalized.slice(2), 16));
      }
      if (normalized.startsWith("#")) {
        return String.fromCodePoint(Number.parseInt(normalized.slice(1), 10));
      }
      return (
        {
          amp: "&",
          apos: "'",
          gt: ">",
          lt: "<",
          nbsp: " ",
          quot: '"',
        } as const
      )[normalized as "amp" | "apos" | "gt" | "lt" | "nbsp" | "quot"];
    },
  );
}

/**
 * Extracts copy that a visitor or public crawler can observe from static HTML.
 * Next.js hydration scripts and asset identifiers are implementation details and
 * must not be treated as rendered copy.
 */
export function extractPublicCopy(html: string): string {
  const metadata: string[] = [];
  const withoutScripts = html.replace(
    /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi,
    (_script, attributes: string, body: string) => {
      if (/\btype\s*=\s*(["'])application\/ld\+json\1/i.test(attributes)) {
        metadata.push(body);
      }
      return " ";
    },
  );
  const withoutStyles = withoutScripts.replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, " ");

  for (const tag of withoutStyles.matchAll(/<[^>]+>/g)) {
    for (const attribute of tag[0].matchAll(/\b([a-z][a-z0-9:-]*)\s*=\s*(["'])([\s\S]*?)\2/gi)) {
      if (PUBLIC_TEXT_ATTRIBUTES.has(attribute[1].toLowerCase())) metadata.push(attribute[3]);
    }
  }

  const visibleText = withoutStyles.replace(/<!--([\s\S]*?)-->/g, " ").replace(/<[^>]+>/g, " ");
  return decodeHtmlEntities([visibleText, ...metadata].join("\n"));
}
