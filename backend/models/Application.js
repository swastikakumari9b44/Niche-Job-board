const mongoose = require('mongoose');

const applicationSchema = new mongoose.Schema(
  {
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true },
    candidateId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    candidateName: { type: String, required: true, trim: true },
    candidateEmail: { type: String, required: true, lowercase: true, trim: true },
    // Stored file name inside backend/uploads (never a public URL). Served only via an authorized endpoint.
    resumeUrl: { type: String, required: true, trim: true, maxlength: 500 },
    resumeOriginalName: { type: String, trim: true, maxlength: 200 },
    resumeSize: { type: Number, min: 0 },
    // Filled by resume parsing / scoring in later days
    extractedSkills: { type: [String], default: [] },
    // 'scored' = skill coverage computed; 'unavailable' = no readable text or job has no required skills
    matchStatus: { type: String, enum: ['scored', 'unavailable'], default: 'unavailable' },
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
