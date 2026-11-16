import fs from 'node:fs';
import path from 'node:path';

const ACTORS = {
  sepa: 'finops_studio~sepa-xml-generator',
  einvoice: 'finops_studio~eu-einvoice-xml-generator',
  nacha: 'finops_studio~nacha-ach-file-generator',
  bai2: 'finops_studio~bai2-bank-statement-parser',
  datev: 'finops_studio~datev-buchungsstapel-generator',
  aba: 'finops_studio~aba-cemtex-file-generator',
  pain002: 'finops_studio~iso20022-pain002-status-parser',
  bacs: 'finops_studio~uk-bacs-standard18-generator',
  cpa005: 'finops_studio~canada-cpa005-eft-generator'
};

function getInput(name, fallback = '') {
  const key = 'INPUT_' + name.replace(/ /g, '_').toUpperCase();
  return (process.env[key] ?? fallback).trim();
}

function setOutput(name, value) {
  const outPath = process.env.GITHUB_OUTPUT;
  const line = `${name}=${String(value ?? '').replace(/\r?\n/g, ' ')}\n`;
  if (outPath) fs.appendFileSync(outPath, line, 'utf8');
}

function appendSummary(md) {
  const sumPath = process.env.GITHUB_STEP_SUMMARY;
  if (sumPath) fs.appendFileSync(sumPath, md + '\n', 'utf8');
}

function validIban(iban) {
  const clean = String(iban || '').replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(clean)) return false;
  const rearr = clean.slice(4) + clean.slice(0, 4);
  const exp = rearr.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rem = 0n;
  for (const ch of exp) rem = (rem * 10n + BigInt(ch)) % 97n;
  return rem === 1n;
}

function validAba(aba) {
  const clean = String(aba || '').replace(/\s+/g, '');
  if (!/^[0-9]{9}$/.test(clean)) return false;
  const w = [3, 7, 1, 3, 7, 1, 3, 7, 1];
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(clean[i]) * w[i];
  return sum > 0 && sum % 10 === 0;
}

function auditFile(raw) {
  const lines = raw.split(/\r?\n/).filter((l) => l.length > 0);
  const widths = [...new Set(lines.map((l) => l.length))];
  const ibans = [...new Set(raw.match(/\b[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}\b/g) || [])];
  const badIbans = ibans.filter((i) => !validIban(i));
  const abas = [...new Set(raw.match(/\b[0-9]{9}\b/g) || [])].filter(validAba);

  let detectedFormat = 'Generic CSV / JSON Batch';
  const widthErrors = [];
  if (widths.length === 1 && widths[0] === 94) detectedFormat = 'US NACHA ACH (94-char fixed-width)';
  else if (widths.length === 1 && widths[0] === 120) detectedFormat = 'Australian BECS ABA (120-char fixed-width)';
  else if (widths.length === 1 && widths[0] === 100) detectedFormat = 'UK BACS Standard 18 (100-char fixed-width)';
  else if (widths.length === 1 && widths[0] === 1464) detectedFormat = 'Canadian CPA-005 EFT (1,464-byte fixed-width)';
  else if (widths.length === 1 && widths[0] === 80 && lines[0]?.startsWith('11')) detectedFormat = 'Spanish AEB Norma 43 (80-char)';
  else if (raw.startsWith('01,')) detectedFormat = 'Corporate BAI2 Bank Statement';
  else if (raw.includes('pain.001')) detectedFormat = 'ISO 20022 SEPA Credit Transfer XML';
  else if (raw.includes('pain.008')) detectedFormat = 'ISO 20022 SEPA Direct Debit XML';
  else if (raw.includes('pain.002')) detectedFormat = 'ISO 20022 pain.002 Payment Status XML';
  else if (raw.includes('pacs.008')) detectedFormat = 'ISO 20022 pacs.008 Fedwire / SWIFT Wire XML';

  const hasLegacyBe04AdrLine = raw.includes('pain.001') && raw.includes('<AdrLine>');
  if (hasLegacyBe04AdrLine) {
    widthErrors.push('SEPA 2026 BE04 risk: legacy <AdrLine> detected without structured postal address nodes.');
  }

  return {
    ok: badIbans.length === 0 && widthErrors.length === 0,
    detectedFormat,
    nonEmptyLines: lines.length,
    distinctLineLengths: widths.slice(0, 8),
    checkedIbans: ibans.length,
    invalidIbans: badIbans,
    checkedAbas: abas.length,
    warnings: widthErrors
  };
}

