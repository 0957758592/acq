function inferPlatform(productName = '') {
  const name = String(productName).toLowerCase();
  if (name.includes('instagram') || name.includes('инст')) return 'instagram';
  if (name.includes('tiktok') || name.includes('тик')) return 'tiktok';
  return 'tiktok';
}

// A real email address: has an "@" AND a dotted TLD. This deliberately rejects
// password-like tokens that merely contain "@" (e.g. "andy@5246784").
const EMAIL_RE = /^[^\s@:|;]+@[^\s@:|;]+\.[a-z]{2,}$/i;

function isEmail(value) {
  return EMAIL_RE.test(String(value || '').trim());
}

// Suppliers ship credential files in different field orders. We locate the
// email by shape and map fields around it instead of assuming a fixed order.
// Confirmed formats:
//   - username:password:email:emailPassword   (legacy/classic, email at idx 2)
//   - email:password:username                  (e.g. djekxa TikTok autoreg)
//   - email:emailPassword:username:password    (email-first 4-field)
//   - username:password:email                  (3-field, email last)
// emailPassword falls back to the account password (combolists usually reuse it)
// so IMAP code-fetch has a chance when no explicit email password is provided.
function mapCredentialParts(rawParts = []) {
  const parts = rawParts.map((part) => String(part || '').trim());
  const emailIdx = parts.findIndex(isEmail);
  let username = '';
  let password = '';
  let email = '';
  let emailPassword = '';

  if (parts.length >= 4 && emailIdx === 0) {
    [email, emailPassword, username, password] = parts;
  } else if (parts.length >= 4) {
    [username, password, email, emailPassword] = parts;
  } else if (parts.length === 3 && emailIdx === 0) {
    [email, password, username] = parts;
  } else if (parts.length === 3) {
    [username, password, email] = parts;
  } else if (parts.length === 2) {
    [username, password] = parts;
  } else {
    return null;
  }

  if (!emailPassword && email) emailPassword = password;
  return { username, password, email: email || '', emailPassword: emailPassword || '' };
}

function parseCredentialLine(line = '') {
  const normalized = String(line).trim();
  if (!normalized || normalized.startsWith('#')) return null;
  const delimiter = ['|', ':', ';'].find((candidate) => normalized.includes(candidate));
  if (!delimiter) return null;
  const mapped = mapCredentialParts(normalized.split(delimiter));
  if (!mapped || !mapped.username || !mapped.password) return null;
  return mapped;
}

export function parseCredentialFile(text = '') {
  return String(text)
    .split(/\r?\n/)
    .map(parseCredentialLine)
    .filter(Boolean);
}

function normalizeOrdersResponse(response) {
  if (Array.isArray(response)) return { orders: response, hasNext: false };
  const orders = response.data || response.items || response.orders || [];
  const hasNext = Boolean(response.links?.next || response.next_page_url || response.meta?.current_page < response.meta?.last_page);
  return { orders, hasNext };
}

export class DjekxaImporter {
  constructor({ client, fxRubPerUsd = 90 } = {}) {
    if (!client) throw new Error('Djekxa client is required');
    this.client = client;
    this.fxRubPerUsd = Number(fxRubPerUsd || 90);
  }

  async syncRecent({ maxPages = 5, perPage = 20, existingOrderIds = new Set() } = {}) {
    const imports = [];
    for (let page = 1; page <= maxPages; page += 1) {
      const response = await this.client.listOrders({ page, per_page: perPage });
      const { orders, hasNext } = normalizeOrdersResponse(response);
      if (!orders.length) break;
      for (const order of orders) {
        if (existingOrderIds.has(String(order.uuid || order.id))) {
          imports.push({ externalOrderId: String(order.uuid || order.id), skipped: true, reason: 'duplicate' });
          continue;
        }
        imports.push(await this.importOrder(order));
      }
      if (!hasNext) break;
    }
    return imports;
  }

  async importOrder(order) {
    const externalOrderId = String(order.uuid || order.id || '');
    if (!externalOrderId) throw new Error('Djekxa order has no id');
    if (['pending', 'in-progress'].includes(String(order.status || '').toLowerCase())) {
      return { externalOrderId, skipped: true, reason: 'pending', rawOrder: order };
    }

    const items = order.items || order.order_items || [];
    const totalRub = Number(order.total_sum || order.totalRub || order.total || 0);
    const totalUsdCents = Math.round((totalRub / this.fxRubPerUsd) * 100);
    const accountCount = items.reduce((sum, item) => sum + Number(item.quantity || 1), 0) || 1;
    const priceUsdCents = Math.round(totalUsdCents / accountCount);
    const importedAccounts = [];

    for (const item of items) {
      const productName = item.product_name || item.name || order.product_name || '';
      const platform = inferPlatform(productName);
      const fileUrl = item.link_to_file || item.file_url || item.download_url;
      if (!fileUrl || String(item.status || order.status).toLowerCase() !== 'completed') continue;
      const file = await this.client.fetchCredentialFile(fileUrl);
      for (const credentials of parseCredentialFile(file)) {
        importedAccounts.push({
          platform,
          credentials,
          priceUsdCents,
          priceRub: totalRub / accountCount,
          productName
        });
      }
    }

    return {
      externalOrderId,
      status: String(order.status || 'completed'),
      totalRub,
      totalUsdCents,
      fxRubPerUsd: this.fxRubPerUsd,
      importedAccounts,
      rawOrder: order
    };
  }
}
