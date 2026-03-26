/* global html2canvas */

const STORAGE_KEY = "turnosPazy.localState.v4";
const DEFAULT_PEOPLE = ["Georgi Valeriev", "Magui Cerda", "Antonella Sipan", "Inigo Puyol", "Luz Romero", "Patricia Lopez", "Jorge Romera", "Irene Penalosa", "Maria Jose Rubio", "Alessandra Solis", "Adrian Garces", "Ignacio Rivas", "Alonso Garcia", "Rodrigo Fernandez", "Lara Carrasco"];
const DAYS = [{ key: "JUE", label: "Jueves" }, { key: "VIE", label: "Viernes" }, { key: "SAB", label: "Sábado" }, { key: "DOM", label: "Domingo" }, { key: "LUN", label: "Lunes" }, { key: "MAR", label: "Martes" }, { key: "MIE", label: "Miércoles" }];
const FRANJAS = [{ key: "MANANA", label: "Mañana" }, { key: "TARDE", label: "Tarde" }, { key: "NOCHE", label: "Noche" }];
const TIPOS = [{ key: "FIJO", label: "Fijo" }, { key: "BACKUP", label: "Back-up" }];

const qs = (id) => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Falta #${id}`);
  return el;
};
const clamp = (s) => String(s ?? "").trim();
const norm = (s) => clamp(s).replace(/\s+/g, " ");
const uniq = (arr) => Array.from(new Set(arr));
const sortNames = (arr) => [...arr].sort((a, b) => a.localeCompare(b, "es", { sensitivity: "base" }));
const toISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parseISO = (s) => {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
};
const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
const status = (text, kind = "muted") => {
  const el = qs("status");
  el.className = `status ${kind}`;
  el.textContent = text;
};

function computeThursday(isoDate) {
  const d = isoDate ? parseISO(isoDate) : new Date();
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const diff = (x.getDay() - 4 + 7) % 7;
  x.setDate(x.getDate() - diff);
  return toISO(x);
}

function weekFrom(startISO) {
  const base = parseISO(startISO);
  return DAYS.map((day, i) => {
    const dt = addDays(base, i);
    return { ...day, iso: toISO(dt), date: dt };
  });
}

function slotId(iso, franja, tipo) {
  return `${iso}__${franja}__${tipo}`;
}

