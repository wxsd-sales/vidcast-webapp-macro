import { PlayerController } from "./playerController.js";
import { MultiWebRTCDataConnection } from "./webrtc.js";
import { testPlaylist } from "./tests.js";
import {
  formatDuration,
  setHash,
  getHashes,
  isTouchDevice,
  formatDate,
} from "./utils.js";

// --- State Management ---
export let APP_STATE = {
  videos: [],
  current: null, // current video object
  state: "playlist", // or 'player' or 'controls'
  mode: "controls",
  target: "Controller",
  peripheralId: null,
  interactive: false,
  demo: false,
  showLogo: true,
  // Only meaningful on a real device Controller: whether the device is
  // currently in a call that supports presenting into it.
  canShareInCall: false,
  playback: {
    playing: false,
    paused: true,
    ended: false,
    currentTime: 0,
    duration: 0,
    volume: 1,
    muted: false,
    playbackRate: 1,
  },
  sharing: false,
};

let xapi;
let multiConn;
let player;
let playerController;
let suppressNextHashBroadcast = false;

// Real device "Share in Call" support: raw xStatus caches keyed by their
// array index/id, kept in sync via subscription and used to derive whether
// the Share button should be shown and whether we're currently presenting.
let callStatuses = {};
let conferenceCallStatuses = {};
let presentationInstances = {};

// --- Constants ---
const LOGO_URL =
  "https://www.vidcast.io/wp-content/themes/cisco_vidcast/library/images/vidcast-logo--white.svg";
const PLAYLIST_MESSAGE_NAME = "playlist";
const PLAYLIST_REQUEST_TIMEOUT = 8000;
const PLAY_ICON = renderMomentumIcon("icon-play-filled", "controls-icon");
const PAUSE_ICON = renderMomentumIcon("icon-pause-filled", "controls-icon");
const SHARE_ICON = renderMomentumIcon(
  "icon-share-screen-regular",
  "share-icon",
);
const LIBRARY_ICON = renderMomentumIcon("icon-view-all-regular", "library-icon");
const DEVICE_CONNECTION_ALERT_ID = "device-connection-alert";
const DEVICE_CONNECTION_ALERT_ICON = renderMomentumIcon(
  "icon-error-legacy-filled",
  "device-connection-alert-icon",
);

async function connectDevice(jsxapi, { username, password, ipAddress }) {
  console.log("Connecting to:", ipAddress);
  return new Promise(function (resolve, reject) {
    const xapi = jsxapi
      .connect("wss://" + ipAddress, { username, password })
      .on("error", (err) => reject(err))
      .on("ready", () => resolve(xapi));
  });
}

function createRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function getMessageApp({ panelId, username, target, peripheralId }) {
  const app = {
    panelId: panelId ?? username,
  };

  if (peripheralId) app.PeripheralId = peripheralId;
  else app.Target = target ?? "OSD";

  return app;
}

function isTruthy(value) {
  return value === true || value === "true";
}

// The Vidcast logo defaults to visible; it's only hidden when the hash
// parameter is explicitly present and falsy.
export function resolveShowLogo(value) {
  return value === undefined ? true : isTruthy(value);
}

function toFiniteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function getVideoDurationSeconds(video = APP_STATE.current) {
  const durationMs = toFiniteNumber(video?.duration, 0);
  return durationMs > 0 ? durationMs / 1000 : 0;
}

function clampPlaybackTime(time, duration = getVideoDurationSeconds()) {
  const currentTime = Math.max(0, toFiniteNumber(time, 0));
  return duration > 0 ? Math.min(currentTime, duration) : currentTime;
}

function formatPlaybackTime(seconds) {
  return formatDuration(Math.round(toFiniteNumber(seconds, 0) * 1000));
}

function normalizePlaybackState(snapshot = {}) {
  const fallbackDuration = getVideoDurationSeconds();
  const snapshotDuration = toFiniteNumber(snapshot.duration, fallbackDuration);
  const duration = snapshotDuration > 0 ? snapshotDuration : fallbackDuration;
  const ended = Boolean(snapshot.ended);

  let paused =
    "paused" in snapshot
      ? Boolean(snapshot.paused)
      : !(APP_STATE.playback?.playing ?? false);
  let playing =
    "playing" in snapshot ? Boolean(snapshot.playing) : !paused && !ended;

  if (ended) {
    playing = false;
    paused = true;
  } else if (playing) {
    paused = false;
  } else {
    paused = true;
  }

  return {
    ...APP_STATE.playback,
    ...snapshot,
    currentTime: clampPlaybackTime(
      snapshot.currentTime ?? APP_STATE.playback.currentTime,
      duration,
    ),
    duration,
    ended,
    paused,
    playing,
  };
}

