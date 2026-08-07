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
export function selectOffer(items, {
  country,
  strategy = 'cheapest',
  quantity = 1,
  maxUnitPriceRub = null,
  minPurchaseCounter = 0,
  minRating = null,
  maxInvalidPercent = null,
  includeGroups = null,
  excludeGroups = null,
  excludeNames = null
} = {}) {
  const wanted = String(country ?? '').trim().toLowerCase();
  const lc = (v) => String(v ?? '').toLowerCase();
  const anyIncluded = (hay, needles) => needles.some((n) => hay.includes(lc(n)));
  const ratingOf = (p) => (p.rating == null ? null : Number(p.rating));
  const invalidOf = (p) => (p.invalid_items_percent == null ? null : Number(p.invalid_items_percent));
  const candidates = (Array.isArray(items) ? items : []).filter((it) => {
    if (!it || typeof it !== 'object') return false;
    const stock = Number(it.quantity ?? 0);
    if (!(stock >= quantity)) return false; // must cover the requested count
    const price = Number(it.price);
    if (!Number.isFinite(price)) return false;
    if (maxUnitPriceRub != null && price > maxUnitPriceRub) return false;
    if ((Number(it.purchase_counter ?? 0)) < minPurchaseCounter) return false;
    // Supplier-quality floors: an explicit min rating excludes unrated offers;
    // a max invalid-items% excludes suppliers with too many reported bad items.
    if (minRating != null && !(ratingOf(it) != null && ratingOf(it) >= minRating)) return false;
    if (maxInvalidPercent != null && invalidOf(it) != null && invalidOf(it) > maxInvalidPercent) return false;
    if (wanted && !lc(it.name).includes(wanted)) return false;
    // Product-TYPE scoping via the vendor `group` + name (accounts, not Stars/edu).
    const groupName = lc(it.group?.name);
    if (includeGroups?.length && !anyIncluded(groupName, includeGroups)) return false;
    if (excludeGroups?.length && anyIncluded(groupName, excludeGroups)) return false;
    if (excludeNames?.length && anyIncluded(lc(it.name), excludeNames)) return false;
    return true;
  });
  if (!candidates.length) return null;

  const byPriceAsc = (a, b) => Number(a.price) - Number(b.price);
  const bySoldDesc = (a, b) => Number(b.purchase_counter ?? 0) - Number(a.purchase_counter ?? 0);
  // Supplier reliability: higher rating first (unrated last), then fewer invalid
  // items (unknown last), then more sales, then cheaper.
  const byRatingDesc = (a, b) => (ratingOf(b) ?? -1) - (ratingOf(a) ?? -1);
  const byInvalidAsc = (a, b) => (invalidOf(a) ?? 101) - (invalidOf(b) ?? 101);

  const sorted = strategy === 'reliable'
    ? [...candidates].sort((a, b) => byRatingDesc(a, b) || byInvalidAsc(a, b) || bySoldDesc(a, b) || byPriceAsc(a, b))
    : [...candidates].sort((a, b) => byPriceAsc(a, b) || bySoldDesc(a, b));
  return sorted[0];
}
