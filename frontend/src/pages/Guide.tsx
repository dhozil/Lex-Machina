import { Link } from "react-router-dom";

const STEPS = [
  {
    n: "1",
    title: "Choose a network",
    body: "Pick the network your contracts live on: Studionet (recommended, gasless), Localnet, or a testnet. The console remembers your choice.",
  },
  {
    n: "2",
    title: "Connect MetaMask or Rabby",
    body: "Click Connect wallet, pick one of the detected MetaMask/Rabby options, approve the account request, then approve switching to the selected GenLayer network. Reads work without a wallet; every write needs a connected wallet. The app never asks for or stores a private key.",
  },
  {
    n: "3",
    title: "Deploy the contracts",
    body: "Deploy the Governor and a ProtocolVault first, using the CLI or Studio. Then copy the Governor’s contract address.",
  },
  {
    n: "4",
    title: "Connect the Governor",
    body: "On Studionet the built-in Governor loads automatically after you connect a wallet. To inspect another deployment, paste its address and press Load or Use built-in to return to the default.",
  },
  {
    n: "5",
    title: "Register a protocol",
    body: "To bring a contract under governance, enter its address, a label, and an optional description, then Register (owner only). The label and description are stored on-chain. One Governor can govern many protocols — repeat this for each contract. Each is tracked, read, and halted independently. Non-owners can use Request listing instead: the owner approves or rejects from the Listing requests panel.",
  },
  {
    n: "6",
    title: "Report an exploit",
    body: "Anyone can submit a claim. Enter the protocol address, what the exploit is, and supporting evidence. Validators independently judge the evidence — if consensus confirms an active exploit, the protocol is halted.",
  },
  {
    n: "7",
    title: "Prove safe",
    body: "After a fix, submit “Prove safe” on a halted protocol. Validators verify it’s genuinely safe, and the protocol is resumed.",
  },
  {
    n: "8",
    title: "Monitor & tune",
    body: "Press “Monitor & tune” to let the Governor assess health across its protocols and, if warranted, raise or lower its own risk threshold and rewrite its rules — with no vote.",
  },
  {
    n: "9",
    title: "Browse and promote governors",
    body: "Open Governors to see AI-verified deployments with their trust scores. Governor owners can set their on-chain name and description from the console, then submit the deployment for AI review — no human decides what gets promoted.",
  },
];

const STATUSES = [
  { name: "Healthy", color: "teal", desc: "The protocol is live and not paused or halted." },
  { name: "Paused", color: "amber", desc: "A halt was requested; deposits/withdrawals are blocked until resumed." },
  { name: "Halted", color: "ember", desc: "Validators verified an active exploit. The protocol is frozen and can only resume via “Prove safe”." },
];

const TX_STATUSES = [
  { name: "Pending", desc: "The transaction is submitted and awaiting consensus." },
  { name: "Accepted", desc: "Initial consensus accepted the outcome." },
  { name: "Finalized", desc: "The decision is final — the state change is applied." },
  { name: "Failed", desc: "Execution errored (e.g. invalid input, or validators disagreed). Check the message and retry." },
];

export default function Guide() {
  return (
    <main className="guide">
      <div className="container container--body">
        <section className="guide-hero">
          <span className="eyebrow">How it works</span>
          <h1>Using the console</h1>
          <p>
            A step-by-step guide to connecting your Governor and driving a
            self-governing protocol — from registering a contract to halting an
            exploit through validator consensus.
          </p>
        </section>

        <section className="guide-steps">
          <div className="panel-title">Setup & use</div>
          <ol className="guide-list">
            {STEPS.map((s) => (
              <li key={s.n} className="guide-step">
                <span className="guide-n mono">{s.n}</span>
                <div>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="guide-legend">
          <div className="panel-title">Writing your own protocol</div>
          <p>
            Any GenLayer contract can become a governed protocol. Copy{" "}
            <span className="mono">contracts/ProtocolVault.py</span> as a template and keep
            four things: a constructor that stores its Governor address, a{" "}
            <span className="mono">pause()</span> method that blocks sensitive actions, an{" "}
            <span className="mono">unpause()</span> method that reopens them, and a{" "}
            <span className="mono">get_state()</span> view that includes the governor
            address. Only the Governor may call pause/unpause — enforce that
            inside your contract. The governor field is how listing requests
            prove compatibility. Deploy it, then register its address from step 5.
          </p>
        </section>

        <section className="guide-legend">
          <div className="panel-title">Protocol status</div>
          <div className="legend-grid">
            {STATUSES.map((s) => (
              <div key={s.name} className="legend-item">
                <span className={`pill pill-${s.color}`}>
                  <span className="dot" />
                  {s.name}
                </span>
                <p>{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="guide-legend">
          <div className="panel-title">Transaction states</div>
          <div className="legend-grid">
            {TX_STATUSES.map((s) => (
              <div key={s.name} className="legend-item">
                <strong>{s.name}</strong>
                <p>{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="guide-cta panel">
          <h2>Ready to try it?</h2>
          <p>
            Open the console, connect your Governor, and watch the protocol
            govern, verify, and evolve itself.
          </p>
          <Link to="/console" className="btn btn-primary">
            Open the console
          </Link>
        </section>
      </div>
    </main>
  );
}
