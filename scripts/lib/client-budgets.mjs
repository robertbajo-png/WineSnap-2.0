export const clientBudgets = { ".js": 200 * 1024, ".css": 40 * 1024 };

export function clientBudgetIssues(assets) {
  const issues = [];
  for (const [extension, budget] of Object.entries(clientBudgets)) {
    const matching = assets.filter((asset) => asset.name.endsWith(extension));
    if (!matching.length) issues.push(`missing:${extension}`);
    for (const asset of matching) {
      if (!Number.isSafeInteger(asset.gzipBytes) || asset.gzipBytes <= 0) {
        issues.push(`invalid:${asset.name}`);
      } else if (asset.gzipBytes > budget) {
        issues.push(`oversize:${asset.name}`);
      }
    }
  }
  return issues;
}
