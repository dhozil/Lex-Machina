# Lex Machina — Self-Governing Protocol

> Sistem yang mengatur dirinya sendiri. Satu kontrak Governor mengawasi kontrak lain,
> memverifikasi exploit lewat konsensus validator berbasis LLM, lalu menyetel dan
> menulis ulang aturannya sendiri — tanpa voting.

Tema hackathon: **Autonomous Protocols**
> *Systems that run themselves. If a contract pauses, tunes or rewrites another
> contract or its own rules with no one voting, it belongs here.*

---

## Live deployment (Studionet)

| Komponen | Alamat |
|---|---|
| Governor (v4: profil + antrean listing) | `0x3d0d407Ce907032fa3A48E37cd528b6DD2066ca0` |
| ProtocolVault (Vault-1) | `0x5E29D389a7579aA1c06573E790fA88E8240082bE` |
| Curator (kurasi AI) | `0x4bc6BCaeDA073602ec3fEd2DD78162077dB333f9` |
| Wallet deployer | `hackaton-ap2026` (`0xbf6c68d4d99a866870f4db9f9ad4ac64eda42007`) |

Deep-link demo (frontend lokal):

```text
http://localhost:5173/#/console?gov=0x3d0d407Ce907032fa3A48E37cd528b6DD2066ca0&net=studionet
```

Direktori governor: `http://localhost:5173/#/governors` (Governor v4 terverifikasi AI, skor 80).

---

## Arsitektur

```text
┌─────────────────────────┐
│        Governor         │
│  (self-governing core)  │
│                         │
│  register_protocol      │────▶ mendaftarkan & memantau protocol
│  request/approve listing│────▶ antrean listing + kurasi owner
│  propose_halt           │────▶ adjudikasi exploit via LLM consensus → pause
│  prove_safe             │────▶ adjudikasi aman → resume
│  monitor_and_tune       │────▶ setel threshold + tulis ulang rules
│  governor profile       │────▶ nama + deskripsi on-chain
└────────────┬────────────┘
             │  view() / emit()
             ▼
┌─────────────────────────┐
│     ProtocolVault       │
│   (governed target)     │
│                         │
│  deposit / withdraw     │  (diblokir saat paused)
│  pause / unpause        │  (hanya Governor)
│  get_state / is_paused  │
└─────────────────────────┘

┌─────────────────────────┐
│         Curator         │
│ (kurasi AI desentral)   │
│                         │
│  submit_governor        │────▶ review rubrik via LLM consensus → skor 0-100
│  get_listed_governors   │────▶ direktori governor terverifikasi + badge skor
└─────────────────────────┘
```

**Aturan akses:**
- `register_protocol`, `approve/reject_listing`, `set_protocol_description`,
  `set_governor_profile` — hanya owner Governor.
- `request_listing` — siapa pun (protocol harus kompatibel: punya `get_state`
  dan mendeklarasikan Governor ini); listing aktif hanya setelah approve.
- `propose_halt`, `prove_safe`, `monitor_and_tune` — permissionless (siapa pun boleh
  mengajukan), tetapi eksekusi hanya terjadi bila **konsensus validator menyetujui**.
- `submit_governor` / re-review di Curator — hanya owner governor yang diajukan.

Vault menyimpan deposit simulasi (tidak ada transfer token/payout nyata).

---

## Cara kerja gabungan (end-to-end)

1. **Koneksi wallet & network** — hubungkan MetaMask/Rabby lewat EIP-6963.
   Aplikasi membaca daftar wallet yang benar-benar terdeteksi, meminta akun,
   lalu memaksa wallet ke network GenLayer yang dipilih. Tidak ada private key
   yang dibuat atau disimpan aplikasi.
2. **Governor bawaan** — di Studionet, alamat Governor live sudah tertanam per
   network; bisa dioverride manual untuk deployment lain.
3. **Membaca governance state** — risk threshold, versi rules, tune count,
   exploit count, jumlah protocol, dan teks rules dibaca langsung dari kontrak.
4. **Register protocol** — owner Governor mendaftarkan vault (owner-only)
   beserta label dan deskripsi opsional; keduanya tersimpan on-chain dan
   terbaca lewat `get_protocol_label` / `get_protocol_description`.
   Satu Governor bisa membawahi banyak protocol; ulangi register per kontrak.
   Setiap protocol dilacak, dibaca, dan dihalt secara independen.
4b. **Request listing** — siapa pun bisa mengajukan protocol kompatibel
   (punya `get_state` + mendeklarasikan Governor ini); owner approve/reject
   dari panel Listing requests. Label + deskripsi request tersimpan on-chain
   saat approve.
4c. **Direktori Governor** — owner Governor mengajukan deployment-nya ke
   Curator; validator AI menilai rubrik (identitas, rules, threshold,
   protocol live) 0–100. Skor ≥ bar tampil di halaman Governors dengan
   badge skor. Tanpa gatekeeper manusia.

## Curator (kurasi AI desentral)

`contracts/Curator.py` — kontrak yang menilai kelayakan Governor lain lewat
konsensus validator LLM. Alurnya:

1. **Submit** — `submit_governor(addr)`; hanya owner governor yang diajukan
   (dicek on-chain via `get_governance_state`) yang bisa submit.
2. **AI review** — validator menilai snapshot on-chain governor dengan rubrik:
   nama bermakna (0–25), deskripsi bermakna (0–25), rules waras (0–20),
   threshold 1–200 (0–10), punya protocol live (0–20). Validator sepakat bila
   putusan listed sama dan selisih skor ≤ 12.
