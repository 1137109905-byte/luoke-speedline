(() => {
  const STORAGE_KEY = "rock-speedline-pool-v3";
  const IMAGE_ROOT = "https://rkteambuilder.com/monster-images/180/";
  const EXCLUDED_MONSTER_IDS = new Set([479]);

  const STANDARD_PROFILES = [
    { id: "fast", individual: 10, nature: "加速性格", modifier: 1.2 },
    { id: "full", individual: 10, nature: "中性", modifier: 1 },
    { id: "zero", individual: 0, nature: "中性", modifier: 1 }
  ];
  const S3_TOP_120_NAMES = `炮米花|寂灭骨龙|瞌睡王|魔力猫|音速犬|绒光优优|火羽|电球咩咩|泥吼牙|尖嘴狐仙|加油蟹（单只海葵的样子）|水灵|翠顶夫人|恶魔狼|霹雳迪迪|贝古斯|卡瓦重（雪山附近的样子）|烈火守护|雪影娃娃|飞飞钥|火焰猿|海豹船长|古卷执政官|彩蝶鲨|化蝶（平常的样子）|锤头鹳|离心舞者|冰钻布鲁斯|森巨人|黑化加尔|圣羽翼王|徘徊爪爪|利灯鱼|卡瓦重（火山附近的样子）|画间沉铁兽|迪莫|寒音蛇|食尘短绒|蹦床松鼠|小皮球|椰浆布丁|龙息帕尔|闪电鳗鱼|巨噬针鼹|翼龙|幻影灵菇|影狸|稻草守护者|龙鱼|火神|帕帕斯卡|酷拉|深渊蛙|白金独角兽|九幽菇|岚鸟（春天的样子）|獠牙猪|加尔|针叶巡林|岚鸟（夏天的样子）|星光狮（星光能量的样子）|黑猫巫师|菊花梨|布克棱岩|高脚鹬|里拉鳐|海枝枝（翠绿纶布）|棋绮后（白子）|兽花蕾|壳栗丝鼠|嗜波螺（被污染的样子）|月牙雪熊|邪眼巨魔|圣剑-X|伊贝粉粉|海枝枝（碧蓝珊瑚）|怖哭菇|卡洛儿|荆棘电环|伊兰亚龙|抹茶布丁|绒仙子|落陨星兔|石冠王蜥（本来的样子）|克莱因龙|裘卡|窃光蚊|棋绮后（黑子）|琉璃水母|巨鼓象|燃薪虫|饮雪狂兽|珀尔鼬|乌拉塔（极昼的样子）|皇家狮鹫（高山地的样子）|流浪鼠|爆焰喷喷|春花兔|化蝶（幽冥眼的样子）|卡拉波斯|奇丽花|千棘盔（本来的样子）|公平鸽|圆号鱼|雷神之子|陨星虫|炽心勇狮|半朽蜜果灵|化蝶（奇丽花的样子）|雪巨人|夜枭|花衣蝶|蝎子王|波多西|流明坎德拉|白发路路|岚鸟（本来的样子）|铠甲虫|魔草巫灵|岚鸟（秋天的样子）`.split("|");
  const s3Top120Names = new Set(S3_TOP_120_NAMES);
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
    resultCount: document.querySelector("#resultCount"), speedTooltip: document.querySelector("#speedTooltip"),
    toast: document.querySelector("#toast")
  };

  let state = loadState();
  let mainFilter = state.mainFilter === "s3" ? "s3" : "all";
  let poolFilter = "all";
  let speedTooltipTimer;
  let speedTooltipTarget;
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

  function positionSpeedTooltip(target) {
    const targetRect = target.getBoundingClientRect();
    const tooltipRect = els.speedTooltip.getBoundingClientRect();
    const gap = 10;
    const left = Math.min(
      window.innerWidth - tooltipRect.width - 8,
      Math.max(8, targetRect.left + targetRect.width / 2 - tooltipRect.width / 2)
    );
    const above = targetRect.top - tooltipRect.height - gap;
    const top = above >= 8 ? above : targetRect.bottom + gap;
    els.speedTooltip.style.left = `${left}px`;
    els.speedTooltip.style.top = `${top}px`;
  }

  function scheduleSpeedTooltip(target) {
    hideSpeedTooltip();
    speedTooltipTarget = target;
    speedTooltipTimer = setTimeout(() => {
      if (speedTooltipTarget !== target || !target.isConnected) return;
      const monster = byId.get(Number(target.dataset.speedId));
      if (!monster) return;
      const rows = STANDARD_PROFILES.map((profile) => {
        const label = profile.id === "fast" ? "个体10 · 加速性格" : profile.id === "full" ? "个体10 · 中性" : "个体0 · 中性";
        return `<div class="speed-tooltip-row"><span>${label}</span><strong>${calculateSpeed(monster, profile)}</strong></div>`;
      }).join("");
      els.speedTooltip.innerHTML = `<div class="speed-tooltip-title">${monster.displayName} · 三种速度</div>${rows}`;
      els.speedTooltip.classList.add("show");
      els.speedTooltip.setAttribute("aria-hidden", "false");
      positionSpeedTooltip(target);
    }, 1000);
  }

  function hideSpeedTooltip() {
    clearTimeout(speedTooltipTimer);
    speedTooltipTarget = null;
    els.speedTooltip.classList.remove("show");
    els.speedTooltip.setAttribute("aria-hidden", "true");
  }

  function attachSpeedTooltips(root) {
    root.querySelectorAll("[data-speed-id]").forEach((pill) => {
      pill.addEventListener("mouseenter", () => scheduleSpeedTooltip(pill));
      pill.addEventListener("mouseleave", hideSpeedTooltip);
    });
  }

  function renderMain() {
    hideSpeedTooltip();
    const query = els.mainSearch.value.trim().toLowerCase();
    const selected = selectedMonsters();
    const scoped = selected.filter((monster) => mainFilter === "all" || s3Top120Names.has(monster.displayName));
    const entries = scoped
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
    els.summaryText.textContent = mainFilter === "s3"
      ? `S3使用率前120筛选 · 精灵池中匹配 ${scoped.length} 只 · 当前 ${sortedGroups.length} 档速度线。`
      : `已选 ${selectedTotal} 只精灵 · 当前 ${sortedGroups.length} 档速度线。`;
    updateCounts(selectedTotal);

    if (!sortedGroups.length) {
      els.speedList.innerHTML = `<div class="empty-state"><strong>${selectedTotal ? "没有匹配的精灵" : "精灵池还是空的"}</strong><br><button type="button" id="emptyAdd">打开精灵池</button></div>`;
      document.querySelector("#emptyAdd")?.addEventListener("click", openPool);
      return;
    }

    els.speedList.innerHTML = sortedGroups.map((group) => {
      const pills = group.entries.sort((a, b) => a.monster.dex_number - b.monster.dex_number).map(({ monster, note }) => `
        <div class="pet-pill" data-speed-id="${monster.id}">
          <button class="pet-edit" type="button" data-edit-id="${monster.id}" title="在精灵池中查看 ${monster.displayName}">
            ${avatar(monster)}<span class="pet-name">${monster.displayName}</span>${note ? `<span class="speed-note">${note}</span>` : ""}
          </button>
          <button class="pet-remove" type="button" data-remove-id="${monster.id}" aria-label="从速度线全部速度档移除 ${monster.displayName}" title="移除 ${monster.displayName}">×</button>
        </div>`).join("");
      const meta = `种族 ${group.base} · 个体 ${group.individual} · ${group.nature}`;
      return `<article class="speed-group"><div class="speed-number">${group.value}</div><div class="pet-wrap">${pills}</div><div class="group-meta">${meta}</div></article>`;
    }).join("");
    attachImageFallbacks(els.speedList);
    attachSpeedTooltips(els.speedList);
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

  function syncMainFilterButtons() {
    document.querySelectorAll("[data-main-filter]").forEach((button) => button.classList.toggle("active", button.dataset.mainFilter === mainFilter));
  }

  function openPool() {
    hideSpeedTooltip();
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
    state = { ...defaultState(), mainFilter };
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
  document.querySelectorAll("[data-main-filter]").forEach((button) => button.addEventListener("click", () => {
    mainFilter = button.dataset.mainFilter;
    state.mainFilter = mainFilter;
    saveState();
    syncMainFilterButtons();
    renderMain();
  }));
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
  document.addEventListener("scroll", hideSpeedTooltip, true);
  window.addEventListener("resize", hideSpeedTooltip);
  matchMedia("(max-width: 980px)").addEventListener("change", () => {
    document.body.classList.remove("pool-open", "pool-hidden");
  });

  els.restoreDefault.textContent = `恢复默认（${finalMonsters.length}）`;

  syncMainFilterButtons();
  renderMain();
  renderPool();
})();
