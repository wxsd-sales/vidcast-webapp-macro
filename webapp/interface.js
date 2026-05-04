// --- Utility ---
export function formatDuration(ms) {
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

export function formatDate(dateStr) {
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

async function connectDevice(jsxapi, { username, password, ipAddress }) {
  console.log("Connecting to:", ipAddress);
  return new Promise(function (resolve, reject) {
    const xapi = jsxapi
      .connect("wss://" + ipAddress, { username, password })
      .on("error", (err) => reject(err))
      .on("ready", () => resolve(xapi));
  });
}

export function setHash(params) {
  const current = getHashes();
  if (!current) {
    window.location.hash = btoa(JSON.stringify(params));
  } else {
    for (const key in params) {
      if (params.hasOwnProperty(key)) {
        current[key] = params[key];
      }
    }
    window.location.hash = btoa(JSON.stringify(current));
  }
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
                    video.duration,
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
            `,
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

export function getStateFromHash() {
  const params = getHashes();
  console.log(APP_STATE.mode, "updating state from hash");
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

export function isTouchDevice() {
  return (
    "ontouchstart" in window ||
    navigator.maxTouchPoints > 0 ||
    navigator.msMaxTouchPoints > 0
  );
}

export function getHashes(required) {
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
