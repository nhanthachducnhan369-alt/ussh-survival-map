const CATEGORIES = [
  { id: "all", label: "Tất cả", color: "#2563eb" },
  { id: "study", label: "Học tập", color: "#0284c7" },
  { id: "admin", label: "Hành chính", color: "#7c3aed" },
  { id: "food", label: "Ăn uống", color: "#ea580c" },
  { id: "play", label: "Đi chơi", color: "#16a34a" },
  { id: "dl", label: "Chạy deadline", color: "#dc2626" }
];

const CATEGORY_MAP = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

const TAG_LABELS = {
  quiet: "Yên tĩnh",
  group: "Hợp làm nhóm",
  outlet: "Nhiều ổ cắm",
  ac: "Có điều hòa",
  student_aff: "Công tác sinh viên / thủ tục",
  academic: "Đào tạo / khoa / lịch học",
  morning_busy: "Đông buổi sáng",
  cheap: "Giá sinh viên",
  fast: "Ăn nhanh",
  late: "Mở muộn",
  lunch_crowded: "Đông giờ trưa",
  low_cost: "Ít tốn kém",
  group_play: "Hợp đi nhóm",
  evening: "Hợp buổi tối",
  indoor: "Trong nhà / đỡ mưa",
  all_night: "Xuyên đêm / 24h",
  lots_outlet: "Nhiều ổ cắm",
  quiet_night: "Yên tĩnh ban đêm",
  safe_park: "Gửi xe an toàn tối/đêm"
};

const TAGS_BY_CATEGORY = {
  study: ["quiet", "group", "outlet", "ac"],
  admin: ["student_aff", "academic", "morning_busy"],
  food: ["cheap", "fast", "late", "lunch_crowded"],
  play: ["low_cost", "group_play", "evening", "indoor"],
  dl: ["all_night", "lots_outlet", "quiet_night", "safe_park"]
};

const CAUTION_TAGS = new Set(["morning_busy", "lunch_crowded"]);

const CORE_TAGS_BY_CAT = {
  study: new Set(["quiet", "outlet", "group"]),
  admin: new Set(["student_aff", "academic"]),
  food: new Set(["cheap", "fast", "late"]),
  play: new Set(["low_cost", "group_play", "evening"]),
  dl: new Set(["all_night", "lots_outlet", "quiet_night"])
};

// Dán link Google Form báo cập nhật của bạn tại đây
const REPORT_FORM_CONFIG = {
  formViewUrl: "https://docs.google.com/forms/d/e/YOUR_FORM_ID/viewform",
  entryPlace: "entry.111111111"
};

// Tâm bản đồ mặc định: Trường ĐH Khoa học Xã hội và Nhân văn (336 Nguyễn Trãi)
const DEFAULT_CENTER = [20.9964, 105.8066];

const FALLBACK_PLACES = [
  {
    id: "st_01",
    name: "Thư viện & Khu tự học (Nhà I / Thư viện ĐHQGHN)",
    zone: "in",
    cat: "study",
    sub_cat: null,
    lat: 20.9963,
    lng: 105.8065,
    info: "07:30-21:00 · Miễn phí (Thẻ SV) · Khu vực đọc yên tĩnh, cần giữ trật tự",
    tags: ["quiet", "outlet", "ac"],
    checked: "2026-11-21"
  },
  {
    id: "fd_01",
    name: "Khu Cơm bình dân Ngõ 334 Nguyễn Trãi",
    zone: "out",
    cat: "food",
    sub_cat: null,
    lat: 20.9958,
    lng: 105.8074,
    info: "10:00-20:30 · 25k-40k · Ngõ 334 cạnh cổng trường, nhiều lựa chọn cơm suất",
    tags: ["cheap", "fast", "lunch_crowded"],
    checked: "2026-11-21"
  },
  {
    id: "dl_01",
    name: "Cà phê Học bài & Chạy Deadline 24/7 Khu Nguyễn Trãi",
    zone: "out",
    cat: "dl",
    sub_cat: "food",
    lat: 20.9953,
    lng: 105.8082,
    info: "Mở 24/7 · 30k-55k · Mặt đường Nguyễn Trãi, nhiều bàn dài có ổ cắm và trông xe đêm",
    tags: ["all_night", "lots_outlet", "quiet_night", "safe_park"],
    checked: "2026-11-21"
  }
];