function resetPlaybackState() {
  APP_STATE.playback = normalizePlaybackState({
    playing: false,
    paused: true,
    ended: false,
    currentTime: 0,
    duration: getVideoDurationSeconds(),
  });
}

function setPlaybackState(snapshot = {}) {
  APP_STATE.playback = normalizePlaybackState(snapshot);
  updateControlsPlaybackUi();
  updatePlayerPlaybackUi();
}

function setShareState(sharing) {
  APP_STATE.sharing = Boolean(sharing);
  updateShareUi();
}

// In the demo the Share button is always available and purely local; on a
// real device it's only shown once we know the device is in a call that
// supports presenting into it (see subscribeToShareCapability below).
function canShowShareButton() {
  return APP_STATE.demo || APP_STATE.canShareInCall;
}

function updateControlsPlaybackUi() {
  if (APP_STATE.mode !== "controls" || !APP_STATE.current) return;

  const duration = APP_STATE.playback.duration || getVideoDurationSeconds();
  const currentTime = clampPlaybackTime(APP_STATE.playback.currentTime, duration);
  const slider = document.getElementById("slider");
  const timeLabel = document.getElementById("time-label");
  const playPause = document.getElementById("btn-playpause");

  if (slider) {
    slider.max = String(duration);
    slider.value = String(currentTime);
  }

  if (timeLabel) {
    timeLabel.textContent = `${formatPlaybackTime(
      currentTime,
    )} / ${formatPlaybackTime(duration)}`;
  }

  if (playPause) {
    playPause.innerHTML = APP_STATE.playback.playing ? PAUSE_ICON : PLAY_ICON;
    playPause.setAttribute(
      "aria-label",
      APP_STATE.playback.playing ? "Pause" : "Play",
    );
    playPause.title = APP_STATE.playback.playing ? "Pause" : "Play";
  }
}

function updatePlayerPlaybackUi(playerElement = player) {
  if (APP_STATE.mode !== "player" || !APP_STATE.current) return;

  const container = document.querySelector(".player-container");
  if (!container) return;

  const playing = playerElement
    ? !playerElement.paused && !playerElement.ended
    : APP_STATE.playback.playing;

  container.classList.toggle("is-playing", playing);
}

function updateShareUi() {
  document
    .querySelector(".player-container")
    ?.classList.toggle("is-sharing", APP_STATE.demo && APP_STATE.sharing);

  const shareButton = document.getElementById("btn-share");
  if (!shareButton) return;

  shareButton.hidden = !canShowShareButton();
  shareButton.classList.toggle("is-sharing", APP_STATE.sharing);
  shareButton.setAttribute("aria-pressed", String(APP_STATE.sharing));
  shareButton.innerHTML = `${SHARE_ICON} ${
    APP_STATE.sharing ? "Stop Share" : "Share"
  }`;
}

// --- Real device "Share in Call" (Presentation) support ---

function isGhostStatusEntry(entry) {
  return typeof entry?.ghost == "string" && entry.ghost.toLowerCase() == "true";
}

function applyIndexedStatusUpdate(store, entry) {
  const id = entry?.id;
  if (id == null) return;

  if (isGhostStatusEntry(entry)) {
    delete store[id];
  } else {
    store[id] = { ...store[id], ...entry };
  }
}

function isDeviceInCall() {
  return Object.values(callStatuses).some((call) => call.Status == "Connected");
}

function canPresentInCurrentCall() {
  return Object.values(conferenceCallStatuses).some(
    (call) => call?.Capabilities?.Presentation == "True",
  );
}

function isPresentingWebViewInCall() {
  return Object.values(presentationInstances).some(
    (instance) => String(instance.Source) == "1000",
  );
}

function refreshShareAvailability() {
  APP_STATE.canShareInCall = isDeviceInCall() && canPresentInCurrentCall();
  APP_STATE.sharing = isPresentingWebViewInCall();
  updateShareUi();
}

