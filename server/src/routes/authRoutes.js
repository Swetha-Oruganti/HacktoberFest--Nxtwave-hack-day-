import { Router } from "express";
import crypto from "node:crypto";
import { promisify } from "node:util";
import User from "../models/User.js";
import { requireAuth, signToken } from "../middleware/auth.js";

const router = Router();
const scrypt = promisify(crypto.scrypt);
const hashPassword = async (password) => {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = await scrypt(password, salt, 64);
  return `${salt}:${hash.toString("hex")}`;
};

router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 80) return res.status(400).json({ success: false, message: "Enter a name between 2 and 80 characters." });
    if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return res.status(400).json({ success: false, message: "Enter a valid email address." });
    if (typeof password !== "string" || password.length < 8 || password.length > 128) return res.status(400).json({ success: false, message: "Password must be 8–128 characters." });
    const normalized = email.trim().toLowerCase();
    if (await User.exists({ email: normalized })) return res.status(409).json({ success: false, message: "An account with that email already exists." });
    const user = await User.create({ name: name.trim(), email: normalized, passwordHash: await hashPassword(password) });
    res.status(201).json({ success: true, token: signToken(user), user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not create your account." });
  }
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== "string" || typeof password !== "string") return res.status(400).json({ success: false, message: "Enter your email and password." });
  const user = await User.findOne({ email: email.trim().toLowerCase() }).select("+passwordHash");
  if (!user) return res.status(401).json({ success: false, message: "Email or password is incorrect." });
  const [salt, stored] = user.passwordHash.split(":");
  const candidate = await scrypt(password, salt, 64);
  const expected = Buffer.from(stored, "hex");
  if (candidate.length !== expected.length || !crypto.timingSafeEqual(candidate, expected)) return res.status(401).json({ success: false, message: "Email or password is incorrect." });
  res.json({ success: true, token: signToken(user), user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

router.get("/me", requireAuth, async (req, res) => {
  const user = await User.findById(req.user.id).select("name email role createdAt");
  if (!user) return res.status(404).json({ success: false, message: "Account not found." });
  res.json({ success: true, user: { id: user.id, name: user.name, email: user.email, role: user.role, createdAt: user.createdAt } });
});

export default router;
