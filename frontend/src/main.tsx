import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import "./index.css";
import "./lib/chartTheme";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Missing #root in index.html");

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
