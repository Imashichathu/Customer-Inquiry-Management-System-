import cors from "cors";
import express from "express";
import { pool } from "./db.js";

export const app = express();

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
  }),
);
app.use(express.json());

app.get("/api/health", async (_request, response) => {
  try {
    await pool.query("SELECT 1");
    response.json({ status: "ok" });
  } catch (error) {
    console.error("Database health check failed:", error);
    response.status(503).json({ status: "unavailable" });
  }
});
