import fs from "fs"
import fsa from "fs/promises";
import cssLoader from 'bun-css-loader';
import { WebServer } from "./classes/WebServer";

const TAILWIND_ARGS = ["bunx", "tailwindcss", "-i", "src/client/css/tailwind.css", "-o", "public/css/tailwind.css"];

let tailwindWatchStarted = false;
const buildTailwind = async () => {
    await fsa.mkdir("./public/css", { recursive: true });
    if (Bun.env.NODE_ENV == "development") {
        // persistent watcher instead of one-shot recompiles per rebuild
        if (tailwindWatchStarted) return;
        tailwindWatchStarted = true;
        Bun.spawn([...TAILWIND_ARGS, "--watch"], { stdout: "inherit", stderr: "inherit" });
        return;
    }
    await Bun.spawn([...TAILWIND_ARGS, "--minify"], { stdout: "inherit", stderr: "inherit" }).exited;
}

let running = false;
const build = async () => {
    if (running) return;
    running = true;
    console.log("Building website ...");
    if (await fsa.exists("./public/js")) {
        await fsa.rmdir("./public/js", { recursive: true });
    }
    await Bun.build({
        entrypoints: ["src/client/index.tsx"],
        outdir: "public/js",
        splitting: true,
        minify: Bun.env.NODE_ENV != "development",
        target: "browser",
        format: "esm",
        define: {
            "process.env.NODE_ENV": JSON.stringify(Bun.env.NODE_ENV || "production")
        },
        plugins: [
            cssLoader(),
        ],
    });
    if (Bun.env.NODE_ENV == "development") {
        WebServer.websockets.forEach(e => e.send("lolilol"));
    }
    running = false;
}
export default async () => {
    await buildTailwind();
    if (Bun.env.NODE_ENV == "development") {
        fs.watch('./src/client', { recursive: true }, async (eventType, filename) => {
            build();
        });
    }
    build();
}