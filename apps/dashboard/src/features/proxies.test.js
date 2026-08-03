import { proxiesViewModel } from './proxies.js';

describe('proxiesViewModel', () => {
  test('rows show geo/status/assignment/health; totals by status', () => {
    const vm = proxiesViewModel([
      { _id: 'p1', geo: 'us', status: 'assigned', assignedDeviceId: 'd1', health: { ok: true, latencyMs: 90 } },
      { _id: 'p2', geo: 'de', status: 'available', assignedDeviceId: '', health: { ok: false } }
    ]);
    expect(vm.total).toBe(2);
    expect(vm.byStatus).toEqual({ assigned: 1, available: 1 });
    expect(vm.rows[0]).toMatchObject({ id: 'p1', geo: 'us', status: 'assigned', device: 'd1', health: 'ok (90ms)' });
    expect(vm.rows[1].health).toBe('down');
  });
});
