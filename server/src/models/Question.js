import mongoose from "mongoose";

const questionSchema = new mongoose.Schema({
  company: { type: String, required: true, index: true },
  title: { type: String, required: true, trim: true },
  prompt: { type: String, required: true },
  difficulty: { type: String, enum: ["Easy", "Medium", "Hard"], default: "Medium" },
  topic: { type: String, default: "Algorithms" },
  round: { type: String, default: "Technical" },
  source: { type: String, default: "AI generated practice" },
  sourceUrl: String,
  examples: [{ input: String, output: String }],
  hints: [String],
  isGenerated: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });
questionSchema.index({ company: 1, title: 1 }, { unique: true });
export default mongoose.model("Question", questionSchema);
