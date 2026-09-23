import { afterAll, afterEach, beforeAll, describe, expect, it } from "@jest/globals";
import { JSDOM, ResourceLoader, VirtualConsole } from "jsdom";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The real index.html pulls in jsxapi.js and an icon font from external
// CDNs. Fetching those for real would make every test depend on live network
// access and (per the real-world slowness this file's tests guard against)
// can be very slow. Only the local test server's own files are needed to
// exercise the logic under test, so everything else is skipped.
class LocalOnlyResourceLoader extends ResourceLoader {
  fetch(url, options) {
    if (!url.startsWith(baseUrl)) return null;
    return super.fetch(url, options);
  }
}

const webRoot = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

let server;
let baseUrl;
let openDoms = [];

beforeAll(async () => {
  server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      const pathname = url.pathname === "/" ? "/demo.html" : url.pathname;
      const filePath = path.join(webRoot, decodeURIComponent(pathname));
      const data = await readFile(filePath);
      res.writeHead(200, {
        "Content-Type":
          CONTENT_TYPES[path.extname(filePath)] || "application/octet-stream",
      });
      res.end(data);
    } catch (error) {
      res.writeHead(404);
      res.end("Not found");
    }
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  // jsdom's fetches for the (many) iframes each test loads keep their HTTP
  // keep-alive sockets open; server.close() alone only waits for those to
  // end on their own and can hang past Jest's default hook timeout, so the
  // open connections are force-closed first.
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

afterEach(() => {
  for (const dom of openDoms) dom.window.close();
  openDoms = [];
});

function encodeHash(payload) {
  return "#" + Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

function decodeHash(hash) {
  return JSON.parse(Buffer.from(hash.slice(1), "base64").toString("utf8"));
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate, { timeout = 2000, interval = 25 } = {}) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeout) {
      throw new Error("waitFor: timed out waiting for condition");
    }
    await wait(interval);
  }
}

// Loads the real demo.html over a local server with scripts enabled, so its
// inline script actually runs and creates the real OSD/Controller iframes
// (which in turn load the real index.html + main.js).
async function loadDemoPage() {
  const virtualConsole = new VirtualConsole();
  // The demo's Controller iframes exercise WebRTC signaling that jsdom
  // doesn't implement (no RTCPeerConnection); that's an existing, unrelated
  // limitation of the demo page, not something under test here, so route
  // jsdom's console/error noise away from the test output.
  virtualConsole.on("jsdomError", () => {});

  const dom = await JSDOM.fromURL(`${baseUrl}/demo.html`, {
    runScripts: "dangerously",
    resources: new LocalOnlyResourceLoader(),
    pretendToBeVisual: true,
    virtualConsole,
  });
  openDoms.push(dom);

  await waitFor(
    () =>
      dom.window.document.querySelector("#osd iframe")?.contentDocument
        ?.readyState === "complete" &&
      dom.window.document
        .querySelector("#osd iframe")
        .contentWindow.location.hash.length > 1,
  );

  return dom;
}

describe("demo.html Vidcast logo control", () => {
  it("defaults to Visible and launches the OSD iframe with showLogo:true", async () => {
    const dom = await loadDemoPage();
    const { document } = dom.window;

    const logoToggle = document.getElementById("osd-logo");
    expect(logoToggle.textContent.trim()).toBe("Visible");
    expect(logoToggle.getAttribute("aria-pressed")).toBe("true");

    const osdIframe = document.querySelector("#osd iframe");
    const hash = decodeHash(new URL(osdIframe.src).hash);
    expect(hash.showLogo).toBe(true);
  });

  it("toggles the button UI and the live OSD iframe hash without recreating the iframe", async () => {
    const dom = await loadDemoPage();
    const { document } = dom.window;

    const osdIframeBefore = document.querySelector("#osd iframe");
    const logoToggle = document.getElementById("osd-logo");

    logoToggle.click();

    // Same iframe element/node identity: this was a live hash patch, not a
    // reload or a rebuild of the iframe (unlike the other demo controls).
    expect(document.querySelector("#osd iframe")).toBe(osdIframeBefore);

    expect(logoToggle.textContent.trim()).toBe("Hidden");
    expect(logoToggle.getAttribute("aria-pressed")).toBe("false");

    await waitFor(() => {
      const hash = decodeHash(osdIframeBefore.contentWindow.location.hash);
      return hash.showLogo === false;
    });
  });

  it("toggling back to Visible restores showLogo:true on the OSD iframe", async () => {
    const dom = await loadDemoPage();
    const { document } = dom.window;
    const osdIframe = document.querySelector("#osd iframe");
    const logoToggle = document.getElementById("osd-logo");

    logoToggle.click();
    await waitFor(
      () => decodeHash(osdIframe.contentWindow.location.hash).showLogo === false,
    );

    logoToggle.click();
    expect(logoToggle.textContent.trim()).toBe("Visible");
    expect(logoToggle.getAttribute("aria-pressed")).toBe("true");
    await waitFor(
      () => decodeHash(osdIframe.contentWindow.location.hash).showLogo === true,
    );
  });

  it("merges showLogo into the OSD iframe's hash without disturbing the currently selected video", async () => {
    const dom = await loadDemoPage();
    const { document } = dom.window;
    const osdIframe = document.querySelector("#osd iframe");

    // Simulate a paired controller having already selected a video, which
    // is normally relayed to the OSD over the WebRTC data channel by
    // updating its hash (main.js's own updateStateFromHash/render logic is
    // covered separately in main.test.js).
    const current = decodeHash(osdIframe.contentWindow.location.hash);
    osdIframe.contentWindow.location.hash = encodeHash({
      ...current,
      state: "player",
      id: "1",
    });

    document.getElementById("osd-logo").click();

    await waitFor(() => {
      const hash = decodeHash(osdIframe.contentWindow.location.hash);
      return hash.showLogo === false;
    });

    const hashAfterToggle = decodeHash(osdIframe.contentWindow.location.hash);
    expect(hashAfterToggle).toEqual(
      expect.objectContaining({ state: "player", id: "1", showLogo: false }),
    );
  });
});

