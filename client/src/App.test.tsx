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

    await user.type(await screen.findByLabelText("Work email"), "staff@example.com");
    await user.type(screen.getByLabelText("Password"), "local-demo-password");
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
});
