const RARITY_DEFAULTS = {
  common: 100,
  uncommon: 400,
  rare: 4000,
  veryRare: 40000,
  legendary: 200000,
};

const RARITY_LABELS = {
  common: "Common",
  uncommon: "Uncommon",
  rare: "Rare",
  veryRare: "Very Rare",
  legendary: "Legendary",
};

const STORAGE_KEY = "loot-calculator";
const ITEMS_DB_KEY = "loot-calculator-items";
const ITEMS_DB_VERSION = 2;

const ITEMS_API_URL =
  "https://dnd.imdevinc.com/api/items";
const ITEMS_API_PARAMS = "campaignId=7672327&sharingSetting=2";
const ITEMS_PAGE_SIZE = 1000;
const SUGGESTION_LIMIT = 12;

const RARITY_MAP = {
  common: "common",
  uncommon: "uncommon",
  rare: "rare",
  "very rare": "veryRare",
  legendary: "legendary",
  artifact: "legendary",
  varies: "common",
  "unknown rarity": "common",
  none: "common",
};

function normalizeRarity(rarity) {
  return RARITY_MAP[String(rarity ?? "").trim().toLowerCase()] ?? "common";
}

let itemDb = [];

const state = {
  items: [],
  partySize: 4,
};

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.items)) state.items = saved.items;
    if (saved && typeof saved.partySize === "number" && saved.partySize >= 1) {
      state.partySize = saved.partySize;
    }
  } catch {
    // ignore corrupt storage
  }
}

function saveState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ items: state.items, partySize: state.partySize })
  );
}

function loadItemDb() {
  try {
    const saved = JSON.parse(localStorage.getItem(ITEMS_DB_KEY));
    // Older caches stored a plain array without edition data; treat them as
    // stale so the item database gets refetched with the (5e)/(5.5e) suffix.
    if (
      saved &&
      saved.version === ITEMS_DB_VERSION &&
      Array.isArray(saved.items)
    ) {
      return saved.items;
    }
    return null;
  } catch {
    return null;
  }
}

function saveItemDb(items) {
  localStorage.setItem(
    ITEMS_DB_KEY,
    JSON.stringify({ version: ITEMS_DB_VERSION, items })
  );
}

// Items live in either the 2014 (5e) or 2024 (5.5e) ruleset. When the API
// flags an item as legacy it belongs to 5e, otherwise assume 5.5e.
function editionSuffix(item) {
  return item.isLegacy === true ? "5e" : "5.5e";
}

function mapRawItem(item) {
  const rarity = normalizeRarity(item.rarity);
  const baseName = item.name || "Unknown";
  return {
    name: `${baseName} (${editionSuffix(item)})`,
    rarity,
    value: item.cost != null ? Math.round(item.cost) : RARITY_DEFAULTS[rarity],
  };
}

// Uploaded files are dndbeyond.com API responses: { data: [...] }.
function parseItemPayload(payload) {
  if (!payload || !Array.isArray(payload.data)) {
    throw new Error('Expected a dndbeyond items file with a "data" array.');
  }
  return payload.data.map(mapRawItem);
}

