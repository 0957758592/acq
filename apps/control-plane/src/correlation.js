import crypto from 'node:crypto';

// Correlation-ID middleware (TZ §15): every request carries a correlationId —
// reused from x-correlation-id if present, else generated — attached to req and
// echoed in the response so a request can be traced across services/logs.
export function correlationMiddleware({ genId = () => crypto.randomUUID() } = {}) {
  return (req, res, next) => {
    const id = req.headers['x-correlation-id'] || genId();
    req.correlationId = id;
    res.setHeader('x-correlation-id', id);
    next();
  };
}