// Subscribes to the xStatuses needed to know whether this device is in a
// call that supports presenting, and whether we're currently the one
// presenting via this webview. Only ever called for a real device Controller.
function subscribeToShareCapability() {
  // Older RoomOS firmware may not expose every one of these xStatuses; don't
  // let that take down the rest of the Controller if subscribing throws.
  try {
    xapi.Status.Call.on((call) => {
      applyIndexedStatusUpdate(callStatuses, call);
      refreshShareAvailability();
    });

    xapi.Status.Conference.Call.on((call) => {
      applyIndexedStatusUpdate(conferenceCallStatuses, call);
      refreshShareAvailability();
    });

    xapi.Status.Conference.Presentation.on((update) => {
      if (Array.isArray(update?.LocalInstance)) {
        update.LocalInstance.forEach((instance) =>
          applyIndexedStatusUpdate(presentationInstances, instance),
        );
      }
      refreshShareAvailability();
    });
  } catch (error) {
    console.warn("Unable to subscribe to call/presentation status:", error);
    return;
  }

  Promise.all([
    xapi.Status.Call.get(),
    xapi.Status.Conference.Call.get(),
    xapi.Status.Conference.Presentation.get(),
  ])
    .then(([calls, conferenceCalls, presentation]) => {
      for (const call of calls ?? []) applyIndexedStatusUpdate(callStatuses, call);
      for (const call of conferenceCalls ?? [])
        applyIndexedStatusUpdate(conferenceCallStatuses, call);
      for (const instance of presentation?.LocalInstance ?? [])
        applyIndexedStatusUpdate(presentationInstances, instance);
      refreshShareAvailability();
    })
    .catch((error) => {
      console.warn("Unable to query call/presentation status:", error);
    });
}

async function findOsdWebViewId() {
  const webviews = await xapi.Status.UserInterface.WebView.get();
  const list = Array.isArray(webviews) ? webviews : [webviews].filter(Boolean);
  const osdWebview = list.find((webview) => webview?.Target == "OSD");
  return osdWebview ? Number(osdWebview.id) : null;
}

async function toggleRealPresentationShare() {
  try {
    const webViewId = await findOsdWebViewId();
    if (webViewId == null) {
      console.warn("Unable to find the OSD WebView to share into the call");
      return;
    }

    if (APP_STATE.sharing) {
      await xapi.Command.Presentation.Stop();
      // Presentation.Stop hides the OSD WebView entirely (Status becomes
      // NotVisible); restart it as a local-only presentation so it stays
      // up on the OSD without being sent into the call.
      await xapi.Command.Presentation.Start({
        PresentationSource: "WebView",
        SendingMode: "LocalOnly",
        WebViewId: webViewId,
      });
    } else {
      await xapi.Command.Presentation.Start({
        PresentationSource: "WebView",
        SendingMode: "LocalRemote",
        WebViewId: webViewId,
      });
    }
  } catch (error) {
    console.warn("Unable to toggle Presentation sharing:", error);
  }
}

export function localizeHashForSurface(hash = {}) {
  const localHash = {
    ...hash,
    mode: APP_STATE.mode,
    target: APP_STATE.target,
  };

  if (APP_STATE.peripheralId) localHash.peripheralId = APP_STATE.peripheralId;
  else delete localHash.peripheralId;

  if (APP_STATE.interactive) localHash.interactive = true;
  else delete localHash.interactive;

  if (APP_STATE.demo) localHash.demo = true;
  else delete localHash.demo;

  if (APP_STATE.showLogo === false) localHash.showLogo = false;
  else delete localHash.showLogo;

  return localHash;
}

function setRemoteHash(hash) {
  const previousHash = window.location.hash;
  suppressNextHashBroadcast = true;
  setHash(hash);

  if (window.location.hash == previousHash) {
    suppressNextHashBroadcast = false;
  }
}

function renderMomentumIcon(iconClass, extraClasses = "") {
  return `<span class="icon ${iconClass} ${extraClasses}" aria-hidden="true"></span>`;
}

// --- Render Functions ---
function renderHeader(state) {
  const library =
    APP_STATE.state == "playlist"
      ? ""
      : `<button class="controls-library" id="btn-library">${LIBRARY_ICON} Library</button>`;

  return `
            <div class="header">
              <img src="${LOGO_URL}" alt="Logo" class="logo">
              ${library}
            </div>
          `;
}

