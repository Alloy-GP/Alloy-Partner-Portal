import { describe, it, expect } from "vitest";
import { can, roleKey, effectiveIdentity } from "./perms.js";

const alloyAdmin = { isStaff: true, role: "admin" };
const alloyStaff = { isStaff: true, role: "staff" };
const clientOwner = { isStaff: false, role: "owner" };
const clientStaff = { isStaff: false, role: "staff" };
const clientAccounting = { isStaff: false, role: "accounting" };

describe("roleKey", () => {
  it("composes side:role", () => {
    expect(roleKey(alloyAdmin)).toBe("alloy:admin");
    expect(roleKey(clientOwner)).toBe("client:owner");
  });

  it("normalizes legacy roles (bd/ops → staff)", () => {
    expect(roleKey({ isStaff: false, role: "bd" })).toBe("client:staff");
    expect(roleKey({ isStaff: true, role: "ops" })).toBe("alloy:staff");
  });

  it("defaults a missing role to owner", () => {
    expect(roleKey({ isStaff: false })).toBe("client:owner");
  });
});

describe("can", () => {
  it("gates the admin panel to Alloy staff only", () => {
    expect(can(alloyAdmin, "adminPanel")).toBe(true);
    expect(can(alloyStaff, "adminPanel")).toBe(true);
    expect(can(clientOwner, "adminPanel")).toBe(false);
  });

  it("lets every client role plus Alloy admin open a new request", () => {
    expect(can(clientOwner, "newRequest")).toBe(true);
    expect(can(clientStaff, "newRequest")).toBe(true);
    expect(can(clientAccounting, "newRequest")).toBe(true);
    expect(can(alloyAdmin, "newRequest")).toBe(true);
    expect(can(alloyStaff, "newRequest")).toBe(false); // staff act in Zendesk directly
  });

  it("restricts billing to owner/accounting on the client side", () => {
    expect(can(clientOwner, "billing")).toBe(true);
    expect(can(clientAccounting, "billing")).toBe(true);
    expect(can(clientStaff, "billing")).toBe(false);
  });

  it("returns false for an unknown capability", () => {
    expect(can(alloyAdmin, "nonexistent_cap")).toBe(false);
  });
});

describe("effectiveIdentity (staff 'View as client')", () => {
  const admin = { id: "s1", role: "admin", isStaff: true };
  it("outside preview: real staff flag and real role", () => {
    expect(effectiveIdentity(admin, { realStaff: true, viewAsClient: false })).toEqual({ isStaff: true, role: "admin" });
  });
  it("in preview: presents as the client OWNER so gates match a real client", () => {
    const eff = effectiveIdentity(admin, { realStaff: true, viewAsClient: true });
    expect(eff).toEqual({ isStaff: false, role: "owner" });
    expect(can({ ...admin, ...eff }, "billing")).toBe(true);
    expect(can({ ...admin, ...eff }, "newRequest")).toBe(true);
  });
  it("restores the remembered real role after preview (App stores realRole)", () => {
    const swapped = { id: "s1", role: "owner", realRole: "staff", isStaff: false };
    expect(effectiveIdentity(swapped, { realStaff: true, viewAsClient: false })).toEqual({ isStaff: true, role: "staff" });
  });
  it("a client is never staff and keeps their role", () => {
    expect(effectiveIdentity({ id: "c1", role: "accounting" }, { realStaff: false, viewAsClient: false })).toEqual({ isStaff: false, role: "accounting" });
  });
});

describe("screen_onboarding", () => {
  it("lets owners, client staff and Alloy in — not accounting (credentials live there)", () => {
    expect(can(alloyAdmin, "screen_onboarding")).toBe(true);
    expect(can(alloyStaff, "screen_onboarding")).toBe(true);
    expect(can(clientOwner, "screen_onboarding")).toBe(true);
    expect(can(clientStaff, "screen_onboarding")).toBe(true);
    expect(can(clientAccounting, "screen_onboarding")).toBe(false);
  });
});
