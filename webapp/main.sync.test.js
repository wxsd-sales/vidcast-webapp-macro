/**
 * @jest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

function encodeHash(payload) {
  return "#" + Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

// Setting window.location.hash fires 'hashchange' asynchronously, and that
// listener (not the data-channel message handler itself) is what actually
// calls updateStateFromHash()/render(), so tests need to yield a tick after
// anything that changes the hash before asserting on APP_STATE/the DOM.
function nextTick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// A lightweight stand-in for MultiWebRTCDataConnection: main.js only needs
// on()/sendMessageToAll() from it, and real WebRTC (RTCPeerConnection) isn't
// available in jsdom. Tests drive "open"/"message" events directly through
// this fake instead of negotiating a real peer connection.
class FakeMultiWebRTCDataConnection {
  constructor(xapi, mode, app) {
    this.xapi = xapi;
    this.mode = mode;
    this.app = app;
    this.sent = [];
    this.handlers = { open: [], message: [], error: [] };
    FakeMultiWebRTCDataConnection.instances.push(this);
  }

  sendMessageToAll(message) {
    this.sent.push(message);
  }

  on(event, handler) {
    this.handlers[event]?.push(handler);
  }

  emit(event, data) {
    this.handlers[event]?.forEach((handler) => handler(data));
  }
}
FakeMultiWebRTCDataConnection.instances = [];

jest.unstable_mockModule("./webrtc.js", () => ({
  MultiWebRTCDataConnection: FakeMultiWebRTCDataConnection,
}));

async function loadMainAs(hash) {
  FakeMultiWebRTCDataConnection.instances.length = 0;
  document.body.innerHTML = '<div id="app"></div>';
  window.location.hash = encodeHash(hash);

  const main = await import("./main.js");
  const conn = FakeMultiWebRTCDataConnection.instances.at(-1);
  return { main, conn };
}

describe("new controller/OSD connections sync current state", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.unstable_mockModule("./webrtc.js", () => ({
      MultiWebRTCDataConnection: FakeMultiWebRTCDataConnection,
    }));
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("has a newly connected controller request the OSD's current state", async () => {
    const { conn } = await loadMainAs({
      mode: "controls",
      target: "Controller",
      panelId: "vidcast",
      peripheralId: "controller-1",
    });

    conn.emit("open", { connectionIndex: "peer-1" });

    expect(conn.sent).toContainEqual({ requestState: true });
  });

  it("has the OSD (player) respond to a state request with its current hash", async () => {
    const { main, conn } = await loadMainAs({
      mode: "player",
      target: "OSD",
      panelId: "vidcast",
    });

    // Simulate a controller having already selected a video before this
    // request arrives (the same "hash" message a real selection sends).
    conn.emit("message", {
      connectionIndex: "peer-1",
      data: JSON.stringify({
        hash: { mode: "controls", target: "Controller", state: "player", id: "1" },
      }),
    });
    await nextTick();

    expect(main.APP_STATE.state).toBe("player");
    expect(main.APP_STATE.current?.id).toBe("1");

    conn.sent.length = 0;
    conn.emit("message", {
      connectionIndex: "peer-2",
      data: JSON.stringify({ requestState: true }),
    });

    expect(conn.sent).toHaveLength(1);
    expect(conn.sent[0].hash).toEqual(
      expect.objectContaining({ mode: "player", state: "player", id: "1" }),
    );
  });

  it("syncs a controller to the currently selected video once the OSD replies", async () => {
    const { main, conn } = await loadMainAs({
      mode: "controls",
      target: "Controller",
      panelId: "vidcast",
      peripheralId: "controller-2",
    });

    expect(main.APP_STATE.state).toBe("playlist");
    expect(main.APP_STATE.current).toBeNull();

    conn.emit("message", {
      connectionIndex: "peer-1",
      data: JSON.stringify({
        hash: {
          mode: "player",
          target: "OSD",
          panelId: "vidcast",
          state: "player",
          id: "1",
        },
      }),
    });
    await nextTick();

    expect(main.APP_STATE.state).toBe("controls");
    expect(main.APP_STATE.current?.id).toBe("1");
    expect(
      document.querySelector(".controls-video-name"),
    ).not.toBeNull();
  });

  it("a controller that requests state while the OSD has nothing selected stays on the playlist", async () => {
    const { conn: osdConn, main: osdMain } = await loadMainAs({
      mode: "player",
      target: "OSD",
      panelId: "vidcast",
    });

    expect(osdMain.APP_STATE.state).toBe("playlist");

    osdConn.sent.length = 0;
    osdConn.emit("message", {
      connectionIndex: "peer-3",
      data: JSON.stringify({ requestState: true }),
    });

    expect(osdConn.sent[0].hash).toEqual(
      expect.objectContaining({ mode: "player" }),
    );
    expect(osdConn.sent[0].hash.id).toBeFalsy();
  });
});
