const { test } = require('node:test');
const assert = require('node:assert');
const { scoreResume, extractSkills } = require('../services/skillMatcher');

test('example from the spec: 4 of 5 required skills = 80%', () => {
  const r = scoreResume('Experienced engineer: Python, PyTorch, SQL and AWS.', ['Python', 'PyTorch', 'SQL', 'Docker', 'AWS']);
  assert.strictEqual(r.matchScore, 80);
  assert.deepStrictEqual(r.matchedSkills, ['Python', 'PyTorch', 'SQL', 'AWS']);
  assert.deepStrictEqual(r.missingSkills, ['Docker']);
  assert.strictEqual(r.status, 'scored');
});

test('whole-word matching: java != javascript, sql != mysql, express (verb) ignored', () => {
  assert.strictEqual(scoreResume('I know JavaScript and MySQL', ['Java', 'SQL']).matchScore, 0);
  assert.deepStrictEqual(extractSkills('I express myself well'), []);
});

test('aliases and symbols: nodejs, k8s, sklearn, C++, Next.js', () => {
  const r = scoreResume('Built services in NodeJS on k8s; sklearn models; C++ and Next.js.', ['Node.js', 'Kubernetes', 'Scikit-learn', 'C++', 'Next.js']);
  assert.strictEqual(r.matchScore, 100);
});

test('skills outside the dictionary are still compared as plain words', () => {
  assert.strictEqual(scoreResume('Expert in Pytest and Pydantic', ['pytest', 'Hypothesis']).matchScore, 50);
});

test('unavailable when there is no text or no required skills; never throws on odd input', () => {
  assert.strictEqual(scoreResume('', ['Python']).status, 'unavailable');
  assert.strictEqual(scoreResume('Python', ['Python']).status, 'unavailable'); // too little text to trust
  assert.strictEqual(scoreResume('Python developer with many years of experience', []).status, 'unavailable');
  assert.strictEqual(scoreResume(null, undefined).status, 'unavailable');
});
