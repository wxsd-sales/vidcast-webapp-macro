import { PlayerController } from "./playerController.js";
import { MultiWebRTCDataConnection } from "./webrtc.js";
// --- State Management ---
let APP_STATE = {
  videos: [],
  current: null, // current video object
  state: "playlist", // or 'player' or 'controls'
  mode: "player",
};

let xapi;
let multiConn;
let player;
let playerController;


// --- Constants ---
const LOGO_URL =
  "https://www.vidcast.io/wp-content/themes/cisco_vidcast/library/images/vidcast-logo--white.svg";

// --- Utility ---
function formatDuration(ms) {
  const minsInMs = 60 * 1000;
  const hourInMs = minsInMs * 60 * 1000;

  const h = Math.floor(ms / hourInMs);
  const m = Math.floor(ms / minsInMs);
  const s = Math.floor((ms % minsInMs) / 1000);

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s
      .toString()
      .padStart(2, "0")}`;
  } else {
    return `${m}:${s.toString().padStart(2, "0")}`;
  }
}
function formatDate(dateStr) {
  // Expects ISO 8601 string
  const date = new Date(parseInt(dateStr));
  //console.log('Date:', date);
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const m = months[date.getMonth()];
  const d = date.getDate();
  let suffix = "th";
  if (d % 10 === 1 && d !== 11) suffix = "st";
  else if (d % 10 === 2 && d !== 12) suffix = "nd";
  else if (d % 10 === 3 && d !== 13) suffix = "rd";
  return `${m} ${d}${suffix}`;
}

// --- Mock fetch for videos (replace with your real fetch) ---
async function fetchDemoVideos() {
  // Replace this with: return fetch('YOUR_API_ENDPOINT').then(res => res.json());
  await new Promise((res) => setTimeout(res, 400)); // simulate latency

  return [
    {
      name: "Laptop vs Cisco Desk Device",
      user_name: "Ryan Kaplan",
      duration: "43840",
      description:
        "Show the best possible video experience compared to a standard laptop video experience.  (0:43)",
      camera_thumbnail_asset_url:
        "https://samplelib.com/lib/preview/jpeg/sample-clouds-400x300.jpg",
      matrix_thumbnail_asset_url:
        "https://cdn-3-d.app.vidcast.io/5b/52/dc/5b52dcb0-96d7-4309-a666-72907d17e743/thumbnail_matrix_1704920603331.jpeg?Expires=1766505481&Signature=lJTVlVu2K626d7N7d8ZZwb5dxAdah2Qi9eAZVHR~4wIhe03lADo13sVl10XZMvblIKBwbSEw0lNVxfI8HJLRGabHE0Ajd9I9nXTXsSCP4MjBXJFPVrWpTfjyqSNV8sBOTNHPz8u~2jOV456y6oxTGbYOMfoXS3Z9qiqMoiNn61d1fJcAnncDLAYxed4a94QWCywyP6JimaeUvkBpaSTqA2W51vPHZ-wXOzf1Su3ZR77~z1Ppb3lHpXnG2~TlHQ3ZyELc8X-Z0bM2BoC5cBddhxxb1cU8u2DYN4diUS91HrECayHgEZ9RhVOaMJ8F7eHpTcEBAyN3lZHx~wnZgZ521w__&Key-Pair-Id=K7MMR7AZ73QPM",
      camera_asset_url: "https://samplelib.com/mp4/sample-5s.mp4",
      preview_asset_url:
        "https://cdn-3-e.app.vidcast.io/5b/52/dc/5b52dcb0-96d7-4309-a666-72907d17e743/preview_cb42795a-e769-441e-ac6f-eeeb21a752a5_processed.mp4?Expires=1766505481&Signature=QXymrK52ohe4YkseXIcH0LB-l4Opf~zMfPjLPaYsKqfL~TYxFAoKuOSvhD9AnMUsZLvSRTtUqV5FSJoY4IKxU~B5d-~TgLzD5ENSX1~iWaGtaUm8PrWPWYE3szBif6mGLU559v8Ya6Hvahojmwc83myw25CtTb4k~whY9MpJrMWl6J-1vPbR0a52jXKTl~WL~ann2QCdX1aUouoO5Go-2DdxxuCMZF8wpWZI6RbI80Wj29JbYczAbARR8xVOmSX11wx2n5In3fE6MvS5PsgakAjDtKxOdjg4HcBWFEQ26-nJPAUlaEpzdNZhkpf8cGASySYr~LOM5QrY~2ZqD0LcGA__&Key-Pair-Id=K7MMR7AZ73QPM",
      avatar_url: "https://randomuser.me/api/portraits/men/11.jpg",
      id: 1,
    },

    {
      name: "Laptop vs Cisco Desk Device",
      user_name: "Ryan Kaplan",
      duration: "43840",
      description:
        "Show the best possible video experience compared to a standard laptop video experience.  (0:43)",
      camera_thumbnail_asset_url:
        "https://samplelib.com/lib/preview/jpeg/sample-clouds-400x300.jpg",
      matrix_thumbnail_asset_url:
        "https://cdn-3-d.app.vidcast.io/5b/52/dc/5b52dcb0-96d7-4309-a666-72907d17e743/thumbnail_matrix_1704920603331.jpeg?Expires=1766505481&Signature=lJTVlVu2K626d7N7d8ZZwb5dxAdah2Qi9eAZVHR~4wIhe03lADo13sVl10XZMvblIKBwbSEw0lNVxfI8HJLRGabHE0Ajd9I9nXTXsSCP4MjBXJFPVrWpTfjyqSNV8sBOTNHPz8u~2jOV456y6oxTGbYOMfoXS3Z9qiqMoiNn61d1fJcAnncDLAYxed4a94QWCywyP6JimaeUvkBpaSTqA2W51vPHZ-wXOzf1Su3ZR77~z1Ppb3lHpXnG2~TlHQ3ZyELc8X-Z0bM2BoC5cBddhxxb1cU8u2DYN4diUS91HrECayHgEZ9RhVOaMJ8F7eHpTcEBAyN3lZHx~wnZgZ521w__&Key-Pair-Id=K7MMR7AZ73QPM",
      camera_asset_url: "https://samplelib.com/mp4/sample-5s.mp4",
      preview_asset_url:
        "https://cdn-3-e.app.vidcast.io/5b/52/dc/5b52dcb0-96d7-4309-a666-72907d17e743/preview_cb42795a-e769-441e-ac6f-eeeb21a752a5_processed.mp4?Expires=1766505481&Signature=QXymrK52ohe4YkseXIcH0LB-l4Opf~zMfPjLPaYsKqfL~TYxFAoKuOSvhD9AnMUsZLvSRTtUqV5FSJoY4IKxU~B5d-~TgLzD5ENSX1~iWaGtaUm8PrWPWYE3szBif6mGLU559v8Ya6Hvahojmwc83myw25CtTb4k~whY9MpJrMWl6J-1vPbR0a52jXKTl~WL~ann2QCdX1aUouoO5Go-2DdxxuCMZF8wpWZI6RbI80Wj29JbYczAbARR8xVOmSX11wx2n5In3fE6MvS5PsgakAjDtKxOdjg4HcBWFEQ26-nJPAUlaEpzdNZhkpf8cGASySYr~LOM5QrY~2ZqD0LcGA__&Key-Pair-Id=K7MMR7AZ73QPM",
      avatar_url: "https://randomuser.me/api/portraits/men/11.jpg",
      id: 20,
    },
  ];
}

async function connectDevice(jsxapi, { username, password, ipAddress }) {
  console.log("Connecting to:", ipAddress);
  return new Promise(function (resolve, reject) {
    const xapi = jsxapi
      .connect("wss://" + ipAddress, { username, password })
      .on("error", (err) => reject(err))
      .on("ready", () => resolve(xapi));
  });
}

function setHash(params, notify = true) {
  const current = getHashes();
  for (const key in params) {
    if (params.hasOwnProperty(key)) {
      current[key] = params[key];
    }
  }
  if (notify) multiConn.sendMessageToAll({ hash: current });
  window.location.hash = btoa(JSON.stringify(current));
}

// --- Render Functions ---
function renderHeader(state) {
  const library =
    APP_STATE.state == "playlist"
      ? ""
      : '<button class="controls-library" id="btn-library"><span class="library-icon"></span> Library</button>';

  return `
            <div class="header">
              <img src="${LOGO_URL}" alt="Logo" class="logo">
              ${library}
            </div>
          `;
}

function renderPlaylistGrid(videos) {
    const player = document.getElementById("player-video");
    if(player && typeof player.pause === 'function'){
        player.pause();
        player.remove();

         if (player.parentNode) {
      player.parentNode.removeChild(player);
      console.log(`Video with ID "${videoId}" removed from the DOM.`);
    }
    }
    playerController = null;
  return `
            <div class="playlist-grid">
            ${videos
              .map(
                (video) => `
              <div class="video-card" tabindex="0" data-video-id="${video.id}">
                <div style="position:relative;">
                  <img class="video-thumb" src="${
                    video.camera_thumbnail_asset_url
                  }" alt="Video preview">
                  <span class="duration-overlay">${formatDuration(
                    video.duration
                  )}</span>
                </div>
                <div class="card-info">
                  <img class="avatar" src="${video.avatar_url}" alt="${
                  video.user_name
                }">
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
            `
              )
              .join("")}
            </div>
          `;
}

function renderPlayerState(video) {
  const library = !isTouchDevice()
    ? ""
    : '<button class="controls-library" id="btn-library"><span class="library-icon"></span> Library</button>';
  return `
            <div class="player-container">
              <div class="player-video-wrapper">
                <video class="player-video" id="player-video" src="${video.camera_asset_url}" controls  poster="${video.camera_thumbnail_asset_url}"></video>
                <div class="player-logo-header">
                  <img src="${LOGO_URL}" alt="Logo" class="logo">
                  ${library}
                </div>
              </div>
            </div>
          `;
}

function renderControlsState(video) {
  return `
            <div class="controls-container">
              <div class="controls-video-card">
                <img src="${
                  video.camera_thumbnail_asset_url
                }" alt="Video preview" class="controls-thumb">
                <div class="controls-info">
                  <div class="controls-video-name" title="${video.name}">${
    video.name
  }</div>
  <div class="controls-video-description">${video.description}</div>
                  <div class="controls-creator">
                    <img class="controls-avatar" src="${
                      video.avatar_url
                    }" alt="${video.user_name}">
                    <span>${video.user_name}</span>
                    <span class="controls-date">${formatDate(
                      video.created
                    )}</span>
                  </div>
                </div>
              </div>
              <div class="controls-bar">
                    <input type="range" class="controls-slider" id="slider" min="0" max="${
                      video.duration / 1000
                    }" value="0" step="1">
              </div>
              <div class="controls-bar">
                <button class="controls-btn controls-btn-rotate" id="btn-backward" title="Back 10s">&#x21BA;</button>
                <button class="controls-btn" id="btn-playpause" title="Play/Pause">&#9658;</button>
                
                <button class="controls-btn controls-btn-rotate" id="btn-forward" title="Forward 10s">&#x21BB;</button>
                <span class="controls-time" id="time-label">0:00 / ${formatDuration(
                  video.duration
                )}</span>
                <button class="controls-share" id="btn-share"><span class="share-icon"></span> Share</button>
              </div>
            </div>
          `;
}

// --- Main Render ---
function render() {
  const app = document.getElementById("app");
  console.log("Rendering - state:", APP_STATE.state, "mode:", APP_STATE.mode);

  if (APP_STATE.state === "playlist") {
    APP_STATE.current = null;
    app.innerHTML =
      renderHeader(APP_STATE.videos) + renderPlaylistGrid(APP_STATE.videos);
    setupEventHandlers();
    return;
  }
  if (APP_STATE.mode === "player" && APP_STATE.current) {
    app.innerHTML = renderPlayerState(APP_STATE.current);
  } else if (APP_STATE.mode === "controls" && APP_STATE.current) {
    app.innerHTML = renderHeader() + renderControlsState(APP_STATE.current);
  } else {
    // Playlist
    app.innerHTML =
      renderHeader(APP_STATE.videos) + renderPlaylistGrid(APP_STATE.videos);
  }
  setupEventHandlers();
}

// --- Event Handlers ---
function setupEventHandlers() {
  // Playlist card click
  if (APP_STATE.state === "playlist") {
    document.querySelectorAll(".video-card").forEach((card) => {
      card.addEventListener("click", (e) => {
        const id = card.getAttribute("data-video-id");
        const vid = APP_STATE.videos.find((v) => v.id === id);
        if (!vid) return;
        // Check URL hash for mode
        // set hash accordingly
        setHash({ state: "player", id: vid.id });
      });
    });
  }
  // Controls state: playback controls
  if (APP_STATE.mode === "controls" && APP_STATE.current) {
    let playing = false;
    let currentTime = 0;
    const duration = APP_STATE.current.duration;
    // Play/Pause button
    document.getElementById("btn-playpause").addEventListener("click", () => {
      playing = !playing;
      document.getElementById("btn-playpause").innerHTML = playing
        ? "&#10073;&#10073;"
        : "&#9658;";
      // API call for play/pause

      multiConn.sendMessageToAll({
        control: { type: playing ? "play" : "pause" },
      });
    });
    // Seek bar
    const slider = document.getElementById("slider");
    const timeLabel = document.getElementById("time-label");
    slider.addEventListener("input", () => {
      currentTime = parseInt(slider.value, 10);
      updateTimeLabel();
      multiConn.sendMessageToAll({
        control: { type: "seek", time: currentTime },
      })
    });
    function updateTimeLabel() {
      timeLabel.textContent = `${formatDuration(
        currentTime
      )} / ${formatDuration(duration)}`;
    }
    updateTimeLabel();
    // Backward/Forward
    document.getElementById("btn-backward").addEventListener("click", () => {
      currentTime = Math.max(0, currentTime - 10);
      slider.value = currentTime;
      updateTimeLabel();
      multiConn.sendMessageToAll({
        control: { type: "seek", time: currentTime },
      });
    });
    document.getElementById("btn-forward").addEventListener("click", () => {
      currentTime = Math.min(duration, currentTime + 10);
      slider.value = currentTime;

      updateTimeLabel();
      multiConn.sendMessageToAll({
        control: { type: "seek", time: currentTime },
      });
    });
    // Share in Call
    document.getElementById("btn-share").addEventListener("click", () => {
      alert(
        'Share in call triggered for "' +
          APP_STATE.current.name +
          '" (mocked action).'
      );
    });
    // Return to library
    document.getElementById("btn-library").addEventListener("click", () => {
      console.log("returning to library");
      setHash({ state: "playlist", id: null });
    });
  }

  if (APP_STATE.mode === "player" && APP_STATE.current) {
    document.getElementById("btn-library")?.addEventListener("click", () => {
      console.log("returning to library");
      setHash({ state: "playlist", id: null });
    });

    
    player = document.getElementById("player-video");

    playerController.controlPlayer(player);
  }
}

// --- Hash Change Listener ---
window.addEventListener("hashchange", () => {
  updateStateFromHash();
  render();
  multiConn.sendMessageToAll(JSON.stringify({ hash: getHashes() }));
});

function updateStateFromHash() {
  const params = getHashes();
  console.log("updating state from hash");
  console.log(params);
  console.log(APP_STATE);

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
  console.log(APP_STATE);
}

function isTouchDevice() {
  return (
    "ontouchstart" in window ||
    navigator.maxTouchPoints > 0 ||
    navigator.msMaxTouchPoints > 0
  );
}

function getHashes(required) {
  if (!location.hash) return;
  const hashString = location.hash.split("#").slice(1).join();
  try {
    const hashes = JSON.parse(atob(hashString));
    console.log(hashes);

    if (typeof required === "undefined") return hashes;
    if (required.every((key) => Object.keys(hashes).includes(key))) {
      console.log("All required parameters found");
      return hashes;
    }
    console.log("Missing Parameters");
  } catch (error) {
    return;
  }
}

async function getPlaylist(panelId) {
  if (xapi == null) return;
  const extensions = await xapi.Command.UserInterface.Extensions.List({
    ActivityType: "Custom",
  });
  const panels = extensions?.Extensions?.Panel;
  if (!panels) return;
  const channelPanel = panels.find(
    (panel) => panel.PanelId == panelId + "playlist"
  );

  const widgets = channelPanel?.Page?.[0]?.Row?.[0]?.Widget;
  if (!widgets) return;

  const recoveredPlaylist = widgets.map((widget, index) => {
    const values = widget?.ValueSpace?.Value;
    return values.reduce(
      (obj, item) => Object.assign(obj, { [atob(item.Name)]: atob(item.Key) }),
      {}
    );
  });
  return recoveredPlaylist;
}

// --- Initial Load ---
async function main() {
  const hashes = getHashes(["username", "password", "ipAddress", "mode"]);

  if (!hashes) {
    console.log("Required Hashes Not Found");
    APP_STATE.videos = await fetchDemoVideos();
  }

  try {
    xapi = await connectDevice(jsxapi, hashes);
    console.log("Connected");
    const playlist = await getPlaylist(hashes.username);
    console.log(playlist);
    APP_STATE.videos = playlist;
    APP_STATE.mode = hashes.mode;
    console.log("app state", APP_STATE);

    multiConn = new MultiWebRTCDataConnection(xapi, APP_STATE.mode);

    console.log("multiConn", typeof multiConn);
    multiConn.on("open", ({ connectionIndex }) => {
      console.log(`Data channel ${connectionIndex} is open`);
      playerController = new PlayerController(multiConn);
      if(player)playerController.controlPlayer(player);
    });

    multiConn.on("message", ({ connectionIndex, data }) => {
      console.log(`Received message on data channel ${connectionIndex}:`, data);
      if (data == undefined) return;

      const { hash, action, player } = JSON.parse(data);
      if (hash) {
        hash.mode = APP_STATE.mode;
        setHash(hash, false);
        return;
      }
    });

    // Send a message to all connected webviews
  } catch (err) {
    console.warn("Unable to connect to device:", hashes.ipAddress);
    console.warn(err);
    //APP_STATE.videos = await fetchDemoVideos();
  }

  updateStateFromHash();
  render();
}
main();
