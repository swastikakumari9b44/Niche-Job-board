const mongoose = require('mongoose');

const NICHE_CATEGORIES = ['AI/ML', 'Nursing', 'Web3', 'Frontend', 'Other'];
const EMPLOYMENT_TYPES = ['full-time', 'part-time', 'contract', 'internship', 'temporary'];

const jobSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 150 },
    company: { type: String, required: true, trim: true, maxlength: 150 },
    description: { type: String, required: true, trim: true, maxlength: 10000 },
    nicheCategory: { type: String, enum: NICHE_CATEGORIES, required: true },
    location: { type: String, required: true, trim: true, maxlength: 150 },
    employmentType: { type: String, enum: EMPLOYMENT_TYPES, required: true },
    requiredSkills: { type: [String], default: [] },
    // Vertical-Switcher: niche-specific fields, validated per category in validators/jobValidator.js
    customFields: { type: mongoose.Schema.Types.Mixed, default: {} },
    status: { type: String, enum: ['active', 'closed'], default: 'active' },
    employerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // Set by the server only (future payment flow). Never from client input.
    promotion: {
      pinnedUntil: { type: Date, default: null },
      urgentUntil: { type: Date, default: null },
    },
  },
  { timestamps: true, minimize: false }
);

jobSchema.index({ status: 1, nicheCategory: 1, createdAt: -1 });

module.exports = mongoose.model('Job', jobSchema);
module.exports.NICHE_CATEGORIES = NICHE_CATEGORIES;
module.exports.EMPLOYMENT_TYPES = EMPLOYMENT_TYPES;
