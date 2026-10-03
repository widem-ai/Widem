import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./styles.css";

// Rendered synchronously: the scheduler can otherwise paint after the load event, and the browser has
// by then already given up restoring the scroll position on a reload or back navigation.
const root = createRoot(document.getElementById("root")!);
flushSync(() => root.render(<App />));
