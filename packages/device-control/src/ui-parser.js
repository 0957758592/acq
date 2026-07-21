function decodeXml(value) {
  return String(value || '')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function readAttribute(attributes, name) {
  return decodeXml(attributes.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] || '');
}

export function parseUIDump(xml = '') {
  const elements = [];
  const nodeRegex = /<node\s+([^>]*?)\/?>/g;
  let match = nodeRegex.exec(xml);
  while (match) {
    const attributes = match[1];
    const bounds = attributes.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    if (bounds) {
      const [, x1, y1, x2, y2] = bounds;
      const text = readAttribute(attributes, 'text');
      const contentDesc = readAttribute(attributes, 'content-desc');
      const resourceId = readAttribute(attributes, 'resource-id');
      const className = readAttribute(attributes, 'class');
      const keepEmptyTarget = /(EditText|EditableText|Button|ImageButton|CheckBox|RadioButton)/i.test(className);
      if (text || contentDesc || resourceId || keepEmptyTarget) {
        elements.push({
          text: text || contentDesc || '',
          contentDesc: contentDesc || undefined,
          resourceId: resourceId || undefined,
          className: className || undefined,
          bounds: `[${x1},${y1}][${x2},${y2}]`,
          x: Math.round((Number(x1) + Number(x2)) / 2),
          y: Math.round((Number(y1) + Number(y2)) / 2)
        });
      }
    }
    match = nodeRegex.exec(xml);
  }
  return elements;
}

export function findElement(elements = [], ...textOptions) {
  for (const searchText of textOptions) {
    const needle = String(searchText || '').toLowerCase();
    const found = elements.find((element) => String(element.text || '').toLowerCase().includes(needle));
    if (found) return found;
  }
  return null;
}

export function findElementExact(elements = [], ...textOptions) {
  for (const searchText of textOptions) {
    const needle = String(searchText || '').toLowerCase().trim();
    const found = elements.find((element) => {
      const text = String(element.text || '').toLowerCase().trim();
      const desc = String(element.contentDesc || '').toLowerCase().trim();
      return text === needle || desc === needle;
    });
    if (found) return found;
  }
  return null;
}

export function findByContentDesc(elements = [], desc = '') {
  const needle = String(desc || '').toLowerCase();
  return (
    elements.find((element) => {
      const contentDesc = String(element.contentDesc || '').toLowerCase();
      const text = String(element.text || '').toLowerCase();
      return contentDesc.includes(needle) || text.includes(needle);
    }) || null
  );
}

export function findByResourceId(elements = [], resourceId = '') {
  return elements.find((element) => element.resourceId === resourceId) || null;
}

export function findElements(elements = [], ...textOptions) {
  const needles = textOptions.map((value) => String(value || '').toLowerCase()).filter(Boolean);
  return elements.filter((element) => needles.some((needle) => String(element.text || '').toLowerCase().includes(needle)));
}

export function findDismissButton(elements = [], dismissTexts = []) {
  return findElementExact(elements, ...dismissTexts);
}

export function getAllText(elements = []) {
  return elements.map((element) => element.text).filter(Boolean);
}