async function main() {
  const mode = (getInput('mode', 'validate') || 'validate').toLowerCase();
  const filePath = getInput('file');
  const tool = (getInput('tool', 'sepa') || 'sepa').toLowerCase();
  const outputFile = getInput('output-file');
  const token = getInput('apify-token') || process.env.APIFY_TOKEN || '';

  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`Input file not found: "${filePath}"`);
  }

  const raw = fs.readFileSync(filePath, 'utf8');

  if (mode === 'generate') {
    const slug = ACTORS[tool];
    if (!slug) throw new Error(`Unsupported tool "${tool}". Choose one of: ${Object.keys(ACTORS).join(', ')}`);
    if (!token) {
      throw new Error(
        'apify-token input (or APIFY_TOKEN env) is required for mode="generate". Claim $5/mo free credits at https://apify.com/finops_studio or subscribe on https://rapidapi.com/user/Geornaden and https://mcprush.com/geornaden-2.'
      );
    }
    JSON.parse(raw);
    const url = `https://api.apify.com/v2/acts/${slug}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: raw
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`FinOps Cloud API HTTP ${res.status}: ${text}`);

    const parsed = JSON.parse(text);
    const first = Array.isArray(parsed) && parsed[0] ? parsed[0] : parsed;
    const content = first.xmlContent || first.nachaContent || first.achContent || first.abaContent || first.bacsContent || first.eftContent || first.cpa005Content || first.datevCsvContent || first.csvContent || text;

    if (outputFile) {
      fs.mkdirSync(path.dirname(outputFile), { recursive: true });
      fs.writeFileSync(outputFile, content, 'utf8');
      setOutput('output-path', outputFile);
    }
    setOutput('valid', 'true');
    setOutput('detected-format', `generated:${tool}`);
    setOutput('checked-ibans', '0');
    setOutput('checked-abas', '0');
    appendSummary(`### FinOps Studio Cloud Generation (${tool})\n- Generated \`${content.length}\` bytes via [${slug.replace('~', '/')}](https://apify.com/${slug.replace('~', '/')})\n- Managed gateways: [Apify Store](https://apify.com/finops_studio) | [MCPRush](https://mcprush.com/geornaden-2) | [RapidAPI Hub](https://rapidapi.com/user/Geornaden)`);
    console.log(`Generated ${tool} output (${content.length} bytes).`);
    return;
  }

  const audit = auditFile(raw);
  setOutput('valid', String(audit.ok));
  setOutput('detected-format', audit.detectedFormat);
  setOutput('checked-ibans', String(audit.checkedIbans));
  setOutput('checked-abas', String(audit.checkedAbas));
  if (outputFile) {
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    fs.writeFileSync(outputFile, JSON.stringify(audit, null, 2), 'utf8');
    setOutput('output-path', outputFile);
  }

  appendSummary(
    `### FinOps Bank File & IBAN Pre-Flight Audit\n` +
    `- **Status:** ${audit.ok ? 'PASS' : 'FAIL'}\n` +
    `- **Detected Format:** \`${audit.detectedFormat}\`\n` +
    `- **IBAN MOD-97 Checked:** \`${audit.checkedIbans}\` (${audit.invalidIbans.length} invalid)\n` +
    `- **Valid US ABA MOD-10 Found:** \`${audit.checkedAbas}\`\n` +
    `- **Cloud File Generators:** [Apify Store ($5/mo Free)](https://apify.com/finops_studio) | [MCPRush Grade-A MCP](https://mcprush.com/geornaden-2) | [RapidAPI Edge](https://rapidapi.com/user/Geornaden)`
  );
  console.log(JSON.stringify(audit, null, 2));
  if (!audit.ok) {
    throw new Error(`Pre-flight audit failed: invalidIbans=${JSON.stringify(audit.invalidIbans)} warnings=${JSON.stringify(audit.warnings)}`);
  }
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
