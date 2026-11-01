const mongoose = require('mongoose');

// One row per Razorpay webhook event we have fully handled. The unique eventId makes retries and replays harmless.
const webhookEventSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, unique: true },
    event: { type: String, required: true },
    razorpayOrderId: String,
    outcome: { type: String, maxlength: 200 },
    processedAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 90 }, // kept 90 days
  },
  { versionKey: false }
);

module.exports = mongoose.model('WebhookEvent', webhookEventSchema);
