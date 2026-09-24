import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { KEYWORD_PATHS } from "./data/marketing-routes";
import { useGtagPageView } from "./lib/gtag";
import { usePageMeta } from "./lib/page-meta";
import GetDemoPage from "./pages/GetDemoPage";
import HowItWorksPage from "./pages/HowItWorksPage";
import KeywordPage from "./pages/KeywordPage";
import LandingPage from "./pages/LandingPage";
import AiCallingPage from "./pages/AiCallingPage";
import SolutionsIndexPage from "./pages/SolutionsIndexPage";
import WhatsAppServicesPage from "./pages/WhatsAppServicesPage";
import PrivacyPolicyPage from "./pages/PrivacyPolicyPage";
import VoicePage from "./pages/VoicePage";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function PageMeta() {
  const { pathname } = useLocation();
  usePageMeta(pathname);
  useGtagPageView(pathname);
  return null;
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <PageMeta />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/get-demo" element={<GetDemoPage />} />
        <Route path="/signup" element={<Navigate to="/get-demo" replace />} />
        <Route path="/how-it-works" element={<HowItWorksPage />} />
        <Route path="/voice" element={<VoicePage />} />
        <Route path="/privacy" element={<PrivacyPolicyPage />} />
        <Route path="/solutions" element={<SolutionsIndexPage />} />
        <Route path="/solutions/ai-calling-agents" element={<AiCallingPage />} />
        <Route path="/solutions/whatsapp-services" element={<WhatsAppServicesPage />} />
        <Route
          path="/solutions/customer-service"
          element={<Navigate to="/solutions/ai-calling-agents" replace />}
        />
        <Route
          path="/solutions/marketing-sales"
          element={<Navigate to="/solutions/ai-calling-agents" replace />}
        />
        {KEYWORD_PATHS.map((path) => (
          <Route
            key={path}
            path={path}
            element={<KeywordPage path={path} />}
          />
        ))}
        <Route path="/solutions/*" element={<Navigate to="/solutions" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
