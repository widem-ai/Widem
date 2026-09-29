// Browser entry: hydrates the pre-rendered page. The language comes from <html lang>, set by the shell.
import { StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./styles/tokens.css";
import "./styles/site.css";

const root = document.getElementById("root");
if (!root) throw new Error("Widem: #root missing from the pre-rendered page");
const lang = document.documentElement.lang === "ar" ? "ar" : "en";

hydrateRoot(
  root,
  <StrictMode>
    <App lang={lang} />
  </StrictMode>,
);