function renderPlaylistGrid(videos) {
  return `
            <div class="playlist-scroll">
            <div class="playlist-grid">
            ${videos
              .map(
                (video) => `
              <div class="video-card is-loading-media" tabindex="0" data-video-id="${video.id}">
                <div class="video-thumb-shell">
                  <img class="video-thumb" src="${
                    video.camera_thumbnail_asset_url
                  }" alt="Video preview" data-card-media>
                  <span class="duration-overlay">${formatDuration(
                    video.duration,
                  )}</span>
                </div>
                <div class="card-info">
                  <img class="avatar" src="${video.avatar_url}" alt="${
                    video.user_name
                  }" data-card-media>
                  <div class="text-info">
                    <div class="video-name" title="${video.name}">${
                      video.name.length > 44
                        ? video.name.slice(0, 41) + "..."
                        : video.name
                    }</div>
                    <div class="creator-info">${
                      video.user_name
                    } &middot; ${formatDate(video.created)}</div>
                  </div>
                </div>
              </div>
            `,
              )
              .join("")}
            </div>
            </div>
          `;
}

function renderPlayerState(video) {
  const library = !isInteractiveSurface()
    ? ""
    : `<button class="controls-library player-library-button" id="btn-library">${LIBRARY_ICON} Library</button>`;
  const controls = isInteractiveSurface() ? "controls" : "";
  const logoHeader = APP_STATE.showLogo
    ? `<div class="player-logo-header">
                  <img src="${LOGO_URL}" alt="Logo" class="logo">
                </div>`
    : "";
  return `
            <div class="player-container">
              <div class="player-video-wrapper">
                <video class="player-video" id="player-video" src="${video.camera_asset_url}" ${controls} poster="${video.camera_thumbnail_asset_url}"></video>
                ${logoHeader}
                ${library}
              </div>
            </div>
          `;
}

function renderControlsState(video) {
  const duration = APP_STATE.playback.duration || getVideoDurationSeconds(video);
  const currentTime = clampPlaybackTime(APP_STATE.playback.currentTime, duration);
  const playPauseIcon = APP_STATE.playback.playing ? PAUSE_ICON : PLAY_ICON;
  const shareClass = APP_STATE.sharing ? " is-sharing" : "";
  const shareLabel = APP_STATE.sharing ? "Stop Share" : "Share";
  const shareHidden = canShowShareButton() ? "" : " hidden";

  return `
            <div class="controls-container">
              <div class="controls-video-card is-loading-media">
                <img src="${
                  video.camera_thumbnail_asset_url
                }" alt="Video preview" class="controls-thumb" data-card-media>
                <div class="controls-info">
                  <div class="controls-video-name" title="${video.name}">${
                    video.name
                  }</div>
  <div class="controls-video-description">${video.description}</div>
                  <div class="controls-creator">
                    <img class="controls-avatar" src="${
                      video.avatar_url
                    }" alt="${video.user_name}" data-card-media>
                    <span>${video.user_name}</span>
                    <span class="controls-date">${formatDate(
                      video.created,
                    )}</span>
                  </div>
                </div>
              </div>
              <div class="controls-bar">
                    <input type="range" class="controls-slider" id="slider" min="0" max="${duration}" value="${currentTime}" step="0.1">
              </div>
              <div class="controls-bar">
                <button class="controls-btn" id="btn-backward" title="Back 10s" aria-label="Back 10 seconds">${renderMomentumIcon(
                  "icon-redo-regular",
                  "controls-icon controls-icon-backward",
                )}</button>
                <button class="controls-btn" id="btn-playpause" title="${
                  APP_STATE.playback.playing ? "Pause" : "Play"
                }" aria-label="${
                  APP_STATE.playback.playing ? "Pause" : "Play"
                }">${playPauseIcon}</button>
                
                <button class="controls-btn" id="btn-forward" title="Forward 10s" aria-label="Forward 10 seconds">${renderMomentumIcon(
                  "icon-redo-regular",
                  "controls-icon",
                )}</button>
                <span class="controls-time" id="time-label">${formatPlaybackTime(
                  currentTime,
                )} / ${formatPlaybackTime(duration)}</span>
                <button class="controls-share${shareClass}" id="btn-share" aria-pressed="${APP_STATE.sharing}"${shareHidden}>${SHARE_ICON} ${shareLabel}</button>
              </div>
            </div>
          `;
}