const state = {
  places: [],
  category: "all",
  selectedTags: [],
  openOnly: false,
  keyword: "",
  viewMode: "map",
  selectedPlace: null,
  expanded: false,
  userLocation: { lat: DEFAULT_CENTER[0], lng: DEFAULT_CENTER[1], isGps: false }
};

let map;
let markersLayer;
let userMarker;

// --- 1. Lọc & Chấm điểm Tag ---

function filterPlaces(
  places,
  { category = "all", tags = [], openOnly = false, keyword = "", now = new Date() }
) {
  const kw = keyword.trim().toLowerCase();

  return places.filter((place) => {
    if (place.hidden === true) return false;

    if (category && category !== "all") {
      if (place.cat !== category && place.sub_cat !== category) return false;
    }

    if (openOnly) {
      const openInfo = getOpenStatusFromInfo(place.info, now);
      if (openInfo.status !== "open") return false;
    }

    if (tags.length > 0) {
      const pTags = place.tags || [];
      if (!tags.every((t) => pTags.includes(t))) return false;
    }

    if (kw) {
      const inName = (place.name || "").toLowerCase().includes(kw);
      const inInfo = (place.info || "").toLowerCase().includes(kw);
      const inTags = (place.tags || []).some((t) =>
        (TAG_LABELS[t] || t).toLowerCase().includes(kw)
      );
      if (!inName && !inInfo && !inTags) return false;
    }

    return true;
  });
}

