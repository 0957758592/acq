import { selectOffer } from './select-offer.js';

// Real product/list item shape (subset): { id, name, price, quantity, minimum_order, purchase_counter }.
const offers = [
  { id: 1, name: 'LinkedIn.com | ManReg | 2FA | USA IP', price: 1703.75, quantity: 1, minimum_order: 1, purchase_counter: 5 },
  { id: 2, name: 'LinkedIn Autoreg | USA', price: 43.5, quantity: 95, minimum_order: 1, purchase_counter: 900 },
  { id: 3, name: 'LinkedIn | GERMANY IP', price: 30.0, quantity: 50, minimum_order: 1, purchase_counter: 100 },
  { id: 4, name: 'LinkedIn USA | out of stock', price: 10.0, quantity: 0, minimum_order: 1, purchase_counter: 10 }
];

test('cheapest strategy picks the lowest-price IN-STOCK offer matching the country', () => {
  const pick = selectOffer(offers, { country: 'USA', strategy: 'cheapest', quantity: 1 });
  expect(pick.id).toBe(2); // 43.5 USA in stock (id4 is out of stock, id1 pricier)
});

test('skips out-of-stock offers (quantity 0) and offers below the requested quantity', () => {
  const pick = selectOffer(offers, { country: 'USA', strategy: 'cheapest', quantity: 50 });
  expect(pick.id).toBe(2); // only id2 has quantity >= 50 among USA
});

test('country filter matches the country keyword embedded in the name (case-insensitive)', () => {
  const pick = selectOffer(offers, { country: 'germany', strategy: 'cheapest', quantity: 1 });
  expect(pick.id).toBe(3);
});

test('respects the max unit price (RUB) budget cap', () => {
  const pick = selectOffer(offers, { country: 'USA', strategy: 'cheapest', quantity: 1, maxUnitPriceRub: 20 });
  expect(pick).toBeNull(); // cheapest USA in-stock is 43.5 > 20
});

test('reliable strategy prefers the most-sold (purchase_counter) offer within the price cap', () => {
  const pick = selectOffer(offers, { country: 'USA', strategy: 'reliable', quantity: 1, maxUnitPriceRub: 2000 });
  expect(pick.id).toBe(2); // id2 has purchase_counter 900 (>id1's 5), within cap
});

test('returns null when nothing matches', () => {
  expect(selectOffer(offers, { country: 'brazil', strategy: 'cheapest', quantity: 1 })).toBeNull();
  expect(selectOffer([], { strategy: 'cheapest', quantity: 1 })).toBeNull();
});

test('with no country filter, considers all in-stock offers', () => {
  const pick = selectOffer(offers, { strategy: 'cheapest', quantity: 1 });
  expect(pick.id).toBe(3); // 30.0 is the cheapest in-stock overall
});

// group/name filters — scope to the right PRODUCT TYPE (accounts, not Stars/edu).
const typed = [
  { id: 10, name: 'Telegram Stars', price: 3.94, quantity: 9000, purchase_counter: 50, group: { name: 'Telegram Stars' } },
  { id: 11, name: 'Аккаунт телеграм США 2FA', price: 40.6, quantity: 99, purchase_counter: 200, group: { name: 'Авторег Telegram' } },
  { id: 12, name: 'Gmail.edu accounts . Domain - not @gmail.com', price: 1, quantity: 9, purchase_counter: 5, group: { name: 'Автореги Gmail' } },
  { id: 13, name: 'Gmail.com | 2FA', price: 43.5, quantity: 12, purchase_counter: 300, group: { name: 'Ручная регистрация Gmail' } }
];

test('excludeGroups drops non-account groups (Telegram Stars) so cheapest picks the account', () => {
  // Telegram-only set (as scoped by category_id=43 in the real buy path).
  const telegram = typed.filter((it) => /telegram/i.test(it.group.name));
  const pick = selectOffer(telegram, { strategy: 'cheapest', quantity: 1, excludeGroups: ['stars', 'software', 'канал'] });
  expect(pick.id).toBe(11); // Stars excluded -> the авторег account
});

test('includeGroups keeps only matching account groups', () => {
  const pick = selectOffer(typed, { strategy: 'cheapest', quantity: 1, includeGroups: ['авторег', 'ручн', 'аккаунт'] });
  expect([11, 12, 13]).toContain(pick.id); // Stars (id10) filtered out
});

test('excludeNames drops offers whose name matches (e.g. edu gmail)', () => {
  const pick = selectOffer(typed, { strategy: 'cheapest', quantity: 1, includeGroups: ['gmail'], excludeNames: ['edu', 'not @gmail'] });
  expect(pick.id).toBe(13); // the .edu (id12) dropped -> real @gmail.com
});

// supplier-quality ranking: rating -> invalid_items_percent -> sales -> price.
const rated = [
  { id: 1, price: 50, quantity: 10, rating: 4.9, invalid_items_percent: 0, purchase_counter: 100 },
  { id: 2, price: 20, quantity: 10, rating: null, invalid_items_percent: 0, purchase_counter: 5 },
  { id: 3, price: 30, quantity: 10, rating: 4.5, invalid_items_percent: 2, purchase_counter: 50 },
  { id: 4, price: 10, quantity: 10, rating: null, invalid_items_percent: null, purchase_counter: null }
];

test('reliable strategy prefers the highest-rated supplier even if pricier', () => {
  const pick = selectOffer(rated, { strategy: 'reliable', quantity: 1 });
  expect(pick.id).toBe(1); // rating 4.9 wins over cheaper unrated
});

test('reliable falls back to invalid% then sales when ratings are equal/absent', () => {
  const unrated = rated.filter((r) => r.rating == null); // id2 (inv0, sold5), id4 (inv null, sold null)
  const pick = selectOffer(unrated, { strategy: 'reliable', quantity: 1 });
  expect(pick.id).toBe(2); // 0% invalid + sold beats no-data cheaper
});

test('minRating drops unrated / lower-rated offers', () => {
  const pick = selectOffer(rated, { strategy: 'reliable', quantity: 1, minRating: 4.6 });
  expect(pick.id).toBe(1); // only 4.9 qualifies (4.5 and nulls excluded)
});

test('maxInvalidPercent drops offers with too many invalid items', () => {
  const pick = selectOffer(rated, { strategy: 'reliable', quantity: 1, maxInvalidPercent: 1 });
  expect(pick.id).toBe(1); // id3 (2% invalid) excluded; id1 (0%) wins on rating
});