function renderVolumeRocker() {
  if (!shouldShowVolumeRocker()) return "";

  return `
            <div class="volume-rocker" role="group" aria-label="System volume">
              <button class="volume-rocker-btn" type="button" data-volume-action="decrease" title="Volume down" aria-label="Volume down">
                ${renderMomentumIcon(
                  "icon-speaker-turn-down-regular",
                  "volume-icon",
                )}
              </button>
              <span class="volume-rocker-divider" aria-hidden="true"></span>
              <button class="volume-rocker-btn" type="button" data-volume-action="increase" title="Volume up" aria-label="Volume up">
                ${renderMomentumIcon(
                  "icon-speaker-turn-up-regular",
                  "volume-icon",
                )}
              </button>
            </div>
          `;
}

function renderWaitingState() {
  return `
            <div class="waiting-screen">
              <img src="${LOGO_URL}" alt="Logo" class="waiting-logo">
              <div class="waiting-message">Select a Vidcast on the controller</div>
            </div>
          `;
}

function renderDeviceConnectionAlert() {
  return `
            <div class="device-connection-alert" id="${DEVICE_CONNECTION_ALERT_ID}" role="alert">
              ${DEVICE_CONNECTION_ALERT_ICON}
              <div class="device-connection-alert-text">
                <strong>Unable to connect to this device</strong>
                <span>The device's certificate may not be trusted by this webview yet. Try restarting the device to restore the connection.</span>
              </div>
              <button type="button" class="device-connection-alert-dismiss" aria-label="Dismiss notification">&times;</button>
            </div>
          `;
}

// Shown when the local websocket connection back to the RoomOS device
// fails, which typically happens when the device's self-signed certificate
// hasn't yet been trusted by the webview's Chromium instance.
function showDeviceConnectionAlert() {
  if (APP_STATE.demo) return;
  if (document.getElementById(DEVICE_CONNECTION_ALERT_ID)) return;

  document.body.insertAdjacentHTML("beforeend", renderDeviceConnectionAlert());
  document
    .getElementById(DEVICE_CONNECTION_ALERT_ID)
    ?.querySelector(".device-connection-alert-dismiss")
    .addEventListener("click", dismissDeviceConnectionAlert);
}

function dismissDeviceConnectionAlert() {
  document.getElementById(DEVICE_CONNECTION_ALERT_ID)?.remove();
}

function isInteractiveSurface() {
  return (
    APP_STATE.mode === "controls" ||
    APP_STATE.interactive ||
    APP_STATE.target === "Controller" ||
    APP_STATE.peripheralId ||
    isTouchDevice()
  );
}

function shouldShowVolumeRocker() {
  return (
    APP_STATE.mode === "controls" &&
    (APP_STATE.state === "playlist" || APP_STATE.state === "controls")
  );
}

// --- Main Render ---
export function render() {
  const app = document.getElementById("app");
  console.log("Rendering - state:", APP_STATE.state, "mode:", APP_STATE.mode);

  while (app.firstChild) {
    console.log("Removing child");
    app.removeChild(app.firstChild);
  }

  const playerVideo = document.getElementById("player-video");

  if (playerVideo) {
    console.warn("removing player video");
    playerVideo.pause();
    playerVideo.removeAttribute("src"); // video.src = '' works so this line can be deleted
    playerVideo.load();
    playerVideo.src = "";
    playerVideo.srcObject = null;
    playerVideo.remove();
  }

  if (APP_STATE.state === "playlist") {
    APP_STATE.current = null;
    if (!isInteractiveSurface()) {
      app.innerHTML = renderWaitingState();
      setupEventHandlers();
      return;
    }
    app.innerHTML =
      renderHeader(APP_STATE.videos) +
      renderPlaylistGrid(APP_STATE.videos) +
      renderVolumeRocker();
    setupEventHandlers();
    return;
  }

  if (APP_STATE.mode === "player" && APP_STATE.current) {
    app.innerHTML = renderPlayerState(APP_STATE.current);
  } else if (APP_STATE.mode === "controls" && APP_STATE.current) {
    app.innerHTML =
      renderHeader() +
      renderControlsState(APP_STATE.current) +
      renderVolumeRocker();
  } else {
    // Playlist
    app.innerHTML =
      renderHeader(APP_STATE.videos) +
      renderPlaylistGrid(APP_STATE.videos) +
      renderVolumeRocker();
  }
  setupEventHandlers();
}

