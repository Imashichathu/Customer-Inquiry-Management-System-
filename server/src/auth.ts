import bcrypt from "bcryptjs";
import type { NextFunction, Request, Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { pool } from "./db.js";

const SESSION_COOKIE = "inquiry_session";
const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must contain at least 32 characters");
  }
  return secret;
}

export function createSessionToken(userId: number): string {
  return jwt.sign({ sub: String(userId) }, getJwtSecret(), { expiresIn: "8h" });
}

export function setSessionCookie(response: Response, userId: number): void {
  response.cookie(SESSION_COOKIE, createSessionToken(userId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_MS,
  });
}

export function clearSessionCookie(response: Response): void {
  response.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: "lax", path: "/" });
}

export async function requireAuth(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  const cookieValue: unknown = request.cookies?.[SESSION_COOKIE];
  const token = typeof cookieValue === "string" ? cookieValue : undefined;
  if (!token) {
    response.status(401).json({ error: "unauthorized", message: "Sign in to continue." });
    return;
  }

  let secret: string;
  try {
    secret = getJwtSecret();
  } catch (error) {
    next(error);
    return;
  }
  let userId: number;
  try {
    const payload = jwt.verify(token, secret) as JwtPayload;
    userId = Number(payload.sub);
    if (!Number.isSafeInteger(userId) || userId < 1) {
      throw new Error("Invalid session subject");
    }
  } catch {
    clearSessionCookie(response);
    response.status(401).json({ error: "unauthorized", message: "Your session has expired. Sign in again." });
    return;
  }

  try {
    const result = await pool.query<{
      id: number;
      full_name: string;
      email: string;
    }>(
      `SELECT id, full_name, email
       FROM staff_users
       WHERE id = $1 AND is_active = true`,
      [userId],
    );
    const user = result.rows[0];
    if (!user) {
      clearSessionCookie(response);
      response.status(401).json({ error: "unauthorized", message: "This staff account is no longer active." });
      return;
    }

    request.staffUser = {
      id: user.id,
      fullName: user.full_name,
      email: user.email,
    };
    next();
  } catch (error) {
    next(error);
  }
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
