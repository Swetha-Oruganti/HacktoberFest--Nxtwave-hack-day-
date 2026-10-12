
import "dotenv/config";
import { GoogleGenAI } from "@google/genai";

const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

export function getAIStatus() {
  const gemmaModel = process.env.GEMMA_MODEL || "gemma-4-26b-a4b-it";
  return {
    available: Boolean(ai),
    provider: process.env.GEMINI_MODEL?.startsWith("gemma-") ? "Gemma" : "Gemini",
    model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    gemmaAvailable: Boolean(ai),
    gemmaModel,
  };
}

export async function generateAIText(prompt, { model = process.env.GEMINI_MODEL || "gemini-2.5-flash" } = {}) {
  if (!ai) throw new Error("AI is not configured. Add GEMINI_API_KEY to server/.env.");

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: { temperature: 0.7, maxOutputTokens: 4096 },
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
