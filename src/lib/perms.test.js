import { describe, it, expect } from "vitest";
import { can, roleKey } from "./perms.js";

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
