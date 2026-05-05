/********************************************************
 * Macro Author:      	William Mills
 *                    	Technical Solutions Specialist
 *                    	wimills@cisco.com
 *                    	Cisco Systems
 *
 * Version: 1-0-0
 * Released: 11/13/25
 *
 * This is an example macro which demonstrates how to open and
 * control playback of Vidcast videos from a paired Room Navigator.
 *
 * Full Readme, source code and license details available here:
 * https://github.com/wxsd-sales/vidcast-webapp-macro
 *
 ********************************************************/

import xapi from "xapi";

/*********************************************************
 * Configure the settings below
 **********************************************************/

const config = {
  button: {
    name: "Vidcast",
    icon: "https://app.vidcast.io/icon.png",
  },
  vidcast: {
    playlistId: "727b3694-97d2-4a6c-97b1-6511d17514d3",
  },
  playerUrl: "https://wxsd-sales.github.io/vidcast-webapp-macro/webapp/index.html",
  panelId: "vidcast",
};

/*********************************************************
 * Do not change below
 **********************************************************/

const PLAYLIST_MESSAGE_NAME = "playlist";
const MAX_MESSAGE_TEXT_LENGTH = 8192;

let opening = false;
let activeCompanionKey = null;
let activePlaylist = [];
const webviewUrls = {};
const webviews = {};

init().catch((error) =>
  console.warn("Unable to initialise Vidcast macro:", error.message || error),
);

async function init() {
  xapi.Event.UserInterface.Extensions.Panel.Clicked.on(processClicks);
  xapi.Event.Message.Send.on(processMessageSend);

  xapi.Status.UserInterface.WebView.on(({ URL, Type, id, ghost }) => {
    const closedTarget = getWebviewTarget(id);
    if (ghost && closedTarget) {
      clearCompanionWebview(closedTarget);
      resetTrackedWebviews();
      deleteAccount(config.panelId);
      return;
    }

    if (!URL || Type != "Integration") return;
    const target = getWebviewUrlTarget(URL);
    if (!target) return;
    webviews[target] = id;
  });

  await deleteAccount(config.panelId);
  await removePlaylistUI();
  await createButton();
}

async function processClicks({ PanelId, PeripheralId }) {
  if (PanelId != config.panelId) return;
  if (opening) return;
  if (hasOpenWebviews()) return;

  opening = true;
  setTimeout(() => {
    opening = false;
  }, 2000);

  try {
    const playlist = await getPlaylist();
    activePlaylist = playlist;
    await openWebviews({ PeripheralId });
  } catch (error) {
    console.warn("Unable to open Vidcast WebViews:", error.message || error);
  }
}

function processMessageSend({ Text }) {
  const data = safeParse(Text);
  if (!isPlaylistRequest(data)) return;

  sendPlaylist(data).catch((error) => {
    console.warn("Unable to send Vidcast playlist:", error.message || error);
    sendPlaylistError(data, "Unable to send Vidcast playlist").catch(
      (sendError) =>
        console.warn(
          "Unable to send Vidcast playlist error:",
          sendError.message || sendError,
        ),
    );
  });
}

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    return;
  }
}

function isPlaylistRequest(data) {
  return (
    data?.type == "request" &&
    data?.name == PLAYLIST_MESSAGE_NAME &&
    data?.app?.panelId == config.panelId &&
    typeof data.requestId == "string" &&
    data.requestId.length > 0
  );
}

async function sendPlaylist(request) {
  const playlist = Array.isArray(activePlaylist) ? activePlaylist : [];
  const content = JSON.stringify(playlist);
  const packets = createMessageResponsePackets(content, request);

  for (const packet of packets) {
    await xapi.Command.Message.Send({ Text: JSON.stringify(packet) });
  }
}

function sendPlaylistError(request, message) {
  return xapi.Command.Message.Send({
    Text: JSON.stringify({
      type: "error",
      name: PLAYLIST_MESSAGE_NAME,
      requestId: request.requestId,
      app: getMessageApp(request.app),
      message,
    }),
  });
}

function createMessageResponsePackets(content, request) {
  let total = 1;

  while (true) {
    const chunks = splitContentForPacketTotal(content, request, total);
    if (chunks.length == total) {
      return chunks.map((chunk, index) => ({
        type: "response",
        name: PLAYLIST_MESSAGE_NAME,
        requestId: request.requestId,
        app: getMessageApp(request.app),
        index,
        total: chunks.length,
        content: chunk,
      }));
    }
    total = chunks.length;
  }
}

function splitContentForPacketTotal(content, request, total) {
  if (content.length == 0) return [""];

  const chunks = [];
  let start = 0;

  while (start < content.length) {
    const index = chunks.length;
    const packetBase = {
      type: "response",
      name: PLAYLIST_MESSAGE_NAME,
      requestId: request.requestId,
      app: getMessageApp(request.app),
      index,
      total,
    };
    const end = findPacketEnd(content, start, packetBase);
    chunks.push(content.slice(start, end));
    start = end;
  }

  return chunks;
}