async function fetchAllItems() {
  const all = [];
  let page = 0;

  while (true) {
    const url = `${ITEMS_API_URL}?${ITEMS_API_PARAMS}&page=${page}&pageSize=${ITEMS_PAGE_SIZE}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const body = await res.json();
    if (!body.success) throw new Error(body.message || "API error");

    const batch = Array.isArray(body.data) ? body.data : [];
    all.push(...batch.map(mapRawItem));

    const total = body.pagination?.total ?? all.length;
    page++;
    if (batch.length === 0 || all.length >= total) break;
  }

  return all;
}

function applyItemDb(items, source) {
  itemDb = items;
  saveItemDb(itemDb);
  showToast(`Item database loaded: ${itemDb.length} items (${source}).`, "success");
}

async function initItemDb() {
  const stored = loadItemDb();
  if (stored) {
    itemDb = stored;
    return;
  }
  try {
    itemDb = await fetchAllItems();
    saveItemDb(itemDb);
  } catch {
    showToast("Could not load the item database. You can still add items by hand.");
  }
}

const COPPER_PER_GP = 100;
const COPPER_PER_SP = 10;

const els = {
  name: document.getElementById("item-name"),
  rarity: document.getElementById("item-rarity"),
  value: document.getElementById("item-value"),
  consumable: document.getElementById("item-consumable"),
  add: document.getElementById("add-item"),
  list: document.getElementById("loot-list"),
  emptyState: document.getElementById("empty-state"),
  clearAll: document.getElementById("clear-all"),
  totalValue: document.getElementById("total-value"),
  sellPrice: document.getElementById("sell-price"),
  partySize: document.getElementById("party-size"),
  splitValue: document.getElementById("split-value"),
  splitSell: document.getElementById("split-sell"),
  suggestions: document.getElementById("item-suggestions"),
  refreshItems: document.getElementById("refresh-items"),
  toast: document.getElementById("toast"),
  modal: document.getElementById("refresh-modal"),
  modalBackdrop: document.getElementById("refresh-backdrop"),
  dropzone: document.getElementById("item-dropzone"),
  fileInput: document.getElementById("item-file"),
  fileName: document.getElementById("item-file-name"),
  modalError: document.getElementById("modal-error"),
  modalSubmit: document.getElementById("modal-submit"),
  modalDefault: document.getElementById("modal-default"),
  modalCancel: document.getElementById("modal-cancel"),
};

function fmtCoins(cp) {
  const parts = [];
  const gp = Math.floor(cp / COPPER_PER_GP);
  cp -= gp * COPPER_PER_GP;
  const sp = Math.floor(cp / COPPER_PER_SP);
  const copper = cp - sp * COPPER_PER_SP;

  if (gp) parts.push(`${gp.toLocaleString("en-US")} gp`);
  if (sp) parts.push(`${sp} sp`);
  if (copper) parts.push(`${copper} cp`);
  return parts.length ? parts.join(" ") : "0 gp";
}

function totalValueCp() {
  return state.items.reduce((sum, item) => sum + item.value * COPPER_PER_GP, 0);
}

function sellPriceCp() {
  return Math.floor(totalValueCp() / 2);
}

function splitValueCp() {
  const n = Math.max(1, state.partySize);
  return Math.floor(totalValueCp() / n);
}

function splitSellCp() {
  const n = Math.max(1, state.partySize);
  return Math.floor(sellPriceCp() / n);
}

function updateTotals() {
  els.totalValue.textContent = fmtCoins(totalValueCp());
  els.sellPrice.textContent = fmtCoins(sellPriceCp());
  els.splitValue.textContent = fmtCoins(splitValueCp());
  els.splitSell.textContent = fmtCoins(splitSellCp());
}

function renderList() {
  els.list.innerHTML = "";

  if (state.items.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty-state";
    empty.textContent = "No loot yet. Add some magic items.";
    els.list.appendChild(empty);
    return;
  }

  state.items.forEach((item, index) => {
    const li = document.createElement("li");
    li.className = "loot-item";

    const meta = document.createElement("div");
    meta.className = "loot-meta";

    const name = document.createElement("span");
    name.className = "name";
    name.textContent = item.name;

    const rarity = document.createElement("span");
    rarity.className = "rarity";
    rarity.textContent = RARITY_LABELS[item.rarity];

    meta.appendChild(name);
    meta.appendChild(rarity);

    const value = document.createElement("span");
    value.className = "value";
    value.textContent = `${item.value.toLocaleString("en-US")} gp`;

    const remove = document.createElement("button");
    remove.className = "remove";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Remove ${item.name}`);
    remove.addEventListener("click", () => {
      state.items.splice(index, 1);
      renderList();
      updateTotals();
      saveState();
    });

    li.appendChild(meta);
    li.appendChild(value);
    li.appendChild(remove);
    els.list.appendChild(li);
  });
}

let toastTimer = null;

function showToast(message, type = "error") {
  els.toast.innerHTML = "";

  const text = document.createElement("span");
  text.textContent = message;

  const dismiss = document.createElement("button");
  dismiss.className = "toast-dismiss";
  dismiss.textContent = "×";
  dismiss.setAttribute("aria-label", "Dismiss");
  dismiss.addEventListener("click", hideToast);

  els.toast.appendChild(text);
  els.toast.appendChild(dismiss);
  els.toast.className = `toast toast-${type}`;
  els.toast.hidden = false;

  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, 6000);
}

