/**
 * Secret Scanner for DevOneStack
 * Scans content for passwords, API keys, tokens, and credentials before making a Space public.
 */

const SECRET_PATTERNS = [
  { name: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/i },
  { name: 'GitHub Personal Access Token', regex: /ghp_[a-zA-Z0-9]{36}/ },
  { name: 'GitHub OAuth Token', regex: /gho_[a-zA-Z0-9]{36}/ },
  { name: 'Slack Token', regex: /xox[baprs]-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24}/ },
  { name: 'Private Key', regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/ },
  { name: 'Database Connection String', regex: /mongodb(?:\+srv)?:\/\/[^\s:]+:[^\s@]+@[^\s/]+/i },
  { name: 'Generic API Key / Secret', regex: /(?:api[_-]?key|secret[_-]?key|auth[_-]?token|bearer)\s*[:=]\s*['"][a-zA-Z0-9_\-]{20,}['"]/i },
  { name: 'Hardcoded Password', regex: /(?:password|passwd|pwd)\s*[:=]\s*['"][^'"]{8,}['"]/i },
];

/**
 * Scans a string or an object for secret patterns.
 * @param {string|object} content 
 * @returns {{ hasSecrets: boolean, findings: string[] }}
 */
export function scanForSecrets(content) {
  if (!content) return { hasSecrets: false, findings: [] };

  const textToScan = typeof content === 'string' ? content : JSON.stringify(content);
  const findings = [];

  for (const pattern of SECRET_PATTERNS) {
    if (pattern.regex.test(textToScan)) {
      findings.push(pattern.name);
    }
  }

  return {
    hasSecrets: findings.length > 0,
    findings: [...new Set(findings)]
  };
}
