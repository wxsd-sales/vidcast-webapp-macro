/**
 * @jest-environment jsdom
 */
import { afterAll, describe, expect, it, jest } from "@jest/globals";

function encodeHash(payload) {
  return "#" + Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

function decodeHash(hash) {
  return JSON.parse(Buffer.from(hash.slice(1), "base64").toString("utf8"));
}

// main.js runs its top-level main() as soon as it's imported, so the DOM and
// hash it needs must be in place before that first (and only) import below.
document.body.innerHTML = '<div id="app"></div>';
window.location.hash = encodeHash({
  mode: "player",
  target: "OSD",
  panelId: "vidcast",
});

jest.spyOn(console, "log").mockImplementation(() => {});
jest.spyOn(console, "warn").mockImplementation(() => {});
jest.spyOn(console, "error").mockImplementation(() => {});

const { APP_STATE, resolveShowLogo, localizeHashForSurface, updateStateFromHash, render } =
  await import("./main.js");

afterAll(() => {
  jest.restoreAllMocks();
});

function selectVideo(id, overrides = {}) {
  const current = decodeHash(window.location.hash);
  window.location.hash = encodeHash({
    ...current,
    state: "player",
    id,
    ...overrides,
  });
  updateStateFromHash();
  render();
}

describe("resolveShowLogo", () => {
  it("defaults to visible when the hash parameter is absent", () => {
    expect(resolveShowLogo(undefined)).toBe(true);
  });

  it("treats boolean and string true as visible", () => {
    expect(resolveShowLogo(true)).toBe(true);
    expect(resolveShowLogo("true")).toBe(true);
  });

  it("treats boolean and string false as hidden", () => {
    expect(resolveShowLogo(false)).toBe(false);
    expect(resolveShowLogo("false")).toBe(false);
  });
});

describe("localizeHashForSurface showLogo round-trip", () => {
  it("omits showLogo from the replayed hash when this surface's logo is visible", () => {
    APP_STATE.showLogo = true;
    expect(localizeHashForSurface({})).not.toHaveProperty("showLogo");
  });

  it("preserves an explicit hidden showLogo on the replayed hash", () => {
    APP_STATE.showLogo = false;
    expect(localizeHashForSurface({})).toEqual(
      expect.objectContaining({ showLogo: false }),
    );
  });

  it("ignores a companion surface's own showLogo value in the incoming hash", () => {
    APP_STATE.showLogo = true;
    // A remote surface's broadcast hash could carry its own showLogo value;
    // this surface must not adopt it.
    expect(
      localizeHashForSurface({ showLogo: false }),
    ).not.toHaveProperty("showLogo");
  });
});

describe("Vidcast player view - logo visibility", () => {
  it("shows the logo by default when no showLogo hash parameter is present", () => {
    selectVideo("1");

    expect(APP_STATE.state).toBe("player");
    expect(APP_STATE.current?.id).toBe("1");
    expect(APP_STATE.showLogo).toBe(true);
    expect(document.querySelector(".player-logo-header")).not.toBeNull();
    expect(
      document.querySelector(".player-logo-header .logo"),
    ).not.toBeNull();
  });

  it("hides the logo and removes it from the layout when showLogo is false", () => {
    selectVideo("1", { showLogo: false });

    expect(APP_STATE.showLogo).toBe(false);
    expect(document.querySelector(".player-logo-header")).toBeNull();
    // The player view itself, and the video, still render normally.
    expect(document.querySelector(".player-container")).not.toBeNull();
    expect(document.querySelector("#player-video")).not.toBeNull();
  });

  it("shows the logo again once showLogo is explicitly set back to true", () => {
    selectVideo("1", { showLogo: true });

    expect(APP_STATE.showLogo).toBe(true);
    expect(document.querySelector(".player-logo-header")).not.toBeNull();
  });

  it("hides the logo for string 'false' as well as boolean false", () => {
    selectVideo("1", { showLogo: "false" });

    expect(APP_STATE.showLogo).toBe(false);
    expect(document.querySelector(".player-logo-header")).toBeNull();
  });

  it("only affects the player view's logo, not the waiting/playlist screen's own logo", () => {
    // No id selected: falls back to the waiting screen or playlist view,
    // neither of which is gated by showLogo.
    const current = decodeHash(window.location.hash);
    window.location.hash = encodeHash({
      ...current,
      showLogo: false,
      state: "playlist",
      id: null,
    });
    updateStateFromHash();
    render();

    expect(document.querySelector(".player-logo-header")).toBeNull();
    expect(document.querySelector(".waiting-logo, .header .logo")).not.toBeNull();
  });
});
