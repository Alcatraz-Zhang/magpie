// The provider editor's models by maker, the newest first (WJaunita45604
// on X: 供应商的模型里面应该支持默认按厂商分类，并且按模型里的数字从大到小排序).
// Each maker's models stand under its name, a plain small label, makers in
// the order below; one whose maker magpie doesn't know goes under Other,
// last, in the vendor's order. The maker is the server's (modelJSON.Maker: agent.ModelIcon, the
// logo the agents' pickers draw beside it). A list of one maker has no
// labels. Within a maker the version its name holds decides, compared
// number by number (5.10 over 5.9, 5 over 4.8): a higher version first,
// a release before its preview, the alias before its dated snapshots, a
// later snapshot first, and the vendor's order between the rest. Only the order drawn changes: the 24 a vendor's list
// serves with none picked are still its first 24.
// advgroups.js imports it as the Providers page first draws, which an
// editor waits for, and app.js when it draws a provider's models without
// it (they show in the vendor's order for that moment); it weighs nothing
// on the core.
// It also holds the model selection controls and each chip's API menu.

// the makers, in the order their groups go, by the logo the server names
const MAKERS = {
  "claude-color": "Anthropic", openai: "OpenAI", "gemini-color": "Google", "deepseek-color": "DeepSeek", xai: "xAI",
  "qwen-color": "Qwen", kimi: "Moonshot AI", "zhipu-color": "Zhipu", "minimax-color": "MiniMax", "mistral-color": "Mistral",
  mimocode: "Xiaomi", stepfun: "StepFun",
};
const RANK = Object.keys(MAKERS);

// versionOf reads what catalog.FamilyOf reads off a name: its version
// numbers, its snapshot (a date or revision after them) and whether it is
// a preview. A size (70b, a22b, 32k) is no version.
const NUM = /^\d+(?:\.\d+)*$/, TAIL = /^([a-z][a-z.]*?[a-z])(\d+(?:\.\d+)*)$|^([a-z])(\d+(?:\.\d+)*)$/, HEAD = /^(\d+(?:\.\d+)*)([a-z]+)$/;
const SIZE = /^(?:[a-z]?\d+(?:\.\d+)?|\d+x\d+(?:\.\d+)?)[bmkte]$/, PREVIEW = new Set(["preview", "exp", "experimental", "beta", "alpha"]);
const versions = new Map();
function versionOf(name) {
  let f = versions.get(name);
  if (f) return f;
  const w = name.toLowerCase().trim().split(/[-_/:@[\]\s]+/), snap = [];
  f = { v: [], snap: "", pre: false };
  w.forEach((x, i) => { if (/^\d+$/.test(x) && (x.length >= 4 || (x.length >= 2 && x[0] === "0"))) snap[i] = true; });
  // the day after a month (05-20), the month before a year (12-2024)
  w.forEach((x, i) => { if (!snap[i] && /^\d\d$/.test(x) && (snap[i - 1] || /^(?:19|20)\d\d$/.test(w[i + 1] || ""))) snap[i] = true; });
  const add = (s) => f.v.push(...s.split(".").map((n) => parseInt(n, 10) || 0));
  w.forEach((x, i) => {
    let m;
    if (!x || x === "latest") return;
    if (snap[i]) f.snap += (f.snap ? "-" : "") + x;
    else if (PREVIEW.has(x)) f.pre = true;
    else if (NUM.test(x)) add(x);
    else if (SIZE.test(x)) return;
    else if ((m = TAIL.exec(x))) add(m[2] || m[4]);
    else if ((m = HEAD.exec(x))) add(m[1]);
  });
  versions.set(name, f);
  return f;
}

// newer: below 0 when a goes before b
function newer(a, b) {
  for (let i = 0; i < Math.min(a.v.length, b.v.length); i++) if (a.v[i] !== b.v[i]) return b.v[i] - a.v[i];
  if (a.v.length !== b.v.length) return b.v.length - a.v.length;
  if (a.pre !== b.pre) return a.pre ? 1 : -1;
  if (!a.snap !== !b.snap) return a.snap ? 1 : -1;
  return a.snap === b.snap ? 0 : a.snap > b.snap ? -1 : 1;
}

const makerOf = (m) => (RANK.includes(m.maker) ? m.maker : "");

