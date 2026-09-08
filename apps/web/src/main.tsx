import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { Backdrop } from "./components/Backdrop";
import "./styles/app.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Backdrop />
    <App />
  </StrictMode>,
);

// Cache the shell so a flaky connection shows the app, not a dinosaur.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
}
