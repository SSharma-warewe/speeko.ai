import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "@call-agent/ui/styles.css";
import "./global.css";
import App from "./App";
import { AdminAuthProvider, UserAuthProvider } from "./lib/auth";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AdminAuthProvider>
        <UserAuthProvider>
          <App />
        </UserAuthProvider>
      </AdminAuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