// --- Event Handlers ---
function setupEventHandlers() {
  setupCardMediaLoadingStates();
  setupVolumeRockerEventHandlers();

  // Playlist card click
  if (APP_STATE.state === "playlist") {
    document.querySelectorAll(".video-card").forEach((card) => {
      card.addEventListener("click", (e) => {
        const id = card.getAttribute("data-video-id");
        console.log("card clicked id:", id);
        const vid = APP_STATE.videos.find((v) => v.id === id);
        console.log("Vid:", vid);
        if (!vid) return;
        // Check URL hash for mode
        // set hash accordingly
        setHash({ state: "player", id: vid.id });
      });
    });
    return;
  }
  // Controls state: playback controls
  if (APP_STATE.mode === "controls" && APP_STATE.current) {
    const slider = document.getElementById("slider");

    function seekTo(time) {
      const duration = APP_STATE.playback.duration || getVideoDurationSeconds();
      const currentTime = clampPlaybackTime(time, duration);
      setPlaybackState({ currentTime, ended: false });
      multiConn?.sendMessageToAll({
        control: { type: "seek", time: currentTime },
      });
    }

    document.getElementById("btn-playpause").addEventListener("click", () => {
      const playing = !APP_STATE.playback.playing;
      setPlaybackState({ playing, paused: !playing, ended: false });
      multiConn?.sendMessageToAll({
        control: { type: playing ? "play" : "pause" },
      });
    });

    slider.addEventListener("input", () => {
      seekTo(slider.value);
    });

    document.getElementById("btn-backward").addEventListener("click", () => {
      seekTo(APP_STATE.playback.currentTime - 10);
    });

    document.getElementById("btn-forward").addEventListener("click", () => {
      seekTo(APP_STATE.playback.currentTime + 10);
    });

    updateControlsPlaybackUi();
    updateShareUi();

    // Share in Call
    document.getElementById("btn-share").addEventListener("click", () => {
      if (!APP_STATE.demo && xapi) {
        toggleRealPresentationShare();
        return;
      }

      const sharing = !APP_STATE.sharing;
      setShareState(sharing);
      multiConn?.sendMessageToAll({
        share: { active: sharing },
      });
    });
    // Return to library
    document.getElementById("btn-library").addEventListener("click", () => {
      console.log("returning to library");
      setHash({ state: "playlist", id: null });
    });
  }

  if (APP_STATE.mode === "player" && APP_STATE.current) {
    console.log("Setting up listner for player");

    document.getElementById("btn-library")?.addEventListener("click", () => {
      console.log("returning to library");
      setHash({ state: "playlist", id: null });
    });

    player = document.getElementById("player-video");
    console.log("typeof player:", typeof player);

    ["loadedmetadata", "play", "playing", "pause", "ended"].forEach(
      (eventType) => {
        player.addEventListener(eventType, () => {
          updatePlayerPlaybackUi(player);
        });
      },
    );
    updatePlayerPlaybackUi(player);
    updateShareUi();

    if (playerController) playerController.controlPlayer(player);
  }
}

function setupVolumeRockerEventHandlers() {
  document.querySelectorAll("[data-volume-action]").forEach((button) => {
    button.addEventListener("click", () => {
      adjustSystemVolume(button.dataset.volumeAction);
    });
  });
}

function adjustSystemVolume(action) {
  const volumeCommands = xapi?.Command?.Audio?.Volume;
  const commandName =
    action === "increase" ? "Increase" : action === "decrease" ? "Decrease" : "";

  if (!commandName || typeof volumeCommands?.[commandName] != "function") {
    console.warn("System volume command unavailable:", action);
    return;
  }

  Promise.resolve(volumeCommands[commandName]()).catch((error) => {
    console.warn(`Unable to ${action} system volume:`, error);
  });
}

