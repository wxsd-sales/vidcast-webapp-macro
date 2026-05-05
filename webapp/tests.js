const sampleVideoUrl = "https://samplelib.com/mp4/sample-5s.mp4";

const demoVideos = [
  {
    title: "All Hands Highlights",
    description: "A short recap of the latest company update.",
    creator: "Avery Stone",
    initials: "AS",
    duration: "43840",
    created: "1764610200452",
    colors: ["#0f766e", "#22d3ee", "#111827"],
  },
  {
    title: "Hybrid Meetings That Flow",
    description: "Best practices for running inclusive video meetings.",
    creator: "Morgan Lee",
    initials: "ML",
    duration: "31500",
    created: "1764005400452",
    colors: ["#1d4ed8", "#8b5cf6", "#0f172a"],
  },
  {
    title: "Desk Device Demo",
    description: "Show the room and desk experience side by side.",
    creator: "Jordan Kim",
    initials: "JK",
    duration: "67000",
    created: "1763400600452",
    colors: ["#be123c", "#fb7185", "#18181b"],
  },
  {
    title: "Sales Kickoff Moments",
    description: "A quick edit for the regional sales team.",
    creator: "Taylor Reed",
    initials: "TR",
    duration: "90500",
    created: "1762795800452",
    colors: ["#92400e", "#f59e0b", "#111827"],
  },
  {
    title: "Training: Share in Call",
    description: "How presenters can share Vidcast playback in a call.",
    creator: "Sam Rivera",
    initials: "SR",
    duration: "124000",
    created: "1762191000452",
    colors: ["#166534", "#84cc16", "#052e16"],
  },
  {
    title: "Customer Story Preview",
    description: "A polished teaser for an upcoming customer story.",
    creator: "Casey Nguyen",
    initials: "CN",
    duration: "58000",
    created: "1761586200452",
    colors: ["#6d28d9", "#f472b6", "#111827"],
  },
  {
    title: "Room Navigator Walkthrough",
    description: "A controller-first view of the Vidcast workflow.",
    creator: "Riley Brooks",
    initials: "RB",
    duration: "76000",
    created: "1760981400452",
    colors: ["#0369a1", "#38bdf8", "#082f49"],
  },
  {
    title: "Engineering Sync",
    description: "Feature updates and decisions from the product team.",
    creator: "Dev Patel",
    initials: "DP",
    duration: "102000",
    created: "1760376600452",
    colors: ["#4338ca", "#a78bfa", "#111827"],
  },
  {
    title: "Launch Readiness",
    description: "Final checklist before publishing the macro demo.",
    creator: "Jamie Fox",
    initials: "JF",
    duration: "48500",
    created: "1759771800452",
    colors: ["#991b1b", "#f97316", "#1c1917"],
  },
];

export const testPlaylist = demoVideos.map((video, index) => ({
  id: String(index + 1),
  name: video.title,
  description: video.description,
  created: video.created,
  user_name: video.creator,
  duration: video.duration,
  camera_thumbnail_asset_url: createThumbnail(video, index),
  matrix_thumbnail_asset_url: createThumbnail(video, index),
  camera_asset_url: sampleVideoUrl,
  preview_asset_url: sampleVideoUrl,
  avatar_url: createAvatar(video),
}));

function createThumbnail(video, index) {
  const [start, accent, end] = video.colors;
  const number = String(index + 1).padStart(2, "0");

  return svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stop-color="${start}"/>
          <stop offset="0.55" stop-color="${accent}"/>
          <stop offset="1" stop-color="${end}"/>
        </linearGradient>
        <radialGradient id="glow" cx="75%" cy="22%" r="62%">
          <stop offset="0" stop-color="rgba(255,255,255,0.42)"/>
          <stop offset="1" stop-color="rgba(255,255,255,0)"/>
        </radialGradient>
      </defs>
      <rect width="640" height="360" fill="url(#bg)"/>
      <rect width="640" height="360" fill="url(#glow)"/>
      <path d="M0 265 C110 210 178 326 292 269 C408 211 459 307 640 224 L640 360 L0 360 Z" fill="rgba(0,0,0,0.28)"/>
      <circle cx="510" cy="94" r="54" fill="rgba(255,255,255,0.16)"/>
      <rect x="40" y="42" width="88" height="34" rx="17" fill="rgba(0,0,0,0.35)"/>
      <text x="64" y="66" fill="#fff" font-family="Arial, sans-serif" font-size="22" font-weight="700">${number}</text>
      <text x="40" y="246" fill="#fff" font-family="Arial, sans-serif" font-size="38" font-weight="700">${escapeXml(video.title)}</text>
      <text x="40" y="288" fill="rgba(255,255,255,0.82)" font-family="Arial, sans-serif" font-size="22">${escapeXml(video.creator)}</text>
      <path d="M289 132 L289 228 L371 180 Z" fill="rgba(255,255,255,0.88)"/>
    </svg>
  `);
}

function createAvatar(video) {
  const [start, accent] = video.colors;

  return svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
      <defs>
        <linearGradient id="avatar" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stop-color="${accent}"/>
          <stop offset="1" stop-color="${start}"/>
        </linearGradient>
      </defs>
      <rect width="128" height="128" rx="64" fill="url(#avatar)"/>
      <circle cx="92" cy="30" r="26" fill="rgba(255,255,255,0.2)"/>
      <text x="64" y="78" text-anchor="middle" fill="#fff" font-family="Arial, sans-serif" font-size="40" font-weight="700">${escapeXml(video.initials)}</text>
    </svg>
  `);
}

function svgDataUrl(svg) {
  return `data:image/svg+xml,${encodeURIComponent(svg.replace(/\s+/g, " ").trim())}`;
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