function getSummaryTags(place, { activeCategory, selectedTags, maxTags = 4, now = new Date() }) {
  const placeTags = place.tags || [];
  const selectedSet = new Set(selectedTags);
  const activeCat = activeCategory && activeCategory !== "all" ? activeCategory : place.cat;
  const coreSet = CORE_TAGS_BY_CAT[activeCat] || new Set();

  const hour = now.getHours();
  const isLunch = hour >= 11 && hour <= 13;
  const isNight = hour >= 20 || hour < 5;

  const scored = placeTags.map((code) => {
    let score = 10;
    const isMatched = selectedSet.has(code);
    const isCaution = CAUTION_TAGS.has(code);

    if (isMatched) score += 100;
    if (coreSet.has(code)) score += 25;
    if (isCaution) score += 15;
    if (isLunch && (code === "fast" || code === "lunch_crowded")) score += 40;
    if (isNight && ["all_night", "late", "evening", "quiet_night"].includes(code)) score += 40;

    return { code, label: TAG_LABELS[code] || code, isCaution, isMatched, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const limit = Math.min(Math.max(maxTags, 1), 4);
  const out = [];
  let cautionCount = 0;

  for (const item of scored) {
    if (out.length >= limit) break;
    if (item.isCaution) {
      if (cautionCount >= 1) continue;
      cautionCount += 1;
    }
    out.push(item);
  }
  return out;
}

// --- 2. Khoảng cách, Giờ mở cửa & Liên kết ngoài ---

function getDistanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function formatDistanceText(meters, walkSpeed = 75) {
  if (typeof meters !== "number" || Number.isNaN(meters)) return "";
  const dist = meters < 1000 ? `~${meters}m` : `~${(meters / 1000).toFixed(1)}km`;
  const mins = Math.max(1, Math.round(meters / walkSpeed));
  return `Cách ${dist} (${mins} phút đi bộ)`;
}

function sortPlacesByDistance(places, origin) {
  return places
    .map((place) => {
      const meters =
        origin && typeof origin.lat === "number" && typeof origin.lng === "number"
          ? getDistanceMeters(origin.lat, origin.lng, place.lat, place.lng)
          : null;
      return { place, meters };
    })
    .sort((a, b) => {
      if (a.meters === null && b.meters === null) return 0;
      if (a.meters === null) return 1;
      if (b.meters === null) return -1;
      return a.meters - b.meters;
    });
}

function timeToMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return Number.isNaN(h) || Number.isNaN(m) ? null : h * 60 + m;
}

function minutesToTime(mins) {
  const norm = ((mins % 1440) + 1440) % 1440;
  return `${String(Math.floor(norm / 60)).padStart(2, "0")}:${String(norm % 60).padStart(2, "0")}`;
}

function getOpenStatusFromInfo(infoText = "", now = new Date()) {
  const hoursPart = infoText.split("·")[0].trim();
  if (!hoursPart) return { status: "unknown", label: "Chưa rõ giờ" };
  if (/24\/7|xuyên đêm|24h/i.test(hoursPart)) {
    return { status: "open", label: "Đang mở • 24/7" };
  }

  const day = now.getDay();
  const dayMatch = hoursPart.match(/\(([^)]+)\)/);
  if (dayMatch && /T2\s*-\s*T6/i.test(dayMatch[1]) && (day === 0 || day === 6)) {
    return { status: "closed", label: `Đang đóng • Chỉ mở ${dayMatch[1]}` };
  }

  const matches = [...hoursPart.matchAll(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/g)];
  if (!matches.length) return { status: "unknown", label: hoursPart };

  const cur = now.getHours() * 60 + now.getMinutes();
  const ranges = matches
    .map((m) => {
      const start = timeToMinutes(m[1]);
      let end = timeToMinutes(m[2]);
      if (start === null || end === null) return null;
      if (end <= start) end += 1440;
      return { start, end };
    })
    .filter(Boolean);

  for (const r of ranges) {
    if (
      (cur >= r.start && cur < r.end) ||
      (r.end > 1440 && cur + 1440 >= r.start && cur + 1440 < r.end)
    ) {
      return { status: "open", label: `Đang mở • Đóng ${minutesToTime(r.end)}` };
    }
  }

  const nextStart = ranges
    .map((r) => (r.start >= cur ? r.start : r.start + 1440))
    .sort((a, b) => a - b)[0];

  return { status: "closed", label: `Đang đóng • Mở ${minutesToTime(nextStart)}` };
}

function buildDirectionsUrl(dest, origin = null, travelMode = "walking") {
  const params = new URLSearchParams({
    api: "1",
    destination: `${dest.lat},${dest.lng}`,
    travelmode: travelMode
  });
  if (origin && typeof origin.lat === "number" && typeof origin.lng === "number") {
    params.set("origin", `${origin.lat},${origin.lng}`);
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function buildReportFormUrl(place) {
  if (!REPORT_FORM_CONFIG.formViewUrl || REPORT_FORM_CONFIG.formViewUrl.includes("YOUR_FORM_ID")) {
    return "#";
  }
  const params = new URLSearchParams();
  if (REPORT_FORM_CONFIG.entryPlace) {
    params.set(REPORT_FORM_CONFIG.entryPlace, `${place.id} - ${place.name}`);
  }
  return `${REPORT_FORM_CONFIG.formViewUrl}?${params.toString()}`;
}

// --- 3. Giao diện & Tương tác ---

function createPinIcon(catId) {
  const color = (CATEGORY_MAP[catId] && CATEGORY_MAP[catId].color) || "#2563eb";
  return L.divIcon({
    className: "",
    html: `<div class="custom-pin" style="background:${color}"></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28]
  });
}

function renderCategoryChips() {
  const container = document.getElementById("catChips");
  container.innerHTML = "";

  CATEGORIES.forEach((cat) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `chip ${state.category === cat.id ? "active" : ""}`;
    btn.textContent = cat.label;
    btn.addEventListener("click", () => {
      state.category = cat.id;
      state.selectedTags = [];
      renderCategoryChips();
      renderTagChips();
      updateMapAndUi();
    });
    container.appendChild(btn);
  });
}

function renderTagChips() {
  const container = document.getElementById("tagChips");
  container.innerHTML = "";

  // Chip trạng thái Đang mở cửa đứng đầu hàng Cấp 2
  const openBtn = document.createElement("button");
  openBtn.type = "button";
  openBtn.className = `chip open-filter-chip ${state.openOnly ? "active" : ""}`;
  openBtn.textContent = "Đang mở cửa";
  openBtn.addEventListener("click", () => {
    state.openOnly = !state.openOnly;
    renderTagChips();
    updateMapAndUi();
  });
  container.appendChild(openBtn);

  const availableTags =
    state.category === "all"
      ? Object.keys(TAG_LABELS)
      : TAGS_BY_CATEGORY[state.category] || [];

  availableTags.forEach((tagCode) => {
    const active = state.selectedTags.includes(tagCode);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `chip ${active ? "active" : ""}`;
    btn.textContent = TAG_LABELS[tagCode] || tagCode;
    btn.addEventListener("click", () => {
      if (active) {
        state.selectedTags = state.selectedTags.filter((t) => t !== tagCode);
      } else {
        state.selectedTags.push(tagCode);
      }
      renderTagChips();
      updateMapAndUi();
    });
    container.appendChild(btn);
  });
}

function buildRelaxSuggestions(currentState) {
  const suggestions = [];

  if (currentState.keyword.trim() !== "") {
    suggestions.push({
      label: `Xóa từ khóa "${currentState.keyword.trim()}"`,
      apply: () => {
        currentState.keyword = "";
        document.getElementById("searchInput").value = "";
      }
    });
  }

  if (currentState.selectedTags.length > 0) {
    const lastTag = currentState.selectedTags[currentState.selectedTags.length - 1];
    const lastTagLabel = TAG_LABELS[lastTag] || lastTag;
    suggestions.push({
      label: `Bỏ tag "${lastTagLabel}"`,
      apply: () => {
        currentState.selectedTags.pop();
        renderTagChips();
      }
    });
  }

  if (currentState.openOnly) {
    suggestions.push({
      label: "Tắt lọc Đang mở cửa",
      apply: () => {
        currentState.openOnly = false;
        renderTagChips();
      }
    });
  }

  if (currentState.category !== "all") {
    suggestions.push({
      label: "Xem ở Tất cả nhóm",
      apply: () => {
        currentState.category = "all";
        currentState.selectedTags = [];
        renderCategoryChips();
        renderTagChips();
      }
    });
  }

  return suggestions.slice(0, 3);
}

function renderEmptyHint(matchedCount) {
  const banner = document.getElementById("emptyHintBanner");
  if (!banner) return;

  if (matchedCount > 0) {
    banner.classList.add("hidden");
    banner.innerHTML = "";
    return;
  }

  const suggestions = buildRelaxSuggestions(state);
  banner.classList.remove("hidden");
  banner.innerHTML = `
    <p class="empty-hint-text">Chưa có địa điểm khớp đủ điều kiện này. Thử nới lỏng nhanh:</p>
    <div class="empty-hint-actions"></div>
  `;

  const actionsEl = banner.querySelector(".empty-hint-actions");
  suggestions.forEach((s) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "hint-btn";
    btn.textContent = s.label;
    btn.addEventListener("click", () => {
      s.apply();
      updateMapAndUi();
    });
    actionsEl.appendChild(btn);
  });
}

function renderPlaceSheet(place) {
  const sheet = document.getElementById("placeSheet");
  const content = document.getElementById("sheetContent");

  if (!place) {
    sheet.classList.add("hidden");
    return;
  }

  sheet.classList.remove("hidden");
  sheet.classList.toggle("expanded", state.expanded);

  const catLabel = (CATEGORY_MAP[place.cat] && CATEGORY_MAP[place.cat].label) || place.cat;
  const zoneLabel = place.zone === "in" ? "Nội khu" : "Ngoại khu";
  const meters = getDistanceMeters(
    state.userLocation.lat,
    state.userLocation.lng,
    place.lat,
    place.lng
  );
  const distText = formatDistanceText(meters);
  const openStatus = getOpenStatusFromInfo(place.info);
  const maxTags = window.innerWidth < 375 ? 3 : 4;
  const summaryTags = getSummaryTags(place, {
    activeCategory: state.category,
    selectedTags: state.selectedTags,
    maxTags
  });

  const dirUrl = buildDirectionsUrl(
    { lat: place.lat, lng: place.lng },
    state.userLocation.isGps ? state.userLocation : null,
    place.cat === "dl" ? "driving" : "walking"
  );

  const reportUrl = buildReportFormUrl(place);
  const reportAttr =
    reportUrl === "#"
      ? `href="#report" onclick="alert('Hãy cập nhật link Google Form của bạn trong REPORT_FORM_CONFIG (js/app.js) để nhận báo cáo từ sinh viên.'); return false;"`
      : `href="${reportUrl}" target="_blank" rel="noopener noreferrer"`;

  content.innerHTML = `
    <h2 class="place-title">${place.name}</h2>
    <div class="place-meta">
      <span>${catLabel} · ${zoneLabel}</span>
      ${distText ? `<span>• ${distText}</span>` : ""}
      <span class="status-badge ${openStatus.status}">${openStatus.label}</span>
    </div>
    <p class="place-info">${place.info}</p>
    <div class="tag-list">
      ${summaryTags
        .map(
          (t) =>
            `<span class="tag-pill ${t.isMatched ? "matched" : ""} ${
              t.isCaution ? "caution" : ""
            }">${t.label}</span>`
        )
        .join("")}
    </div>
    <div class="sheet-actions">
      <a class="btn-primary" href="${dirUrl}" target="_blank" rel="noopener noreferrer">
        Chỉ đường
      </a>
      <a class="btn-secondary" ${reportAttr}>
        Báo cập nhật
      </a>
    </div>
    ${
      state.expanded
        ? `
      <div class="extra-details">
        <div><strong>Mã điểm:</strong> ${place.id}</div>
        <div><strong>Tọa độ:</strong> ${place.lat}, ${place.lng}</div>
        <div><strong>Kiểm tra gần nhất:</strong> ${place.checked || "Chưa rõ"}</div>
      </div>
    `
        : ""
    }
  `;
}

function renderListView(matchedPlaces) {
  const listView = document.getElementById("listView");
  const summaryEl = document.getElementById("listSummary");
  const container = document.getElementById("listContainer");

  const isList = state.viewMode === "list";
  listView.classList.toggle("hidden", !isList);
  if (!isList) return;

  const sorted = sortPlacesByDistance(matchedPlaces, state.userLocation);
  const originNote = state.userLocation.isGps
    ? "tính từ vị trí GPS của bạn"
    : "tính từ cổng USSH (336 Nguyễn Trãi)";

  summaryEl.textContent = `${sorted.length} địa điểm • Gần nhất trước (${originNote})`;

  if (sorted.length === 0) {
    container.innerHTML = "";
    return;
  }

  const maxTags = window.innerWidth < 375 ? 3 : 4;
  container.innerHTML = "";

  sorted.forEach(({ place, meters }) => {
    const openStatus = getOpenStatusFromInfo(place.info);
    const distText = formatDistanceText(meters);
    const summaryTags = getSummaryTags(place, {
      activeCategory: state.category,
      selectedTags: state.selectedTags,
      maxTags
    });

    const card = document.createElement("article");
    card.className = "list-card";
    card.innerHTML = `
      <div class="list-card-top">
        <h3 class="list-card-title">${place.name}</h3>
        ${distText ? `<span class="list-card-dist">${distText}</span>` : ""}
      </div>
      <div class="list-card-sub">
        <span class="status-badge ${openStatus.status}">${openStatus.label}</span>
        <span>${place.zone === "in" ? "Nội khu" : "Ngoại khu"}</span>
      </div>
      <p class="list-card-info">${place.info}</p>
      <div class="tag-list" style="margin-bottom:0">
        ${summaryTags
          .map(
            (t) =>
              `<span class="tag-pill ${t.isMatched ? "matched" : ""} ${
                t.isCaution ? "caution" : ""
              }">${t.label}</span>`
          )
          .join("")}
      </div>
    `;

    card.addEventListener("click", () => {
      state.viewMode = "map";
      state.selectedPlace = place;
      state.expanded = false;
      document.getElementById("toggleViewBtn").textContent = "Danh sách";
      document.getElementById("listView").classList.add("hidden");
      map.setView([place.lat, place.lng], 17);
      renderPlaceSheet(place);
    });

    container.appendChild(card);
  });
}

function updateMapAndUi() {
  const hasFilter =
    state.category !== "all" ||
    state.selectedTags.length > 0 ||
    state.openOnly ||
    state.keyword.trim() !== "";
  document.getElementById("clearFiltersBtn").disabled = !hasFilter;

  const matched = filterPlaces(state.places, {
    category: state.category,
    tags: state.selectedTags,
    openOnly: state.openOnly,
    keyword: state.keyword
  });

  markersLayer.clearLayers();
  matched.forEach((place) => {
    const marker = L.marker([place.lat, place.lng], {
      icon: createPinIcon(place.cat)
    });
    marker.on("click", () => {
      state.selectedPlace = place;
      state.expanded = false;
      renderPlaceSheet(place);
    });
    marker.addTo(markersLayer);
  });

  renderEmptyHint(matched.length);
  renderListView(matched);

  if (state.selectedPlace) {
    renderPlaceSheet(state.selectedPlace);
  }
}

async function loadPlaces() {
  try {
    const res = await fetch("./data/places.json");
    if (!res.ok) throw new Error("Failed to load places.json");
    const data = await res.json();
    return Array.isArray(data) ? data : FALLBACK_PLACES;
  } catch {
    return FALLBACK_PLACES;
  }
}

function locateUser() {
  if (!("geolocation" in navigator)) {
    map.setView(DEFAULT_CENTER, 16);
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude } = pos.coords;
      state.userLocation = { lat: latitude, lng: longitude, isGps: true };
      map.setView([latitude, longitude], 16);

      if (userMarker) {
        userMarker.setLatLng([latitude, longitude]);
      } else {
        userMarker = L.circleMarker([latitude, longitude], {
          radius: 7,
          color: "#ffffff",
          weight: 2,
          fillColor: "#2563eb",
          fillOpacity: 1
        })
          .bindTooltip("Vị trí của bạn")
          .addTo(map);
      }
      updateMapAndUi();
    },
    () => {
      map.setView(DEFAULT_CENTER, 16);
    },
    { enableHighAccuracy: true, timeout: 4000 }
  );
}

async function init() {
  map = L.map("map", { zoomControl: false }).setView(DEFAULT_CENTER, 16);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap"
  }).addTo(map);

  markersLayer = L.layerGroup().addTo(map);

  document.getElementById("searchInput").addEventListener("input", (e) => {
    state.keyword = e.target.value;
    updateMapAndUi();
  });

  document.getElementById("toggleViewBtn").addEventListener("click", (e) => {
    state.viewMode = state.viewMode === "map" ? "list" : "map";
    e.target.textContent = state.viewMode === "map" ? "Danh sách" : "Bản đồ";
    if (state.viewMode === "list") {
      state.selectedPlace = null;
      renderPlaceSheet(null);
    }
    updateMapAndUi();
  });

  document.getElementById("clearFiltersBtn").addEventListener("click", () => {
    state.category = "all";
    state.selectedTags = [];
    state.openOnly = false;
    state.keyword = "";
    document.getElementById("searchInput").value = "";
    renderCategoryChips();
    renderTagChips();
    updateMapAndUi();
  });

  document.getElementById("closeSheetBtn").addEventListener("click", () => {
    state.selectedPlace = null;
    state.expanded = false;
    renderPlaceSheet(null);
  });

  document.getElementById("toggleExpandBtn").addEventListener("click", () => {
    state.expanded = !state.expanded;
    if (state.selectedPlace) renderPlaceSheet(state.selectedPlace);
  });

  document.getElementById("locateBtn").addEventListener("click", locateUser);

  state.places = await loadPlaces();
  renderCategoryChips();
  renderTagChips();
  updateMapAndUi();
}

init();