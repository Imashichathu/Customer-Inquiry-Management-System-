import cors from "cors";
import cookieParser from "cookie-parser";
import express from "express";
import { authRouter } from "./auth-routes.js";
import { requireAuth } from "./auth.js";
import { pool } from "./db.js";
import { inquiryRouter } from "./inquiries.js";

export const app = express();

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
    credentials: true,
  }),
);
app.use(express.json({ limit: "16kb" }));
app.use(cookieParser());

app.use("/api/auth", authRouter);
app.use("/api/inquiries", requireAuth, inquiryRouter);

app.get("/api/health", async (_request, response) => {
  try {
    await pool.query("SELECT 1");
    response.json({ status: "ok" });
  } catch (error) {
    console.error("Database health check failed:", error);
    response.status(503).json({ status: "unavailable" });
  }
});

app.use(
  (
    error: unknown,
    _request: express.Request,
    response: express.Response,
    next: express.NextFunction,
  ) => {
    if (response.headersSent) {
      next(error);
      return;
    }

    if (error instanceof SyntaxError && "body" in error) {
      response.status(400).json({
        error: "invalid_json",
        message: "Request body must contain valid JSON.",
      });
      return;
    }

    console.error("API request failed:", error);
    response.status(500).json({
      error: "internal_error",
      message: "Something went wrong. Please try again.",
    });
  },
);
