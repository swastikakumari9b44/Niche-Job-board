const mongoose = require('mongoose');

const applicationSchema = new mongoose.Schema(
  {
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true },
    candidateId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    candidateName: { type: String, required: true, trim: true },
    candidateEmail: { type: String, required: true, lowercase: true, trim: true },
    resumeUrl: { type: String, required: true, trim: true, maxlength: 500 },
    // Filled by resume parsing / scoring in later days
    extractedSkills: { type: [String], default: [] },
    matchScore: { type: Number, min: 0, max: 100, default: 0 },
    matchedSkills: { type: [String], default: [] },
    missingSkills: { type: [String], default: [] },
    status: { type: String, enum: ['Applied', 'Shortlisted', 'Rejected'], default: 'Applied' },
  },
  { timestamps: true }
);

// One application per candidate per job
applicationSchema.index({ jobId: 1, candidateId: 1 }, { unique: true });
applicationSchema.index({ candidateId: 1 });

module.exports = mongoose.model('Application', applicationSchema);
