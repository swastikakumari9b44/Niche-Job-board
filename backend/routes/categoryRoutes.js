const router = require('express').Router();
const { categories, employmentTypeLabels } = require('../config/categories');

// Public: drives the frontend Vertical-Switcher form
router.get('/', (_req, res) =>
  res.json({ success: true, message: 'Categories retrieved', data: { categories, employmentTypes: employmentTypeLabels } })
);

module.exports = router;
