import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

const macroName = "./vidcast.js";
const panelId = "vidcast";
const playlistId = "727b3694-97d2-4a6c-97b1-6511d17514d3";
const playerUrl = "https://wxsd-sales.github.io/vidcast-webapp-macro/webapp/index.html";
const playlistUrl = `https://api.vidcast.io/v1/playlists/${playlistId}/videos?page=0&pageSize=20&skipUnavailable=false`;

const fallbackPlaylist = [
  {
    id: "video-1",
    name: "Mock playlist fallback",
    description: "A short Vidcast demo",
    created: "1764610200452",
    user_name: "Example User",
    duration: "43840",
    avatar_url: "https://example.com/avatar.jpg",
    camera_thumbnail_asset_url: "https://example.com/thumb.jpg",
    matrix_thumbnail_asset_url: "https://example.com/matrix.jpg",
    camera_asset_url: "https://example.com/video.mp4",
    preview_asset_url: "https://example.com/preview.mp4",
  },
];

const webappVideoFields = [
  "id",
  "name",
  "description",
  "created",
  "user_name",
  "duration",
  "avatar_url",
  "camera_thumbnail_asset_url",
  "camera_asset_url",
];

async function loadPlaylistFixture() {
  try {
    const response = await fetchWithTimeout(playlistUrl, 5000);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const body = await response.json();
    if (!Array.isArray(body?.content) || body.content.length == 0) {
      throw new Error("playlist response did not include any videos");
    }

    return {
      label: "live playlist fixture",
      videos: body.content,
    };
  } catch (error) {
    const reason = error?.message || String(error);

    return {
      label: `mock playlist fallback fixture because ${reason}`,
      videos: fallbackPlaylist.map((video) => ({
        ...video,
        name: `Mock playlist fallback: ${reason}`,
      })),
    };
  }
}

const playlistFixture = await loadPlaylistFixture();
const playlist = playlistFixture.videos;

