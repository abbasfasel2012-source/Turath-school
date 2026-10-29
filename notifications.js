/* =====================================================
   مركز الإشعارات: جرس + صوت + اهتزاز + إشعار النظام
   يعتمد على المتغيرات العامة: db, currentProfile
===================================================== */
(function () {
  const LS_SEEN = "turath_notif_seen_v1";
  const LS_LIST = "turath_notif_list_v1";
  const LS_SOUND = "turath_notif_sound_v1";
  const POLL_MS = 20000;

  let started = false;
  let list = [];
  let lastCheck = {};
  let audioCtx = null;

  try { list = JSON.parse(localStorage.getItem(LS_LIST) || "[]"); } catch (e) { list = []; }
  try { lastCheck = JSON.parse(localStorage.getItem(LS_SEEN) || "{}"); } catch (e) { lastCheck = {}; }
  let soundOn = localStorage.getItem(LS_SOUND) !== "off";

  /* ---------- الصوت ---------- */
  function unlockAudio() {
    if (!audioCtx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (C) audioCtx = new C();
    }
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  }
  ["click", "touchstart", "keydown"].forEach((ev) =>
    document.addEventListener(ev, unlockAudio, { passive: true })
  );

  function playChime() {
    if (!soundOn) return;
    unlockAudio();
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    [[880, 0], [1318.5, 0.15], [1760, 0.3]].forEach(([f, t]) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, now + t);
      g.gain.exponentialRampToValueAtTime(0.35, now + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.45);
      o.connect(g).connect(audioCtx.destination);
      o.start(now + t);
      o.stop(now + t + 0.5);
    });
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  }

  /* ---------- الواجهة ---------- */
  const css = document.createElement("style");
  css.textContent = `
  #tnBell{position:fixed;top:14px;left:14px;z-index:9999;width:48px;height:48px;border-radius:50%;border:none;
    background:#0c2340;color:#f3d38a;font-size:22px;box-shadow:0 4px 14px rgba(0,0,0,.35);cursor:pointer;display:none}
  #tnBell.shake{animation:tnShake .6s ease 2}
  @keyframes tnShake{0%,100%{transform:rotate(0)}20%{transform:rotate(-18deg)}40%{transform:rotate(16deg)}60%{transform:rotate(-10deg)}80%{transform:rotate(6deg)}}
  #tnBadge{position:absolute;top:-4px;right:-4px;min-width:20px;height:20px;padding:0 5px;border-radius:10px;background:#d23c3c;
    color:#fff;font-size:12px;font-weight:bold;line-height:20px;display:none;font-family:inherit}
  #tnPanel{position:fixed;top:70px;left:14px;right:14px;max-width:380px;max-height:70vh;z-index:9999;background:#fff;color:#1d2433;
    border-radius:14px;box-shadow:0 10px 40px rgba(0,0,0,.35);display:none;flex-direction:column;overflow:hidden;direction:rtl;font-family:inherit}
  #tnPanel.open{display:flex}
  #tnHead{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:#0c2340;color:#f3d38a;font-weight:bold}
  #tnHead button{background:transparent;border:1px solid #f3d38a55;color:#f3d38a;border-radius:8px;padding:4px 8px;font-size:12px;cursor:pointer;font-family:inherit;margin-inline-start:6px}
  #tnList{overflow:auto;flex:1}
  .tnItem{padding:12px 14px;border-bottom:1px solid #eee;cursor:default}
  .tnItem.unread{background:#fff8e6}
  .tnItem b{display:block;font-size:14px;margin-bottom:3px}
  .tnItem p{margin:0;font-size:13px;color:#555;white-space:pre-wrap}
  .tnItem small{color:#999;font-size:11px}
  .tnEmpty{padding:30px;text-align:center;color:#999;font-size:14px}
  #tnToast{position:fixed;top:14px;right:14px;left:74px;max-width:420px;margin-inline-start:auto;z-index:10000;background:#0c2340;color:#fff;
    border-right:5px solid #f3d38a;border-radius:12px;padding:12px 14px;box-shadow:0 8px 30px rgba(0,0,0,.4);direction:rtl;
    transform:translateY(-140%);transition:transform .35s ease;font-family:inherit;cursor:pointer}
  #tnToast.show{transform:translateY(0)}
  #tnToast b{display:block;color:#f3d38a;margin-bottom:3px}
  #tnToast p{margin:0;font-size:13px}`;
  document.head.appendChild(css);

  const bell = document.createElement("button");
  bell.id = "tnBell";
  bell.setAttribute("aria-label", "الإشعارات");
  bell.innerHTML = '🔔<span id="tnBadge"></span>';
  const panel = document.createElement("div");
  panel.id = "tnPanel";
  panel.innerHTML =
    '<div id="tnHead"><span>الإشعارات</span><span><button id="tnSound"></button><button id="tnRead">تعليم الكل كمقروء</button></span></div><div id="tnList"></div>';
  const toast = document.createElement("div");
  toast.id = "tnToast";
  document.body.append(bell, panel, toast);

  const badge = bell.querySelector("#tnBadge");
  const listEl = panel.querySelector("#tnList");
  const soundBtn = panel.querySelector("#tnSound");

  function renderSoundBtn() { soundBtn.textContent = soundOn ? "🔊 الصوت" : "🔇 صامت"; }
  renderSoundBtn();
  soundBtn.onclick = () => {
    soundOn = !soundOn;
    localStorage.setItem(LS_SOUND, soundOn ? "on" : "off");
    renderSoundBtn();
    if (soundOn) playChime();
  };
  panel.querySelector("#tnRead").onclick = () => {
    list.forEach((n) => (n.read = true));
    save(); render();
  };
  bell.onclick = (e) => {
    e.stopPropagation();
    panel.classList.toggle("open");
    if (panel.classList.contains("open")) {
      setTimeout(() => { list.forEach((n) => (n.read = true)); save(); render(); }, 1500);
    }
  };
  document.addEventListener("click", (e) => {
    if (!panel.contains(e.target) && e.target !== bell) panel.classList.remove("open");
  });
  toast.onclick = () => { toast.classList.remove("show"); panel.classList.add("open"); };

  function esc(s) { const d = document.createElement("div"); d.textContent = s || ""; return d.innerHTML; }
  function fmt(t) { try { return new Date(t).toLocaleString("ar-IQ", { dateStyle: "medium", timeStyle: "short" }); } catch (e) { return ""; } }

  function save() {
    list = list.slice(0, 60);
    localStorage.setItem(LS_LIST, JSON.stringify(list));
    localStorage.setItem(LS_SEEN, JSON.stringify(lastCheck));
  }
  function render() {
    const unread = list.filter((n) => !n.read).length;
    badge.textContent = unread > 9 ? "9+" : unread;
    badge.style.display = unread ? "block" : "none";
    listEl.innerHTML = list.length
      ? list.map((n) => `<div class="tnItem ${n.read ? "" : "unread"}"><b>${esc(n.title)}</b><p>${esc(n.body)}</p><small>${fmt(n.at)}</small></div>`).join("")
      : '<div class="tnEmpty">لا توجد إشعارات بعد</div>';
  }

  let toastTimer;
  function notify(n) {
    if (list.some((x) => x.key === n.key)) return;
    list.unshift({ ...n, read: false });
    save(); render();
    playChime();
    bell.classList.remove("shake"); void bell.offsetWidth; bell.classList.add("shake");
    toast.innerHTML = `<b>${esc(n.title)}</b><p>${esc((n.body || "").slice(0, 140))}</p>`;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 6000);
    if (document.hidden && "Notification" in window && Notification.permission === "granted") {
      navigator.serviceWorker && navigator.serviceWorker.getRegistration().then((reg) => {
        const opts = { body: n.body, icon: "icon-192.png", badge: "icon-192.png", dir: "rtl", lang: "ar", vibrate: [200, 100, 200], tag: n.key };
        if (reg) reg.showNotification(n.title, opts); else new Notification(n.title, opts);
      }).catch(() => {});
    }
  }

  /* ---------- مصادر الإشعارات ---------- */
  function sources(p) {
    const me = p.id;
    const isStudent = p.role === "student";
    const s = [
      { table: "announcements", map: (r) => ({ title: "📢 إعلان جديد: " + (r.title || ""), body: r.content || "" }) },
      { table: "lessons", skip: (r) => r.teacher_id === me, map: (r) => ({ title: "📚 درس جديد: " + (r.title || ""), body: r.content || "" }) },
    ];
    if (isStudent) {
      s.push({ table: "warnings", filter: ["student_id", me], map: (r) => ({ title: "⚠️ تم تسجيل إنذار عليك", body: r.reason || "" }) });
      s.push({ table: "student_notes", filter: ["student_id", me], map: (r) => ({ title: "📝 ملاحظة جديدة من الأستاذ", body: r.content || "" }) });
    } else {
      s.push({ table: "leave_requests", skip: (r) => r.student_id === me, map: (r) => ({ title: "🗓️ طلب إجازة جديد", body: (r.reason || "") + (r.start_date ? `\nمن ${r.start_date} إلى ${r.end_date || r.start_date}` : "") }) });
    }
    return s;
  }

  async function poll(src, initial) {
    const since = lastCheck[src.table];
    let q = db.from(src.table).select("*").order("created_at", { ascending: false }).limit(15);
    if (src.filter) q = q.eq(src.filter[0], src.filter[1]);
    if (since) q = q.gt("created_at", since);
    const { data, error } = await q;
    if (error || !data) return;
    if (data.length) lastCheck[src.table] = data[0].created_at;
    if (!since) { save(); return; } // أول مرة: لا نزعج المستخدم بالقديم
    data.reverse().forEach((r) => {
      if (src.skip && src.skip(r)) return;
      notify({ key: src.table + ":" + r.id, at: r.created_at, ...src.map(r) });
    });
    save();
  }

  function realtime(srcs, p) {
    try {
      const ch = db.channel("turath-notifs-" + p.id);
      srcs.forEach((src) => {
        const cfg = { event: "INSERT", schema: "public", table: src.table };
        if (src.filter) cfg.filter = `${src.filter[0]}=eq.${src.filter[1]}`;
        ch.on("postgres_changes", cfg, (payload) => {
          const r = payload.new || {};
          if (src.skip && src.skip(r)) return;
          if (r.created_at) lastCheck[src.table] = r.created_at;
          notify({ key: src.table + ":" + r.id, at: r.created_at || new Date().toISOString(), ...src.map(r) });
        });
      });
      if (p.role === "student") {
        ch.on("postgres_changes", { event: "UPDATE", schema: "public", table: "leave_requests", filter: `student_id=eq.${p.id}` }, (payload) => {
          const r = payload.new || {};
          if (!r.status || r.status === "pending") return;
          const ok = r.status === "approved";
          notify({ key: "leave:" + r.id + ":" + r.status, at: new Date().toISOString(),
            title: ok ? "✅ تمت الموافقة على طلب إجازتك" : "❌ تم رفض طلب إجازتك", body: r.start_date ? `من ${r.start_date} إلى ${r.end_date || r.start_date}` : "" });
        });
      }
      ch.subscribe();
    } catch (e) { console.warn("realtime unavailable", e); }
  }

  let start = function (p) {
    if (started) return;
    started = true;
    bell.style.display = "block";
    render();
    const srcs = sources(p);
    srcs.forEach((s) => poll(s, true));
    realtime(srcs, p);
    setInterval(() => srcs.forEach((s) => poll(s)), POLL_MS);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) srcs.forEach((s) => poll(s)); });
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("service-worker.js").catch(() => {});
  }


  /* ---------- إرسال إشعارات حقيقية للأجهزة عند الإضافة ---------- */
  const WATCH = ["announcements", "lessons", "warnings", "student_notes", "leave_requests"];
  async function sendPush(meta) {
    try {
      const { data } = await db.auth.getSession();
      const token = data && data.session && data.session.access_token;
      if (!token) return;
      setTimeout(() => fetch("https://cdsyuaplkalohqxsvoxs.supabase.co/functions/v1/push", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "notify", token, ...meta }),
      }).catch(() => {}), 600);
    } catch (e) {}
  }
  function hook(q, meta) {
    if (!q || typeof q.then !== "function") return q;
    const oe = q.eq;
    if (typeof oe === "function") q.eq = function (col, val) { if (col === "id") meta.id = val; return oe.apply(this, arguments); };
    const ot = q.then;
    q.then = function (res, rej) {
      return ot.call(this, (r) => { if (r && !r.error) sendPush(meta); return res ? res(r) : r; }, rej);
    };
    return q;
  }
  function patchDb() {
    if (typeof db === "undefined" || !db || db.__tnPatched) return;
    const of = db.from.bind(db);
    db.from = function (t) {
      const b = of(t);
      if (!WATCH.includes(t)) return b;
      const oi = b.insert, ou = b.update;
      b.insert = function (v) { const many = Array.isArray(v) && v.length > 1; const q = oi.apply(this, arguments); return many ? q : hook(q, { table: t, op: "insert" }); };
      b.update = function () { return hook(ou.apply(this, arguments), { table: t, op: "update" }); };
      return b;
    };
    db.__tnPatched = true;
  }
  patchDb();

  // إذا كان الإذن ممنوحاً مسبقاً نجدد الاشتراك تلقائياً بعد الدخول
  async function autoSubscribe() {
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
      if (Notification.permission !== "granted" || window.top !== window.self) return;
      if (typeof enableNotifications === "function") {
        const st = document.getElementById("notifStatus");
        const before = st ? st.textContent : "";
        await enableNotifications();
        if (st) st.textContent = before;
      }
    } catch (e) {}
  }
  const origStart = start;
  start = function (p) { origStart(p); autoSubscribe(); };

  // ننتظر تسجيل الدخول
  setInterval(() => {
    let p = null;
    try { p = typeof currentProfile !== "undefined" ? currentProfile : null; } catch (e) {}
    if (p && p.id && !started) start(p);
    if (!p && started) { bell.style.display = "none"; panel.classList.remove("open"); }
    if (p && started) bell.style.display = "block";
  }, 1500);

  window.turathTestNotification = () =>
    notify({ key: "test:" + Date.now(), at: new Date().toISOString(), title: "🔔 إشعار تجريبي", body: "الإشعارات والصوت يعملان بنجاح" });
})();
