import mongoose from "mongoose";

const experienceSchema = new mongoose.Schema({
  company: { type: String, required: true, trim: true, maxlength: 100 },
  role: { type: String, required: true, trim: true, maxlength: 120 },
  level: { type: String, default: "Not specified", maxlength: 50 },
  interviewDate: Date,
  location: { type: String, maxlength: 100 },
  workMode: { type: String, enum: ["onsite", "remote", "hybrid", "not-specified"], default: "not-specified" },
  applicationChannel: { type: String, maxlength: 120 },
  overallDurationDays: { type: Number, min: 0, max: 365 },
  outcome: { type: String, enum: ["offer", "rejected", "withdrew", "in-progress", "not-shared"], default: "not-shared" },
  rounds: [{
    name: String,
    format: { type: String, maxlength: 80 },
    durationMinutes: { type: Number, min: 0, max: 600 },
    topics: [String],
    details: String,
    questions: [String],
    result: { type: String, enum: ["passed", "not-passed", "not-shared"], default: "not-shared" },
  }],
  processSummary: { type: String, maxlength: 2000 },
  preparation: { type: String, maxlength: 1500 },
  difficultyRating: { type: Number, min: 1, max: 5 },
  wouldRecommend: Boolean,
  anonymous: { type: Boolean, default: true },
  tips: { type: String, maxlength: 2000 },
  sourceUrl: { type: String, maxlength: 500 },
  author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending", index: true },
}, { timestamps: true });
export default mongoose.model("Experience", experienceSchema);
