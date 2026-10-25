// Single source of truth for the Vertical-Switcher. The frontend fetches this via GET /api/categories
// and renders its forms from it; the backend builds its Zod validation from the same data.
const config = require('./categories.json');

const NICHE_CATEGORIES = Object.keys(config.categories);
const EMPLOYMENT_TYPES = config.employmentTypes.map((t) => t.toLowerCase());

module.exports = { categories: config.categories, NICHE_CATEGORIES, EMPLOYMENT_TYPES, employmentTypeLabels: config.employmentTypes };
