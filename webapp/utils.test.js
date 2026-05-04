import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { getHashes, setHash } from "./utils.js";

function encodeHash(payload) {
  return `#${Buffer.from(JSON.stringify(payload), "utf8").toString("base64")}`;
}

describe("webapp URL hash helpers", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "location", {
      configurable: true,
      value: { hash: "" },
      writable: true,
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { location: globalThis.location },
      writable: true,
    });
    jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete globalThis.location;
    delete globalThis.window;
  });

  it("reads macro launch payloads with target and peripheral metadata", () => {
    location.hash = encodeHash({
      username: "vidcast",
      password: "secret",
      ipAddress: "192.168.1.100",
      mode: "controls",
      target: "Controller",
      peripheralId: "panel-1",
    });

    expect(getHashes(["username", "password", "ipAddress", "mode"])).toEqual({
      username: "vidcast",
      password: "secret",
      ipAddress: "192.168.1.100",
      mode: "controls",
      target: "Controller",
      peripheralId: "panel-1",
    });
  });

  it("merges hash updates without dropping launch metadata", () => {
    location.hash = encodeHash({
      username: "vidcast",
      password: "secret",
      ipAddress: "192.168.1.100",
      mode: "player",
      target: "OSD",
    });

    setHash({ id: "video-1", state: "player" });

    expect(getHashes()).toEqual({
      username: "vidcast",
      password: "secret",
      ipAddress: "192.168.1.100",
      mode: "player",
      target: "OSD",
      id: "video-1",
      state: "player",
    });
  });
});
