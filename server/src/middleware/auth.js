import crypto from "node:crypto";

const developmentSecret = crypto.randomBytes(32).toString("hex");
const secret = () => process.env.JWT_SECRET || (process.env.NODE_ENV === "production" ? "" : developmentSecret);

export function signToken(user) {
  if (!secret()) throw new Error("JWT_SECRET must be configured in production.");
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ sub: String(user._id), role: user.role, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7 })).toString("base64url");
  const body = `${header}.${payload}`;
  const signature = crypto.createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function requireAuth(req, res, next) {
  if (!secret()) return res.status(503).json({ success: false, message: "Authentication is not configured." });
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ success: false, message: "Sign in to continue." });
  try {
    const [header, payload, signature] = token.split(".");
    const expected = crypto.createHmac("sha256", secret()).update(`${header}.${payload}`).digest();
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) throw new Error("Invalid signature");
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (claims.exp < Date.now() / 1000) throw new Error("Expired token");
    req.user = { id: claims.sub, role: claims.role };
    next();
  } catch {
    res.status(401).json({ success: false, message: "Your session expired. Please sign in again." });
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") return res.status(403).json({ success: false, message: "Admin access required." });
  next();
}
