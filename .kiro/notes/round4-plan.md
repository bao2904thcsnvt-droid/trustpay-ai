# Round 4 — Unified Payment Hub (Easy/Pro, Multi-bank, Paste-to-Pay, App Lock, Split Bill)

Constraints: no terminal / shell / git / web_search. Keep lib/, F01–F28, P01–P20, TT 50 (10M / 20M), all features (Safe Shopping, Subscription Guard, VietQR + PVcomBank, Call Shield, Guardian 15s, MoMo SDK, Light/Dark, PWA?, Camera QR?, Voice Copilot?, VI/EN). New data → localStorage + Reset Demo clears it.

## Step 0 — survey (verify which "existing" features really exist: PWA, Camera QR, Voice Copilot)

## Data (new persistent store `trustpay-ai.hub.v1`, reset by Reset Demo)
- linkedAccounts[] {id, institutionCode, accountNumber, holderName, label?, isDefault} — defaults PVCB ••••4128, VCB ••••9821, MB ••••5502, MOMO ••••888
- defaultSourceId
- trustedPayees[] {id, label, relation(FAMILY|SHOP|LANDLORD|OTHER), institutionCode, accountNumber, accountName, lastUsedAt?}
- uiMode stays in preferences (easy | pro) — preference, not demo data? -> user says "mọi dữ liệu mới lưu localStorage + reset": put appLock + balanceHidden + uiMode in preferences? Decide: uiMode/balanceHidden = preferences (survive reset like theme); appLock config = hub store (reset clears PIN/passkey registration).

## lib (pure, testable)
- lib/hub/hub-defaults.ts, lib/hub/hub-schema.ts (sanitize), lib/hub/hub-store.ts
- lib/hub/paste-to-pay.ts — parse chat message: bank (aliases), STK, amount (450k, 1tr2, 1.200.000đ), name, memo
- lib/hub/bill-split.ts — split total / n, remainder handling, memo
- lib/security/app-lock.ts — PIN hash (sha256 + salt), WebAuthn helpers (create/get with platform authenticator), availability check

## Components
- layout: ModeToggle (✨ Easy / ⚡ Pro) in header
- hub/LinkedAccountsBar, hub/TrustedPayees (+ save after safe transfer), hub/SplitBill, hub/EasyHome (3 giant buttons), hub/AiCheckHelper (plain-language verdict), security/AppLockGate (unlock modal: WebAuthn or PIN), BalancePrivacyToggle (eye)
- Paste-to-Pay button + Ctrl+V in TransactionInputPanel

## Wiring in TrustPayApp
- Easy mode: hide Ops tab, FinOps, SDK, telemetry; show EasyHome
- Gate: require unlock before VietQR handoff + split-bill QR when app lock enabled

## Tests F29–F31 (paste-to-pay parse, split bill, hub sanitize / PIN hash)
## Demo script update (optional mention)
