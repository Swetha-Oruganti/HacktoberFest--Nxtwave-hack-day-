
import { generateAIText } from "../config/gemini.js";

export async function chat(req, res) {
  try {
    const { message } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        success: false,
        message: "Please provide a message"
      });
    }

    const reply = await generateAIText(
      `You are InterviewIQ, a friendly coding interview assistant.
Explain concepts simply and help users prepare for technical interviews.

User message: ${message}`
    );

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
