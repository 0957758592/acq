// Minimal in-process metrics registry (TZ §15) exporting Prometheus text format.
// Counters (monotonic) and gauges (absolute) with label sets. Zero deps so any
// process can expose /metrics without a heavy client.
function labelKey(labels = {}) {
  const keys = Object.keys(labels).sort();
  return keys.map((k) => `${k}=${labels[k]}`).join(',');
}

function escapeLabelValue(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function renderLabels(labels = {}) {
  const keys = Object.keys(labels).sort();
  if (!keys.length) return '';
  return `{${keys.map((k) => `${k}="${escapeLabelValue(labels[k])}"`).join(',')}}`;
}

function createMetric(type) {
  const series = new Map(); // labelKey -> { labels, value }
  return {
    type,
    series,
    _apply(labels, fn) {
      const key = labelKey(labels);
      const entry = series.get(key) || { labels, value: 0 };
      entry.value = fn(entry.value);
      series.set(key, entry);
    }
  };
}

export function createMetricsRegistry() {
  const metrics = new Map(); // name -> { type, help, metric }

  function ensure(name, type, help) {
    if (!metrics.has(name)) metrics.set(name, { type, help: help ?? '', metric: createMetric(type) });
    return metrics.get(name).metric;
  }

  return {
    counter(name, help) {
      const m = ensure(name, 'counter', help);
      return { inc: (labels = {}, by = 1) => m._apply(labels, (v) => v + by) };
    },
    gauge(name, help) {
      const m = ensure(name, 'gauge', help);
      return {
        set: (labels = {}, value) => m._apply(labels, () => value),
        inc: (labels = {}, by = 1) => m._apply(labels, (v) => v + by),
        dec: (labels = {}, by = 1) => m._apply(labels, (v) => v - by)
      };
    },
    render() {
      const lines = [];
      for (const [name, { type, help, metric }] of metrics) {
        if (help) lines.push(`# HELP ${name} ${help}`);
        lines.push(`# TYPE ${name} ${type}`);
        for (const { labels, value } of metric.series.values()) {
          lines.push(`${name}${renderLabels(labels)} ${value}`);
        }
      }
      return `${lines.join('\n')}\n`;
    }
  };
}
