<p align="center">
  <img src="frontend/public/logo.svg" width="128" alt="Lex Machina golden seal" />
</p>

<h1 align="center">Lex Machina</h1>

<p align="center">
  <strong>Law from the machine.</strong> A self-governing protocol — supervising
  other contracts, verifying exploits through AI-validator consensus, then tuning
  and rewriting its own rules. With no one voting.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/GenLayer-Studionet_61999-C9A227?style=flat-square" alt="Studionet 61999" />
  <img src="https://img.shields.io/badge/tests-29_passed-0E7A6D?style=flat-square" alt="29 tests passed" />
  <img src="https://img.shields.io/badge/frontend-Vite_%2B_React-171309?style=flat-square" alt="Vite + React" />
  <img src="https://img.shields.io/badge/curated_by-AI_consensus-6D28D9?style=flat-square" alt="AI consensus" />
</p>

<p align="center">
  <a href="#live-deployment-studionet"><strong>Live Deployment</strong></a> ·
  <a href="#combined-end-to-end-flow">How It Works</a> ·
  <a href="#decentralized-ai-curator">AI Curator</a> ·
  <a href="#deploy-frontend-vercel">Deploy to Vercel</a>
</p>

> Hackathon theme: **Autonomous Protocols**
> *Systems that run themselves. If a contract pauses, tunes or rewrites another
> contract or its own rules with no one voting, it belongs here.*

---

## Live deployment (Studionet)

| Component | Address |
|---|---|
| Governor (v4: profile + listing queue) | `0x3d0d407Ce907032fa3A48E37cd528b6DD2066ca0` |
| ProtocolVault (Vault-1) | `0x5E29D389a7579aA1c06573E790fA88E8240082bE` |
| Curator (AI curation) | `0x4bc6BCaeDA073602ec3fEd2DD78162077dB333f9` |
| Deployer wallet | `hackaton-ap2026` (`0xbf6c68d4d99a866870f4db9f9ad4ac64eda42007`) |

Demo deep-link (local frontend):

```text
http://localhost:5173/#/console?gov=0x3d0d407Ce907032fa3A48E37cd528b6DD2066ca0&net=studionet
```

Governor directory: `http://localhost:5173/#/governors` (Governor v4 AI-verified, score 80).

---

## Architecture

```text
┌─────────────────────────┐
│        Governor         │
│  (self-governing core)  │
│                         │
│  register_protocol      │────▶ register & monitor protocols
│  request/approve listing│────▶ listing queue + owner curation
│  propose_halt           │────▶ exploit adjudication via LLM consensus → pause
│  prove_safe             │────▶ safety adjudication → resume
│  monitor_and_tune       │────▶ set threshold + rewrite rules
│  governor profile       │────▶ on-chain name + description
└────────────┬────────────┘
             │  view() / emit()
             ▼
┌─────────────────────────┐
│     ProtocolVault       │
│   (governed target)     │
│                         │
│  deposit / withdraw     │  (blocked while paused)
│  pause / unpause        │  (Governor only)
│  get_state / is_paused  │
└─────────────────────────┘

┌─────────────────────────┐
│         Curator         │
│ (decentralized AI       │
│  curation)              │
│                         │
│  submit_governor        │────▶ rubric review via LLM consensus → score 0-100
│  get_listed_governors   │────▶ verified governor directory + score badges
└─────────────────────────┘
```

**Access rules:**
- `register_protocol`, `approve/reject_listing`, `set_protocol_description`,
  `set_governor_profile` — Governor owner only.
- `request_listing` — anyone (protocol must be compatible: exposes `get_state`
  and declares this Governor); listing goes live only after approval.
- `propose_halt`, `prove_safe`, `monitor_and_tune` — permissionless (anyone may
  submit), but execution happens only if **validator consensus approves**.
- `submit_governor` / re-review on the Curator — only the submitted governor's owner.

The Vault holds simulated deposits (no real token transfers/payouts).

---

## Combined end-to-end flow

1. **Wallet & network connection** — connect MetaMask/Rabby via EIP-6963.
   The app reads the actually-detected wallet list, requests an account,
   then forces the wallet onto the selected GenLayer network. No private key
   is ever created or stored by the app.
2. **Built-in Governor** — on Studionet, the live Governor address is embedded per
   network; it can be manually overridden for other deployments.
3. **Reading governance state** — risk threshold, rules version, tune count,
   exploit count, protocol count, and rules text are read straight from the contract.
4. **Register protocol** — the Governor owner registers the vault (owner-only)
   with an optional label and description; both are stored on-chain and
   readable via `get_protocol_label` / `get_protocol_description`.
   One Governor can govern many protocols; repeat registration per contract.
   Each protocol is tracked, read, and halted independently.
4b. **Request listing** — anyone can submit a compatible protocol
   (exposes `get_state` + declares this Governor); the owner approves/rejects
   from the Listing requests panel. The requested label + description are stored
   on-chain upon approval.
4c. **Governor directory** — a Governor owner submits their deployment to the
   Curator; AI validators score a rubric (identity, rules, threshold,
   live protocols) 0–100. Scores at or above the bar appear on the Governors page
   with a score badge. No human gatekeeper.

## Decentralized AI curator

`contracts/Curator.py` — a contract that judges whether other Governors are
listable, through LLM-validator consensus. The flow:

1. **Submit** — `submit_governor(addr)`; only the submitted governor's owner
   (checked on-chain via `get_governance_state`) can submit.
