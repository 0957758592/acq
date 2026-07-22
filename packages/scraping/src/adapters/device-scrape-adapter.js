import { parseUIDump } from '@acq/device-control';

// On-device scrape tier adapter (TZ §10.1 T2) — REAL. Harvests app-only data
// (full follower/member/liker lists that the web never exposes) by driving a
// live device: dump the UI, extract rows, scroll, repeat until the list is dry
// or maxScrolls. The row extractor (which UI nodes are rows) is injected per
// platform (verify-by-fact selectors); the dump→parse→scroll→collect mechanism
// is real. Dedups by keyOf so overlapping scroll windows don't double-count.
export function createDeviceScrapeAdapter({
  provider,
  parseDump = parseUIDump,
  extractRows,
  keyOf = (r) => JSON.stringify(r),
  maxScrolls = 30,
  stopWhenDry = 2,
  swipe = { x1: 540, y1: 1500, x2: 540, y2: 400, ms: 400 }
} = {}) {
  if (!provider) throw new Error('device scrape adapter requires a device provider');
  if (typeof extractRows !== 'function') throw new Error('device scrape adapter requires extractRows');

  return {
    async scrape({ params = {} }) {
      const controller = provider.createDirectController(params.deviceId, params.controllerOpts);
      const seen = new Set();
      const rawItems = [];
      let dry = 0;

      for (let i = 0; i < maxScrolls && dry < stopWhenDry; i += 1) {
        const nodes = parseDump(await controller.getUIDump());
        const rows = extractRows(nodes) || [];
        let added = 0;
        for (const row of rows) {
          const k = keyOf(row);
          if (seen.has(k)) continue;
          seen.add(k);
          rawItems.push(row);
          added += 1;
        }
        dry = added === 0 ? dry + 1 : 0;
        if (dry >= stopWhenDry) break;
        await controller.swipe(swipe.x1, swipe.y1, swipe.x2, swipe.y2, swipe.ms);
      }
      return { rawItems };
    }
  };
}
