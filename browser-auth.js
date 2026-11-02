'use strict';

/**
 * Browser Google sign-in for the admin console.
 * This is NOT TikTok OAuth. TikTok public LIVE events use a separate connector.
 * No Google/TikTok passwords, access tokens or TikTok cookies are collected.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const COOKIE = 'temple_admin_session';
const SESSION_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const GOOGLE_JWKS = 'https://www.googleapis.com/oauth2/v3/certs';
const ALLOWED_ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);

function cleanTikTokUsername(value) {
  let input = String(value || '').trim();
  if (/^https?:\/\//i.test(input)) {
    let url;
    try { url = new URL(input); } catch (_) { throw new Error('Link TikTok không hợp lệ'); }
    if (!['tiktok.com', 'www.tiktok.com', 'm.tiktok.com'].includes(url.hostname.toLowerCase())) {
      throw new Error('Chỉ hỗ trợ link tiktok.com/@username/live hoặc tên @username');
    }
    const m = url.pathname.match(/^\/@([^/]+)/);
    if (!m) throw new Error('Link TikTok cần chứa @username (không hỗ trợ link rút gọn)');
    input = decodeURIComponent(m[1]);
  }
  input = input.replace(/^@/, '');
  if (!/^[a-zA-Z0-9._]{2,32}$/.test(input)) {
    throw new Error('Tên TikTok phải từ 2–32 ký tự: chữ, số, dấu chấm hoặc gạch dưới');
  }
  return input;
}

function createBrowserAuth({ dataDir }) {
  const clientId = String(process.env.GOOGLE_CLIENT_ID || '').trim();
  const allowedEmails = new Set(
    String(process.env.ADMIN_EMAILS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean)
  );
  const configured = Boolean(clientId && allowedEmails.size);
  const linkFile = path.join(dataDir, 'google-tiktok-links.json');
  const sessions = new Map();
  const signInAttempts = new Map();
  let jwksCache = { until: 0, keys: [] };
  let linked = {};
  try {
    const existing = JSON.parse(fs.readFileSync(linkFile, 'utf8'));
    if (existing && typeof existing === 'object' && !Array.isArray(existing)) linked = existing;
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn('[Google/TikTok links] Could not read:', err.message);
  }

  const readCookie = req => {
    const raw = String(req.headers.cookie || '');
    const item = raw.split(';').map(x => x.trim()).find(x => x.startsWith(COOKIE + '='));
    return item ? item.slice(COOKIE.length + 1) : '';
  };

  function userFromRequest(req) {
    const token = readCookie(req);
    if (!token) return null;
    const record = sessions.get(token);
    if (!record) return null;
    if (record.expires <= Date.now()) {
      sessions.delete(token);
      return null;
    }
    return record.user;
  }

  function allowAdmin(req) {
    const user = userFromRequest(req);
    if (user && allowedEmails.has(user.email.toLowerCase())) return true;
    // Explicit opt-in for isolated local development only. NEVER set on public hosts.
    const addr = req.socket?.remoteAddress || '';
    return process.env.LOCAL_DEV_UNSAFE === '1' && !clientId &&
      (addr === '::1' || addr === '127.0.0.1' || addr === '::ffff:127.0.0.1');
  }

  function checkBrowserOrigin(req) {
    const origin = req.get('origin');
    if (!origin) return true; // Non-browser integrations; still require a valid admin session.
    try {
      const parsed = new URL(origin);
      return (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
        parsed.host === req.get('host') &&
        (parsed.protocol === 'https:' || req.hostname === 'localhost' || req.hostname === '127.0.0.1');
    } catch (_) { return false; }
  }

  function requireAdmin(req, res, next) {
    if (!checkBrowserOrigin(req)) return res.status(403).json({ ok: false, error: 'Origin không được phép' });
    if (!allowAdmin(req)) return res.status(401).json({
      ok: false,
      error: configured ? 'Vui lòng đăng nhập Google bằng email quản trị' : 'Cần thiết lập GOOGLE_CLIENT_ID và ADMIN_EMAILS trên server'
    });
    next();
  }

  function getLinked(user) {
    const rec = user && linked[user.sub];
    return typeof rec?.username === 'string' ? rec.username : '';
  }

  function saveLinked(user, username) {
    if (!user) throw new Error('Chưa đăng nhập');
    const clean = cleanTikTokUsername(username);
    linked[user.sub] = { username: clean, updatedAt: new Date().toISOString() };
    fs.mkdirSync(dataDir, { recursive: true });
    const tmp = linkFile + '.' + crypto.randomBytes(6).toString('hex') + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(linked, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, linkFile);
    return clean;
  }

  async function verifyGoogleIdToken(token) {
    if (!configured) throw new Error('Google Sign-in chưa cấu hình');
    if (typeof token !== 'string' || token.length > 12000) throw new Error('Credential không hợp lệ');
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Google ID token không hợp lệ');
    let header, claims;
    try {
      header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
      claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    } catch (_) { throw new Error('Không giải mã được ID token'); }
    if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new Error('Thuật toán token không hợp lệ');
    const now = Math.floor(Date.now() / 1000);
    if (!ALLOWED_ISSUERS.has(claims.iss) || claims.aud !== clientId ||
        !Number.isFinite(claims.exp) || claims.exp <= now ||
        !Number.isFinite(claims.iat) || claims.iat > now + 60 ||
        claims.email_verified !== true || typeof claims.sub !== 'string' || !claims.sub) {
      throw new Error('ID token hết hạn hoặc không đúng ứng dụng');
    }
    if (Date.now() >= jwksCache.until || !jwksCache.keys.some(k => k.kid === header.kid)) {
      const response = await fetch(GOOGLE_JWKS, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error('Không kết nối được Google JWKS');
      const data = await response.json();
      if (!Array.isArray(data.keys)) throw new Error('Google JWKS không hợp lệ');
      jwksCache = { keys: data.keys, until: Date.now() + 5 * 60 * 1000 };
    }
    const jwk = jwksCache.keys.find(k => k.kid === header.kid && k.kty === 'RSA' && k.use === 'sig');
    if (!jwk || !crypto.verify('RSA-SHA256',
      Buffer.from(parts[0] + '.' + parts[1]),
      crypto.createPublicKey({ key: jwk, format: 'jwk' }),
      Buffer.from(parts[2], 'base64url'))) {
      throw new Error('Chữ ký Google ID token không hợp lệ');
    }
    const email = String(claims.email || '').trim().toLowerCase();
    if (!allowedEmails.has(email)) throw new Error('Email Google chưa có trong ADMIN_EMAILS');
    return {
      sub: claims.sub,
      email,
      name: String(claims.name || '').slice(0, 100),
      picture: /^https:\/\/[a-z0-9.-]+\/\S+$/i.test(claims.picture || '') ? claims.picture : ''
    };
  }

  function sessionInfo(req) {
    const user = userFromRequest(req);
    return {
      configured,
      googleClientId: clientId || null,
      hasClientId: Boolean(clientId),
      hasAdminEmails: Boolean(allowedEmails.size),
      user: user ? { name: user.name, email: user.email, picture: user.picture } : null,
      tiktokUsername: user ? getLinked(user) : '',
      localDevMode: process.env.LOCAL_DEV_UNSAFE === '1' && !clientId
    };
  }

  function rateLimit(req) {
    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();
    for (const [k, v] of signInAttempts) if (v.until < now) signInAttempts.delete(k);
    const attempt = signInAttempts.get(key) || { hits: 0, until: now + 5 * 60 * 1000 };
    attempt.hits++;
    signInAttempts.set(key, attempt);
    if (signInAttempts.size > 2000) signInAttempts.clear();
    return attempt.hits <= 20;
  }

  async function login(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (!checkBrowserOrigin(req)) return res.status(403).json({ ok: false, error: 'Origin không được phép' });
    if (!rateLimit(req)) return res.status(429).json({ ok: false, error: 'Quá nhiều lần đăng nhập, thử lại sau' });
    try {
      const user = await verifyGoogleIdToken(req.body?.credential);
      for (const [id, rec] of sessions) if (rec.expires < Date.now()) sessions.delete(id);
      if (sessions.size >= 1000) sessions.delete(sessions.keys().next().value);
      const token = crypto.randomBytes(32).toString('base64url');
      sessions.set(token, { user, expires: Date.now() + SESSION_AGE_MS });
      res.cookie(COOKIE, token, {
        httpOnly: true, secure: req.secure, sameSite: 'lax', path: '/', maxAge: SESSION_AGE_MS
      });
      return res.json({ ok: true, ...sessionInfo({ ...req, headers: { ...req.headers, cookie: COOKIE + '=' + token } }) });
    } catch (e) {
      return res.status(401).json({ ok: false, error: e.message || 'Google Sign-in không hợp lệ' });
    }
  }

  function logout(req, res) {
    if (!checkBrowserOrigin(req)) return res.status(403).json({ ok: false, error: 'Origin không được phép' });
    sessions.delete(readCookie(req));
    res.clearCookie(COOKIE, { httpOnly: true, secure: req.secure, sameSite: 'lax', path: '/' });
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok: true });
  }

  return { sessionInfo, userFromRequest, allowAdmin, checkBrowserOrigin, requireAdmin,
    login, logout, getLinked, saveLinked, cleanTikTokUsername };
}

module.exports = { createBrowserAuth, cleanTikTokUsername };
