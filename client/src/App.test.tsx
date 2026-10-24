import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const staff = { id: 1, fullName: "Support Staff", email: "staff@example.com" };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("sign-in flow", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/auth/me")) {
        return jsonResponse(401, { message: "Sign in to continue." });
      }
      if (url.endsWith("/api/auth/login")) {
        return jsonResponse(200, { user: staff });
      }
      if (url.includes("/api/inquiries?")) {
        return jsonResponse(200, { inquiries: [] });
      }
      throw new Error(`Unexpected request: ${url}`);
    }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("signs in and shows the empty inquiry workspace", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.queryByText("ID")).toBeNull();
    await user.type(await screen.findByLabelText("Work email"), "staff@example.com");
    await user.type(screen.getByLabelText("Password"), "local-demo-password");
    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(screen.getByLabelText("Password").getAttribute("type")).toBe("text");
    await user.click(screen.getByRole("button", { name: "Hide password" }));
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("heading", { name: /Every request/ })).toBeTruthy();
    expect(await screen.findByText("Your inbox is clear")).toBeTruthy();
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/inquiries?"),
        expect.objectContaining({ credentials: "include" }),
      );
    });
  });

  it("shows inquiry details and keeps status updates available", async () => {
    const inquiry = {
      id: 8,
      customerName: "Justin Lee",
      contactMethod: "justin.lee@example.com",
      subject: "Sample: Unable to update billing details",
      description: "The customer sees an error when saving a new billing address.",
      status: "new",
      createdByName: "Support Staff",
      createdAt: "2026-10-23T09:00:00.000Z",
      updatedAt: "2026-10-23T09:00:00.000Z",
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/auth/me")) {
        return jsonResponse(401, { message: "Sign in to continue." });
      }
      if (url.endsWith("/api/auth/login")) {
        return jsonResponse(200, { user: staff });
      }
      if (url.includes("/api/inquiries?")) {
        return jsonResponse(200, { inquiries: [inquiry] });
      }
      if (url.endsWith("/api/inquiries/8")) {
        return jsonResponse(200, { inquiry });
      }
      if (url.endsWith("/api/inquiries/8/status")) {
        const body = JSON.parse(String(init?.body)) as { status: string };
        return jsonResponse(200, { inquiry: { ...inquiry, status: body.status } });
      }
      throw new Error(`Unexpected request: ${url}`);
    }));

    const user = userEvent.setup();
    render(<App />);
    await user.type(await screen.findByLabelText("Work email"), "staff@example.com");
    await user.type(screen.getByLabelText("Password"), "local-demo-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await user.click(await screen.findByRole("button", { name: /Sample: Unable to update billing details/ }));

    expect(await screen.findByRole("heading", { name: inquiry.subject })).toBeTruthy();
    expect(screen.getByText("Justin Lee")).toBeTruthy();
    expect(screen.getByText("justin.lee@example.com")).toBeTruthy();
    expect(screen.getByText(inquiry.description)).toBeTruthy();
    await user.selectOptions(screen.getByLabelText("Inquiry status"), "in_progress");
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/inquiries/8/status"),
        expect.objectContaining({ method: "PATCH" }),
      );
    });
  });
});
