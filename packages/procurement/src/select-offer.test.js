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