function findPacketEnd(content, start, packetBase) {
  let low = start + 1;
  let high = content.length;
  let best = start;

  while (low <= high) {
    const end = Math.floor((low + high) / 2);
    const Text = JSON.stringify({
      ...packetBase,
      content: content.slice(start, end),
    });

    if (Text.length <= MAX_MESSAGE_TEXT_LENGTH) {
      best = end;
      low = end + 1;
    } else {
      high = end - 1;
    }
  }

  if (best == start) {
    throw new Error("Unable to create a Message.Send packet within the size limit");
  }

  return best;
}

function getMessageApp(app = {}) {
  const messageApp = {
    panelId: config.panelId,
  };

  if (hasPeripheralId(app.PeripheralId)) {
    messageApp.PeripheralId = app.PeripheralId;
  } else {
    messageApp.Target = app.Target || "OSD";
  }

  return messageApp;
}

function hasOpenWebviews() {
  return (
    Object.values(webviews).some(Boolean) ||
    Object.values(webviewUrls).some(Boolean)
  );
}

async function getPlaylist() {
  const playlistId = config.vidcast.playlistId;
  const url = `https://api.vidcast.io/v1/playlists/${playlistId}/videos`;
  const params = "?page=0&pageSize=20&skipUnavailable=false";

  try {
    const result = await xapi.Command.HttpClient.Get({
      Url: url + params,
      ResultBody: "PlainText",
    });
    const body = JSON.parse(result.Body);
    return Array.isArray(body?.content) ? body.content : [];
  } catch (error) {
    console.warn("Unable to get Vidcast playlist:", error.message || error);
    return [];
  }
}

async function openWebviews({ PeripheralId } = {}) {
  const username = config.panelId;
  const password = await createIntegrationAccount(username);
  const companionKey = getWebviewKey({
    Target: "Controller",
    PeripheralId,
  });
  const Title = config.button.name;

  try {
    const osdUrl = await createWebappUrl({
      username,
      password,
      mode: "player",
      Target: "OSD",
    });
    const companionUrl = await createWebappUrl({
      username,
      password,
      mode: "controls",
      Target: "Controller",
      PeripheralId,
    });

    activeCompanionKey = companionKey;
    trackWebviewUrl("OSD", osdUrl);
    trackWebviewUrl(companionKey, companionUrl);

    await xapi.Command.UserInterface.WebView.Display({
      Mode: "Fullscreen",
      Target: "OSD",
      Title,
      Url: osdUrl,
    });
    await xapi.Command.UserInterface.WebView.Display({
      Mode: "Fullscreen",
      ...getWebviewDisplayTarget({ Target: "Controller", PeripheralId }),
      Title,
      Url: companionUrl,
    });
  } catch (error) {
    await clearTrackedWebviews();
    resetTrackedWebviews();
    await deleteAccount(username);
    throw error;
  }
}

function trackWebviewUrl(target, url) {
  webviewUrls[target] = url;
  webviews[target] = webviews[target] ?? null;
}

async function clearTrackedWebviews() {
  await Promise.all(
    Object.keys(webviewUrls).map((target) =>
      xapi.Command.UserInterface.WebView.Clear(getWebviewClearTarget(target)),
    ),
  );
}

function clearCompanionWebview(closedTarget) {
  const companionTarget = getCompanionWebviewTarget(closedTarget);
  if (!companionTarget) return;
  if (!webviews[companionTarget] && !webviewUrls[companionTarget]) return;
  xapi.Command.UserInterface.WebView.Clear(getWebviewClearTarget(companionTarget));
}

function resetTrackedWebviews() {
  for (const target of Object.keys(webviews)) delete webviews[target];
  for (const target of Object.keys(webviewUrls)) delete webviewUrls[target];
  activeCompanionKey = null;
}

function getWebviewTarget(id) {
  return Object.keys(webviews).find((target) => webviews[target] == id);
}

function getWebviewUrlTarget(url) {
  return Object.keys(webviewUrls).find((target) => webviewUrls[target] == url);
}

function getCompanionWebviewTarget(target) {
  if (target == "OSD") return activeCompanionKey;
  if (target == activeCompanionKey) return "OSD";
}

function hasPeripheralId(PeripheralId) {
  return typeof PeripheralId == "string" && PeripheralId.length > 0;
}

function getWebviewKey({ Target = "OSD", PeripheralId } = {}) {
  return hasPeripheralId(PeripheralId) ? `Peripheral:${PeripheralId}` : Target;
}

function getWebviewDisplayTarget({ Target = "OSD", PeripheralId } = {}) {
  if (hasPeripheralId(PeripheralId)) return { PeripheralId };
  return { Target };
}

function getWebviewClearTarget(target) {
  if (target.startsWith("Peripheral:")) {
    return { PeripheralId: target.replace("Peripheral:", "") };
  }
  return { Target: target };
}

