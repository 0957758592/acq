import { domainError } from '@acq/engine-domain';

import { applyResponseMap } from './response-map.js';
import { assertQuantity, assertPriceDrift, assertMaxTotal, assertBalance } from './guards.js';
import { extractDelivered } from './delivery-format.js';

// Compiles a VERIFIED declarative ShopAdapterSpec into a deterministic
// PurchaseAdapter (TZ §6.3 EXECUTE). No probabilistic/LLM work here — generation
// happens offline; execution is by-fact. An unverified spec is a hard seam.
export function compileShopAdapter(spec, { httpClient, secretResolver, config = {} } = {}) {
  if (!spec.verified) {
    throw domainError('SHOP_SPEC_UNVERIFIED', `shop ${spec.shopId} spec is not verified`);
  }

  const call = async (endpoint, body) => {
    const raw = await httpClient.request({
      method: endpoint.method,
      url: `${spec.baseUrl}${endpoint.path}`,
      auth: spec.auth,
      body
    });
    return { raw, mapped: applyResponseMap(raw, endpoint.responseMap) };
  };

  async function getBalance() {
    const { mapped } = await call(spec.endpoints.balance);
    return { balanceUsdCents: mapped.balanceUsdCents ?? 0 };
  }

  async function listOffers() {
    const { mapped } = await call(spec.endpoints.offers);
    return mapped;
  }

  async function purchase(quantity) {
    assertQuantity(quantity);
    const { mapped: offers } = await call(spec.endpoints.offers);
    const liveUnit = offers.unitPriceUsdCents ?? 0;
    assertPriceDrift({
      liveUnit,
      expectedUnit: config.expectedUnitUsdCents,
      tolerance: config.priceDriftTolerance ?? 0.1
    });
    const liveTotal = liveUnit * quantity;
    assertMaxTotal({ liveTotal, maxTotal: config.maxTotalUsdCents });
    const balance = (await getBalance()).balanceUsdCents;
    assertBalance({ balance, liveTotal });

    const { mapped } = await call(spec.endpoints.purchase, { quantity });
    return { orderId: mapped.orderId, amountUsdCents: liveTotal };
  }

  async function fetchDelivered(order) {
    const { mapped } = await call(spec.endpoints.delivery, order);
    const candidates = extractDelivered(mapped.blob, spec.endpoints.delivery.deliveryFormat);
    const out = [];
    for (const candidate of candidates) {
      const secretRefs = {};
      for (const [name, value] of Object.entries(candidate.secrets || {})) {
        secretRefs[name] = await secretResolver.put(name, value);
      }
      out.push({
        identifier: candidate.identifier,
        platform: spec.platform,
        source: 'purchase',
        shopId: spec.shopId,
        secretRefs
      });
    }
    return out;
  }

  return { getBalance, listOffers, purchase, fetchDelivered };
}