// modelOrder: models in the order drawn, and put(chip, model), which
// appends a chip to chips under its maker's label
window.modelOrder = function (models, chips) {
  const rank = (m) => (makerOf(m) ? RANK.indexOf(m.maker) : RANK.length);
  // the name shown, else its id, where it says a version
  const ver = (m) => { const a = versionOf(m.name || m.id); return a.v.length || !m.name ? a : versionOf(m.id); };
  // Other stays in the vendor's order: its numbers are different makers'
  const list = models.map((m, i) => [m, rank(m), makerOf(m) && ver(m), i]).sort((a, b) => a[1] - b[1] || (a[2] && newer(a[2], b[2])) || a[3] - b[3]).map((x) => x[0]);
  const many = new Set(models.map(makerOf)).size > 1;
  let last;
  return {
    list,
    put(c, m) {
      const k = makerOf(m);
      if (many && k !== last) chips.append(el("div", "mmaker", k ? t(MAKERS[k]) : t("Other")));
      last = k;
      chips.append(c);
    },
  };
};

// modelAPIPick: the API a model is asked on (01huadalang), picked from a
// chip's right-click and staged as Model settings stages it
window.modelAPIPick = function (c, p, id, apis, apiNow, draw) {
  const m = p.models.find((x) => x.id === id) || { id };
  const auto = (m.auto || []).map(apiLabel).join(" · ");
  const opts = [{ v: "", name: "Auto", note: auto ? t("As its vendor's list says: {apis}", { apis: auto }) : "Each API the provider has, as it answers" },
    ...apis.map(([k, l, hint]) => ({ v: k, name: l, note: hint }))];
  openProtoMenu(c, opts, apiNow(id), (v) => {
    if (v === apiNow(id)) return;
    const prefs = draft.modelPrefs = draft.modelPrefs || {};
    prefs[id] = prefs[id] || {};
    if (v === (m.api || "")) delete prefs[id].api; else prefs[id].api = v;
    if (!Object.keys(prefs[id]).length) delete prefs[id];
    draw();
    status(v ? t("{model} is asked on {api} once saved", { model: id, api: apiLabel(v) }) : t("{model} is asked as its vendor's list says once saved", { model: id }), "ok");
  }, "API this model is asked on", "model-api-menu");
};

window.modelBulk = function (p, q, noAPI, draw) {
  // every model at once (those the filter shows, when there is one), or none
  const bulk = el("div", "mbulk");
  const allOn = el("button", "text action", t("Select all"));
  allOn.title = t("Pick every model listed that this provider can serve (those the filter shows)");
  allOn.onclick = () => {
    const f = (q?.value || "").trim().toLowerCase();
    const ids = p.models.filter((m) => !noAPI(m)).filter((m) => !f || m.id.toLowerCase().includes(f) || (m.name || "").toLowerCase().includes(f) || (m.default || "").toLowerCase().includes(f)).map((m) => m.id);
    draft.chosen = [...draft.chosen, ...ids.filter((id) => !draft.chosen.includes(id))];
    draft.none = true;
    draw();
  };
  const allOff = el("button", "text action", t("Select none"));
  allOff.title = t("Unpick every model");
  allOff.onclick = () => { draft.chosen = []; draft.none = true; draft.picking = false; draw(); };
  bulk.append(allOn, allOff);
  // just the free ones, offered when the list has free and paid
  const isFree = (m) => m.free || m.zero || namedFree(m.id, m.name);
  if (p.models.some(isFree) && !p.models.every(isFree)) {
    const freeOn = el("button", "text action", t("Free only"));
    freeOn.title = t("Pick only the free models (those the filter shows), unpicking the others");
    freeOn.onclick = () => {
      const f = (q?.value || "").trim().toLowerCase();
      draft.chosen = p.models.filter((m) => isFree(m) && !noAPI(m) && (!f || m.id.toLowerCase().includes(f) || (m.name || "").toLowerCase().includes(f) || (m.default || "").toLowerCase().includes(f))).map((m) => m.id);
      draft.none = true;
      draw();
    };
    bulk.append(freeOn);
  }
  // unpicks those whose last test failed (H20 on Discord)
  const workOn = el("button", "text action works-only", t("Working only"));
  const failedPicks = () => {
    const got = modelTests[p.id] || {};
    const ids = servedIds(p);
    return [ids, ids.filter((id) => got[id] && !got[id].ok)];
  };
  workOn.onclick = () => {
    const [ids, bad] = failedPicks();
    if (!bad.length) return;
    draft.chosen = ids.filter((id) => !bad.includes(id));
    draft.none = true;
    draw();
    status(t(bad.length === 1 ? "Unpicked 1 model that didn't answer" : "Unpicked {n} models that didn't answer", { n: bad.length }), "ok");
  };
  const drawWorkOn = () => {
    // in the row only once a test has answered, not there hidden till then
    if (!Object.values(modelTests[p.id] || {}).some((x) => x)) { workOn.remove(); return; }
    if (!workOn.isConnected) bulk.append(workOn);
    const bad = failedPicks()[1].length;
    workOn.disabled = !bad;
    workOn.title = bad ? t("Unpick the models whose last test failed; those that answered, and those not tested, stay picked")
      : t("Every picked model that was tested answered");
  };
  return { bulk, drawWorkOn };
};

