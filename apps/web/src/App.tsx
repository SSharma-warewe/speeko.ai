import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import GetDemoPage from "./pages/GetDemoPage";
import LandingPage from "./pages/LandingPage";
import SolutionPage from "./pages/SolutionPage";
import SolutionsIndexPage from "./pages/SolutionsIndexPage";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/get-demo" element={<GetDemoPage />} />
        <Route path="/signup" element={<Navigate to="/get-demo" replace />} />
        <Route path="/solutions" element={<SolutionsIndexPage />} />
        <Route
          path="/solutions/customer-service"
          element={<SolutionPage slug="customer-service" />}
        />
        <Route
          path="/solutions/marketing-sales"
          element={<SolutionPage slug="marketing-sales" />}
        />
        <Route path="/solutions/*" element={<Navigate to="/solutions" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
