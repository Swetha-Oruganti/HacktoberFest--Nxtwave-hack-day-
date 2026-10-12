
import { generateAIText } from "../config/gemini.js";

export async function chat(req, res) {
  try {
    const { message, history = [] } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        success: false,
        message: "Please provide a message"
      });
    }

    const safeHistory = Array.isArray(history) ? history.slice(-8).map((item) => `${item.role === "assistant" ? "Coach" : "Candidate"}: ${String(item.text || "").slice(0, 1200)}`).join("\n") : "";
    const reply = await generateAIText(`You are InterviewIQ, a friendly technical interview coach. Give clear, useful help. Do not provide a complete solution unless explicitly requested; prefer hints first.\nRecent conversation:\n${safeHistory}\nCandidate: ${message.slice(0, 3000)}`);

    return res.json({
      success: true,
      reply
    });
  } catch (error) {
    console.error("Chatbot error:", error);

    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
}
