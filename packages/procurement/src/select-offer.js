// Pure offer selection over a vendor product/list result (TZ §6.5). Encodes the
// operator's buy policy: always prefer a RELIABLE supplier, then apply the tier
// strategy. No I/O, no vendor coupling — the buy path feeds it real search items
// and acts on the chosen one. Returns the picked offer or null (caller raises a
// coded NO_MATCHING_OFFER seam — never guesses a purchase).
//
// strategy:
//   'cheapest'  — lowest price among in-stock matches (test default); ties break
//                 toward the more-sold (reliable) offer.
//   'reliable'  — most-sold (purchase_counter) within the price cap; ties break
//                 toward the cheaper offer (prod: proven supplier first).
export function selectOffer(items, { country, strategy = 'cheapest', quantity = 1, maxUnitPriceRub = null, minPurchaseCounter = 0 } = {}) {
  const wanted = String(country ?? '').trim().toLowerCase();
  const candidates = (Array.isArray(items) ? items : []).filter((it) => {
    if (!it || typeof it !== 'object') return false;
    const stock = Number(it.quantity ?? 0);
    if (!(stock >= quantity)) return false; // must cover the requested count
    const price = Number(it.price);
    if (!Number.isFinite(price)) return false;
    if (maxUnitPriceRub != null && price > maxUnitPriceRub) return false;
    if ((Number(it.purchase_counter ?? 0)) < minPurchaseCounter) return false;
    if (wanted && !String(it.name ?? '').toLowerCase().includes(wanted)) return false;
    return true;
  });
  if (!candidates.length) return null;

  const byPriceAsc = (a, b) => Number(a.price) - Number(b.price);
  const bySoldDesc = (a, b) => Number(b.purchase_counter ?? 0) - Number(a.purchase_counter ?? 0);

  const sorted = strategy === 'reliable'
    ? [...candidates].sort((a, b) => bySoldDesc(a, b) || byPriceAsc(a, b))
    : [...candidates].sort((a, b) => byPriceAsc(a, b) || bySoldDesc(a, b));
  return sorted[0];
}