2. **AI review** — validators score the governor's on-chain snapshot against a rubric:
   meaningful name (0–25), meaningful description (0–25), sane rules (0–20),
   threshold within 1–200 (0–10), live protocols (0–20). Validators agree when the
   listed verdict matches and scores differ by ≤ 12.
3. **Listed + badge** — scores ≥ `min_score` (default 70) appear in
   `get_listed_governors` with name, description, and live stats.
4. **Re-review** — owners can request a re-score; the Curator owner can emergency
   `delist` and set `min_score` (1–100).

Nondet blocks only touch locals + `gl.nondet` (parse helpers live at module
level) per GenLayer's storage docs — no pickling-storage warnings.

## Building your own protocol

Any GenLayer contract can become a Governor-governed protocol. Copy
`contracts/ProtocolVault.py` as a template and keep four things:

1. A constructor that stores its Governor's address.
2. `pause()` — blocks sensitive actions (deposit/withdraw/etc).
3. `unpause()` — reopens them.
4. `get_state()` — a view including the governor address (listing-compatibility requirement).

Only the Governor may call `pause`/`unpause` — enforce it inside the
contract (like the Vault does: check `gl.message.sender_address == governor`). Then
`genvm-lint check`, write/extend tests, deploy, and register from the Console.

---
5. **Report exploit / emergency halt** — anyone submits a claim + evidence.
   LLM validators judge the evidence independently; if consensus confirms,
   the Governor flags halt and pauses the vault via `emit`.
6. **Prove safe / resume** — after a fix, a safety adjudication unpauses.
7. **Autonomous monitor & tune** — the Governor reads every protocol's metrics, the LLM
   picks `tighten` / `relax` / `hold`; on change, threshold, version,
   counter, and rules text update with no vote.
8. **Protocol detail page** — status, stats, actions, address/link copying,
   and per-protocol transaction history.
9. **Duplicate instance** — reads a protocol's contract code from the chain, deploys
   an exact copy, then registers it (registration still needs the owner).
10. **Transactions & audit** — every action is tracked (pending → accepted → finalized),
    with drill-down detail: validator votes, execution result, triggered tx,
    stdout/stderr, and explorer links.

---

## Running the frontend

```bash
cd frontend
npm install
npm run dev
# open http://localhost:5173
```

Ready-made data (Studionet):

- Governor: `0x3d0d407Ce907032fa3A48E37cd528b6DD2066ca0`
- Vault: `0x5E29D389a7579aA1c06573E790fA88E8240082bE`
- Curator: `0x4bc6BCaeDA073602ec3fEd2DD78162077dB333f9`
- Sample claim: `Reentrancy allows repeated withdrawals before balance updates`
- Sample evidence: `Call trace shows repeated withdraw transfers with only one balance deduction`
- Sample safe reason: `Patch deployed, balances reconciled, re-audit completed; no active drain path remains`

Pages: `/` (landing), `/governors` (AI-curated directory), `/how-it-works` (guide), `/console` (live),
`/protocol/:addr` (protocol detail).

---

## Deploy

Via CLI (using a configured `genlayer` wallet):

```bash
python deploy/deploy.py --network studionet
```

Via the `genlayer-js` script (operator key through the environment, never commit it):

```bash
DEPLOYER_PRIVATE_KEY=0x... node deploy/deploy-frontend.mjs studionet
```

The script prints a console deep-link with the Governor pre-filled.

## Deploy frontend (Vercel)

Repo: `https://github.com/dhozil/Lex-Machina`

1. Push this repo to GitHub.
2. In Vercel: Add New → Project → import `dhozil/Lex-Machina`.
3. **Root Directory:** `frontend`. Framework preset: Vite. Build Command:
   `npm run build`. Output Directory: `dist`. No environment variables.
4. `frontend/vercel.json` already maps `/rpc/studionet|testnet_asimov|testnet_bradbury`
   to the real RPCs (server-side proxy, CORS-free). Localnet only works in dev
   (`vite.config.ts`), because Vercel cannot reach `127.0.0.1`.

---

## Verification

- `genvm-lint check contracts/Governor.py` — passes
- `genvm-lint check contracts/ProtocolVault.py` — passes
- `gltest tests/` — **29 passed** (20 direct + 9 integration)
- Live Studionet: register, halt, resume, and tune verified end-to-end
- Frontend: clean `tsc --noEmit`, successful `npm run build`

Hardening from GenLayer staff review:

- No float division in consensus logic (`lv <= 2*vv`, integer math).
- Claim/evidence/reason must be non-empty (plus length caps).
- Comparative validators (re-run + compare verdicts), not leader-only.
- LLM `reasoning` is never stored/used for decisions.
- Runner version pinned (`py-genlayer:1jb45aa8…`).
- Prompt-injection framing: user inputs treated as untrusted data with delimiters.
- Nondet blocks never touch contract storage (module-level helpers).

---

## Repo structure

```text
contracts/            Governor.py, ProtocolVault.py, Curator.py
deploy/               deploy.py, deploy-frontend.mjs
frontend/             Vite + React + TS + genlayer-js
tests/                direct/ + integration/
gltest.config.yaml    test network config
```

## Security notes

- The frontend never asks for or stores private keys; signing happens via wallet extensions.
- Don't use a wallet holding valuable funds for demos unless necessary.
- Always verify the Governor address, network, and receipts in the explorer.
- Browser transaction history is local metadata only, not on-chain proof.
