import { lazy, Suspense } from "react";
import { HashRouter, Routes, Route, useLocation } from "react-router-dom";
import Nav from "./components/Nav";
import Footer from "./components/Footer";
import Landing from "./pages/Landing";

const Console = lazy(() => import("./pages/Console"));
const Governors = lazy(() => import("./pages/Governors"));
const GovernorProfile = lazy(() => import("./pages/GovernorProfile"));
const Guide = lazy(() => import("./pages/Guide"));
const ProtocolDetail = lazy(() => import("./pages/ProtocolDetail"));

function AppShell() {
  const location = useLocation();
  return (
    <>
      <Nav />
      <div key={location.pathname} className="page-transition">
        <Suspense fallback={<div className="page-loading">Loading…</div>}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/governors" element={<Governors />} />
            <Route path="/governor/:addr" element={<GovernorProfile />} />
            <Route path="/how-it-works" element={<Guide />} />
            <Route path="/console" element={<Console />} />
            <Route path="/protocol/:addr" element={<ProtocolDetail />} />
          </Routes>
        </Suspense>
      </div>
      <Footer />
    </>
  );
}

export default function App() {
  return (
    <HashRouter>
      <AppShell />
    </HashRouter>
  );
}
