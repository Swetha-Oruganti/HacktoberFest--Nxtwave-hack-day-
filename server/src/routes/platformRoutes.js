import { Router } from "express";
import { generateAIText, getAIStatus } from "../config/gemini.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import Question from "../models/Question.js";
import Experience from "../models/Experience.js";
import Attempt from "../models/Attempt.js";

const router = Router();
const companies = [
  { name: "Google", mark: "G", color: "#4285f4", focus: "Algorithms · System design", questions: 0, experiences: 0 },
  { name: "Amazon", mark: "a", color: "#ff9900", focus: "Leadership · Data structures", questions: 0, experiences: 0 },
  { name: "Meta", mark: "∞", color: "#0866ff", focus: "Product sense · Algorithms", questions: 0, experiences: 0 },
  { name: "Microsoft", mark: "⊞", color: "#00a4ef", focus: "Problem solving · Collaboration", questions: 0, experiences: 0 },
  { name: "Apple", mark: "●", color: "#a1a1aa", focus: "Systems · Craft", questions: 0, experiences: 0 },
  { name: "Netflix", mark: "N", color: "#e50914", focus: "System design · Culture", questions: 0, experiences: 0 },
  { name: "Uber", mark: "U", color: "#111827", focus: "Algorithms · Distributed systems", questions: 0, experiences: 0 },
  { name: "Airbnb", mark: "A", color: "#ff5a5f", focus: "Product · System design", questions: 0, experiences: 0 },
];

function safeUrl(value) {
  if (!value) return undefined;
  try { const u = new URL(value); return ["http:", "https:"].includes(u.protocol) ? u.toString() : undefined; } catch { return undefined; }
}
function parseJson(text) {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  return JSON.parse(cleaned);
}

router.get("/companies", async (_req, res) => {
  const [qCounts, eCounts] = await Promise.all([
    Question.aggregate([{ $group: { _id: "$company", count: { $sum: 1 } } }]),
    Experience.aggregate([{ $match: { status: "approved" } }, { $group: { _id: "$company", count: { $sum: 1 } } }]),
  ]);
  const qMap = new Map(qCounts.map((x) => [x._id.toLowerCase(), x.count]));
  const eMap = new Map(eCounts.map((x) => [x._id.toLowerCase(), x.count]));
  const dynamic = [...new Set([...qCounts.map((x) => x._id), ...eCounts.map((x) => x._id)])]
    .filter((n) => !companies.some((c) => c.name.toLowerCase() === n.toLowerCase()))
    .map((name) => ({ name, mark: name[0]?.toUpperCase() || "C", color: "#8d7cff", focus: "Community contributed", questions: 0, experiences: 0 }));
  res.json({ success: true, companies: [...companies, ...dynamic].map((c) => ({ ...c, questions: qMap.get(c.name.toLowerCase()) || 0, experiences: eMap.get(c.name.toLowerCase()) || 0 })), ai: getAIStatus() });
});