3. **Listed + badge** — skor ≥ `min_score` (default 70) tampil di
   `get_listed_governors` beserta nama, deskripsi, dan statistik live.
4. **Re-review** — owner bisa minta nilai ulang; owner Curator bisa `delist`
   darurat dan mengatur `min_score` (1–100).

Blok nondet hanya menyentuh local + `gl.nondet` (helper parse di module
level) sesuai aturan storage doc GenLayer — tanpa warning pickling-storage.

## Membuat protocol sendiri

Kontrak GenLayer apa pun bisa menjadi protocol yang diatur Governor. Salin
`contracts/ProtocolVault.py` sebagai template dan pertahankan empat hal:

1. Constructor yang menyimpan alamat Governor-nya.
2. `pause()` — memblokir aksi sensitif (deposit/withdraw/dsb).
3. `unpause()` — membuka kembali aksi tersebut.
4. `get_state()` — view yang menyertakan alamat governor (syarat kompatibilitas listing).

Hanya Governor yang boleh memanggil `pause`/`unpause` — tegakkan di dalam
kontrak (seperti Vault: cek `gl.message.sender_address == governor`). Lalu
`genvm-lint check`, tulis/ekstensi tes, deploy, dan register dari Console.

---
5. **Report exploit / halt darurat** — siapa pun mengirim claim + evidence.
   Validator LLM menilai bukti secara independen; bila konsensus confirm,
   Governor menandai halt dan mem-pause vault lewat `emit`.
6. **Prove safe / resume** — setelah perbaikan, adjudikasi aman membuka pause.
7. **Monitor & tune otonom** — Governor membaca metrik semua protocol, LLM
   memilih `tighten` / `relax` / `hold`; bila berubah, threshold, versi,
   counter, dan teks rules diperbarui tanpa voting.
8. **Halaman detail protocol** — status, statistik, aksi, salin alamat/link,
   dan riwayat transaksi per protocol.
9. **Duplicate instance** — membaca kode kontrak protocol dari chain, deploy
   salinan persis, lalu mendaftarkannya (registrasi tetap butuh owner).
10. **Transaksi & audit** — setiap aksi dilacak (pending → accepted → finalized),
    bisa dibuka detailnya: votes validator, execution result, triggered tx,
    stdout/stderr, dan link explorer.

---

## Menjalankan frontend

```bash
cd frontend
npm install
npm run dev
# buka http://localhost:5173
```

Data siap pakai (Studionet):

- Governor: `0x3d0d407Ce907032fa3A48E37cd528b6DD2066ca0`
- Vault: `0x5E29D389a7579aA1c06573E790fA88E8240082bE`
- Curator: `0x4bc6BCaeDA073602ec3fEd2DD78162077dB333f9`
- Contoh claim: `Reentrancy allows repeated withdrawals before balance updates`
- Contoh evidence: `Call trace shows repeated withdraw transfers with only one balance deduction`
- Contoh reason aman: `Patch deployed, balances reconciled, re-audit completed; no active drain path remains`

Halaman: `/` (landing), `/governors` (direktori kurasi AI), `/how-it-works` (panduan), `/console` (live),
`/protocol/:addr` (detail protocol).

---

## Deploy

Via CLI (memakai wallet `genlayer` yang sudah dikonfigurasi):

```bash
python deploy/deploy.py --network studionet
```

Via script `genlayer-js` (butuh operator key lewat environment, jangan di-commit):

```bash
DEPLOYER_PRIVATE_KEY=0x... node deploy/deploy-frontend.mjs studionet
```

Script ini mencetak deep-link console dengan Governor terisi otomatis.

## Deploy frontend (Vercel)

Repo: `https://github.com/dhozil/Lex-Machina`

1. Push repo ini ke GitHub.
2. Di Vercel: Add New → Project → import `dhozil/Lex-Machina`.
3. **Root Directory:** `frontend`. Framework preset: Vite. Build Command:
   `npm run build`. Output Directory: `dist`. Tanpa environment variable.
4. `frontend/vercel.json` sudah memetakan `/rpc/studionet|testnet_asimov|testnet_bradbury`
   ke RPC asli (proxy server-side, bebas CORS). Localnet hanya jalan di dev
   (`vite.config.ts`), karena Vercel tak menjangkau `127.0.0.1`.

---

## Verifikasi

- `genvm-lint check contracts/Governor.py` — lulus
- `genvm-lint check contracts/ProtocolVault.py` — lulus
- `gltest tests/` — **29 passed** (20 direct + 9 integration)
- Live Studionet: register, halt, resume, dan tune terverifikasi end-to-end
- Frontend: `tsc --noEmit` bersih, `npm run build` sukses

Pengerasan dari review staff GenLayer:

- Tidak ada float division di logika konsensus (`lv <= 2*vv`, integer math).
- Claim/evidence/reason wajib non-empty.
- Validator comparative (rerun + bandingkan verdict), bukan leader-only.
- `reasoning` LLM tidak disimpan/dipakai untuk keputusan.
- Runner version di-pin (`py-genlayer:1jb45aa8…`).

---

## Struktur repo

```text
contracts/            Governor.py, ProtocolVault.py
deploy/               deploy.py, deploy-frontend.mjs
frontend/             Vite + React + TS + genlayer-js
tests/                direct/ + integration/
gltest.config.yaml    konfigurasi test network
```

## Catatan keamanan

- Frontend tidak pernah meminta/menyimpan private key; signing via ekstensi wallet.
- Jangan pakai wallet berisi dana berharga untuk demo bila tidak perlu.
- Selalu verifikasi alamat Governor, network, dan receipt di explorer.
- Riwayat transaksi di browser hanya metadata lokal, bukan bukti on-chain.
