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

// D&D Beyond blocks cross-origin browser requests. Point this at a local or
// hosted CORS proxy that forwards the path and query string unchanged.
const ITEMS_API_URL =
  "https://character-service.dndbeyond.com/character/v5.1/game-data/items";
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
    return Array.isArray(saved) ? saved : null;
  } catch {
    return null;
  }
}

function saveItemDb(items) {
  localStorage.setItem(ITEMS_DB_KEY, JSON.stringify(items));
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
    for (const item of batch) {
      const rarity = normalizeRarity(item.rarity);
      all.push({
        name: item.name || "Unknown",
        rarity,
        value:
          item.cost != null ? Math.round(item.cost) : RARITY_DEFAULTS[rarity],
      });
    }

    const total = body.pagination?.total ?? all.length;
    page++;
    if (batch.length === 0 || all.length >= total) break;
  }

  return all;
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

async function refreshItemDb() {
  itemDb = await fetchAllItems();
  saveItemDb(itemDb);
  showToast(`Item database refreshed (${itemDb.length} items).`, "success");
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

els.refreshItems.addEventListener("click", async () => {
  els.refreshItems.disabled = true;
  const label = els.refreshItems.textContent;
  els.refreshItems.textContent = "Loading…";
  try {
    await refreshItemDb();
  } catch {
    showToast("Could not refresh the item database. Please try again.");
  } finally {
    els.refreshItems.disabled = false;
    els.refreshItems.textContent = label;
  }
});

els.clearAll.addEventListener("click", () => {
  state.items = [];
  renderList();
  updateTotals();
  saveState();
});

els.partySize.addEventListener("input", () => {
  const n = parseInt(els.partySize.value, 10);
  state.partySize = Number.isNaN(n) || n < 1 ? 1 : n;
  els.partySize.value = state.partySize;
  updateTotals();
  saveState();
});

loadState();
els.partySize.value = state.partySize;
renderList();
updateTotals();
initItemDb();
