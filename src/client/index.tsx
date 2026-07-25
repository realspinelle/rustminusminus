import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import { NODE_ENV } from "./const.ts";
import dev from "./dev.ts";

if (NODE_ENV == "development") {
    dev();
}

ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);