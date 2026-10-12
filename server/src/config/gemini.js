
import "dotenv/config";
import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
  throw new Error("GEMINI_API_KEY is missing from .env");
}

const ai = new GoogleGenAI({ apiKey });

export async function generateAIText(prompt) {
  const model = process.env.GEMINI_MODEL;

  if (!model) {
    throw new Error("GEMINI_MODEL is missing from .env");
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
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
