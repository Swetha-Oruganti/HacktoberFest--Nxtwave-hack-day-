
import "dotenv/config";
import express from "express";
import cors from "cors";
import { fileURLToPath } from "node:url";
import { connectDB } from "./config/db.js";
import { getAIStatus } from "./config/gemini.js";
import chatRoutes from "./routes/chatRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import platformRoutes from "./routes/platformRoutes.js";
import { requireAuth } from "./middleware/auth.js";
import { seedStarterQuestions } from "./config/seedQuestions.js";
const app = express();

app.use(cors({
  origin: process.env.CLIENT_URL ? process.env.CLIENT_URL.split(",").map((s) => s.trim()) : false,
  credentials: true,
}));

app.use(express.json({ limit: "5mb" }));
app.use(express.static(fileURLToPath(new URL("../public", import.meta.url))));

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "InterviewIQ API is running",
    ai: getAIStatus(),
    database: "connected",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api", platformRoutes);
app.use("/api/chat", requireAuth, chatRoutes);

app.get("*path", (_req, res, next) => {
  if (_req.path.startsWith("/api/")) return next();
  res.sendFile(fileURLToPath(new URL("../public/index.html", import.meta.url)));
});
app.use((error, _req, res, _next) => {
  console.error("Request error:", error.message);
  res.status(500).json({ success: false, message: "Something went wrong. Please try again." });
});

const PORT = process.env.PORT || 5000;

async function startServer() {
  if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET must be configured before starting in production.");
  }
  await connectDB();
  await seedStarterQuestions();
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((error) => {
  console.error("Server startup failed:", error.message);
  process.exit(1);
});
