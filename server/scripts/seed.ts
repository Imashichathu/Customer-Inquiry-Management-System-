import bcrypt from "bcryptjs";
import { pool } from "../src/db.js";

const sampleInquiries = [
  {
    customerName: "Jordan Lee",
    contactMethod: "jordan.lee@example.com",
    subject: "Sample: Unable to update billing details",
    description: "The customer sees an error when saving a new billing address and would like help updating the account.",
    status: "new",
    daysAgo: 0,
  },
  {
    customerName: "Taylor Morgan",
    contactMethod: "+1 555-010-0142",
    subject: "Sample: Delivery tracking has not changed",
    description: "The tracking page has shown the same status for several days. Please check the shipment and share an update.",
    status: "in_progress",
    daysAgo: 1,
  },
  {
    customerName: "Casey Rivera",
    contactMethod: "casey.rivera@example.com",
    subject: "Sample: Question about plan features",
    description: "The customer is comparing plans and would like clarification about the features included in the standard plan.",
    status: "resolved",
    daysAgo: 2,
  },
  {
    customerName: "Alex Kim",
    contactMethod: "alex.kim@example.com",
    subject: "Sample: Request to change account email",
    description: "The customer would like to replace the email address associated with their account.",
    status: "new",
    daysAgo: 4,
  },
  {
    customerName: "Sam Patel",
    contactMethod: "+1 555-010-0187",
    subject: "Sample: Follow-up on recent support request",
    description: "The customer is following up and would appreciate confirmation that the previous request has been completed.",
    status: "resolved",
    daysAgo: 6,
  },
] as const;

async function seedStaffAccount() {
  const email = process.env.SEED_STAFF_EMAIL?.trim();
  const password = process.env.SEED_STAFF_PASSWORD;
  const fullName = process.env.SEED_STAFF_NAME?.trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new Error("Set SEED_STAFF_EMAIL to a valid email address");
  }
  if (!password || password.length < 12 || password.length > 200) {
    throw new Error("SEED_STAFF_PASSWORD must be between 12 and 200 characters");
  }
  if (!fullName || fullName.length > 120) {
    throw new Error("Set SEED_STAFF_NAME to a name of 1 to 120 characters");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const staffResult = await client.query<{ id: number }>(
      `INSERT INTO staff_users (full_name, email, password_hash)
       VALUES ($1, $2, $3)
       ON CONFLICT (lower(email))
       DO UPDATE SET full_name = EXCLUDED.full_name,
                     password_hash = EXCLUDED.password_hash,
                     is_active = true
       RETURNING id`,
      [fullName, email, passwordHash],
    );
    const staffId = staffResult.rows[0]?.id;
    if (staffId === undefined) {
      throw new Error("Could not determine the seeded staff account ID");
    }

    let insertedSamples = 0;
    for (const inquiry of sampleInquiries) {
      const result = await client.query(
        `INSERT INTO inquiries
           (customer_name, contact_method, subject, description, status, created_by, created_at, updated_at)
         SELECT $1, $2, $3, $4, $5, $6, now() - ($7::int * interval '1 day'), now() - ($7::int * interval '1 day')
         WHERE NOT EXISTS (
           SELECT 1 FROM inquiries WHERE created_by = $6 AND subject = $3::varchar
         )`,
        [
          inquiry.customerName,
          inquiry.contactMethod,
          inquiry.subject,
          inquiry.description,
          inquiry.status,
          staffId,
          inquiry.daysAgo,
        ],
      );
      insertedSamples += result.rowCount ?? 0;
    }

    await client.query("COMMIT");
    console.log(`Seeded staff account ${email} and ${insertedSamples} sample inquiries`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

seedStaffAccount()
  .catch((error: unknown) => {
    console.error("Staff account seeding failed:", error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