function setupCardMediaLoadingStates() {
  document.querySelectorAll(".is-loading-media").forEach((card) => {
    const media = Array.from(card.querySelectorAll("[data-card-media]"));
    const pending = new Set(media);

    if (pending.size == 0) {
      card.classList.remove("is-loading-media");
      return;
    }

    function finish(image, failed = false) {
      if (!pending.has(image)) return;

      pending.delete(image);
      image.classList.add("is-loaded");
      image.classList.toggle("is-load-error", failed);

      if (pending.size == 0) {
        card.classList.remove("is-loading-media");
      }
    }

    media.forEach((image) => {
      if (image.complete) {
        finish(image, image.naturalWidth == 0);
        return;
      }

      image.addEventListener("load", () => finish(image), { once: true });
      image.addEventListener("error", () => finish(image, true), { once: true });
    });
  });
}

// --- Hash Change Listener ---
window.addEventListener("hashchange", () => {
  updateStateFromHash();
  render();
  const shouldBroadcast = !suppressNextHashBroadcast;
  suppressNextHashBroadcast = false;
  if (shouldBroadcast && multiConn) {
    multiConn.sendMessageToAll({ hash: getHashes() });
  }
});

export function updateStateFromHash() {
  const params = getHashes() ?? {};
  const previousVideoId = APP_STATE.current?.id ?? null;
  console.log(APP_STATE.mode, "updating state from hash");
  console.log(APP_STATE);

  if (params.mode) APP_STATE.mode = params.mode;
  if (params.target) APP_STATE.target = params.target;
  APP_STATE.peripheralId = params.peripheralId ?? null;
  APP_STATE.interactive = isTruthy(params.interactive);
  APP_STATE.demo = isTruthy(params.demo);
  APP_STATE.showLogo = resolveShowLogo(params.showLogo);

  if (params.mode === "player" && params.id) {
    APP_STATE.state = "player";
    APP_STATE.current =
      APP_STATE.videos.find((v) => v.id === params.id) || null;
  } else if (params.mode === "controls" && params.id) {
    APP_STATE.state = "controls";
    APP_STATE.current =
      APP_STATE.videos.find((v) => v.id === params.id) || null;
  } else {
    console.log("Defaulting to playlist");
    APP_STATE.state = "playlist";
    APP_STATE.current = null;
  }

  const nextVideoId = APP_STATE.current?.id ?? null;
  if (nextVideoId !== previousVideoId || !nextVideoId) {
    resetPlaybackState();
    setShareState(false);
  }

  console.log(APP_STATE);
}

async function getPlaylist(xapi, app) {
  if (xapi == null || !app?.panelId) return [];

  const requestId = createRequestId();
  const chunks = [];
  let count = 0;

  return new Promise((resolve, reject) => {
    let unsubscribe;
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out waiting for Vidcast playlist"));
    }, PLAYLIST_REQUEST_TIMEOUT);

    function cleanup() {
      clearTimeout(timeout);
      if (typeof unsubscribe == "function") unsubscribe();
    }

    unsubscribe = xapi.Event.Message.Send.on(({ Text }) => {
      const packet = safeParse(Text);
      if (!isPlaylistPacket(packet, requestId, app)) return;

      if (packet.type == "error") {
        cleanup();
        reject(new Error(packet.message || "Unable to get Vidcast playlist"));
        return;
      }

      if (packet.type != "response") return;
      const { index, total, content } = packet;
      if (!isValidPacket(index, total, content)) return;

      if (chunks[index] === undefined) count += 1;
      chunks[index] = content;

      if (count == total) {
        cleanup();
        const playlist = safeParse(chunks.join(""));
        resolve(Array.isArray(playlist) ? playlist : []);
      }
    });

    Promise.resolve(
      xapi.Command.Message.Send({
        Text: JSON.stringify({
          type: "request",
          name: PLAYLIST_MESSAGE_NAME,
          requestId,
          app,
        }),
      }),
    ).catch((error) => {
      cleanup();
      reject(error);
    });
  });
}

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    return;
  }
}

function isPlaylistPacket(packet, requestId, app) {
  return (
    packet?.name == PLAYLIST_MESSAGE_NAME &&
    packet?.requestId == requestId &&
    packet?.app?.panelId == app.panelId
  );
}

function isValidPacket(index, total, content) {
  return (
    index === +index &&
    total === +total &&
    index % 1 == 0 &&
    total % 1 == 0 &&
    index >= 0 &&
    total > 0 &&
    index < total &&
    total <= 1000 &&
    typeof content == "string"
  );
}

