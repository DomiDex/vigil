import { startA2AServer } from "./llm/a2a-server.ts";

const port = parseInt(process.env.VIGIL_PORT || "4850", 10);
startA2AServer(port);

// Keep alive
setInterval(() => {}, 1 << 30);
