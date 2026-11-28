# TrustPay AI — Project Rules & Architecture

## Tech Stack & Standards
- Next.js App Router + TypeScript (`strict`), Tailwind CSS, PWA (`public/manifest.json`, `public/sw.js`).
- Typography: `Be Vietnam Pro` (Vietnamese UI), `Inter` with `tabular-nums` (amounts), `JetBrains Mono` (account numbers, hashes, TLV). Color palette: Obsidian Slate (`#090D16`).
- Non-custodial payment architecture: real bank account linking (PVcomBank, Vietcombank, MB, MoMo), EMVCo VietQR (CRC-16/CCITT-FALSE), banking deep links (`dl.vietqr.io/pay`, `momo://`), and universal iOS/Android camera QR scanner (`jsqr` + `BarcodeDetector`).

## Mandatory Security & Compliance Rules
- Enforce Circular 50 NHNN biometric thresholds: require WebAuthn/biometric verification for transactions >= 10,000,000 VND or daily cumulative >= 20,000,000 VND.
- Never break existing fraud & injection test suites (`F01–F27`).
- Guard all browser-only APIs (`window`, `localStorage`, `navigator.mediaDevices`, `navigator.credentials`) against SSR hydration mismatches.

## Verification Checklist (Run Before Every Commit)
1. `npx next typegen && npx tsc --noEmit`
2. `npm run test:fraud && npm run test:injection`
3. `npm run build`
4. Commit and push to `main` (auto-deploys to Vercel).
