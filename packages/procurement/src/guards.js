import { domainError } from '@acq/engine-domain';

// The four pre-purchase guards (TZ §6.1), generalized from the dark.shopping
// adapter so every declarative shop reuses one implementation (DRY). Each throws
// a distinct coded DomainError so callers can branch on the reason.

export function assertQuantity(quantity) {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw domainError('PROCUREMENT_QUANTITY_INVALID', `quantity must be a positive integer, got ${quantity}`);
  }
}

export function assertPriceDrift({ liveUnit, expectedUnit, tolerance = 0.1 }) {
  // Fail safe: a non-positive expected unit or a non-finite drift throws.
  if (!(expectedUnit > 0)) {
    throw domainError('PROCUREMENT_PRICE_DRIFT', 'expectedUnit must be a positive integer');
  }
  const drift = Math.abs(liveUnit - expectedUnit) / expectedUnit;
  if (!Number.isFinite(drift) || drift > tolerance) {
    throw domainError('PROCUREMENT_PRICE_DRIFT', `unit price drift ${(drift * 100).toFixed(1)}%`);
  }
}

export function assertMaxTotal({ liveTotal, maxTotal }) {
  if (maxTotal && liveTotal > maxTotal) {
    throw domainError('PROCUREMENT_MAX_TOTAL_EXCEEDED', `live total ${liveTotal} > max ${maxTotal}`);
  }
}

export function assertBalance({ balance, liveTotal }) {
  if (balance < liveTotal) {
    throw domainError('PROCUREMENT_INSUFFICIENT_BALANCE', `balance ${balance} < live total ${liveTotal}`);
  }
}
