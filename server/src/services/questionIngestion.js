import crypto from "node:crypto";
import Question from "../models/Question.js";

export function normalizeProblemText(text = "") {
  return String(text)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/```[\s\S]*?```/g, " code ")
    .replace(/https?:\/\/\S+/gi, " ")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function fingerprintProblem(text) {
  return crypto.createHash("sha256").update(normalizeProblemText(text)).digest("hex");
}

function canonicalUrl(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return undefined;
    url.hash = "";
    url.search = "";
    return `${url.protocol}//${url.host}${url.pathname.replace(/\/$/, "")}`.toLowerCase();
  } catch { return undefined; }
}
function validDate(value) { const date = value ? new Date(value) : null; return date && !Number.isNaN(date.valueOf()) ? String(value).trim() : undefined; }

function tokenSimilarity(left, right) {
  const a = new Set(normalizeProblemText(left).split(" ").filter((word) => word.length > 2));
  const b = new Set(normalizeProblemText(right).split(" ").filter((word) => word.length > 2));
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const word of a) if (b.has(word)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

async function findExactExisting(item, fingerprint, sourceUrl) {
  const or = [{ contentFingerprint: fingerprint }];
  const link = canonicalUrl(sourceUrl);
  if (link) or.push({ sourceUrl: link }, { "sourceLinks.url": link });
  const exact = await Question.findOne({ $or: or });
  if (exact) return exact;

  const normalized = normalizeProblemText(item.prompt);
  const terms = normalized.split(" ").filter((word) => word.length > 3).slice(0, 12);
  if (!terms.length) return null;
  try {
    const candidates = await Question.find({ $text: { $search: terms.join(" ") } }).select("title prompt company companyTags sourceLinks contentFingerprint").limit(20).lean();
    return candidates.find((candidate) => normalizeProblemText(candidate.prompt) === normalized) || null;
  } catch {
    return null;
  }
}

async function nearCandidates(item) {
  const normalized = normalizeProblemText(item.prompt);
  const terms = normalized.split(" ").filter((word) => word.length > 3).slice(0, 12);
  if (!terms.length) return [];
  try {
    const candidates = await Question.find({ $text: { $search: terms.join(" ") } }).select("title prompt company companyTags sourceUrl sourceLinks").limit(20).lean();
    return candidates.map((candidate) => ({ candidate, similarity: tokenSimilarity(item.prompt, candidate.prompt) }))
      .filter((match) => match.similarity >= 0.82)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 3)
      .map(({ candidate, similarity }) => ({ id: candidate._id, title: candidate.title, company: candidate.company, companyTags: candidate.companyTags, sourceUrl: candidate.sourceUrl, similarity: Number(similarity.toFixed(2)) }));
  } catch {
    return [];
  }
}

export async function findLikelyDuplicateQuestions(prompt) {
  return nearCandidates({ title: "Generated question", prompt });
}

export async function ingestQuestion(item, source, userId) {
  const companyTags = [...new Set((item.companyTags || []).map((tag) => String(tag).trim()).filter(Boolean))];
  if (!companyTags.length) throw new Error("Each imported question needs at least one company tag.");
  const title = String(item.title || "").trim().slice(0, 180);
  const prompt = String(item.prompt || "").trim().slice(0, 12000);
  if (title.length < 3 || prompt.length < 30) throw new Error("Each question needs a title and a prompt of at least 30 characters.");
  const fingerprint = fingerprintProblem(prompt);
  const sourceUrl = canonicalUrl(item.sourceUrl || source.sourceUrl);
  const existing = await findExactExisting({ ...item, title, prompt }, fingerprint, sourceUrl);
  const license = source.licenseName.trim().slice(0, 160);
  const postedAt = validDate(item.sourcePostedAt || item.postedAt);
  const askedAt = validDate(item.sourceAskedAt || item.askedAt);
  const sourceLink = sourceUrl ? [{ platform: source.platform.trim(), title, url: sourceUrl, license, licenseUrl: canonicalUrl(source.licenseUrl), termsUrl: canonicalUrl(source.termsUrl), permissionRef: String(source.permissionReference || "").slice(0, 300), postedAt, askedAt }] : [];
  if (existing) {
    await Question.updateOne({ _id: existing._id }, {
      $set: { contentFingerprint: fingerprint },
      $addToSet: { companyTags: { $each: companyTags } },
    });
    if (sourceLink.length) await Question.updateOne({ _id: existing._id, "sourceLinks.url": { $ne: sourceUrl } }, { $push: { sourceLinks: sourceLink[0] } });
    return { status: "merged", id: String(existing._id), title: existing.title, companyTags: [...new Set([...(existing.companyTags || []), existing.company, ...companyTags])] };
  }

  const duplicates = await nearCandidates({ ...item, title, prompt });
  if (duplicates.length) return { status: "review", title, companyTags, possibleDuplicates: duplicates };

  const question = await Question.create({
    company: companyTags[0], companyTags, title, prompt,
    difficulty: ["Easy", "Medium", "Hard"].includes(item.difficulty) ? item.difficulty : "Medium",
    topic: String(item.topic || "Algorithms").slice(0, 80), round: String(item.round || "Technical").slice(0, 80),
    source: `${source.platform.trim()} · ${license}`, sourcePlatform: source.platform.trim(), sourceLicense: license,
    sourceUrl, sourceLinks: sourceLink, sourcePostedAt: postedAt, sourceAskedAt: askedAt, provenanceStatus: source.permissionReference ? "permission-granted" : "licensed",
    contentFingerprint: fingerprint,
    examples: Array.isArray(item.examples) ? item.examples.slice(0, 5).map((example) => ({ input: String(example.input || "").slice(0, 300), output: String(example.output || "").slice(0, 300) })) : [],
    hints: Array.isArray(item.hints) ? item.hints.slice(0, 6).map((hint) => String(hint).slice(0, 500)) : [],
    createdBy: userId,
  });
  return { status: "imported", id: String(question._id), title, companyTags };
}
