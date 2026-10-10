import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');

export const ACCESS_TTL_SECONDS = 15 * 60;
export const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const signAccessToken = ({ id, typ, role }) =>
  jwt.sign({ sub: String(id), typ, role }, env.JWT_ACCESS_SECRET, { expiresIn: ACCESS_TTL_SECONDS, issuer: 'nessence' });

export const verifyAccessToken = (token) => jwt.verify(token, env.JWT_ACCESS_SECRET, { issuer: 'nessence' });
