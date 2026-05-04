import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { MultiWebRTCDataConnection } from "./webrtc.js";

async function flushPromises() {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
}

describe("MultiWebRTCDataConnection modes", () => {
  let frames;

  beforeEach(() => {
    frames = [{ postMessage: jest.fn() }, { postMessage: jest.fn() }];
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        addEventListener: jest.fn(),
        top: { frames },
      },
      writable: true,
    });
    Object.defineProperty(globalThis, "self", {
      configurable: true,
      value: {
        crypto: { randomUUID: () => "conn-1" },
      },
      writable: true,
    });
    Object.defineProperty(globalThis, "RTCPeerConnection", {
      configurable: true,
      value: jest.fn(function () {
        this.createDataChannel = jest.fn(() => ({
          close: jest.fn(),
          readyState: "open",
          send: jest.fn(),
        }));
        this.createOffer = jest.fn(async () => ({
          type: "offer",
          sdp: "offer-sdp",
        }));
        this.setLocalDescription = jest.fn(async (description) => {
          this.localDescription = description;
        });
      }),
      writable: true,
    });
    jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete globalThis.window;
    delete globalThis.self;
    delete globalThis.RTCPeerConnection;
  });

  it("treats player mode as the OSD/player role", () => {
    new MultiWebRTCDataConnection(undefined, "player");

    expect(RTCPeerConnection).not.toHaveBeenCalled();
    expect(frames[0].postMessage).toHaveBeenCalledWith(
      JSON.stringify({ type: "playerReady" }),
    );
    expect(frames[1].postMessage).toHaveBeenCalledWith(
      JSON.stringify({ type: "playerReady" }),
    );
  });

  it("treats controls mode as the controller role", async () => {
    const connection = new MultiWebRTCDataConnection(undefined, "controls");
    const openHandler = jest.fn();
    connection.on("open", openHandler);
    await flushPromises();

    const dataChannel = connection.dataChannels["conn-1"];
    dataChannel.onopen();

    expect(openHandler).toHaveBeenCalledWith({ connectionIndex: "conn-1" });
    expect(frames[0].postMessage).toHaveBeenCalledWith(
      JSON.stringify({
        mode: "controls",
        type: "offer",
        sdp: "offer-sdp",
        connectionIndex: "conn-1",
      }),
    );
  });

  it("adds app metadata to signaling messages when provided", async () => {
    new MultiWebRTCDataConnection(undefined, "controls", {
      panelId: "vidcast",
      PeripheralId: "panel-1",
    });
    await flushPromises();

    expect(frames[0].postMessage).toHaveBeenCalledWith(
      JSON.stringify({
        mode: "controls",
        type: "offer",
        sdp: "offer-sdp",
        connectionIndex: "conn-1",
        app: {
          panelId: "vidcast",
          PeripheralId: "panel-1",
        },
      }),
    );
  });

  it("ignores non-signaling Message.Send packets", async () => {
    new MultiWebRTCDataConnection(undefined, "player", {
      panelId: "vidcast",
      Target: "OSD",
    });
    RTCPeerConnection.mockClear();

    const messageHandler = window.addEventListener.mock.calls[0][1];
    messageHandler({
      data: JSON.stringify({
        type: "response",
        name: "playlist",
        requestId: "request-1",
        app: {
          panelId: "vidcast",
          Target: "OSD",
        },
        index: 0,
        total: 1,
        content: "[]",
      }),
    });
    await flushPromises();

    expect(RTCPeerConnection).not.toHaveBeenCalled();
  });

  it("stores incoming player-side data channels so the OSD can relay messages", () => {
    const connection = new MultiWebRTCDataConnection(undefined, "player", {
      panelId: "vidcast",
      Target: "OSD",
    });
    const incomingChannel = {
      readyState: "open",
      send: jest.fn(),
    };

    const pc = connection._createPeerConnection("controller-1");
    pc.ondatachannel({ channel: incomingChannel });
    connection.sendMessageToAll({ hash: { id: "video-1" } });

    expect(connection.dataChannels["controller-1"]).toBe(incomingChannel);
    expect(incomingChannel.send).toHaveBeenCalledWith(
      JSON.stringify({ hash: { id: "video-1" } }),
    );
  });
});
