import { Router } from "express";
import type { Response } from "express";
import { pool } from "./db.js";

export const INQUIRY_STATUSES = ["new", "in_progress", "resolved"] as const;
export type InquiryStatus = (typeof INQUIRY_STATUSES)[number];

export interface Inquiry {
  id: number;
  customerName: string;
  contactMethod: string;
  subject: string;
  description: string;
  status: InquiryStatus;
  createdBy: number;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

const inquirySelection = `
  SELECT i.id, i.customer_name, i.contact_method, i.subject, i.description,
         i.status, i.created_by, u.full_name AS created_by_name,
         i.created_at, i.updated_at
  FROM inquiries i
  JOIN staff_users u ON u.id = i.created_by`;

function mapTimestamp(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value));
  return date.toISOString();
}

function mapInquiry(row: Record<string, unknown>): Inquiry {
  return {
    id: Number(row.id),
    customerName: String(row.customer_name),
    contactMethod: String(row.contact_method),
    subject: String(row.subject),
    description: String(row.description),
    status: row.status as InquiryStatus,
    createdBy: Number(row.created_by),
    createdByName: String(row.created_by_name),
    createdAt: mapTimestamp(row.created_at),
    updatedAt: mapTimestamp(row.updated_at),
  };
}

export type InquiryInput = Pick<
  Inquiry,
  "customerName" | "contactMethod" | "subject" | "description"
>;

export function validateInquiryInput(input: unknown):
  | { valid: true; value: InquiryInput }
  | { valid: false; message: string } {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { valid: false, message: "Provide the inquiry details." };
  }

  const values = input as Record<string, unknown>;
  const fields: Array<[keyof InquiryInput, string, number]> = [
    ["customerName", "Customer name", 160],
    ["contactMethod", "Contact details", 254],
    ["subject", "Subject", 200],
    ["description", "Description", 5000],
  ];
  const cleaned = {} as InquiryInput;

  for (const [key, label, maxLength] of fields) {
    const value = values[key];
    if (typeof value !== "string" || value.trim().length === 0) {
      return { valid: false, message: `${label} is required.` };
    }
    if (value.trim().length > maxLength) {
      return { valid: false, message: `${label} must be ${maxLength} characters or fewer.` };
    }
    cleaned[key] = value.trim();
  }

  return { valid: true, value: cleaned };
}

function parseInquiryId(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) {
    return null;
  }
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

function sendInquiryNotFound(response: Response): void {
  response.status(404).json({ error: "not_found", message: "This inquiry could not be found." });
}

export const inquiryRouter = Router();

inquiryRouter.get("/", async (request, response, next) => {
  const query = typeof request.query.q === "string" ? request.query.q.trim() : "";
  const status = typeof request.query.status === "string" ? request.query.status : "all";

  if (query.length > 200) {
    response.status(400).json({ error: "validation_error", message: "Search must be 200 characters or fewer." });
    return;
  }
  if (status !== "all" && !INQUIRY_STATUSES.includes(status as InquiryStatus)) {
    response.status(400).json({ error: "validation_error", message: "Choose a valid inquiry status." });
    return;
  }

  try {
    const result = await pool.query(
      `${inquirySelection}
       WHERE ($1 = '' OR i.customer_name ILIKE $2 OR i.contact_method ILIKE $2
              OR i.subject ILIKE $2 OR i.description ILIKE $2)
         AND ($3 = 'all' OR i.status = $3)
       ORDER BY i.updated_at DESC, i.id DESC`,
      [query, `%${query}%`, status],
    );
    response.json({ inquiries: result.rows.map((row) => mapInquiry(row)) });
  } catch (error) {
    next(error);
  }
});

inquiryRouter.post("/", async (request, response, next) => {
  const parsed = validateInquiryInput(request.body);
  if (!parsed.valid) {
    response.status(400).json({ error: "validation_error", message: parsed.message });
    return;
  }

  try {
    const { customerName, contactMethod, subject, description } = parsed.value;
    const result = await pool.query(
      `INSERT INTO inquiries
         (customer_name, contact_method, subject, description, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [customerName, contactMethod, subject, description, request.staffUser!.id],
    );
    const created = await pool.query(
      `${inquirySelection}
       WHERE i.id = $1`,
      [result.rows[0].id],
    );
    response.status(201).json({ inquiry: mapInquiry(created.rows[0]) });
  } catch (error) {
    next(error);
  }
});

inquiryRouter.get("/:id", async (request, response, next) => {
  const id = parseInquiryId(request.params.id);
  if (id === null) {
    response.status(400).json({ error: "invalid_id", message: "Inquiry ID must be a positive integer." });
    return;
  }

  try {
    const result = await pool.query(`${inquirySelection} WHERE i.id = $1`, [id]);
    if (!result.rows[0]) {
      sendInquiryNotFound(response);
      return;
    }
    response.json({ inquiry: mapInquiry(result.rows[0]) });
  } catch (error) {
    next(error);
  }
});

inquiryRouter.patch("/:id/status", async (request, response, next) => {
  const id = parseInquiryId(request.params.id);
  if (id === null) {
    response.status(400).json({ error: "invalid_id", message: "Inquiry ID must be a positive integer." });
    return;
  }

  const { status, expectedUpdatedAt } = request.body ?? {};
  if (!INQUIRY_STATUSES.includes(status as InquiryStatus)) {
    response.status(400).json({ error: "validation_error", message: "Choose New, In Progress, or Resolved." });
    return;
  }
  if (
    typeof expectedUpdatedAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T/.test(expectedUpdatedAt) ||
    Number.isNaN(Date.parse(expectedUpdatedAt))
  ) {
    response.status(400).json({
      error: "validation_error",
      message: "A current inquiry version is required. Refresh the inquiry and try again.",
    });
    return;
  }

  try {
    const updated = await pool.query(
      `UPDATE inquiries
       SET status = $1,
           updated_at = GREATEST(clock_timestamp()::timestamptz(3), updated_at + interval '1 millisecond')
       WHERE id = $2 AND updated_at = $3::timestamptz
       RETURNING id`,
      [status, id, expectedUpdatedAt],
    );
    if (updated.rowCount === 0) {
      const currentResult = await pool.query(`${inquirySelection} WHERE i.id = $1`, [id]);
      if (!currentResult.rows[0]) {
        sendInquiryNotFound(response);
        return;
      }
      response.status(409).json({
        error: "stale_inquiry",
        message: "This inquiry changed in another tab. Refresh it before making another update.",
        inquiry: mapInquiry(currentResult.rows[0]),
      });
      return;
    }

    const result = await pool.query(`${inquirySelection} WHERE i.id = $1`, [id]);
    response.json({ inquiry: mapInquiry(result.rows[0]) });
  } catch (error) {
    next(error);
  }
});
