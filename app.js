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

const formatters = {
  gp: (n) => `${n.toLocaleString("en-US")} gp`,
  number: (n) => n.toLocaleString("en-US"),
};

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
};

function fmt(n) {
  return formatters.gp(n);
}

function totalValue() {
  return state.items.reduce((sum, item) => sum + item.value, 0);
}

function sellPrice() {
  return Math.floor(totalValue() / 2);
}

function splitValue() {
  const n = Math.max(1, state.partySize);
  return Math.floor(totalValue() / n);
}

function splitSell() {
  const n = Math.max(1, state.partySize);
  return Math.floor(sellPrice() / n);
}

function updateTotals() {
  els.totalValue.textContent = fmt(totalValue());
  els.sellPrice.textContent = fmt(sellPrice());
  els.splitValue.textContent = fmt(splitValue());
  els.splitSell.textContent = fmt(splitSell());
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
    value.textContent = fmt(item.value);

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

els.name.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addItem();
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
