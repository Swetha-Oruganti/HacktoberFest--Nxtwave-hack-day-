
import "dotenv/config";
import { GoogleGenAI } from "@google/genai";

const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

export function getAIStatus() {
  const gemmaModel = process.env.GEMMA_MODEL || "gemma-4-26b-a4b-it";
  return {
    available: Boolean(ai),
    provider: process.env.GEMINI_MODEL?.startsWith("gemma-") ? "Gemma" : "Gemini",
    model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    researchModel: process.env.GEMINI_RESEARCH_MODEL || "gemini-3.8-flash",
    gemmaAvailable: Boolean(ai),
    gemmaModel,
  };
}

export async function generateAIText(prompt, { model = process.env.GEMINI_MODEL || "gemini-2.5-flash", maxOutputTokens = 8192 } = {}) {
  if (!ai) throw new Error("AI is not configured. Add GEMINI_API_KEY to server/.env.");

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: { temperature: 0.45, maxOutputTokens },
      });

      if (!response.text) {
        throw new Error("Gemini returned an empty response");
      }

      return response.text;
    } catch (error) {
      const status = error.status;

      const temporaryFailure = status === 503 || status === 429;

      if (!temporaryFailure || attempt === 2) {
        throw error;
      }

      const delay = 1000 * 2 ** attempt;
      console.log(
        `Gemini temporarily unavailable. Retrying in ${delay / 1000}s...`
      );

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// Use Gemini's built-in Google Search tool for fresh, attributable company research.
// Search results stay request-scoped; callers should render links instead of storing post text.
export async function researchCompany(company, role = "Software Engineer") {
  if (!ai) throw new Error("AI is not configured. Add GEMINI_API_KEY to server/.env.");
  const model = process.env.GEMINI_RESEARCH_MODEL || "gemini-3.8-flash";
  let response;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      response = await ai.models.generateContent({
        model,
        contents: `Research recent public ${company} ${role} interview experiences and company-tagged coding practice resources. Search for first-hand reports on Reddit (especially r/leetcode, r/cscareerquestions, and relevant regional engineering communities) and public X posts, then look for public company-tagged index/search pages on LeetCode, CodeChef, GeeksforGeeks, and TakeUForward. Prefer 2024–2026 interview reports and distinguish candidate reports from platform indexes or editorial guides. Summarize recurring hiring stages, round formats, topic families, difficulty signals, behavioral/system-design components, preparation advice, and which platforms expose company-tagged collections. Do not quote posts, reproduce exact proprietary coding problem statements, include usernames, infer offer outcomes, or present one person's report as company policy. Be transparent where sources disagree or evidence is thin. Return a concise, readable report with sections: What candidates report, Common technical areas, Non-coding rounds, Tagged practice collections, Caveats. The user interface will show the source links separately.`,
        config: { tools: [{ googleSearch: {} }], temperature: 0.2, maxOutputTokens: 2500 },
      });
      break;
    } catch (error) {
      if (![429, 503].includes(error.status) || attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
    }
  }
  const candidate = response.candidates?.[0];
  const metadata = candidate?.groundingMetadata;
  const sources = (metadata?.groundingChunks || []).map((chunk) => ({
    title: String(chunk.web?.title || "Web source").slice(0, 240),
    url: chunk.web?.uri,
    postedAt: chunk.web?.publishedTime || chunk.web?.date || undefined,
  })).filter((source) => {
    try { return ["http:", "https:"].includes(new URL(source.url).protocol); } catch { return false; }
  });
  return { text: response.text || "No research summary was returned.", model, queries: metadata?.webSearchQueries || [], sources };
}
