// createDarkShoppingProcurementAdapter — implements the domain ProcurementPort
// over an injected dark.shopping `client` and an injected delivery `importer`.
//
// The purchase() guard sequence mirrors the engine precedent (createLiveOrder):
//   (1) live-price drift vs expected > tolerance  -> throw
//   (2) live total > maxTotal                      -> throw
//   (3) balance < live total                       -> throw
// client.purchase() runs only after all three guards pass. Each guard throws
// its own distinct coded DomainError so callers can branch on the reason.
import { domainError } from '@acq/whatsapp';

// PROVISIONAL external-shape seam — VERIFY against a real dark.shopping balance
// response at go-live. Defaults to 0 when the shape is unrecognized so the
// balance guard fails safe (0 < any positive total => insufficient balance).
function readBalanceUsdCents(b) {
  return b?.balanceUsdCents ?? b?.balance_usd_cents ?? 0;
}

// PROVISIONAL external-shape seam — VERIFY against a real dark.shopping offers
// response at go-live. Defaults to 0 when the shape is unrecognized so the
// price-drift guard fails safe (unit 0 => 100% drift => throw).
function pickUnitPriceUsdCents(offers) {
  return Array.isArray(offers) && offers[0]
    ? (offers[0].unitPriceUsdCents ?? offers[0].price_usd_cents ?? 0)
    : 0;
}

// Reads the live balance without relying on `this`, so both the public
// getBalance() and the purchase() balance guard share one code path and the
// adapter methods keep working when destructured off the object.
async function fetchBalanceUsdCents(client) {
  return readBalanceUsdCents(await client.getBalance());
}

export function createDarkShoppingProcurementAdapter({ client, importer, config }) {
  return {
    async getBalance() {
      return { balanceUsdCents: await fetchBalanceUsdCents(client) };
    },

    async listOffers() {
      return client.listOffers();
    },

    async purchase(quantity) {
      // (0) quantity — reject non-positive / non-integer before any client call
      if (!Number.isInteger(quantity) || quantity <= 0) {
        throw domainError(
          'PROCUREMENT_QUANTITY_INVALID',
          `quantity must be a positive integer, got ${quantity}`
        );
      }

      const offers = await client.listOffers();
      const liveUnit = pickUnitPriceUsdCents(offers);

      // (1) price drift — fail safe: a non-positive expected unit or a
      // non-finite drift throws rather than passing the guard open.
      if (!(config.expectedUnitUsdCents > 0)) {
        throw domainError('PROCUREMENT_PRICE_DRIFT', 'expectedUnitUsdCents must be a positive integer');
      }
      const drift = Math.abs(liveUnit - config.expectedUnitUsdCents) / config.expectedUnitUsdCents;
      if (!Number.isFinite(drift) || drift > (config.priceDriftTolerance ?? 0.1)) {
        throw domainError('PROCUREMENT_PRICE_DRIFT', `unit price drift ${(drift * 100).toFixed(1)}%`);
      }

      // (2) max total
      const liveTotal = liveUnit * quantity;
      if (config.maxTotalUsdCents && liveTotal > config.maxTotalUsdCents) {
        throw domainError(
          'PROCUREMENT_MAX_TOTAL_EXCEEDED',
          `live total ${liveTotal} > max ${config.maxTotalUsdCents}`
        );
      }

      // (3) balance
      const balanceUsdCents = await fetchBalanceUsdCents(client);
      if (balanceUsdCents < liveTotal) {
        throw domainError(
          'PROCUREMENT_INSUFFICIENT_BALANCE',
          `balance ${balanceUsdCents} < live total ${liveTotal}`
        );
      }

      const result = await client.purchase(quantity);
      return { ...result, amountUsdCents: liveTotal };
    },

    async fetchDelivered(order) {
      const raw = await client.fetchDelivered(order);
      return importer.importDelivered(raw, { verifiedFormat: config.deliveryFormatVerified });
    }
  };
}