// The editor keeps its own override draft. The provider previews its
// exposure from the current catalog, without fetching or saving the list.
window.bestFamilyModels = function (p, box, draw) {
  const d = draft, active = () => bestChosen() && !decideOnly(p);
  const limit = () => d.bestLimit ?? (p.preset === "remote-magpie" ? 0 : 24);
  const cap = el("button", "text action best-limit");
  const count = el("span", "hint");
  const retry = el("button", "text action", t("Try again"));
  const controls = el("div", "mbulk");
  controls.append(cap, count, retry);
  cap.setAttribute("aria-label", t("Automatic model limit"));
  const choices = [null, 24, 48, 96, 192, 0].map((v) => ({
    v, name: v === null ? "Default" : v === 0 ? "Unlimited" : String(v), literalName: !!v,
  }));
  cap.onclick = () => openProtoMenu(cap, choices, d.bestLimit, (v) => { d.bestLimit = v; draw(); }, "Automatic model limit");
  let request;
  retry.onclick = () => { request = null; draw(); };
  const expose = (ids) => {
    retry.hidden = !request?.failed;
    count.textContent = retry.hidden ? t("Exposed models: {n}", { n: ids.length }) : t("Model preview unavailable");
    return ids;
  };
  const ids = (noAPI) => {
    controls.hidden = !active();
    if (controls.hidden) { request = null; return null; }
    cap.textContent = `${t("Automatic model limit")} · ${limit() || t("Unlimited")}`;
    const modelPrefs = Object.fromEntries(Object.entries(d.modelPrefs || {}).filter(([, m]) => m.api !== undefined).map(([id, { api }]) => [id, { api }]));
    const args = { ...bestSettingsOfDraft(), modelPrefs, listOff: d.listOff }, key = JSON.stringify(args);
    if (request?.key === key && request.models) return expose(request.models);

    // The catalog flags give the initial drawing while the preview returns.
    const rows = d.listOff ? [] : p.models.filter((m) => !noAPI(m));
    const automatic = rows.filter((m) => m.best).slice(0, limit() || rows.length);
    const overrides = args.bestInFamilyOverrides;
    const shown = [...new Set([...automatic.filter((m) => overrides[m.id] !== 0), ...rows.filter((m) => overrides[m.id] === 1)].map((m) => m.id))];
    if (request?.key !== key) {
      const asked = request = { key };
      const current = () => request === asked && draft === d && box.isConnected && active();
      api("provider/models", { id: p.id, bestInFamilyPreview: true, ...args }).then((r) => {
        if (!current() || !Array.isArray(r.models)) return;
        asked.models = r.models;
        if (shown.length !== r.models.length || shown.some((id, i) => id !== r.models[i])) draw();
      }, (e) => {
        if (!current()) return;
        asked.failed = true;
        retry.title = e.message;
        draw();
      });
    }
    return expose(shown);
  };
  const edit = (id, v) => {
    d.bestOverrides = { ...d.bestOverrides, [id]: v };
    if (v === null) delete d.bestOverrides[id];
    draw();
  };
  const nextOverride = (id) => {
    const v = d.bestOverrides[id];
    return v === 0 ? 1 : v === 1 ? null : 0;
  };
  return {
    active, controls, ids, edit,
    cycle: (id) => edit(id, nextOverride(id)),
    add: (ids) => { d.bestOverrides = { ...d.bestOverrides, ...Object.fromEntries(ids.map((id) => [id, 1])) }; },
    included: (id) => active() && d.bestOverrides[id] === 1,
    restore: (id) => active() && Object.hasOwn(d.bestOverrides, id),
    mark(c, id, on) {
      if (!active()) return;
      c.setAttribute("aria-pressed", on);
      const v = d.bestOverrides[id], next = nextOverride(id);
      c.classList.toggle("best-excluded", v === 0);
      const action = t(next === null ? "Restore automatic selection" : next === 1 ? "Include in Best in family" : "Exclude from Best in family");
      const state = v === 1 ? t("Manually included") : v === 0 ? t("Manually excluded") : "";
      c.title = [c.title, state, action].filter(Boolean).join("\n");
    },
    hint() {
      if (d.unlisted) return t("Best in family: routing groups use the automatic choices and your overrides.");
      if (!limit()) return t("Best in family: agents see the newest model of each family it lists (dashed). A newer one it lists later takes the old one's place.");
      return t("Best in family: agents see the newest model of each family it lists (dashed), up to {n} automatic choices. A newer one it lists later takes the old one's place.", { n: limit() });
    },
  };
};
