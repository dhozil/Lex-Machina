import { Link, NavLink } from "react-router-dom";
import ThemeToggle from "./ThemeToggle";

const LINKS = [
  { to: "/", label: "Overview", end: true },
  { to: "/governors", label: "Governors", end: false },
  { to: "/how-it-works", label: "How it works", end: false },
  { to: "/console", label: "Console", end: false },
];

export default function Nav() {
  return (
    <header className="nav">
      <div className="container nav-inner">
        <Link to="/" className="brand" aria-label="Lex Machina home">
          <span className="brand-mark" aria-hidden="true">
            <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
              <circle cx="13" cy="13" r="6" fill="none" stroke="var(--brass)" strokeWidth="1.6" />
              <circle cx="13" cy="13" r="2" fill="var(--brass)" />
              <line x1="13" y1="1" x2="13" y2="7" stroke="var(--brass)" strokeWidth="1.2" opacity="0.5" />
              <line x1="13" y1="19" x2="13" y2="25" stroke="var(--brass)" strokeWidth="1.2" opacity="0.5" />
              <line x1="1" y1="13" x2="7" y2="13" stroke="var(--brass)" strokeWidth="1.2" opacity="0.5" />
              <line x1="19" y1="13" x2="25" y2="13" stroke="var(--brass)" strokeWidth="1.2" opacity="0.5" />
            </svg>
          </span>
          <span className="brand-word">
            Lex <em>Machina</em>
          </span>
        </Link>

        <nav className="nav-links" aria-label="Primary">
          {LINKS.map((l) => (
            <NavLink
              key={l.label}
              to={l.to}
              className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
              end={l.end}
            >
              {l.label}
            </NavLink>
          ))}
        </nav>

        <div className="nav-actions">
          <ThemeToggle />
          <Link to="/console" className="btn btn-primary btn-sm">
            Open console
          </Link>
        </div>
      </div>
    </header>
  );
}
