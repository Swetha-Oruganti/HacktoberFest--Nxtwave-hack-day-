
import "dotenv/config";
import { generateAIText } from "./config/gemini.js";

try {
  const result = await generateAIText(
    "Reply with exactly: Gemini connection successful"
  );

  console.log("Gemini response:", result);
} catch (error) {
  console.error("Gemini test failed:", error);
}
