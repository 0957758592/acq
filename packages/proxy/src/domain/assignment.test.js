import { assignProxy, releaseProxy } from './assignment.js';
import { ProxyError } from '../errors.js';

const freeProxy = { proxyId: 'p1', assignedDeviceId: null, type: 'residential' };

describe('assignProxy (1:1 sticky device<->proxy)', () => {
  test('assigns a free proxy to a device', () => {
    const result = assignProxy(freeProxy, 'dev1');
    expect(result.assignedDeviceId).toBe('dev1');
    expect(result.proxyId).toBe('p1');
  });

  test('is idempotent when re-assigning to the same device', () => {
    const once = assignProxy(freeProxy, 'dev1');
    const twice = assignProxy(once, 'dev1');
    expect(twice.assignedDeviceId).toBe('dev1');
  });

  test('does not mutate the input proxy', () => {
    assignProxy(freeProxy, 'dev1');
    expect(freeProxy.assignedDeviceId).toBeNull();
  });

  test('rejects assigning a proxy already held by another device', () => {
    const held = assignProxy(freeProxy, 'dev1');
    try {
      assignProxy(held, 'dev2');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ProxyError);
      expect(err.code).toBe('PROXY_ASSIGN_FAILED');
    }
  });
});

describe('releaseProxy', () => {
  test('frees an assigned proxy', () => {
    const held = assignProxy(freeProxy, 'dev1');
    expect(releaseProxy(held).assignedDeviceId).toBeNull();
  });
});
