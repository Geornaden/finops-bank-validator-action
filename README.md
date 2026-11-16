# FinOps Bank File & IBAN Pre-Flight Validator (GitHub Action)

[![FinOps Studio — 9 Live Banking, Payroll & E-Invoice APIs MCP on mcprush](https://mcprush.com/badge/finops-studio-banking-payroll-e-invoicing-mcp/score.svg)](https://mcprush.com/to/finops-studio-banking-payroll-e-invoicing-mcp?ref=badge)

Deterministic GitHub Action to **validate IBANs (MOD-97), US ABA routing numbers (MOD-10), SEPA 2026 `BE04` structured addresses, and fixed-width bank batch files (`NACHA` 94-char, `AU ABA` 120-char, `UK BACS 18` 100-char, `CA CPA-005` 1,464-byte, `Norma 43` 80-char, `BAI2`)** right inside Pull Requests and scheduled treasury pipelines.

---

## Quickstart: Validate Bank Files & IBANs on Every PR (`Free Offline Mode`)

```yaml
name: Banking & Treasury Pre-Flight Audit
on: [pull_request]

jobs:
  audit-bank-batch:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: Geornaden/finops-bank-validator-action@v1
        with:
          mode: validate
          file: ./batches/friday-payouts.csv
```

## Scheduled Nightly File Generation (`SEPA XML`, `Peppol E-Invoice`, `NACHA ACH`, `DATEV EXTF`, `UK BACS`, `AU ABA`, `CA CPA-005`)

Connect directly to FinOps Studio's deterministic Cloud APIs (`$0/mo` subscription + `$5/mo` free starter credits on [Apify Store](https://apify.com/finops_studio)):

```yaml
- uses: Geornaden/finops-bank-validator-action@v1
  with:
    mode: generate
    tool: sepa
    file: ./batches/sepa-payload.json
    output-file: ./out/sepa-pain001.xml
    apify-token: ${{ secrets.APIFY_TOKEN }}
```

## Cloud Gateways & Links
- **Cloud Batch APIs ($5/mo Free Credits):** <https://apify.com/finops_studio>
- **MCPRush Remote MCP & Agent Skill Packs (Grade A):** <https://mcprush.com/geornaden-2>
- **RapidAPI Edge Subscriptions (<10ms):** <https://rapidapi.com/user/Geornaden>
- **Full Documentation & Free Browser Tools:** <https://geornaden.github.io/finops-studio/>
