import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { dirOf, langOf } from "./site.ts";
import "./styles.css";

// Language and direction come from the URL, set before the first render so nothing paints in the wrong direction.
const lang = langOf(location.pathname);
document.documentElement.lang = lang;
document.documentElement.dir = dirOf(lang);

// Rendered synchronously: the scheduler can otherwise paint after the load event, and the browser has
// by then already given up restoring the scroll position on a reload or back navigation.
const root = createRoot(document.getElementById("root")!);
flushSync(() => root.render(<App lang={lang} />));
