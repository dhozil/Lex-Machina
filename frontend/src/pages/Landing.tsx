import { Link } from "react-router-dom";
import Constellation from "../components/Constellation";

const NODES = [
  { id: "vault-1", state: "healthy" as const, label: "VAULT" },
  { id: "vault-2", state: "healthy" as const, label: "ORACLE" },
  { id: "vault-3", state: "pending" as const, label: "MARKET" },
  { id: "vault-4", state: "healthy" as const, label: "TOKEN" },
  { id: "vault-5", state: "halted" as const, label: "LEDGER" },
  { id: "vault-6", state: "healthy" as const, label: "ESCROW" },
];

const BEHAVIORS = [
  {
    n: "01",
    title: "Govern",
    body: "One contract defines and enforces the behavior rules of another. The Governor registers protocols and reads their live state to keep them in line.",
  },
  {
    n: "02",
    title: "Verify & halt",
    body: "Anyone can submit an exploit claim. AI-validator consensus decides whether the evidence proves an active exploit — and only then is the protocol paused. No single actor decides.",
  },
  {
    n: "03",
    title: "Evolve",
    body: "The Governor watches its protocols and tunes its own risk policy, rewriting its own rules with no one voting. The system adapts to stay healthy.",
  },
];

export default function Landing() {
  return (
    <>
      {/* HERO */}
      <section className="hero">
        <div className="container container--body hero-grid">
          <div className="hero-copy">
            <span className="eyebrow">Lex Machina</span>
            <h1 className="hero-title">
              A protocol that
              <br />
              <span className="hero-accent">runs itself.</span>
            </h1>
            <p className="hero-sub">
              Lex Machina is a self-governing intelligent contract. It
              supervises the protocols beneath it, verifies exploits through
              AI-validator consensus, and tunes its own rules — with no one voting.
            </p>
            <div className="hero-actions">
              <Link to="/console" className="btn btn-primary">
                Open the console
              </Link>
              <Link to="/how-it-works" className="btn btn-ghost">
                See how it works
              </Link>
            </div>
            <div className="hero-trust mono">
              <span>No oracles</span>
              <span className="dot">·</span>
              <span>Verifiable LLM consensus</span>
              <span className="dot">·</span>
              <span>Runs on GenLayer</span>
            </div>
          </div>

          <div className="hero-visual">
            <Constellation nodes={NODES} size={620} />
          </div>
        </div>
      </section>

      {/* LIVE VERIFICATION */}
      <section className="section proof-strip" aria-label="What you can verify live">
        <div className="container container--body proof-grid">
          <article className="proof">
            <div className="proof-label mono">Governor</div>
            <h3>Read live governance state</h3>
            <p>
              Threshold, rule version, tune count, exploit count, and protocol
              count come directly from the connected contract—not this page.
            </p>
          </article>
          <article className="proof">
            <div className="proof-label mono">Protocols</div>
            <h3>Inspect governed contracts</h3>
            <p>
              Every listed protocol is read through the Governor and shown as
              Healthy, Paused, or Halted with its onchain balances and activity.
            </p>
          </article>
          <article className="proof">
            <div className="proof-label mono">Consensus</div>
            <h3>Check votes and execution</h3>
            <p>
              Open any transaction to inspect validator votes, execution status,
              triggered child transactions, and stdout/stderr.
            </p>
          </article>
          <article className="proof">
            <div className="proof-label mono">Tuning</div>
            <h3>Watch rules change</h3>
            <p>
              When validators agree, threshold, tune count, rule version, and
              rule text update—and each change links back to its transaction.
            </p>
          </article>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" className="section">
        <div className="container container--body">
          <span className="eyebrow">How it works</span>
          <h2 className="section-title">Three behaviors. One autonomous system.</h2>
          <p className="section-lead">
            The theme describes it exactly: a contract that pauses, tunes, or
            rewrites another contract — or its own rules — with no one voting.
            Lex Machina is that system.
          </p>

          <div className="behaviors">
            {BEHAVIORS.map((b) => (
              <article key={b.n} className="behavior">
                <span className="behavior-n mono">{b.n}</span>
                <h3>{b.title}</h3>
                <p>{b.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* WHY GENLAYER */}
      <section className="section why">
        <div className="container container--body why-grid">
          <div className="why-copy">
            <span className="eyebrow">Why GenLayer</span>
            <h2 className="section-title">Judgment, not just code.</h2>
            <p>
              Ordinary smart contracts run deterministic code. But deciding whether
              an exploit is real, or whether a protocol is healthy, is a judgment —
              not a calculation.
            </p>
            <p>
              GenLayer adds <strong>verifiable AI-validator consensus</strong>.
              Validators independently run the same task and must agree, so
              subjective decisions become trustworthy, reproducible, and appealable.
              That is what lets Lex Machina act without a single authority.
            </p>
          </div>
          <div className="why-panel panel">
            <div className="panel-title">The adjudication loop</div>
            <ol className="loop">
              <li>
                <span className="loop-n mono">1</span>
                <div>
                  <strong>Evidence submitted</strong>
                  <p>Anyone reports an exploit claim and evidence.</p>
                </div>
              </li>
              <li>
                <span className="loop-n mono">2</span>
                <div>
                  <strong>Validators judge</strong>
                  <p>Every validator runs the same judgment independently.</p>
                </div>
              </li>
              <li>
                <span className="loop-n mono">3</span>
                <div>
                  <strong>Consensus decides</strong>
                  <p>They must agree on the outcome — or the decision is re-run.</p>
                </div>
              </li>
            </ol>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section cta">
        <div className="container container--body cta-inner">
          <h2>See it govern in real time.</h2>
          <p>
            Connect to the console to inspect the governance state, register
            protocols, and watch exploit adjudication and auto-tuning happen on-chain.
            Or browse AI-verified governors in the directory.
          </p>
          <div className="hero-actions" style={{ justifyContent: "center" }}>
            <Link to="/console" className="btn btn-primary">
              Open the console
            </Link>
            <Link to="/governors" className="btn btn-ghost">
              Browse governors
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
