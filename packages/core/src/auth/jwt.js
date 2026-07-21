import jwt from 'jsonwebtoken';

export function signJwt(payload, secret, opts = {}) {
  return jwt.sign(payload, secret, { expiresIn: '7d', ...opts });
}

export function verifyJwt(token, secret) {
  return jwt.verify(token, secret);
}
