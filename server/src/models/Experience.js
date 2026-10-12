import mongoose from "mongoose";

const experienceSchema = new mongoose.Schema({
  company: { type: String, required: true, trim: true, maxlength: 100 },
  role: { type: String, required: true, trim: true, maxlength: 120 },
  level: { type: String, default: "Not specified", maxlength: 50 },
  interviewDate: Date,
  rounds: [{ name: String, details: String, questions: [String] }],
  tips: { type: String, maxlength: 2000 },
  sourceUrl: { type: String, maxlength: 500 },
  author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending", index: true },
}, { timestamps: true });
export default mongoose.model("Experience", experienceSchema);
