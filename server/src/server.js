
import "dotenv/config";
import express from "express";
import cors from "cors";
import { connectDB } from "./config/db.js";
import { generateAIText } from "./config/gemini.js";
import chatRoutes from "./routes/chatRoutes.js";
const app = express();

app.use(cors({
  origin: process.env.CLIENT_URL,
}));

app.use(express.json({ limit: "100kb" }));

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "InterviewIQ API is running",
  });
});

app.post("/api/questions/generate", async (req, res) => {
  const { topic, difficulty = "medium", count = 5 } = req.body;

  if (!topic) {
    return res.status(400).json({ success: false, message: "topic is required" });
  }

  const prompt = `Generate ${count} ${difficulty}-difficulty interview questions about "${topic}".
Return ONLY a valid JSON array (no markdown, no extra text) where each element has:
  "question": the interview question (string)
  "answer": a concise model answer (string)
Example: [{"question": "...", "answer": "..."}]`;

  try {
    const text = await generateAIText(prompt);
    // Strip potential markdown code fences from the AI response
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    const questions = JSON.parse(cleaned);
    res.json({ success: true, questions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

const PORT = process.env.PORT || 5000;

async function startServer() {
  await connectDB();
  app.use("/api/chat", chatRoutes);
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((error) => {
  console.error("Server startup failed:", error.message);
  process.exit(1);
});
