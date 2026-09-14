export default function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <div className="footer-brand">
          <span className="footer-mark" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 26 26" fill="none">
              <circle cx="13" cy="13" r="6" fill="none" stroke="var(--brass)" strokeWidth="1.6" />
              <circle cx="13" cy="13" r="2" fill="var(--brass)" />
            </svg>
          </span>
          <span>Lex Machina</span>
        </div>
        <p className="footer-note">
          A self-governing intelligent contract on GenLayer — protocols that
          pause, tune, and rewrite themselves.
        </p>
        <div className="footer-meta mono">
          <span>GenLayer</span>
          <span className="dot" aria-hidden="true">
            ·
          </span>
          <span>verifiable LLM consensus</span>
        </div>
      </div>
    </footer>
  );
}