router.get("/questions", async (req, res) => {
  const filter = {};
  if (typeof req.query.company === "string" && req.query.company.trim()) filter.company = new RegExp(`^${req.query.company.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
  if (typeof req.query.difficulty === "string" && ["Easy", "Medium", "Hard"].includes(req.query.difficulty)) filter.difficulty = req.query.difficulty;
  if (typeof req.query.topic === "string" && req.query.topic.trim()) filter.topic = new RegExp(req.query.topic.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  if (typeof req.query.search === "string" && req.query.search.trim()) {
    const term = req.query.search.trim().slice(0, 80).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = ["title", "prompt", "company", "topic"].map((field) => ({ [field]: new RegExp(term, "i") }));
  }
  const page = Math.max(1, Math.min(1000, Number.parseInt(req.query.page, 10) || 1));
  const questions = await Question.find(filter).sort({ createdAt: -1 }).skip((page - 1) * 24).limit(24).lean();
  const total = await Question.countDocuments(filter);
  res.json({ success: true, questions, total, page });
});

router.post("/questions/generate", requireAuth, async (req, res) => {
  try {
    const { company, role = "Software Engineer", topic = "Algorithms", difficulty = "Medium", count = 4, model = "default" } = req.body || {};
    if (typeof company !== "string" || company.trim().length < 2 || company.length > 100) return res.status(400).json({ success: false, message: "Choose a company to generate practice for." });
    if (!["Easy", "Medium", "Hard"].includes(difficulty)) return res.status(400).json({ success: false, message: "Choose Easy, Medium, or Hard difficulty." });
    const amount = Math.max(1, Math.min(8, Number(count) || 4));
    const useGemma = model === "gemma";
    if (useGemma && !getAIStatus().gemmaAvailable) return res.status(503).json({ success: false, message: "Add GEMINI_API_KEY to server/.env to enable Gemma 4." });
    const modelName = useGemma ? process.env.GEMMA_MODEL || "gemma-4-26b-a4b-it" : process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const prompt = `Create ${amount} original coding interview practice questions. Target company: ${company.trim()}; role: ${String(role).slice(0, 100)}; focus: ${String(topic).slice(0, 80)}; difficulty: ${difficulty}. Do not claim these are leaked or actual company questions. Do not reproduce known proprietary platform problems. Return ONLY a JSON array. Each item must include title, prompt (problem statement and constraints), difficulty, topic, round, examples (array of input/output strings), and hints (array of strings).`;
    const result = parseJson(await generateAIText(prompt, { model: modelName }));
    if (!Array.isArray(result) || !result.length) throw new Error("The model returned no practice questions. Please try again.");
    const docs = result.slice(0, amount).filter((q) => typeof q.title === "string" && typeof q.prompt === "string").map((q) => ({
      company: company.trim(), title: q.title.slice(0, 180), prompt: q.prompt.slice(0, 12000), difficulty: ["Easy", "Medium", "Hard"].includes(q.difficulty) ? q.difficulty : difficulty,
      topic: typeof q.topic === "string" ? q.topic.slice(0, 80) : topic, round: typeof q.round === "string" ? q.round.slice(0, 80) : "Technical", source: `Original AI practice · ${useGemma ? "Gemma 4" : "Gemini"}`, isGenerated: true, createdBy: req.user.id,
      examples: Array.isArray(q.examples) ? q.examples.slice(0, 5).map((e) => typeof e === "string" ? { input: e.slice(0, 300), output: "" } : { input: String(e.input || "").slice(0, 300), output: String(e.output || "").slice(0, 300) }) : [],
      hints: Array.isArray(q.hints) ? q.hints.slice(0, 6).map((h) => String(h).slice(0, 500)) : [],
    }));
    if (!docs.length) throw new Error("The model returned questions in an unexpected format. Please try again.");
    const saved = await Promise.all(docs.map(async (doc) => {
      try { return await Question.findOneAndUpdate({ company: doc.company, title: doc.title }, { $setOnInsert: doc }, { upsert: true, new: true }); }
      catch (e) { if (e.code === 11000) return Question.findOne({ company: doc.company, title: doc.title }); throw e; }
    }));
    res.status(201).json({ success: true, questions: saved, model: modelName });
  } catch (error) {
    console.error("Question generation failed:", error.message);
    res.status(502).json({ success: false, message: error.message || "Question generation failed." });
  }
});

router.get("/experiences", async (req, res) => {
  const filter = { status: "approved" };
  if (typeof req.query.company === "string" && req.query.company.trim()) filter.company = new RegExp(`^${req.query.company.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
  const experiences = await Experience.find(filter).sort({ createdAt: -1 }).limit(60).populate("author", "name").lean();
  res.json({ success: true, experiences });
});

router.post("/experiences", requireAuth, async (req, res) => {
  const { company, role, level, interviewDate, rounds, tips, sourceUrl } = req.body || {};
  if (typeof company !== "string" || company.trim().length < 2 || company.length > 100 || typeof role !== "string" || role.trim().length < 2 || role.length > 120) return res.status(400).json({ success: false, message: "Company and role are required." });
  if (!Array.isArray(rounds) || rounds.length < 1 || rounds.length > 12) return res.status(400).json({ success: false, message: "Add between 1 and 12 interview rounds." });
  const cleanedRounds = rounds.map((r) => ({ name: String(r.name || "Interview round").slice(0, 100), details: String(r.details || "").slice(0, 1200), questions: Array.isArray(r.questions) ? r.questions.slice(0, 15).map((q) => String(q).slice(0, 500)) : [] }));
  const experience = await Experience.create({ company: company.trim(), role: role.trim(), level: String(level || "Not specified").slice(0, 50), interviewDate: interviewDate ? new Date(interviewDate) : undefined, rounds: cleanedRounds, tips: typeof tips === "string" ? tips.slice(0, 2000) : "", sourceUrl: safeUrl(sourceUrl), author: req.user.id, status: "pending" });
  res.status(201).json({ success: true, experience: { id: experience.id, status: experience.status }, message: "Thanks for sharing. Your experience will appear after a quick review." });
});

router.post("/attempts", requireAuth, async (req, res) => {
  const { questionId, code = "", language = "javascript", durationSeconds = 0 } = req.body || {};
  if (typeof code !== "string" || code.length > 50000) return res.status(400).json({ success: false, message: "Code is too large." });
  const question = questionId ? await Question.findById(questionId).select("company title") : null;
  if (questionId && !question) return res.status(404).json({ success: false, message: "Question not found." });
  const attempt = await Attempt.create({ user: req.user.id, question: question?._id, company: question?.company || "Practice", title: question?.title || "Free practice", code, language: String(language).slice(0, 30), durationSeconds: Math.max(0, Math.min(86400, Number(durationSeconds) || 0)), status: "completed" });
  res.status(201).json({ success: true, attempt: { id: attempt.id, createdAt: attempt.createdAt } });
});

router.get("/attempts", requireAuth, async (req, res) => {
  const [attempts, experienceCount] = await Promise.all([
    Attempt.find({ user: req.user.id }).sort({ createdAt: -1 }).limit(12).lean(),
    Experience.countDocuments({ author: req.user.id }),
  ]);
  const total = await Attempt.countDocuments({ user: req.user.id });
  res.json({ success: true, attempts, stats: { solved: total, streak: 0, experiences: experienceCount } });
});

router.get("/admin/experiences", requireAuth, requireAdmin, async (_req, res) => {
  const experiences = await Experience.find({ status: "pending" }).sort({ createdAt: 1 }).populate("author", "name email").lean();
  res.json({ success: true, experiences });
});
router.patch("/admin/experiences/:id", requireAuth, requireAdmin, async (req, res) => {
  const { status } = req.body || {};
  if (!["approved", "rejected"].includes(status)) return res.status(400).json({ success: false, message: "Choose approved or rejected." });
  const experience = await Experience.findByIdAndUpdate(req.params.id, { status }, { new: true });
  if (!experience) return res.status(404).json({ success: false, message: "Experience not found." });
  res.json({ success: true, experience: { id: experience.id, status } });
});

export default router;