async function createWebappUrl({
  username,
  password,
  mode,
  Target = "OSD",
  PeripheralId,
}) {
  const ipAddress = await getDeviceAddress();
  const payload = {
    username,
    password,
    ipAddress,
    mode,
    panelId: config.panelId,
    target: Target,
  };

  if (hasPeripheralId(PeripheralId)) payload.peripheralId = PeripheralId;

  return `${config.playerUrl.split("#")[0]}#${btoa(JSON.stringify(payload))}`;
}

async function getDeviceAddress() {
  const ipv4 = await xapi.Status.Network[1].IPv4.Address.get();
  if (ipv4) return ipv4;

  const ipv6 = await xapi.Status.Network[1].IPv6.Address.get();
  if (ipv6) return `[${ipv6.replace(/^\[|\]$/g, "")}]`;

  throw new Error("Device IP address is unavailable");
}

async function createAccount(username, password) {
  const existingAccount = await findAccount(username);
  if (existingAccount) await deleteAccount(username);

  try {
    const result = await xapi.Command.UserManagement.User.Add({
      Active: "True",
      Passphrase: password,
      PassphraseChangeRequired: "False",
      Role: ["Integrator", "User"],
      ShellLogin: "False",
      Username: username,
    });
    return result;
  } catch (error) {
    console.warn("Error creating user:", JSON.stringify(error));
    throw error;
  }
}

async function deleteAccount(username) {
  const existingAccount = await findAccount(username);
  if (!existingAccount) return;

  return new Promise(function (resolve) {
    xapi.Command.UserManagement.User.Delete({ Username: username })
      .then(async ({ status }) => {
        await sleep(200);
        resolve(status);
      })
      .catch((error) => {
        console.warn(`User Account [${username}] - Delete Error - ${error}`);
        resolve();
      });
  });
}

async function findAccount(username) {
  const query = await xapi.Command.UserManagement.User.List();
  const users = query?.User;
  if (!users) return;
  return users.find((user) => user.Username == username);
}

function createPassword(length) {
  const chars =
    "0123456789abcdefghijklmnopqrstuvwxyz!@#$%^&*()ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let password = "";
  for (let i = 0; i < length; i++) {
    const randomNumber = Math.floor(Math.random() * chars.length);
    password += chars.substring(randomNumber, randomNumber + 1);
  }
  return password;
}

async function createIntegrationAccount(username, characterLength = 10) {
  if (characterLength < 10) characterLength = 10;
  if (characterLength > 255) characterLength = 255;
  const password = createPassword(characterLength);
  await createAccount(username, password);
  return password;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createButton() {
  const panelId = config.panelId;
  const button = config.button;
  const order = await panelOrder(panelId);
  const icon = button?.icon?.startsWith("http")
    ? await getIcon(button.icon)
    : button?.icon
      ? `<Icon>${button.icon}</Icon>`
      : "";
  const color = button?.color ? `<Color>${button.color}</Color>` : "";

  const panel = `
    <Extensions>
      <Panel>
        ${order}
        <Type>Statusbar</Type>
        <Location>HomeScreen</Location>
        ${icon}
        ${color}
        <Name>${replaceSpecialCharacters(button?.name)}</Name>
        <ActivityType>Custom</ActivityType>
      </Panel>
    </Extensions>`;

  return xapi.Command.UserInterface.Extensions.Panel.Save({ PanelId: panelId }, panel);
}

function removePlaylistUI() {
  return xapi.Command.UserInterface.Extensions.Panel.Remove({
    PanelId: config.panelId + "playlist",
  }).catch(() => {});
}

function replaceSpecialCharacters(text = "") {
  return String(text)
    .replaceAll(/&/g, "&amp;")
    .replaceAll(/</g, "&lt;")
    .replaceAll(/>/g, "&gt;");
  //.replaceAll(/"/g, "&quot;")
  //.replaceAll(/'/g, "&apos;");
}

/*********************************************************
 * Gets the current Panel Order if exiting Macro panel is present
 * to preserve the order in relation to other custom UI Extensions
 **********************************************************/
async function panelOrder(panelId) {
  const list = await xapi.Command.UserInterface.Extensions.List({
    ActivityType: "Custom",
  });
  const panel = list?.Extensions?.Panel;
  if (!panel) return "";
  const panels = Array.isArray(panel) ? panel : [panel];
  const existingPanel = panels.find((item) => item.PanelId == panelId);
  if (!existingPanel) return "";
  return `<Order>${existingPanel.Order}</Order>`;
}

/*********************************************************
 * Downloads Icon from provided URL and returns the
 * Icon Id as the required UI Extension XML string
 **********************************************************/
function getIcon(url) {
  return xapi.Command.UserInterface.Extensions.Icon.Download({ Url: url })
    .then((result) =>
      result?.IconId
        ? `<Icon>Custom</Icon><CustomIcon><Id>${result.IconId}</Id></CustomIcon>`
        : "",
    )
    .catch((error) => {
      console.warn("Unable to download icon:", error.message || error);
      return "";
    });
}
