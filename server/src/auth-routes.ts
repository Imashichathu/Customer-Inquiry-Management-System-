import { Router } from "express";
import { verifyPassword, setSessionCookie, clearSessionCookie, requireAuth } from "./auth.js";
import { pool } from "./db.js";

export const authRouter = Router();

authRouter.post("/login", async (request, response, next) => {
  const { email, password } = request.body ?? {};
  if (
    typeof email !== "string" ||
    email.trim().length < 3 ||
    email.trim().length > 254 ||
    typeof password !== "string" ||
    password.length === 0 ||
    password.length > 200
  ) {
    response.status(400).json({
      error: "validation_error",
      message: "Enter a valid email address and password.",
    });
    return;
  }

  try {
    const result = await pool.query<{
      id: number;
      full_name: string;
      email: string;
      password_hash: string;
    }>(
      `SELECT id, full_name, email, password_hash
       FROM staff_users
       WHERE lower(email) = lower($1) AND is_active = true`,
      [email.trim()],
    );
    const user = result.rows[0];
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      response.status(401).json({
        error: "invalid_credentials",
        message: "Email or password is incorrect.",
      });
      return;
    }

    setSessionCookie(response, user.id);
    response.json({ user: { id: user.id, fullName: user.full_name, email: user.email } });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/logout", (_request, response) => {
  clearSessionCookie(response);
  response.status(204).end();
});

authRouter.get("/me", requireAuth, (request, response) => {
  response.json({ user: request.staffUser });
});
