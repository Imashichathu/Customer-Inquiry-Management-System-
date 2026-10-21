import bcrypt from "bcryptjs";
import { pool } from "../src/db.js";

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
  await pool.query(
    `INSERT INTO staff_users (full_name, email, password_hash)
     VALUES ($1, $2, $3)
     ON CONFLICT (lower(email))
     DO UPDATE SET full_name = EXCLUDED.full_name,
                   password_hash = EXCLUDED.password_hash,
                   is_active = true`,
    [fullName, email, passwordHash],
  );
  console.log(`Seeded staff account ${email}`);
}

seedStaffAccount()
  .catch((error: unknown) => {
    console.error("Staff account seeding failed:", error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
