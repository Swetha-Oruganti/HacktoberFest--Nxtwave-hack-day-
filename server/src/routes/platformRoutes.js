import { Router } from "express";
import { generateAIText, getAIStatus, researchCompany } from "../config/gemini.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import Question from "../models/Question.js";
import Experience from "../models/Experience.js";
import Attempt from "../models/Attempt.js";
import { fingerprintProblem, findLikelyDuplicateQuestions, ingestQuestion } from "../services/questionIngestion.js";
import { executeCode, listRunnerLanguages } from "../services/judge0.js";

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
function escapeRegex(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function parseJson(text) {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  return JSON.parse(cleaned);
}

router.get("/companies", async (_req, res) => {
  const [qCounts, eCounts] = await Promise.all([
    Question.aggregate([
      { $set: { allCompanies: { $setUnion: [{ $ifNull: ["$companyTags", []] }, ["$company"]] } } },
      { $unwind: "$allCompanies" },
      { $group: { _id: "$allCompanies", count: { $sum: 1 } } },
    ]),
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
  if (typeof req.query.company === "string" && req.query.company.trim()) {
    const company = new RegExp(`^${req.query.company.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
    filter.$and = [...(filter.$and || []), { $or: [{ company }, { companyTags: company }] }];
  }
  if (typeof req.query.difficulty === "string" && ["Easy", "Medium", "Hard"].includes(req.query.difficulty)) filter.difficulty = req.query.difficulty;
  if (typeof req.query.topic === "string" && req.query.topic.trim()) filter.topic = new RegExp(req.query.topic.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  if (typeof req.query.search === "string" && req.query.search.trim()) {
    const term = req.query.search.trim().slice(0, 80).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$and = [...(filter.$and || []), { $or: ["title", "prompt", "company", "companyTags", "topic", "sourcePlatform"].map((field) => ({ [field]: new RegExp(term, "i") })) }];
  }
  const page = Math.max(1, Math.min(1000, Number.parseInt(req.query.page, 10) || 1));
  const questions = await Question.find(filter).sort({ createdAt: -1 }).skip((page - 1) * 24).limit(24).lean();
  const total = await Question.countDocuments(filter);
  res.json({ success: true, questions, total, page });
});

router.get("/runner/languages", async (_req, res) => {
  try { res.json({ success: true, languages: await listRunnerLanguages() }); }
  catch (error) {
    const status = error.status === 401 || error.status === 403 ? 503 : 502;
    res.status(status).json({ success: false, message: error.message || "The code runner is unavailable." });
  }
});

router.post("/runner/execute", requireAuth, async (req, res) => {
  const { code, languageId, stdin = "" } = req.body || {};
  if (typeof code !== "string" || !code.trim() || code.length > 50000) return res.status(400).json({ success: false, message: "Provide code between 1 byte and 50 KB." });
  if (typeof stdin !== "string" || stdin.length > 10000) return res.status(400).json({ success: false, message: "Input must be 10 KB or smaller." });
  try { res.json({ success: true, ...(await executeCode({ sourceCode: code, languageId, stdin })) }); }
  catch (error) {
    console.error("Code execution failed:", error.message);
    const status = error.status === 401 || error.status === 403 ? 503 : 502;
    res.status(status).json({ success: false, message: error.message || "The code runner is unavailable." });
  }
});

router.post("/research/company", requireAuth, async (req, res) => {
  const { company, role = "Software Engineer" } = req.body || {};
  if (typeof company !== "string" || company.trim().length < 2 || company.length > 100) return res.status(400).json({ success: false, message: "Choose a company to research." });
  try {
    const result = await researchCompany(company.trim(), String(role).slice(0, 100));
    res.json({ success: true, ...result, disclaimer: "Public web findings are candidate-reported and may be incomplete or outdated. They are not official company guidance." });
  } catch (error) {
    console.error("Company research failed:", error.message);
    res.status(502).json({ success: false, message: error.message || "Company research failed." });
  }
});

router.post("/questions/generate", requireAuth, async (req, res) => {
  try {
    const { company, role = "Software Engineer", topic = "Algorithms", difficulty = "Medium", count = 4, model = "default" } = req.body || {};
    if (typeof company !== "string" || company.trim().length < 2 || company.length > 100) return res.status(400).json({ success: false, message: "Choose a company to generate practice for." });
    if (!["Easy", "Medium", "Hard"].includes(difficulty)) return res.status(400).json({ success: false, message: "Choose Easy, Medium, or Hard difficulty." });
    const amount = Math.max(1, Math.min(100, Number(count) || 100));
    const useGemma = model === "gemma";
    if (useGemma && !getAIStatus().gemmaAvailable) return res.status(503).json({ success: false, message: "Add GEMINI_API_KEY to server/.env to enable Gemma 4." });
    const modelName = useGemma ? process.env.GEMMA_MODEL || "gemma-4-26b-a4b-it" : process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const companyPattern = new RegExp(`^${escapeRegex(company.trim())}$`, "i");
    const companyFilter = { $or: [{ company: companyPattern }, { companyTags: companyPattern }] };
    const existingForCompany = await Question.find(companyFilter).select("title prompt companyTags contentFingerprint").lean();
    let currentCount = existingForCompany.length;
    let remaining = Math.max(0, amount - currentCount);
    if (!remaining) return res.json({ success: true, questions: [], generated: 0, currentCount, target: amount, model: modelName });

    let researchContext = "";
    if (amount >= 25) {
      try { researchContext = (await researchCompany(company.trim(), String(role).slice(0, 100))).text.slice(0, 2200); }
      catch (error) { console.warn("Grounded company context unavailable; using generic company-style practice:", error.message); }
    }

    const batchSize = 12;
    const knownTitles = new Set(existingForCompany.map((q) => q.title.trim().toLowerCase()));
    const knownFingerprints = new Set(existingForCompany.map((q) => q.contentFingerprint).filter(Boolean));
    const saved = [];
    let duplicatesSkipped = 0;
    let stalledBatches = 0;
    const maxBatches = Math.ceil(remaining / batchSize) + 4;
    for (let batch = 0; batch < maxBatches && remaining > 0; batch += 1) {
      const batchCount = Math.min(batchSize, remaining);
      const avoid = [...knownTitles].slice(-180).join(" | ");
      const prompt = `Create exactly ${batchCount} distinct, original coding interview practice problems for ${company.trim()} ${String(role).slice(0, 100)}. Focus: ${String(topic).slice(0, 80)}; difficulty: ${difficulty}. Cover varied concepts, use practical interview-style constraints, and include examples and hints. Never claim these are actual or leaked company questions; do not reproduce known platform problems. Use company themes only to choose a balanced topic/round mix; invent fresh problem statements. Avoid every title in this list and avoid rephrasing their concepts: ${avoid || "none"}. ${researchContext ? `Grounded, high-level company interview signals (use only as topic guidance; never copy any reported question): ${researchContext}` : ""} Return ONLY a JSON array with title, prompt, difficulty, topic, round, examples (array of {input,output}), and hints (array of strings).`;
      const generated = parseJson(await generateAIText(prompt, { model: modelName, maxOutputTokens: 12000 }));
      if (!Array.isArray(generated)) throw new Error("The model returned questions in an unexpected format. Please try again.");
      let addedThisBatch = 0;
      for (const q of generated.slice(0, batchCount)) {
        if (typeof q.title !== "string" || typeof q.prompt !== "string") continue;
        const title = q.title.trim().slice(0, 180);
        const promptText = q.prompt.trim().slice(0, 12000);
        const fingerprint = fingerprintProblem(promptText);
        if (title.length < 3 || promptText.length < 30 || knownTitles.has(title.toLowerCase()) || knownFingerprints.has(fingerprint)) { duplicatesSkipped += 1; continue; }
        const nearDuplicates = await findLikelyDuplicateQuestions(promptText);
        if (nearDuplicates.length) { duplicatesSkipped += 1; continue; }
        const doc = {
          company: company.trim(), companyTags: [company.trim()], title, prompt: promptText,
          difficulty: ["Easy", "Medium", "Hard"].includes(q.difficulty) ? q.difficulty : difficulty,
          topic: typeof q.topic === "string" ? q.topic.slice(0, 80) : topic,
          round: typeof q.round === "string" ? q.round.slice(0, 80) : "Technical",
          source: `Original AI practice · ${useGemma ? "Gemma 4" : "Gemini"}`, isGenerated: true, createdBy: req.user.id,
          sourcePlatform: useGemma ? "Gemma 4" : "Gemini", provenanceStatus: "original", contentFingerprint: fingerprint,
          examples: Array.isArray(q.examples) ? q.examples.slice(0, 5).map((e) => typeof e === "string" ? { input: e.slice(0, 300), output: "" } : { input: String(e.input || "").slice(0, 300), output: String(e.output || "").slice(0, 300) }) : [],
          hints: Array.isArray(q.hints) ? q.hints.slice(0, 6).map((h) => String(h).slice(0, 500)) : [],
        };
        let question = await Question.findOne({ $or: [{ contentFingerprint: fingerprint }, { company: companyPattern, title: new RegExp(`^${escapeRegex(title)}$`, "i") }] });
        if (question) {
          const alreadyTagged = (question.companyTags || []).some((tag) => tag.toLowerCase() === company.trim().toLowerCase()) || question.company.toLowerCase() === company.trim().toLowerCase();
          await Question.updateOne({ _id: question._id }, { $addToSet: { companyTags: company.trim() } });
          if (!alreadyTagged) { saved.push(question); addedThisBatch += 1; }
        } else {
          let created = false;
          try { question = await Question.create(doc); created = true; }
          catch (error) {
            if (error.code !== 11000) throw error;
            question = await Question.findOne({ contentFingerprint: fingerprint });
            if (!question) throw error;
            const alreadyTagged = (question.companyTags || []).some((tag) => tag.toLowerCase() === company.trim().toLowerCase()) || question.company.toLowerCase() === company.trim().toLowerCase();
            await Question.updateOne({ _id: question._id }, { $addToSet: { companyTags: company.trim() } });
            if (!alreadyTagged) { saved.push(question); addedThisBatch += 1; }
          }
          if (created) { saved.push(question); addedThisBatch += 1; }
        }
        knownTitles.add(title.toLowerCase()); knownFingerprints.add(fingerprint);
      }
      remaining -= addedThisBatch;
      currentCount += addedThisBatch;
      stalledBatches = addedThisBatch ? 0 : stalledBatches + 1;
      if (stalledBatches >= 2) break;
    }
    res.status(201).json({ success: true, questions: saved, generated: saved.length, duplicateGenerated: duplicatesSkipped, currentCount, target: amount, remaining: Math.max(0, amount - currentCount), model: modelName });
  } catch (error) {
    console.error("Question generation failed:", error.message);
    res.status(502).json({ success: false, message: error.message || "Question generation failed." });
  }
});

router.get("/experiences", async (req, res) => {
  const filter = { status: "approved" };
  if (typeof req.query.company === "string" && req.query.company.trim()) filter.company = new RegExp(`^${req.query.company.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
  const experiences = await Experience.find(filter).sort({ createdAt: -1 }).limit(60).populate("author", "name").lean();
  res.json({ success: true, experiences: experiences.map((experience) => ({
    ...experience,
    author: experience.anonymous ? { name: "Anonymous candidate" } : experience.author,
  })) });
});

router.post("/admin/import/questions", requireAuth, requireAdmin, async (req, res) => {
  const { questions, source = {}, rights = {} } = req.body || {};
  if (!Array.isArray(questions) || !questions.length || questions.length > 250) return res.status(400).json({ success: false, message: "Upload a JSON list of 1–250 questions." });
  if (typeof source.platform !== "string" || source.platform.trim().length < 2 || source.platform.length > 80) return res.status(400).json({ success: false, message: "Source platform is required." });
  const hasPermission = typeof rights.permissionReference === "string" && rights.permissionReference.trim().length >= 5;
  if (typeof rights.licenseName !== "string" || rights.licenseName.trim().length < 3 || (!safeUrl(rights.licenseUrl) && !hasPermission)) return res.status(400).json({ success: false, message: "Provide a dataset license and license URL, or written permission reference before importing." });
  if (rights.confirmed !== true) return res.status(400).json({ success: false, message: "Confirm that you have redistribution rights for this dataset." });
  if (/(leetcode|geeks?forgeeks|takeuforward|\btuf\b|codechef)/i.test(source.platform) && !hasPermission) return res.status(403).json({ success: false, message: "This source's current terms restrict automated collection or republication. Attach written permission before importing its problem text." });
  const provenance = { platform: source.platform, licenseName: rights.licenseName, licenseUrl: safeUrl(rights.licenseUrl), termsUrl: safeUrl(source.termsUrl), permissionReference: String(rights.permissionReference || "").slice(0, 300), sourceUrl: safeUrl(source.sourceUrl) };
  const results = [];
  for (const item of questions) {
    try { results.push(await ingestQuestion(item, provenance, req.user.id)); }
    catch (error) { results.push({ status: "invalid", title: String(item?.title || "Untitled").slice(0, 180), reason: error.message }); }
  }
  const summary = results.reduce((total, item) => { total[item.status] += 1; return total; }, { imported: 0, merged: 0, review: 0, invalid: 0 });
  res.status(201).json({ success: true, summary, results, note: "Near-duplicate candidates were skipped for admin review. Imported text remains tied to the provided license/permission record." });
});

router.post("/experiences", requireAuth, async (req, res) => {
  const { company, role, level, interviewDate, rounds, tips, sourceUrl, location, workMode, applicationChannel, overallDurationDays, outcome, processSummary, preparation, difficultyRating, wouldRecommend, anonymous } = req.body || {};
  if (typeof company !== "string" || company.trim().length < 2 || company.length > 100 || typeof role !== "string" || role.trim().length < 2 || role.length > 120) return res.status(400).json({ success: false, message: "Company and role are required." });
  if (!Array.isArray(rounds) || rounds.length < 1 || rounds.length > 12) return res.status(400).json({ success: false, message: "Add between 1 and 12 interview rounds." });
  const cleanedRounds = rounds.map((r) => ({
    name: String(r.name || "Interview round").slice(0, 100),
    format: String(r.format || "").slice(0, 80),
    durationMinutes: Math.max(0, Math.min(600, Number(r.durationMinutes) || 0)),
    topics: Array.isArray(r.topics) ? r.topics.slice(0, 15).map((topic) => String(topic).slice(0, 80)) : [],
    details: String(r.details || "").slice(0, 1200),
    questions: Array.isArray(r.questions) ? r.questions.slice(0, 15).map((q) => String(q).slice(0, 500)) : [],
    result: ["passed", "not-passed", "not-shared"].includes(r.result) ? r.result : "not-shared",
  }));
  const experience = await Experience.create({
    company: company.trim(), role: role.trim(), level: String(level || "Not specified").slice(0, 50),
    interviewDate: interviewDate && !Number.isNaN(new Date(interviewDate).valueOf()) ? new Date(interviewDate) : undefined,
    location: String(location || "").slice(0, 100), workMode: ["onsite", "remote", "hybrid"].includes(workMode) ? workMode : "not-specified",
    applicationChannel: String(applicationChannel || "").slice(0, 120), overallDurationDays: Math.max(0, Math.min(365, Number(overallDurationDays) || 0)),
    outcome: ["offer", "rejected", "withdrew", "in-progress"].includes(outcome) ? outcome : "not-shared",
    rounds: cleanedRounds, processSummary: String(processSummary || "").slice(0, 2000), preparation: String(preparation || "").slice(0, 1500),
    difficultyRating: Math.max(1, Math.min(5, Number(difficultyRating) || 0)) || undefined, wouldRecommend: typeof wouldRecommend === "boolean" ? wouldRecommend : undefined,
    anonymous: anonymous !== false, tips: typeof tips === "string" ? tips.slice(0, 2000) : "", sourceUrl: safeUrl(sourceUrl), author: req.user.id, status: "pending",
  });
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
