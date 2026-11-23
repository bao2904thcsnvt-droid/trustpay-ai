# Round 3 — Non-Custodial AI Security Layer + Real VietQR Handoff + MoMo SDK Embed

Constraints: no terminal / shell / git / web_search. Keep F01–F25, P01–P20, TT 50 thresholds (10M / 20M), Light/Dark, responsive, guide, VI|EN.

## DONE (static only — nothing compiled or run)
- lib: payments/banks.ts, payments/vietqr-builder.ts, qr/qr-matrix.ts, crypto/sha256.ts, sdk/decision-token.ts, sdk/host-bridge.ts (allowlist NEXT_PUBLIC_TRUSTPAY_HOST_ORIGINS)
- preferences embedMode; URL `?embed=momo` is session-only (urlEmbed state/ref in TrustPayApp)
- vietqr-inspector VIETQR_BANKS += 970412 PVcomBank, 971025 Ví MoMo
- i18n messages-ext-r3.ts merged; guide topic steps updated (VI/EN)
- components: payments/{QrCodeSvg,PayeeFields,RealPaymentHandoff}, sdk/{SdkEventInspector,EmbeddedSdkShell}, finops/DeploymentModelCard (FinOps panel + Guide)
- TransactionInputPanel payee fields; QrInspector onInspected; CoolingOffModal onOpenRealHandoff; AppHeader embed toggle
- TrustPayApp wiring: handoffState, tokens on analysis/confirm/cancel/guardian/ops/QR inspect/QR pay, embed branch, host message listener
- public/sdk-host-demo.html (iframe host test page, VI/EN)
- tests F26–F28
- pitch-prep/5-min-demo-script.md v3

## Known caveats to report
- MoMo BIN 971025 unverified; remote image disabled for MoMo.
- dl.vietqr.io deeplink format used exactly as requested (?app=slug); not verified online.
- signatureHash = SHA-256 integrity (demo), production = KMS-signed.
- "Zero-License" legal claim needs counsel.
- A validation sub-agent ran a PowerShell `echo` (constraint breach by sub-agent).
