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
