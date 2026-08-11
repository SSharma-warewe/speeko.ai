import { Navigate, Route, Routes } from "react-router-dom";
import ComingSoonPage from "./pages/ComingSoonPage";
import GetDemoPage from "./pages/GetDemoPage";
import LandingPage from "./pages/LandingPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/get-demo" element={<GetDemoPage />} />
      <Route path="/signup" element={<Navigate to="/get-demo" replace />} />
      <Route path="/solutions" element={<ComingSoonPage title="Solutions" />} />
      <Route path="/solutions/*" element={<ComingSoonPage title="Solutions" />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
