import mongoose from "mongoose";

const attemptSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  question: { type: mongoose.Schema.Types.ObjectId, ref: "Question" },
  company: String,
  title: String,
  language: { type: String, default: "javascript" },
  code: { type: String, maxlength: 50000 },
  status: { type: String, enum: ["draft", "completed"], default: "completed" },
  durationSeconds: { type: Number, min: 0, max: 86400, default: 0 },
}, { timestamps: true });
export default mongoose.model("Attempt", attemptSchema);
