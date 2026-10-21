import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";

process.env.JWT_SECRET ??= "test-secret-that-is-long-enough-to-be-secure";

const { INQUIRY_STATUSES, validateInquiryInput } = await import("../src/inquiries.js");
const { app } = await import("../src/app.js");
const { pool } = await import("../src/db.js");

after(async () => {
  await pool.end();
});

describe("inquiry API", () => {
  it("requires a valid staff session before serving inquiry records", async () => {
    const response = await request(app).get("/api/inquiries");

    assert.equal(response.status, 401);
    assert.equal(response.body.error, "unauthorized");
  });

  it("rejects missing required inquiry fields independently of the UI", () => {
    const result = validateInquiryInput({
      customerName: "   ",
      contactMethod: "555-0100",
      subject: "Delivery question",
      description: "A package has not arrived.",
    });

    assert.deepEqual(result, { valid: false, message: "Customer name is required." });
  });

  it("accepts only the three supported lifecycle statuses", () => {
    assert.deepEqual(INQUIRY_STATUSES, ["new", "in_progress", "resolved"]);
  });

  it(
    "persists inquiries and rejects stale status updates",
    { skip: process.env.RUN_DB_INTEGRATION !== "1" },
    async () => {
      const staffEmail = process.env.SEED_STAFF_EMAIL;
      const staffPassword = process.env.SEED_STAFF_PASSWORD;
      assert.ok(staffEmail, "SEED_STAFF_EMAIL must be configured");
      assert.ok(staffPassword, "SEED_STAFF_PASSWORD must be configured");

      const agent = request.agent(app);
      const login = await agent.post("/api/auth/login").send({
        email: staffEmail,
        password: staffPassword,
      });
      assert.equal(login.status, 200);

      const invalid = await agent.post("/api/inquiries").send({
        customerName: " ",
        contactMethod: "555-0100",
        subject: "Missing name",
        description: "This inquiry should not be saved.",
      });
      assert.equal(invalid.status, 400);

      const uniqueSubject = `Integration test ${Date.now()}`;
      const created = await agent.post("/api/inquiries").send({
        customerName: "Integration Customer",
        contactMethod: "integration@example.com",
        subject: uniqueSubject,
        description: "Verify the PostgreSQL-backed inquiry workflow.",
      });
      assert.equal(created.status, 201);
      const inquiry = created.body.inquiry as {
        id: number;
        status: string;
        updatedAt: string;
      };
      assert.equal(inquiry.status, "new");

      try {
        const found = await agent.get(`/api/inquiries/${inquiry.id}`);
        assert.equal(found.status, 200);
        assert.equal(found.body.inquiry.subject, uniqueSubject);
        const timestampCheck = await pool.query(
          "SELECT updated_at, $1::timestamptz AS expected, updated_at = $1::timestamptz AS matches FROM inquiries WHERE id = $2",
          [inquiry.updatedAt, inquiry.id],
        );
        assert.equal(
          timestampCheck.rows[0].matches,
          true,
          JSON.stringify(timestampCheck.rows[0]),
        );

        const transitioned = await agent
          .patch(`/api/inquiries/${inquiry.id}/status`)
          .send({ status: "resolved", expectedUpdatedAt: inquiry.updatedAt });
        assert.equal(
          transitioned.status,
          200,
          JSON.stringify({ created: inquiry, response: transitioned.body }),
        );
        assert.equal(transitioned.body.inquiry.status, "resolved");

        const staleUpdate = await agent
          .patch(`/api/inquiries/${inquiry.id}/status`)
          .send({ status: "in_progress", expectedUpdatedAt: inquiry.updatedAt });
        assert.equal(staleUpdate.status, 409);
        assert.equal(staleUpdate.body.inquiry.status, "resolved");

        assert.equal((await agent.get("/api/inquiries/not-an-id")).status, 400);
        assert.equal((await agent.get("/api/inquiries/2147483647")).status, 404);
      } finally {
        await pool.query("DELETE FROM inquiries WHERE id = $1", [inquiry.id]);
      }
    },
  );
});