function hideToast() {
  clearTimeout(toastTimer);
  els.toast.hidden = true;
}

let suggestions = [];
let selectedIndex = -1;

function closeSuggestions() {
  suggestions = [];
  selectedIndex = -1;
  els.suggestions.hidden = true;
  els.suggestions.innerHTML = "";
  els.name.setAttribute("aria-expanded", "false");
}

function renderSuggestions(query) {
  if (!query || itemDb.length === 0) {
    closeSuggestions();
    return;
  }

  const lower = query.toLowerCase();
  suggestions = itemDb
    .filter((item) => item.name.toLowerCase().includes(lower))
    .slice(0, SUGGESTION_LIMIT);

  if (suggestions.length === 0) {
    closeSuggestions();
    return;
  }

  selectedIndex = -1;
  els.suggestions.innerHTML = "";

  suggestions.forEach((item, index) => {
    const li = document.createElement("li");
    li.setAttribute("role", "option");
    li.dataset.index = index;

    const name = document.createElement("span");
    name.className = "suggestion-name";

    const matchAt = item.name.toLowerCase().indexOf(lower);
    if (matchAt >= 0) {
      name.appendChild(
        document.createTextNode(item.name.slice(0, matchAt))
      );
      const em = document.createElement("em");
      em.textContent = item.name.slice(matchAt, matchAt + query.length);
      name.appendChild(em);
      name.appendChild(
        document.createTextNode(item.name.slice(matchAt + query.length))
      );
    } else {
      name.textContent = item.name;
    }

    const rarity = document.createElement("span");
    rarity.className = "suggestion-rarity";
    rarity.textContent = RARITY_LABELS[item.rarity];

    li.appendChild(name);
    li.appendChild(rarity);
    els.suggestions.appendChild(li);
  });

  els.suggestions.hidden = false;
  els.name.setAttribute("aria-expanded", "true");
}

function highlightSuggestion() {
  const options = els.suggestions.children;
  for (let i = 0; i < options.length; i++) {
    options[i].classList.toggle("selected", i === selectedIndex);
  }
  if (selectedIndex >= 0 && options[selectedIndex]) {
    options[selectedIndex].scrollIntoView({ block: "nearest" });
  }
}

function chooseSuggestion(index) {
  const item = suggestions[index];
  if (!item) return;
  els.name.value = item.name;
  els.rarity.value = item.rarity;
  els.value.value = item.value;
  closeSuggestions();
  els.rarity.focus();
}

function onNameInput() {
  renderSuggestions(els.name.value.trim());
}

function onNameKeydown(e) {
  if (!els.suggestions.hidden) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      selectedIndex = (selectedIndex + 1) % suggestions.length;
      highlightSuggestion();
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      selectedIndex =
        (selectedIndex - 1 + suggestions.length) % suggestions.length;
      highlightSuggestion();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      chooseSuggestion(selectedIndex >= 0 ? selectedIndex : 0);
      return;
    }
    if (e.key === "Escape") {
      closeSuggestions();
      return;
    }
  }

  if (e.key === "Enter") addItem();
}

function addItem() {
  const name = els.name.value.trim();
  const rarity = els.rarity.value;
  let value = parseInt(els.value.value, 10);

  if (!name) {
    els.name.focus();
    return;
  }

  if (Number.isNaN(value) || value < 0) {
    value = RARITY_DEFAULTS[rarity];
  }

  if (els.consumable.checked) {
    value = Math.floor(value / 2);
  }

  state.items.push({ name, rarity, value });
  els.name.value = "";
  els.consumable.checked = false;
  renderList();
  updateTotals();
  saveState();
}

els.rarity.addEventListener("change", () => {
  els.value.value = RARITY_DEFAULTS[els.rarity.value];
});

els.add.addEventListener("click", addItem);

els.name.addEventListener("input", onNameInput);
els.name.addEventListener("keydown", onNameKeydown);
els.name.addEventListener("blur", () => {
  setTimeout(closeSuggestions, 150);
});

els.suggestions.addEventListener("mousedown", (e) => {
  const li = e.target.closest("li");
  if (!li) return;
  e.preventDefault();
  chooseSuggestion(Number(li.dataset.index));
});

let pendingFile = null;
let lastFocused = null;

