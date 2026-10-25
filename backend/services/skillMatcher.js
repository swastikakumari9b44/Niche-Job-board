// Deterministic, explainable skill coverage. NOT a semantic/AI model: it only checks whether
// each required skill (or a known alias of it) appears as a whole word in the resume text.

// canonical name -> aliases (all lowercase). Single letters like "r"/"c"/"go" are intentionally excluded
// because they match ordinary words; use "golang", "r programming", etc.
const SKILLS = {
  Python: ['python', 'python3'], JavaScript: ['javascript', 'js', 'ecmascript'], TypeScript: ['typescript', 'ts'],
  Java: ['java'], 'C++': ['c++', 'cpp'], 'C#': ['c#', 'csharp'], Go: ['golang', 'go language'], Rust: ['rust'],
  R: ['r programming', 'r language', 'rstudio'], SQL: ['sql'], Solidity: ['solidity'], Kotlin: ['kotlin'], Swift: ['swift'], PHP: ['php'], Ruby: ['ruby'],
  'Node.js': ['node.js', 'nodejs', 'node js'], 'Express.js': ['express.js', 'expressjs'],
  React: ['react', 'react.js', 'reactjs'], 'Next.js': ['next.js', 'nextjs', 'next js'], Angular: ['angular', 'angularjs'], 'Vue.js': ['vue', 'vue.js', 'vuejs'],
  HTML: ['html', 'html5'], CSS: ['css', 'css3'], 'Tailwind CSS': ['tailwind', 'tailwindcss', 'tailwind css'], Bootstrap: ['bootstrap'], SASS: ['sass', 'scss'],
  Redux: ['redux'], GraphQL: ['graphql'], 'REST APIs': ['restful', 'rest api', 'rest apis'],
  MongoDB: ['mongodb', 'mongo db', 'mongo'], PostgreSQL: ['postgresql', 'postgres'], MySQL: ['mysql'], Redis: ['redis'], SQLite: ['sqlite'], Elasticsearch: ['elasticsearch'],
  Docker: ['docker'], Kubernetes: ['kubernetes', 'k8s'], AWS: ['aws', 'amazon web services'], Azure: ['azure'], 'Google Cloud': ['gcp', 'google cloud'],
  Terraform: ['terraform'], Jenkins: ['jenkins'], 'CI/CD': ['ci/cd', 'cicd', 'ci cd'], Git: ['git'], GitHub: ['github'], Linux: ['linux'], Nginx: ['nginx'],
  PyTorch: ['pytorch'], TensorFlow: ['tensorflow'], 'Scikit-learn': ['scikit-learn', 'sklearn', 'scikit learn'], Keras: ['keras'],
  Pandas: ['pandas'], NumPy: ['numpy'], 'Machine Learning': ['machine learning', 'ml'], 'Deep Learning': ['deep learning'], NLP: ['nlp', 'natural language processing'],
  'Computer Vision': ['computer vision'], MLOps: ['mlops'], MLflow: ['mlflow'], 'Hugging Face': ['hugging face', 'huggingface'], LLMs: ['llm', 'llms', 'large language models'],
  Spark: ['spark', 'pyspark'], Hadoop: ['hadoop'], Airflow: ['airflow'], Tableau: ['tableau'], 'Power BI': ['power bi', 'powerbi'], Statistics: ['statistics', 'statistical analysis'],
  Ethereum: ['ethereum'], 'Smart Contracts': ['smart contract', 'smart contracts'], 'Web3.js': ['web3.js', 'web3js'], 'ethers.js': ['ethers.js', 'ethersjs'], Hardhat: ['hardhat'],
  Blockchain: ['blockchain'], Solana: ['solana'], Polygon: ['polygon'],
  'Penetration Testing': ['penetration testing', 'pentesting', 'pen testing'], Wireshark: ['wireshark'], Splunk: ['splunk'], 'Network Security': ['network security'],
  SIEM: ['siem'], Metasploit: ['metasploit'], 'Burp Suite': ['burp suite', 'burpsuite'], Nmap: ['nmap'], CISSP: ['cissp'], CEH: ['ceh'], OSCP: ['oscp'],
  'Patient Care': ['patient care'], 'Critical Care': ['critical care'], BLS: ['bls'], ACLS: ['acls'], 'Electronic Health Records': ['ehr', 'electronic health records', 'electronic medical records'],
  Jest: ['jest'], Cypress: ['cypress'], Figma: ['figma'], Agile: ['agile', 'scrum'], Jira: ['jira'],
};

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const norm = (s) => String(s).toLowerCase().replace(/\s+/g, ' ').trim();

// alias -> canonical lookup (for canonicalizing a job's required skills)
const ALIAS_TO_CANON = new Map();
for (const [canon, aliases] of Object.entries(SKILLS)) {
  ALIAS_TO_CANON.set(norm(canon), canon);
  for (const a of aliases) ALIAS_TO_CANON.set(a, canon);
}

const aliasSet = (canon) => [norm(canon), ...(SKILLS[canon] || [])];
const regexCache = new Map();
function wordRegex(term) {
  if (!regexCache.has(term)) {
    // not preceded/followed by letters, digits, +, # (so "java" never matches "javascript", "sql" never "mysql")
    regexCache.set(term, new RegExp(`(?<![a-z0-9+#])${escapeRegex(term).replace(/ /g, '\\s+')}(?![a-z0-9+#])`));
  }
  return regexCache.get(term);
}
const textHas = (text, terms) => terms.some((t) => wordRegex(t).test(text));

function normalizeText(raw) {
  return String(raw || '').slice(0, 200000).toLowerCase().replace(/[\u2010-\u2015]/g, '-').replace(/\s+/g, ' ');
}

// Every dictionary skill that appears in the resume
function extractSkills(rawText) {
  const text = normalizeText(rawText);
  return Object.keys(SKILLS).filter((canon) => textHas(text, aliasSet(canon)));
}

// Compare a job's required skills with the resume text.
function scoreResume(rawText, requiredSkills) {
  const text = normalizeText(rawText);
  const extractedSkills = extractSkills(rawText);
  const required = [...new Set((requiredSkills || []).map((s) => String(s).trim()).filter(Boolean))];
  const MIN_TEXT_CHARS = 20; // below this the PDF is treated as unreadable (scanned image, blank, etc.)
  if (text.replace(/\s/g, '').length < MIN_TEXT_CHARS || required.length === 0) {
    return { status: 'unavailable', matchScore: 0, extractedSkills, matchedSkills: [], missingSkills: required };
  }
  const matched = [];
  const missing = [];
  for (const skill of required) {
    const canon = ALIAS_TO_CANON.get(norm(skill));
    const terms = canon ? aliasSet(canon) : [norm(skill)];
    (textHas(text, terms) ? matched : missing).push(skill);
  }
  return {
    status: 'scored',
    matchScore: Math.round((matched.length / required.length) * 100), // matched / required, e.g. 4/5 = 80
    extractedSkills,
    matchedSkills: matched,
    missingSkills: missing,
  };
}

module.exports = { extractSkills, scoreResume, normalizeText };