describe("demo.html OSD interactive toggle", () => {
  it("defaults to Non Interactive and launches the OSD iframe with interactive:false", async () => {
    const dom = await loadDemoPage();
    const { document } = dom.window;

    const osdToggle = document.getElementById("osd-interactive");
    expect(osdToggle.textContent.trim()).toBe("Non Interactive");
    expect(osdToggle.getAttribute("aria-pressed")).toBe("false");

    const osdIframe = document.querySelector("#osd iframe");
    expect(decodeHash(new URL(osdIframe.src).hash).interactive).toBe(false);
  });

  it("patches interactive onto the live OSD iframe hash without recreating any iframe", async () => {
    const dom = await loadDemoPage();
    const { document } = dom.window;

    const osdIframeBefore = document.querySelector("#osd iframe");
    const controllerIframesBefore = Array.from(
      document.querySelectorAll("#controller iframe"),
    );
    const osdToggle = document.getElementById("osd-interactive");

    osdToggle.click();

    // Same OSD iframe element, and the (unrelated) controller iframes are
    // untouched too: toggling OSD interactivity must not reload anything.
    expect(document.querySelector("#osd iframe")).toBe(osdIframeBefore);
    expect(Array.from(document.querySelectorAll("#controller iframe"))).toEqual(
      controllerIframesBefore,
    );

    expect(osdToggle.textContent.trim()).toBe("Interactive");
    expect(osdToggle.getAttribute("aria-pressed")).toBe("true");

    await waitFor(() => {
      const hash = decodeHash(osdIframeBefore.contentWindow.location.hash);
      return hash.interactive === true;
    });
  });
});

describe("demo.html controller count control", () => {
  it("only adds the newly needed controller iframes, leaving the OSD and existing controllers untouched", async () => {
    const dom = await loadDemoPage();
    const { document } = dom.window;

    const osdIframeBefore = document.querySelector("#osd iframe");
    const controllerIframesBefore = Array.from(
      document.querySelectorAll("#controller iframe"),
    );
    expect(controllerIframesBefore).toHaveLength(2);

    const controllerCount = document.getElementById("controller-count");
    controllerCount.value = "3";
    controllerCount.dispatchEvent(new dom.window.Event("change"));

    const controllerIframesAfter = Array.from(
      document.querySelectorAll("#controller iframe"),
    );
    expect(controllerIframesAfter).toHaveLength(3);
    // The first two controller iframes are the exact same elements as
    // before: only the third (new) one was created.
    expect(controllerIframesAfter[0]).toBe(controllerIframesBefore[0]);
    expect(controllerIframesAfter[1]).toBe(controllerIframesBefore[1]);
    expect(controllerIframesAfter[2]).not.toBe(controllerIframesBefore[0]);
    expect(controllerIframesAfter[2]).not.toBe(controllerIframesBefore[1]);

    // The OSD iframe was never touched by a controller-count change.
    expect(document.querySelector("#osd iframe")).toBe(osdIframeBefore);
  });

  it("removes only the trailing controller iframes when the count decreases", async () => {
    const dom = await loadDemoPage();
    const { document } = dom.window;

    const controllerIframesBefore = Array.from(
      document.querySelectorAll("#controller iframe"),
    );
    expect(controllerIframesBefore).toHaveLength(2);

    const controllerCount = document.getElementById("controller-count");
    controllerCount.value = "1";
    controllerCount.dispatchEvent(new dom.window.Event("change"));

    const controllerIframesAfter = Array.from(
      document.querySelectorAll("#controller iframe"),
    );
    expect(controllerIframesAfter).toHaveLength(1);
    // The remaining controller is the original first one, not a fresh reload.
    expect(controllerIframesAfter[0]).toBe(controllerIframesBefore[0]);
  });
});
