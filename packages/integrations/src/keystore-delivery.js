// Parser for keystore-api (dark.shopping) order delivery blobs.
//
// VERIFIED BY FACT (2026-08-07) against three real deliveries: the format VARIES
// per product — TAB- or colon-separated, 3..7 fields. So we do NOT hardcode a
// field map (that would mislabel fields across products). Instead: detect the
// separator, take the FIRST field as the account identifier (login/username is
// universally first), and preserve the WHOLE line as `secrets.raw` (+ the split
// `fields`) so nothing is lost and no field is guessed. Per-product precise field
// maps can be layered on later (from a product's documented format) without
// changing this safe default.
const SEPARATORS = ['\t', ':', '|', ';'];

function detectSeparator(line) {
  let best = null;
  let bestCount = 0;
  for (const sep of SEPARATORS) {
    const count = line.split(sep).length - 1;
    if (count > bestCount) {
      best = sep;
      bestCount = count;
    }
  }
  return best; // null when the line is a single opaque token
}

// Parse a raw delivery blob into account candidates: { identifier, secrets }.
// `secrets.raw` is the full line (to be vaulted); `secrets.fields` is the split.
export function parseDelivery(raw) {
  const text = String(raw ?? '');
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '');
  return lines.map((line) => {
    const separator = detectSeparator(line);
    const fields = separator ? line.split(separator) : [line];
    return {
      identifier: fields[0],
      separator,
      fieldCount: fields.length,
      secrets: { raw: line, fields }
    };
  });
}