async function fetchWithTimeout(url, timeoutMs) {
  if (typeof fetch != "function") {
    throw new Error("fetch is not available in this test runtime");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function flushPromises() {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
}

function filterPlaylistForWebapp(videos) {
  return videos.map((video) => {
    const filtered = {};

    for (const field of webappVideoFields) {
      if (Object.prototype.hasOwnProperty.call(video, field)) {
        filtered[field] = video[field];
      }
    }

    return filtered;
  });
}

function mockLocalAccount(xapi, exists = false) {
  let accountExists = exists;

  xapi.Command.UserManagement.User.List.mockImplementation(async () => ({
    User: accountExists ? [{ Username: panelId }] : [],
  }));
  xapi.Command.UserManagement.User.Add.mockImplementation(async () => {
    accountExists = true;
    return { status: "OK" };
  });
  xapi.Command.UserManagement.User.Delete.mockImplementation(async () => {
    accountExists = false;
    return { status: "OK" };
  });

  return {
    exists() {
      return accountExists;
    },
  };
}

async function loadMacro(xapi, options = {}) {
  xapi.Status.Network[1].IPv4.Address.set(
    options.ipv4Address ?? "192.168.1.100",
  );
  xapi.Status.Network[1].IPv6.Address.set(options.ipv6Address ?? "");
  xapi.Command.UserInterface.Extensions.List.mockResolvedValue({
    Extensions: { Panel: [] },
  });
  xapi.Command.UserInterface.Extensions.Icon.Download.mockResolvedValue({
    IconId: "vidcast-icon",
  });
  xapi.Command.HttpClient.Get.mockResolvedValue({
    Body: JSON.stringify({ content: options.playlist ?? playlist }),
  });

  mockLocalAccount(xapi, options.accountExists ?? false);
  await import(macroName);
  await flushPromises();
}

async function clickPanel(xapi, clickEvent = {}) {
  xapi.Event.UserInterface.Extensions.Panel.Clicked.emit({
    PanelId: panelId,
    ...clickEvent,
  });
  await flushPromises();
  return xapi.Command.UserInterface.WebView.Display.mock.calls.map(
    ([args]) => args,
  );
}

function decodeUrlPayload(Url) {
  const hash = Url.split("#")[1];
  return JSON.parse(Buffer.from(hash, "base64").toString("utf8"));
}

function utf8ByteLength(text) {
  return Buffer.byteLength(text, "utf8");
}

async function requestPlaylist(xapi, app, requestId = "request-1") {
  xapi.Event.Message.Send.emit({
    Text: JSON.stringify({
      type: "request",
      name: "playlist",
      requestId,
      app,
    }),
  });
  await flushPromises();
  return xapi.Command.Message.Send.mock.calls.map(([args]) =>
    JSON.parse(args.Text),
  );
}

function expectPlaylistPackets({ packets, packetTexts, requestId, app, videos }) {
  const expectedContent = JSON.stringify(filterPlaylistForWebapp(videos));

  expect(packets.length).toBeGreaterThan(0);
  expect(packetTexts.every((text) => utf8ByteLength(text) <= 8192)).toBe(true);
  expect(packets.every((packet) => packet.total == packets.length)).toBe(true);
  expect(packets.map((packet) => packet.index)).toEqual(
    packets.map((_, index) => index),
  );

  for (const packet of packets) {
    expect(packet).toEqual(
      expect.objectContaining({
        type: "response",
        name: "playlist",
        requestId,
        app,
      }),
    );
  }

  expect(packets.map((packet) => packet.content).join("")).toBe(
    expectedContent,
  );
}

describe("Vidcast macro", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it("saves the Vidcast launch button on startup", async () => {
    const { default: xapi } = await import("xapi");
    xapi.reset();

    await loadMacro(xapi);

    expect(xapi.Command.UserInterface.Extensions.Panel.Save).toHaveBeenCalledWith(
      { PanelId: panelId },
      expect.stringContaining("<Name>Vidcast</Name>"),
    );
    expect(xapi.Command.UserInterface.Extensions.Panel.Save).toHaveBeenCalledWith(
      { PanelId: panelId },
      expect.stringContaining(
        "<Icon>Custom</Icon><CustomIcon><Id>vidcast-icon</Id></CustomIcon>",
      ),
    );
  });

  it(`opens player and sends playlist packets from ${playlistFixture.label}`, async () => {
    const { default: xapi } = await import("xapi");
    xapi.reset();
    await loadMacro(xapi);
    xapi.clearCallHistory();

    const displayArgs = await clickPanel(xapi, { PeripheralId: "panel-1" });

    expect(xapi.Command.HttpClient.Get).toHaveBeenCalledWith({
      Url: playlistUrl,
      ResultBody: "PlainText",
    });
    expect(xapi.Command.UserInterface.Extensions.Panel.Save).not.toHaveBeenCalled();
    expect(xapi.Command.UserManagement.User.Add).toHaveBeenCalledWith(
      expect.objectContaining({
        Role: ["Integrator", "User"],
        ShellLogin: "False",
        Username: panelId,
      }),
    );
    expect(displayArgs).toHaveLength(2);
    expect(displayArgs[0]).toEqual(
      expect.objectContaining({
        Mode: "Fullscreen",
        Target: "OSD",
        Title: "Vidcast",
      }),
    );
    expect(displayArgs[1]).toEqual(
      expect.objectContaining({
        Mode: "Fullscreen",
        PeripheralId: "panel-1",
        Title: "Vidcast",
      }),
    );
    expect(displayArgs[1]).not.toHaveProperty("Target");

    const osdPayload = decodeUrlPayload(displayArgs[0].Url);
    const controlsPayload = decodeUrlPayload(displayArgs[1].Url);

    expect(displayArgs[0].Url.startsWith(`${playerUrl}#`)).toBe(true);
    expect(osdPayload).toEqual(
      expect.objectContaining({
        username: panelId,
        ipAddress: "192.168.1.100",
        mode: "player",
        panelId,
        target: "OSD",
      }),
    );
    expect(controlsPayload).toEqual(
      expect.objectContaining({
        username: panelId,
        ipAddress: "192.168.1.100",
        mode: "controls",
        panelId,
        target: "Controller",
        peripheralId: "panel-1",
      }),
    );
    expect(controlsPayload.password).toBe(osdPayload.password);

    const packets = await requestPlaylist(xapi, {
      panelId,
      PeripheralId: "panel-1",
    });
    const packetTexts = xapi.Command.Message.Send.mock.calls.map(
      ([args]) => args.Text,
    );

    expectPlaylistPackets({
      packets,
      packetTexts,
      requestId: "request-1",
      app: {
        panelId,
        PeripheralId: "panel-1",
      },
      videos: playlist,
    });
  });

  it("falls back to Target Controller when no PeripheralId is provided", async () => {
    const { default: xapi } = await import("xapi");
    xapi.reset();
    await loadMacro(xapi);
    xapi.clearCallHistory();

    const displayArgs = await clickPanel(xapi);

    expect(displayArgs[0]).toEqual(
      expect.objectContaining({
        Target: "OSD",
      }),
    );
    expect(displayArgs[1]).toEqual(
      expect.objectContaining({
        Target: "Controller",
      }),
    );
    expect(decodeUrlPayload(displayArgs[1].Url)).toEqual(
      expect.objectContaining({
        mode: "controls",
        panelId,
        target: "Controller",
      }),
    );
    expect(decodeUrlPayload(displayArgs[1].Url)).not.toHaveProperty(
      "peripheralId",
    );
  });

  it("ignores panel ids that only share the configured prefix", async () => {
    const { default: xapi } = await import("xapi");
    xapi.reset();
    await loadMacro(xapi);
    xapi.clearCallHistory();

    xapi.Event.UserInterface.Extensions.Panel.Clicked.emit({
      PanelId: `${panelId}playlist`,
      PeripheralId: "panel-1",
    });
    await flushPromises();

    expect(xapi.Command.HttpClient.Get).not.toHaveBeenCalled();
    expect(xapi.Command.UserInterface.WebView.Display).not.toHaveBeenCalled();
  });

  it("ignores Message.Send playlist requests for other panels", async () => {
    const { default: xapi } = await import("xapi");
    xapi.reset();
    await loadMacro(xapi);
    xapi.clearCallHistory();

    const packets = await requestPlaylist(xapi, {
      panelId: "other-panel",
      Target: "OSD",
    });

    expect(packets).toEqual([]);
  });

  it("splits large playlist responses within the Message.Send limit", async () => {
    const { default: xapi } = await import("xapi");
    xapi.reset();
    const largePlaylist = [
      {
        ...playlist[0],
        description: "A".repeat(20000),
      },
    ];
    await loadMacro(xapi, { playlist: largePlaylist });
    xapi.clearCallHistory();
    await clickPanel(xapi);

    const packets = await requestPlaylist(
      xapi,
      {
        panelId,
        Target: "OSD",
      },
      "large-request",
    );
    const packetTexts = xapi.Command.Message.Send.mock.calls.map(
      ([args]) => args.Text,
    );

    expectPlaylistPackets({
      packets,
      packetTexts,
      requestId: "large-request",
      app: {
        panelId,
        Target: "OSD",
      },
      videos: largePlaylist,
    });
    expect(packets.length).toBeGreaterThan(1);
  });

  it("splits playlist responses by UTF-8 byte length", async () => {
    const { default: xapi } = await import("xapi");
    xapi.reset();
    const largePlaylist = [
      {
        ...playlist[0],
        description: "Résumé ".repeat(3000),
      },
    ];
    await loadMacro(xapi, { playlist: largePlaylist });
    xapi.clearCallHistory();
    await clickPanel(xapi);

    const packets = await requestPlaylist(
      xapi,
      {
        panelId,
        Target: "OSD",
      },
      "utf8-request",
    );
    const packetTexts = xapi.Command.Message.Send.mock.calls.map(
      ([args]) => args.Text,
    );

    expectPlaylistPackets({
      packets,
      packetTexts,
      requestId: "utf8-request",
      app: {
        panelId,
        Target: "OSD",
      },
      videos: largePlaylist,
    });
    expect(packets.length).toBeGreaterThan(1);
  });

  it("clears the companion webview and deletes the temporary account when a tracked view closes", async () => {
    const { default: xapi } = await import("xapi");
    xapi.reset();
    const account = mockLocalAccount(xapi, false);
    await loadMacro(xapi);
    xapi.clearCallHistory();

    const displayArgs = await clickPanel(xapi, { PeripheralId: "panel-1" });

    xapi.Status.UserInterface.WebView[1].URL.set(displayArgs[0].Url);
    xapi.Status.UserInterface.WebView[1].Type.set("Integration");
    xapi.Status.UserInterface.WebView[2].URL.set(displayArgs[1].Url);
    xapi.Status.UserInterface.WebView[2].Type.set("Integration");
    xapi.Status.UserInterface.WebView[1].remove();
    await flushPromises();

    expect(xapi.Command.UserInterface.WebView.Clear).toHaveBeenCalledWith({
      PeripheralId: "panel-1",
    });
    expect(xapi.Command.UserManagement.User.Delete).toHaveBeenCalledWith({
      Username: panelId,
    });
    expect(account.exists()).toBe(false);
  });
});
