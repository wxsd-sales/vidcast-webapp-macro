/**
 * @jest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

const PANEL_ID = "vidcast";
const PLAYER_URL =
  "https://wxsd-sales.github.io/vidcast-webapp-macro/webapp/index.html";

function encodeHash(payload) {
  return "#" + Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

function nextTick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function flushPromises() {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
}

// Same lightweight MultiWebRTCDataConnection stand-in used in
// main.sync.test.js: real WebRTC (RTCPeerConnection) isn't available in
// jsdom, and this feature doesn't depend on peer connections at all.
class FakeMultiWebRTCDataConnection {
  constructor(xapi, mode, app) {
    this.xapi = xapi;
    this.mode = mode;
    this.app = app;
    this.sent = [];
    this.handlers = { open: [], message: [], error: [] };
  }

  sendMessageToAll(message) {
    this.sent.push(message);
  }

  on(event, handler) {
    this.handlers[event]?.push(handler);
  }
}

jest.unstable_mockModule("./webrtc.js", () => ({
  MultiWebRTCDataConnection: FakeMultiWebRTCDataConnection,
}));

// Makes the module-scope `jsxapi` global (normally the <script src=".../jsxapi.js">
// browser bundle) resolve main.js's connectDevice() straight to a real
// jest-mock-xapi instance, so the rest of the test can drive/assert on it
// with the exact same helpers jest-mock-xapi ships (`.Status.X.set()`,
// `.Command.X.mockResolvedValue()`, etc).
//
// connectDevice() does `jsxapi.connect(...).on("error", cb).on("ready", cb)`,
// so `.connect()` needs to return something with a chainable `.on()` for
// those two lifecycle events. jest-mock-xapi's own `.on()` is its *real*
// internal EventEmitter method, used by every Status/Event/Config
// subscription under the hood - overwriting it directly (e.g.
// `mockXapi.on = ...`) silently breaks every subscription made afterwards
// (including main.js's own playlist and share-capability ones). Wrapping in
// an `Object.create(mockXapi)` derived object instead means only *this*
// wrapper's `.on` is replaced; everything else (Status, Command, Event, ...)
// is inherited straight through to the real, untouched mock instance.
function installFakeJsxapi(mockXapi) {
  window.jsxapi = {
    connect() {
      const lifecycle = Object.create(mockXapi);
      lifecycle.on = (event, handler) => {
        if (event === "ready") Promise.resolve().then(() => handler());
        return lifecycle;
      };
      return lifecycle;
    },
  };
}

function mockPlaylistRequests(xapi, videos) {
  xapi.Command.Message.Send.mockImplementation(async ({ Text }) => {
    const message = JSON.parse(Text);
    if (message?.type === "request" && message?.name === "playlist") {
      queueMicrotask(() => {
        xapi.Event.Message.Send.emit({
          Text: JSON.stringify({
            type: "response",
            name: "playlist",
            requestId: message.requestId,
            app: message.app,
            index: 0,
            total: 1,
            content: JSON.stringify(videos),
          }),
        });
      });
    }
    return { status: "OK" };
  });
}

function setCallConnected(xapi, id = 1) {
  xapi.Status.Call[id].Status.set("Connected");
}

function setConferenceCallCapability(xapi, canPresent, id = 1) {
  xapi.Status.Conference.Call[id].Capabilities.Presentation.set(
    canPresent ? "True" : "False",
  );
}

function setOsdWebView(xapi, { id = 3, status = "Visible" } = {}) {
  xapi.Status.UserInterface.WebView[id].Target.set("OSD");
  xapi.Status.UserInterface.WebView[id].Status.set(status);
  xapi.Status.UserInterface.WebView[id].URL.set(`${PLAYER_URL}#somehash`);
  return id;
}

function setPresentationSharing(xapi, { id = 2, source = 1000 } = {}) {
  xapi.Status.Conference.Presentation.LocalInstance[id].SendingMode.set(
    "LocalRemote",
  );
  xapi.Status.Conference.Presentation.LocalInstance[id].Source.set(source);
  return id;
}

function stopPresentationSharing(xapi, id = 2) {
  xapi.Status.Conference.Presentation.LocalInstance[id].remove();
}

async function loadControllerOnDevice(xapi, videos) {
  mockPlaylistRequests(xapi, videos);
  installFakeJsxapi(xapi);

  document.body.innerHTML = '<div id="app"></div>';
  window.location.hash = encodeHash({
    username: "vidcast",
    password: "secret",
    ipAddress: "192.168.1.100",
    mode: "controls",
    panelId: PANEL_ID,
    target: "Controller",
    peripheralId: "controller-1",
  });

  const main = await import("./main.js");
  await flushPromises();
  return main;
}

function selectVideo(main, id) {
  const current = JSON.parse(
    Buffer.from(window.location.hash.slice(1), "base64").toString("utf8"),
  );
  window.location.hash = encodeHash({ ...current, state: "controls", id });
  main.updateStateFromHash();
  main.render();
}

describe("real device Controller - Share in Call", () => {
  let xapi;

  beforeEach(async () => {
    jest.resetModules();
    jest.unstable_mockModule("./webrtc.js", () => ({
      MultiWebRTCDataConnection: FakeMultiWebRTCDataConnection,
    }));
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});

    ({ default: xapi } = await import("xapi"));
    xapi.reset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete window.jsxapi;
  });

  it("hides the Share button when the device is not in a call", async () => {
    const main = await loadControllerOnDevice(xapi, [
      { id: "1", name: "Video 1", camera_asset_url: "a.mp4" },
    ]);
    selectVideo(main, "1");

    expect(document.getElementById("btn-share").hidden).toBe(true);
  });

  it("keeps the Share button hidden when in a call that can't present", async () => {
    const main = await loadControllerOnDevice(xapi, [
      { id: "1", name: "Video 1", camera_asset_url: "a.mp4" },
    ]);
    selectVideo(main, "1");

    setCallConnected(xapi);
    setConferenceCallCapability(xapi, false);
    await flushPromises();

    expect(document.getElementById("btn-share").hidden).toBe(true);
  });

  it("shows the Share button once in a call that supports presenting", async () => {
    const main = await loadControllerOnDevice(xapi, [
      { id: "1", name: "Video 1", camera_asset_url: "a.mp4" },
    ]);
    selectVideo(main, "1");

    setCallConnected(xapi);
    setConferenceCallCapability(xapi, true);
    await flushPromises();

    const shareButton = document.getElementById("btn-share");
    expect(shareButton.hidden).toBe(false);
    expect(shareButton.textContent).toContain("Share");
  });

  it("finds the OSD WebView and starts a LocalRemote presentation on tap", async () => {
    const main = await loadControllerOnDevice(xapi, [
      { id: "1", name: "Video 1", camera_asset_url: "a.mp4" },
    ]);
    selectVideo(main, "1");

    setCallConnected(xapi);
    setConferenceCallCapability(xapi, true);
    const osdId = setOsdWebView(xapi);
    await flushPromises();

    xapi.Command.Presentation.Start.mockResolvedValue({ status: "OK" });

    document.getElementById("btn-share").click();
    await flushPromises();

    expect(xapi.Command.Presentation.Start).toHaveBeenCalledWith({
      PresentationSource: "WebView",
      SendingMode: "LocalRemote",
      WebViewId: osdId,
    });
  });

  it("reflects an active Source 1000 presentation as 'Stop Share'", async () => {
    const main = await loadControllerOnDevice(xapi, [
      { id: "1", name: "Video 1", camera_asset_url: "a.mp4" },
    ]);
    selectVideo(main, "1");

    setCallConnected(xapi);
    setConferenceCallCapability(xapi, true);
    setPresentationSharing(xapi);
    await flushPromises();

    const shareButton = document.getElementById("btn-share");
    expect(shareButton.hidden).toBe(false);
    expect(shareButton.getAttribute("aria-pressed")).toBe("true");
    expect(shareButton.textContent).toContain("Stop Share");
  });

  it("stops, then restarts a LocalOnly presentation so the OSD stays visible", async () => {
    const main = await loadControllerOnDevice(xapi, [
      { id: "1", name: "Video 1", camera_asset_url: "a.mp4" },
    ]);
    selectVideo(main, "1");

    setCallConnected(xapi);
    setConferenceCallCapability(xapi, true);
    const osdId = setOsdWebView(xapi);
    setPresentationSharing(xapi);
    await flushPromises();

    xapi.Command.Presentation.Stop.mockResolvedValue({ status: "OK" });
    xapi.Command.Presentation.Start.mockResolvedValue({ status: "OK" });

    document.getElementById("btn-share").click();
    await flushPromises();

    expect(xapi.Command.Presentation.Stop).toHaveBeenCalledWith();
    expect(xapi.Command.Presentation.Start).toHaveBeenCalledWith({
      PresentationSource: "WebView",
      SendingMode: "LocalOnly",
      WebViewId: osdId,
    });

    const stopCallOrder = xapi.Command.Presentation.Stop.mock.invocationCallOrder[0];
    const startCallOrder = xapi.Command.Presentation.Start.mock.invocationCallOrder[0];
    expect(stopCallOrder).toBeLessThan(startCallOrder);
  });

  it("reverts to 'Share' once the presentation's LocalInstance is removed (ghost)", async () => {
    const main = await loadControllerOnDevice(xapi, [
      { id: "1", name: "Video 1", camera_asset_url: "a.mp4" },
    ]);
    selectVideo(main, "1");

    setCallConnected(xapi);
    setConferenceCallCapability(xapi, true);
    setPresentationSharing(xapi);
    await flushPromises();

    expect(document.getElementById("btn-share").textContent).toContain(
      "Stop Share",
    );

    stopPresentationSharing(xapi);
    await flushPromises();

    const shareButton = document.getElementById("btn-share");
    expect(shareButton.getAttribute("aria-pressed")).toBe("false");
    expect(shareButton.textContent).toContain("Share");
    expect(shareButton.textContent).not.toContain("Stop Share");
  });
});
