import "dotenv/config";
import { app } from "./app.js";
import { pool } from "./db.js";

const port = Number(process.env.API_PORT ?? 4000);

const server = app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});

function shutdown() {
  server.close(() => {
    void pool.end().then(() => process.exit(0));
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
