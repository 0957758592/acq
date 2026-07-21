import { IntegrationHttpClient } from './http-client.js';

export class DjekxaClient {
  constructor({ apiKey, baseUrl = 'https://djekxa.ru/api/v2' } = {}) {
    if (!apiKey) throw new Error('Djekxa API key is required');
    this.http = new IntegrationHttpClient({
      baseUrl,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'User-Agent': 'Mozilla/5.0 Julio/1.0'
      }
    });
  }

  getBalance() {
    return this.http.request('/user/balance');
  }

  listCategories() {
    return this.http.request('/categories');
  }

  listProducts(params = {}) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
    }
    const suffix = query.toString() ? `/products?${query}` : '/products';
    return this.http.request(suffix);
  }

  getProduct(productId) {
    return this.http.request(`/products/${productId}`);
  }

  listOrders(params = {}) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
    }
    const suffix = query.toString() ? `/orders?${query}` : '/orders';
    return this.http.request(suffix);
  }

  createOrder(payload) {
    return this.http.request('/orders', { method: 'POST', body: payload });
  }

  getOrder(orderId) {
    return this.http.request(`/orders/${orderId}`);
  }

  async fetchCredentialFile(url) {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 Julio/1.0' }
    });
    if (!response.ok) throw new Error(`Djekxa credential file fetch failed ${response.status}`);
    return response.text();
  }
}
