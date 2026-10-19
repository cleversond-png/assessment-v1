// Pesos do design.md para o score final focado em Copilot.
// Entra, SharePoint e Governança pesam 2. Baseline, e-mail e Teams pesam 1.
// iaReadiness fica de fora: é calculado a partir dos outros domínios.
const DOMAIN_WEIGHTS = {
  baseline: 1,
  entraId: 2,
  sharePoint: 2,
  governance: 2,
  emailSecurity: 1,
  teams: 1,
};

function calculateOverallScore(domainResults = {}) {
  let weightedSum = 0;
  let usedWeight = 0;
  for (const [name, weight] of Object.entries(DOMAIN_WEIGHTS)) {
    const score = domainResults[name]?.domainScore;
    if (typeof score !== 'number') continue;
    weightedSum += score * weight;
    usedWeight += weight;
  }
  if (usedWeight === 0) return null;
  return Math.round((weightedSum / usedWeight) * 10) / 10;
}

module.exports = { calculateOverallScore, DOMAIN_WEIGHTS };