// --- Initial Load ---
async function main() {
  const hashes = getHashes(["username", "password", "ipAddress", "mode"]);

  if (!hashes) {
    const demoHashes = getHashes(["mode"]) ?? {};
    console.log("Required Hashes Not Found");
    APP_STATE.videos = testPlaylist;

    APP_STATE.mode = demoHashes.mode ?? APP_STATE.mode;
    APP_STATE.target = demoHashes.target ?? APP_STATE.target;
    APP_STATE.peripheralId = demoHashes.peripheralId ?? null;
    APP_STATE.interactive = isTruthy(demoHashes.interactive);
    APP_STATE.demo = isTruthy(demoHashes.demo);
    APP_STATE.showLogo = resolveShowLogo(demoHashes.showLogo);
    console.log("setting demo mode:", APP_STATE.mode);
    console.log(APP_STATE.mode, testPlaylist);
    setHash({ mode: APP_STATE.mode, state: "playlist", id: null });
    const app = demoHashes.panelId ? getMessageApp(demoHashes) : undefined;
    multiConn = new MultiWebRTCDataConnection(undefined, APP_STATE.mode, app);
  } else {
    try {
      xapi = await connectDevice(jsxapi, hashes);
      console.log("Connected");
      const app = getMessageApp(hashes);
      APP_STATE.videos = await getPlaylist(xapi, app);
      APP_STATE.mode = hashes.mode;
      APP_STATE.target = hashes.target ?? APP_STATE.target;
      APP_STATE.peripheralId = hashes.peripheralId ?? null;
      APP_STATE.interactive = isTruthy(hashes.interactive);
      APP_STATE.demo = isTruthy(hashes.demo);
      APP_STATE.showLogo = resolveShowLogo(hashes.showLogo);
      console.log("app state", APP_STATE);
      if (APP_STATE.mode === "controls") subscribeToShareCapability();
      multiConn = new MultiWebRTCDataConnection(xapi, APP_STATE.mode, app);
      // Send a message to all connected webviews
    } catch (err) {
      console.warn("Unable to connect to device:", hashes.ipAddress);
      console.warn(err);
      APP_STATE.videos = testPlaylist;
      showDeviceConnectionAlert();
    }
  }

  if (!multiConn) {
    multiConn = new MultiWebRTCDataConnection(undefined, APP_STATE.mode);
  }

  multiConn.on("open", ({ connectionIndex }) => {
    console.log(`Data channel ${connectionIndex} is open`);
    if (APP_STATE.mode == "player") {
      if (!playerController) playerController = new PlayerController(multiConn);
      if (player) playerController.controlPlayer(player);
      playerController?.sendCurrentState("connection-open");
    } else {
      // A controller may connect after the OSD already has a video
      // selected (e.g. a new controller opened later in the demo page);
      // ask the OSD for its current state so this instance can sync to it
      // instead of defaulting to the playlist view.
      multiConn.sendMessageToAll({ requestState: true });
    }
  });

  multiConn.on("message", ({ connectionIndex, data }) => {
    console.log(
      APP_STATE.mode,
      `Received Data Channel Message from: ${connectionIndex}:`,
      data,
    );
    if (data == undefined) return;
    let message;
    try {
      message = JSON.parse(data);
    } catch (error) {
      console.warn("Invalid data channel message JSON:", data);
      return;
    }

    const { hash, player, share, requestState } = message;
    if (requestState) {
      if (APP_STATE.mode == "player") {
        multiConn.sendMessageToAll({ hash: getHashes() });
      }
      return;
    }

    if (hash) {
      const localHash = localizeHashForSurface(hash);
      setRemoteHash(localHash);

      if (APP_STATE.mode == "player") {
        console.warn("Replaying hash update");
        multiConn.sendMessageToAll({ hash: localHash }, [connectionIndex]);
      }
      return;
    }

    if (player) {
      setPlaybackState(player);
      return;
    }

    if (share) {
      setShareState(share.active);

      if (APP_STATE.mode == "player") {
        multiConn.sendMessageToAll({ share: { active: APP_STATE.sharing } });
      }
      return;
    }
  });

  updateStateFromHash();
  render();
}
main();
