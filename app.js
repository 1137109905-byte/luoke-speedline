(() => {
  const STORAGE_KEY = "rock-speedline-pool-v3";
  const IMAGE_ROOT = "https://rkteambuilder.com/monster-images/180/";
  const EXCLUDED_MONSTER_IDS = new Set([479]);

  const STANDARD_PROFILES = [
    { id: "fast", individual: 10, nature: "加速性格", modifier: 1.2 },
    { id: "full", individual: 10, nature: "中性", modifier: 1 },
    { id: "zero", individual: 0, nature: "中性", modifier: 1 }
  ];
  const profilesById = new Map(STANDARD_PROFILES.map((profile) => [profile.id, profile]));
  const SPECIAL_LINES = {
    "兽花蕾": [{ profile: "fast", add: 100, note: "特性+100" }],
    "绒光优优": [{ profile: "fast", add: 50, note: "特性+50" }],
    "陨星虫": [{ profile: "fast", add: 50, note: "绝缘球+50" }],
    "女王蜂": [{ profile: "fast", multiply: 1.75, note: "特性+75%" }],
    "迪莫": [{ profile: "fast", multiply: 1.2, note: "特性+20%" }],
    "黑猫巫师": [
      { profile: "fast", add: 50, note: "特性+50" },
      { profile: "full", add: 50, note: "特性+50" }
    ]
  };

  const allMonsters = (window.MONSTERS || []).map((monster) => {
    const zh = monster.localized?.zh || {};
    const baseName = zh.name || monster.name;
    const form = !monster.is_leader_form && zh.form ? `（${zh.form}）` : "";
    return { ...monster, displayName: `${baseName}${form}`, baseName };
  }).sort((a, b) => a.dex_number - b.dex_number || a.id - b.id);

  const monsters = allMonsters.filter((monster) => !EXCLUDED_MONSTER_IDS.has(monster.id));
  const byId = new Map(monsters.map((monster) => [monster.id, monster]));
  const evolvesFromIds = new Set(allMonsters.map((monster) => monster.evolves_from_id).filter(Boolean));
  const finalMonsters = monsters.filter((monster) => !evolvesFromIds.has(monster.id));

  const els = {
    mainSearch: document.querySelector("#mainSearch"), speedList: document.querySelector("#speedList"),
    summaryText: document.querySelector("#summaryText"), poolPanel: document.querySelector("#poolPanel"),
    poolLaunch: document.querySelector("#poolLaunch"), poolClose: document.querySelector("#poolClose"),
    floatingPool: document.querySelector("#floatingPool"), backdrop: document.querySelector("#backdrop"),
    poolSearch: document.querySelector("#poolSearch"), poolList: document.querySelector("#poolList"),
    selectedCount: document.querySelector("#selectedCount"), poolDone: document.querySelector("#poolDone"),
    poolLaunchCount: document.querySelector("#poolLaunchCount"), floatingCount: document.querySelector("#floatingCount"),
    restoreDefault: document.querySelector("#restoreDefault"), clearPool: document.querySelector("#clearPool"),
    resultCount: document.querySelector("#resultCount"), toast: document.querySelector("#toast")
  };

  let state = loadState();
  let poolFilter = "all";
  let toastTimer;

  function defaultState() {
    const selected = {};
    finalMonsters.forEach((monster) => { selected[monster.id] = true; });
    return { selected };
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved?.selected && typeof saved.selected === "object") return saved;
    } catch (_) {}
    return defaultState();
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function selectedMonsters() {
    return Object.keys(state.selected).map((id) => byId.get(Number(id))).filter(Boolean);
  }

  function calculateSpeed(monster, profile) {
    const core = Math.round(1.1 * (monster.base_spd + 3 * profile.individual) + 10);
    return Math.round(core * profile.modifier + 50);
  }

  function lineEntries(monster) {
    const standard = STANDARD_PROFILES.map((profile) => ({
      monster,
      profile,
      value: calculateSpeed(monster, profile),
      note: ""
    }));
    const specials = (SPECIAL_LINES[monster.baseName] || []).map((special) => {
      const profile = profilesById.get(special.profile);
      const standardValue = calculateSpeed(monster, profile);
      const value = special.multiply ? Math.round(standardValue * special.multiply) : standardValue + special.add;
      return { monster, profile, value, note: special.note };
    });
    return [...specials, ...standard];
  }

  function imageUrl(monster) {
    const zh = monster.localized?.zh || {};
    const suffix = !monster.is_leader_form && zh.form ? `(${zh.form})` : "";
    const safeName = `${zh.name || monster.name}${suffix}`.replace(/[\\/:*?"<>|]/g, "").trim();
    return `${IMAGE_ROOT}${encodeURIComponent(safeName)}.png`;
  }

  function avatar(monster) {
    return `<img class="avatar" src="${imageUrl(monster)}" alt="" loading="lazy" data-id="${monster.id}">`;
  }

  function attachImageFallbacks(root) {
    root.querySelectorAll("img[data-id]").forEach((img) => {
      img.addEventListener("error", () => {
        if (img.dataset.fallback === "id") {
          img.removeAttribute("src");
          img.classList.add("avatar-fallback");
          return;
        }
        img.dataset.fallback = "id";
        img.src = `${IMAGE_ROOT}${img.dataset.id}.png`;
      }, { once: false });
    });
  }

  function renderMain() {
    const query = els.mainSearch.value.trim().toLowerCase();
    const selected = selectedMonsters();
    const entries = selected
      .filter((monster) => !query || monster.displayName.toLowerCase().includes(query))
      .flatMap(lineEntries);
    const groups = new Map();
    entries.forEach((entry) => {
      const key = [entry.value, entry.monster.base_spd, entry.profile.individual, entry.profile.nature].join("|");
      if (!groups.has(key)) {
        groups.set(key, {
          value: entry.value,
          base: entry.monster.base_spd,
          individual: entry.profile.individual,
          nature: entry.profile.nature,
          entries: []
        });
      }
      groups.get(key).entries.push(entry);
    });
    const sortedGroups = [...groups.values()].sort((a, b) =>
      b.value - a.value || b.base - a.base || b.individual - a.individual || b.nature.localeCompare(a.nature, "zh-CN")
    );

    const selectedTotal = selected.length;
    els.summaryText.textContent = `已选 ${selectedTotal} 只精灵 · 当前 ${sortedGroups.length} 档速度线。`;
    updateCounts(selectedTotal);

    if (!sortedGroups.length) {
      els.speedList.innerHTML = `<div class="empty-state"><strong>${selectedTotal ? "没有匹配的精灵" : "精灵池还是空的"}</strong><br><button type="button" id="emptyAdd">打开精灵池</button></div>`;
      document.querySelector("#emptyAdd")?.addEventListener("click", openPool);
      return;
    }

    els.speedList.innerHTML = sortedGroups.map((group) => {
      const pills = group.entries.sort((a, b) => a.monster.dex_number - b.monster.dex_number).map(({ monster, note }) => `
        <div class="pet-pill">
          <button class="pet-edit" type="button" data-edit-id="${monster.id}" title="在精灵池中查看 ${monster.displayName}">
            ${avatar(monster)}<span class="pet-name">${monster.displayName}</span>${note ? `<span class="speed-note">${note}</span>` : ""}
          </button>
          <button class="pet-remove" type="button" data-remove-id="${monster.id}" aria-label="从速度线全部速度档移除 ${monster.displayName}" title="移除 ${monster.displayName}">×</button>
        </div>`).join("");
      const meta = `种族 ${group.base} · 个体 ${group.individual} · ${group.nature}`;
      return `<article class="speed-group"><div class="speed-number">${group.value}</div><div class="pet-wrap">${pills}</div><div class="group-meta">${meta}</div></article>`;
    }).join("");
    attachImageFallbacks(els.speedList);
    els.speedList.querySelectorAll("[data-remove-id]").forEach((button) => button.addEventListener("click", (event) => {
      event.stopPropagation();
      toggleMonster(Number(button.dataset.removeId));
    }));
    els.speedList.querySelectorAll("[data-edit-id]").forEach((button) => {
      const edit = () => {
        const monster = byId.get(Number(button.dataset.editId));
        els.poolSearch.value = monster.displayName;
        poolFilter = "all";
        syncPoolFilterButtons();
        openPool();
        renderPool();
      };
      button.addEventListener("click", edit);
    });
  }

  function renderPool() {
    const query = els.poolSearch.value.trim().toLowerCase();
    const filtered = monsters.filter((monster) => {
      const matchesQuery = !query || monster.displayName.toLowerCase().includes(query) || String(monster.dex_number).includes(query);
      const matchesFilter = poolFilter === "all" || Boolean(state.selected[monster.id]);
      return matchesQuery && matchesFilter;
    });
    els.resultCount.textContent = `${filtered.length} 只`;

    const visible = filtered.slice(0, 160);
    els.poolList.innerHTML = visible.map((monster) => {
      const selected = Boolean(state.selected[monster.id]);
      return `<div class="pool-card ${selected ? "selected" : ""}" data-card-id="${monster.id}">
        ${avatar(monster)}
        <div class="pool-card-main"><div class="pool-card-name">${monster.displayName}</div><div class="pool-card-meta">#${String(monster.dex_number).padStart(3, "0")} · 种族 ${monster.base_spd} · 自动生成3档</div></div>
        <button class="pool-toggle" type="button" aria-label="${selected ? "移除" : "加入"}${monster.displayName}">${selected ? "✓" : ""}</button>
      </div>`;
    }).join("") + (filtered.length > visible.length ? `<div class="empty-state">继续输入名称可缩小范围<br>当前先显示前 ${visible.length} 只</div>` : "");
    attachImageFallbacks(els.poolList);

    els.poolList.querySelectorAll(".pool-card").forEach((card) => {
      const id = Number(card.dataset.cardId);
      card.querySelector(".pool-toggle").addEventListener("click", () => toggleMonster(id));
    });
  }

  function toggleMonster(id) {
    const monster = byId.get(id);
    if (!monster) return;
    if (state.selected[id]) {
      delete state.selected[id];
      showToast(`已移除 ${monster.displayName}`);
    } else {
      state.selected[id] = true;
      showToast(`已加入 ${monster.displayName}`);
    }
    saveState();
    renderMain();
    renderPool();
  }

  function updateCounts(count) {
    [els.selectedCount, els.poolLaunchCount, els.floatingCount].forEach((el) => { el.textContent = count; });
    els.poolDone.textContent = `完成（${count}）`;
  }

  function syncPoolFilterButtons() {
    document.querySelectorAll("[data-pool-filter]").forEach((button) => button.classList.toggle("active", button.dataset.poolFilter === poolFilter));
  }

  function openPool() {
    if (matchMedia("(max-width: 980px)").matches) {
      document.body.classList.add("pool-open");
    } else {
      document.body.classList.remove("pool-hidden");
    }
    requestAnimationFrame(() => els.poolSearch.focus());
  }

  function closePool() {
    if (matchMedia("(max-width: 980px)").matches) {
      document.body.classList.remove("pool-open");
    } else {
      document.body.classList.add("pool-hidden");
    }
  }

  function restoreDefault() {
    state = defaultState();
    saveState();
    renderMain();
    renderPool();
    showToast(`已恢复全部 ${finalMonsters.length} 个最终形态`);
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.classList.add("show");
    toastTimer = setTimeout(() => els.toast.classList.remove("show"), 1600);
  }

  els.mainSearch.addEventListener("input", renderMain);
  els.poolSearch.addEventListener("input", renderPool);
  els.poolLaunch.addEventListener("click", openPool);
  els.floatingPool.addEventListener("click", openPool);
  els.poolClose.addEventListener("click", closePool);
  els.poolDone.addEventListener("click", closePool);
  els.backdrop.addEventListener("click", closePool);
  els.restoreDefault.addEventListener("click", restoreDefault);
  els.clearPool.addEventListener("click", () => {
    state.selected = {};
    saveState();
    renderMain();
    renderPool();
    showToast("精灵池已清空");
  });
  document.querySelectorAll("[data-pool-filter]").forEach((button) => button.addEventListener("click", () => {
    poolFilter = button.dataset.poolFilter;
    syncPoolFilterButtons();
    renderPool();
  }));
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") closePool(); });
  matchMedia("(max-width: 980px)").addEventListener("change", () => {
    document.body.classList.remove("pool-open", "pool-hidden");
  });

  els.restoreDefault.textContent = `恢复默认（${finalMonsters.length}）`;

  renderMain();
  renderPool();
})();
