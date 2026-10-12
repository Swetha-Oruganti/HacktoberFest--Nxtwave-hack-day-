import mongoose from "mongoose";

const questionSchema = new mongoose.Schema({
  company: { type: String, required: true, index: true },
  companyTags: { type: [String], default: [], index: true },
  title: { type: String, required: true, trim: true },
  prompt: { type: String, required: true },
  difficulty: { type: String, enum: ["Easy", "Medium", "Hard"], default: "Medium" },
  topic: { type: String, default: "Algorithms" },
  round: { type: String, default: "Technical" },
  source: { type: String, default: "AI generated practice" },
  sourceUrl: String,
  sourcePlatform: { type: String, default: "InterviewIQ" },
  sourceLicense: String,
  sourcePostedAt: String,
  sourceAskedAt: String,
  sourceLinks: [{ platform: String, title: String, url: String, license: String, licenseUrl: String, termsUrl: String, permissionRef: String, postedAt: String, askedAt: String, addedAt: { type: Date, default: Date.now } }],
  contentFingerprint: { type: String, index: true },
  provenanceStatus: { type: String, enum: ["original", "licensed", "permission-granted", "link-only"], default: "original" },
  nearDuplicateOf: { type: mongoose.Schema.Types.ObjectId, ref: "Question" },
  examples: [{ input: String, output: String }],
  hints: [String],
  isGenerated: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true });
questionSchema.index({ company: 1, title: 1 }, { unique: true });
questionSchema.index({ contentFingerprint: 1 }, { unique: true, sparse: true });
questionSchema.index({ title: "text", prompt: "text", topic: "text" });
export default mongoose.model("Question", questionSchema);