function setModalError(message) {
  els.modalError.textContent = message || "";
  els.modalError.hidden = !message;
}

function resetModal() {
  pendingFile = null;
  els.fileInput.value = "";
  els.fileName.textContent = "No file selected";
  els.modalSubmit.disabled = true;
  setModalError("");
}

function openRefreshModal() {
  resetModal();
  lastFocused = document.activeElement;
  els.modal.hidden = false;
  document.body.classList.add("modal-open");
  els.dropzone.focus();
}

function closeRefreshModal() {
  els.modal.hidden = true;
  document.body.classList.remove("modal-open");
  resetModal();
  if (lastFocused && typeof lastFocused.focus === "function") {
    lastFocused.focus();
  }
}

function selectFile(file) {
  if (!file) return;
  if (!/\.json$/i.test(file.name)) {
    setModalError("Please choose a .json file exported from dndbeyond.com.");
    return;
  }
  pendingFile = file;
  els.fileName.textContent = file.name;
  els.modalSubmit.disabled = false;
  setModalError("");
}

async function submitUpload() {
  if (!pendingFile) return;
  els.modalSubmit.disabled = true;
  setModalError("");
  try {
    const text = await pendingFile.text();
    const items = parseItemPayload(JSON.parse(text));
    if (items.length === 0) throw new Error("That file contains no items.");
    applyItemDb(items, pendingFile.name);
    closeRefreshModal();
  } catch (err) {
    setModalError(err.message || "Could not read that file.");
    els.modalSubmit.disabled = false;
  }
}

async function loadDefaultItems() {
  els.modalDefault.disabled = true;
  els.modalSubmit.disabled = true;
  const label = els.modalDefault.textContent;
  els.modalDefault.textContent = "Loading…";
  setModalError("");
  try {
    applyItemDb(await fetchAllItems(), "default");
    closeRefreshModal();
  } catch {
    setModalError("Could not load the default item database. Please try again.");
  } finally {
    els.modalDefault.disabled = false;
    els.modalDefault.textContent = label;
    els.modalSubmit.disabled = !pendingFile;
  }
}

els.refreshItems.addEventListener("click", openRefreshModal);
els.modalCancel.addEventListener("click", closeRefreshModal);
els.modalBackdrop.addEventListener("click", closeRefreshModal);
els.modalSubmit.addEventListener("click", submitUpload);
els.modalDefault.addEventListener("click", loadDefaultItems);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !els.modal.hidden) closeRefreshModal();
});

els.dropzone.addEventListener("click", () => els.fileInput.click());
// The input lives inside the dropzone; without this its programmatic click
// bubbles back and re-triggers the handler infinitely.
els.fileInput.addEventListener("click", (e) => e.stopPropagation());
els.dropzone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    els.fileInput.click();
  }
});

els.fileInput.addEventListener("change", () => {
  selectFile(els.fileInput.files[0]);
});

["dragenter", "dragover"].forEach((type) => {
  els.dropzone.addEventListener(type, (e) => {
    e.preventDefault();
    els.dropzone.classList.add("dragover");
  });
});

// Keep a stray drop anywhere on the modal from navigating the browser to the file.
["dragover", "drop"].forEach((type) => {
  els.modal.addEventListener(type, (e) => e.preventDefault());
});

["dragleave", "dragend", "drop"].forEach((type) => {
  els.dropzone.addEventListener(type, (e) => {
    e.preventDefault();
    els.dropzone.classList.remove("dragover");
  });
});

els.dropzone.addEventListener("drop", (e) => {
  selectFile(e.dataTransfer?.files?.[0]);
});

els.clearAll.addEventListener("click", () => {
  state.items = [];
  renderList();
  updateTotals();
  saveState();
});

function readPartySize() {
  const n = parseInt(els.partySize.value, 10);
  return Number.isNaN(n) || n < 1 ? 1 : n;
}

els.partySize.addEventListener("input", () => {
  state.partySize = readPartySize();
  updateTotals();
  saveState();
});

els.partySize.addEventListener("blur", () => {
  state.partySize = readPartySize();
  els.partySize.value = state.partySize;
  updateTotals();
  saveState();
});

loadState();
els.partySize.value = state.partySize;
renderList();
updateTotals();
initItemDb();
