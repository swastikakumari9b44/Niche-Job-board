const mongoose = require('mongoose');

const { NICHE_CATEGORIES, EMPLOYMENT_TYPES } = require('../config/categories');

const jobSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 150 },
    company: { type: String, required: true, trim: true, maxlength: 150 },
    description: { type: String, required: true, trim: true, maxlength: 10000 },
    nicheCategory: { type: String, enum: NICHE_CATEGORIES, required: true },
    location: { type: String, required: true, trim: true, maxlength: 150 },
    employmentType: { type: String, enum: EMPLOYMENT_TYPES, required: true },
    salaryRange: {
      min: { type: Number, min: 0 },
      max: { type: Number, min: 0 },
      currency: { type: String, trim: true, uppercase: true, maxlength: 3, default: 'INR' },
    },
    requiredSkills: { type: [String], default: [] },
    // Vertical-Switcher: niche-specific fields, validated per category in validators/jobValidator.js
    customFields: { type: mongoose.Schema.Types.Mixed, default: {} },
    status: { type: String, enum: ['active', 'closed'], default: 'active' },
    employerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // Admin moderation. Set only by /api/admin endpoints. Jobs created earlier have no value (= 'none').
    moderation: {
      status: { type: String, enum: ['none', 'flagged', 'removed'], default: 'none' },
      reason: { type: String, trim: true, maxlength: 500 },
      at: Date,
      by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
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