function emptySchedule(weekStart) {
  const out = { weekStart, slots: {} };
  for (const d of weekFrom(weekStart)) {
    for (const f of FRANJAS) {
      for (const t of TIPOS) {
        const id = slotId(d.iso, f.key, t.key);
        out.slots[id] = { id, fecha: d.iso, franja: f.key, tipo: t.key, modo: "NORMAL", asignadoA: "" };
      }
    }
  }
  return out;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      weekStart: computeThursday(parsed.weekStart),
      monthOffset: Number(parsed.monthOffset || 0),
      generationCounter: Number(parsed.generationCounter || 0),
      people: sortNames(uniq((parsed.people || DEFAULT_PEOPLE).map(norm).filter(Boolean))),
      vacationRanges: Array.isArray(parsed.vacationRanges) ? parsed.vacationRanges : [],
      schedulesByWeek: parsed.schedulesByWeek || {},
    };
  } catch {
    return { weekStart: computeThursday(), monthOffset: 0, generationCounter: 0, people: DEFAULT_PEOPLE, vacationRanges: [], schedulesByWeek: {} };
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function vacationsByISO(state) {
  const map = {};
  for (const r of state.vacationRanges) {
    const person = norm(r.person);
    const from = parseISO(r.from);
    const to = parseISO(r.to);
    if (!person || !from || !to) continue;
    let cur = new Date(from);
    while (cur <= to) {
      const iso = toISO(cur);
      if (!map[iso]) map[iso] = [];
      map[iso].push(person);
      cur = addDays(cur, 1);
    }
  }
  return map;
}

function availableForDate(people, vacByIso, iso) {
  const blocked = new Set((vacByIso[iso] || []).map(norm));
  return people.filter((p) => !blocked.has(norm(p)));
}

function renderVacationControls(state) {
  const sel = qs("vacPerson");
  sel.innerHTML = "";
  for (const p of state.people) {
    const opt = document.createElement("option");
    opt.value = p;
    opt.textContent = p;
    sel.appendChild(opt);
  }
}

function renderVacationsThisWeek(state) {
  const vacMap = vacationsByISO(state);
  const rows = weekFrom(state.weekStart).map((d) => ({ iso: d.iso, names: vacMap[d.iso] || [] })).filter((x) => x.names.length);
  const el = qs("vacationsThisWeek");
  if (!rows.length) {
    el.textContent = "—";
    return;
  }
  el.innerHTML = rows.map((x) => `<div><strong>${x.iso}</strong>: ${escapeHtml(x.names.join(", "))}</div>`).join("");
}

function renderCalendar(state) {
  const ws = parseISO(state.weekStart);
  const target = new Date(ws.getFullYear(), ws.getMonth() + state.monthOffset, 1);
  qs("monthLabel").textContent = target.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
  const inWeek = new Set(weekFrom(state.weekStart).map((d) => d.iso));
  const first = new Date(target.getFullYear(), target.getMonth(), 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0);
  const offset = (first.getDay() + 6) % 7;
  const cells = [];
  for (let i = 0; i < offset; i++) cells.push({ empty: true });
  for (let d = 1; d <= last.getDate(); d++) {
    const dt = new Date(target.getFullYear(), target.getMonth(), d);
    const iso = toISO(dt);
    cells.push({ d, iso, inWeek: inWeek.has(iso), isThu: iso === state.weekStart });
  }
  while (cells.length % 7 !== 0) cells.push({ empty: true });
  const heads = ["L", "M", "X", "J", "V", "S", "D"];
  qs("miniCalendar").innerHTML = heads.map((h) => `<div class="calHead">${h}</div>`).join("") + cells.map((c) => {
    if (c.empty) return `<div class="calCell off"></div>`;
    return `<div class="calCell${c.inWeek ? " inWeek" : ""}${c.isThu ? " isThu" : ""}">${c.d}</div>`;
  }).join("");
}

function renderMeta(schedule) {
  const week = weekFrom(schedule.weekStart);
  qs("metaWeek").textContent = `${week[0].iso} -> ${week[6].iso}`;
  qs("metaGeneratedAt").textContent = new Date().toLocaleString("es-ES");
  qs("subtitle").textContent = `${week[0].date.toLocaleDateString("es-ES")} hasta ${week[6].date.toLocaleDateString("es-ES")}`;
}

function renderPeople(people) {
  const wrap = qs("peopleList");
  wrap.innerHTML = "";
  for (const p of people) {
    const chip = document.createElement("div");
    chip.className = "personChip";
    chip.textContent = p;
    wrap.appendChild(chip);
  }
}

function renderSummary(schedule) {
  const counters = new Map();
  for (const s of Object.values(schedule.slots)) {
    if (s.modo === "TODOS") continue;
    const name = norm(s.asignadoA);
    if (!name) continue;
    const cur = counters.get(name) || { fijo: 0, backup: 0 };
    if (s.tipo === "FIJO") cur.fijo += 1;
    else cur.backup += 1;
    counters.set(name, cur);
  }
  const body = qs("summaryBody");
  body.innerHTML = "";
  const rows = Array.from(counters.entries()).map(([name, c]) => ({ name, ...c, total: c.fijo + c.backup })).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "es"));
  for (const r of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${escapeHtml(r.name)}</td><td class="num">${r.fijo}</td><td class="num">${r.backup}</td><td class="num">${r.total}</td>`;
    body.appendChild(tr);
  }
}

function renderTable(schedule, state, onChange) {
  const vacMap = vacationsByISO(state);
  const tbody = qs("scheduleBody");
  tbody.innerHTML = "";
  for (const day of weekFrom(schedule.weekStart)) {
    for (const tipo of TIPOS) {
      const tr = document.createElement("tr");
      if (tipo.key === "FIJO") {
        const td = document.createElement("td");
        td.className = "dayCell";
        td.rowSpan = 2;
        td.innerHTML = `${day.label}<span class="daySub">${day.iso}</span>`;
        tr.appendChild(td);
      }
      const tdTipo = document.createElement("td");
      tdTipo.innerHTML = `<span class="typePill ${tipo.key === "FIJO" ? "fijo" : "backup"}">${tipo.label}</span>`;
      tr.appendChild(tdTipo);
      for (const franja of FRANJAS) {
        const id = slotId(day.iso, franja.key, tipo.key);
        const cur = schedule.slots[id];
        const sel = document.createElement("select");
        sel.className = "slotSelect";
        sel.appendChild(new Option("—", ""));
        sel.appendChild(new Option("TODOS", "__TODOS__"));
        for (const p of availableForDate(state.people, vacMap, day.iso)) sel.appendChild(new Option(p, p));
        sel.value = cur.modo === "TODOS" ? "__TODOS__" : (cur.asignadoA || "");
        sel.addEventListener("change", () => {
          if (sel.value === "__TODOS__") schedule.slots[id] = { ...cur, modo: "TODOS", asignadoA: "" };
          else schedule.slots[id] = { ...cur, modo: "NORMAL", asignadoA: sel.value };
          onChange();
        });
        const td = document.createElement("td");
        td.appendChild(sel);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
  }
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function generate(schedule, state) {
  const vacMap = vacationsByISO(state);
  state.generationCounter = Number(state.generationCounter || 0) + 1;
  const seed = (Date.now() ^ Math.floor(Math.random() * 1e9) ^ (state.generationCounter * 2654435761)) >>> 0;
  const rng = mulberry32(seed);
  const stats = new Map(state.people.map((p) => [p, { total: 0, byFranja: { MANANA: 0, TARDE: 0, NOCHE: 0 }, fijo: 0, backup: 0 }]));
  for (const s of Object.values(schedule.slots)) if (s.modo !== "TODOS") s.asignadoA = "";
  for (const day of weekFrom(schedule.weekStart)) {
    const usedToday = new Set();
    for (const franja of FRANJAS) {
      for (const tipo of TIPOS) {
        const id = slotId(day.iso, franja.key, tipo.key);
        const cur = schedule.slots[id];
        if (cur.modo === "TODOS") continue;
        let cands = availableForDate(state.people, vacMap, day.iso).filter((n) => !usedToday.has(n));
        if (!cands.length) cands = availableForDate(state.people, vacMap, day.iso);
        if (!cands.length) {
          cur.asignadoA = "";
          continue;
        }
        const scored = cands.map((n, idx) => {
          const s = stats.get(n);
          return {
            n,
            score: s.total * 10 + s.byFranja[franja.key] * 8 + (tipo.key === "FIJO" ? s.fijo : s.backup) * 6 + rng() + (idx * 0.001),
          };
        }).sort((a, b) => a.score - b.score);
        const best = scored[0].score;
        const top = scored.filter((x) => x.score <= best + 0.8).map((x) => x.n);
        const chosen = top[Math.floor(rng() * top.length)];
        cur.asignadoA = chosen;
        usedToday.add(chosen);
        const st = stats.get(chosen);
        st.total += 1;
        st.byFranja[franja.key] += 1;
        if (tipo.key === "FIJO") st.fijo += 1;
        else st.backup += 1;
      }
    }
  }
}

async function saveImage(schedule) {
  const canvas = await html2canvas(qs("scheduleCapture"), { backgroundColor: null, scale: Math.min(2, window.devicePixelRatio || 1), useCORS: true });
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = `Turnos_${schedule.weekStart}_${Date.now()}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function init() {
  const state = loadState();
  state.weekStart = computeThursday(state.weekStart);
  state.monthOffset = Number(state.monthOffset || 0);
  state.people = sortNames(uniq((state.people || DEFAULT_PEOPLE).map(norm).filter(Boolean)));
  state.vacationRanges = Array.isArray(state.vacationRanges) ? state.vacationRanges : [];
  state.schedulesByWeek = state.schedulesByWeek || {};

  qs("weekStart").value = state.weekStart;
  let schedule = state.schedulesByWeek[state.weekStart] || emptySchedule(state.weekStart);

  const persist = (reason) => {
    state.weekStart = schedule.weekStart;
    state.schedulesByWeek[schedule.weekStart] = schedule;
    saveState(state);
    status(`Guardado local (${reason})`, "ok");
  };

  const rerender = () => {
    renderVacationControls(state);
    renderVacationsThisWeek(state);
    renderCalendar(state);
    renderMeta(schedule);
    renderPeople(state.people);
    renderTable(schedule, state, () => {
      renderSummary(schedule);
      persist("manual");
    });
    renderSummary(schedule);
  };

  qs("btnGenerate").addEventListener("click", () => {
    generate(schedule, state);
    rerender();
    persist("generar");
    status(`Turnos generados (tirada #${state.generationCounter}).`, "ok");
  });

  qs("btnSaveImage").addEventListener("click", async () => {
    try {
      await saveImage(schedule);
      status("Imagen descargada.", "ok");
    } catch (e) {
      status(`No se pudo guardar imagen: ${e.message}`, "bad");
    }
  });

  qs("weekStart").addEventListener("change", () => {
    const iso = computeThursday(qs("weekStart").value);
    qs("weekStart").value = iso;
    state.weekStart = iso;
    schedule = state.schedulesByWeek[iso] || emptySchedule(iso);
    rerender();
    persist("semana");
  });

  qs("btnMonthPrev").addEventListener("click", () => {
    state.monthOffset -= 1;
    renderCalendar(state);
    saveState(state);
  });
  qs("btnMonthNext").addEventListener("click", () => {
    state.monthOffset += 1;
    renderCalendar(state);
    saveState(state);
  });

  qs("btnAddVacation").addEventListener("click", () => {
    const person = norm(qs("vacPerson").value);
    const from = clamp(qs("vacFrom").value);
    const to = clamp(qs("vacTo").value) || from;
    if (!person || !from || !to) {
      status("Selecciona comercial y rango de fechas.", "warn");
      return;
    }
    state.vacationRanges.push({ person, from, to });
    rerender();
    persist("vacaciones");
  });

  qs("btnRemoveVacation").addEventListener("click", () => {
    const person = norm(qs("vacPerson").value);
    const from = clamp(qs("vacFrom").value);
    const to = clamp(qs("vacTo").value) || from;
    state.vacationRanges = state.vacationRanges.filter((x) => !(x.person === person && x.from === from && x.to === to));
    rerender();
    persist("vacaciones");
  });

  rerender();
}

document.addEventListener("DOMContentLoaded", init);
