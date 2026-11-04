(() => {
  "use strict";

  const TOTAL = 12;
  const PASS = 80;               // % từ khóa cần đạt để tính là thuộc
  const STORE = "chinhtri-progress-v1";
  const WORDS_TARGET = 500;      // số chữ gợi ý khi viết 30 phút

  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ---------- Chuẩn hóa tiếng Việt để so khớp từ khóa (bỏ dấu, chữ thường) ----------
  function norm(s) {
    return s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[đĐ]/g, "d")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // ---------- Đọc file Markdown theo định dạng của dự án ----------
  function parseEssay(md, index) {
    const out = { index, number: index + 1, title: "", outline: [], body: [], keys: [] };
    let section = "";
    for (const raw of md.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      if (line.startsWith("# ") && !out.title) { out.title = line.slice(2).trim(); continue; }
      if (line.startsWith("## ")) { section = line.slice(3).trim().toLowerCase(); continue; }
      if (section === "dàn ý") {
        if (/^\d+\./.test(line)) out.outline.push(line.replace(/^\d+\.\s*/, ""));
      } else if (section === "bài văn") {
        if (line.startsWith("### ")) out.body.push({ heading: line.slice(4) });
        else out.body.push({ text: line });
      } else if (section === "ý chính cần thuộc") {
        if (line.startsWith("- ")) {
          const body = line.slice(2);
          const cut = body.indexOf(":");
          const label = cut >= 0 ? body.slice(0, cut).trim() : body;
          const alts = (cut >= 0 ? body.slice(cut + 1) : body).split("|").map((x) => x.trim()).filter(Boolean);
          out.keys.push({ label, alts, normAlts: alts.map(norm) });
        }
      }
    }
    out.words = out.body.reduce((n, b) => n + (b.text ? b.text.split(/\s+/).length : 0), 0);
    return out;
  }

  function countWords(text) {
    const t = text.trim();
    return t ? t.split(/\s+/).length : 0;
  }

  // ---------- Tiến độ lưu trên trình duyệt ----------
  function loadProgress() {
    try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; }
  }
  function saveProgress(p) {
    try { localStorage.setItem(STORE, JSON.stringify(p)); } catch { /* bỏ qua nếu bị chặn */ }
  }
  let progress = loadProgress();
  const rec = (i) => progress[i] || { best: 0, attempts: 0, memorized: false, last: 0 };

  // ---------- Trạng thái ứng dụng ----------
  const state = { drafts: {}, essays: [], current: 0, tab: "read", showFull: false, timer: null, remaining: 30 * 60, running: false };

  async function loadAll() {
    const files = Array.from({ length: TOTAL }, (_, i) => `content/cau-${String(i + 1).padStart(2, "0")}.md`);
    const texts = await Promise.all(files.map((f) => fetch(f).then((r) => {
      if (!r.ok) throw new Error(`Không đọc được ${f}`);
      return r.text();
    })));
    state.essays = texts.map((t, i) => parseEssay(t, i));
  }

  // ---------- Danh sách và tổng quan ----------
  function statusClass(i) {
    const r = rec(i);
    if (r.best >= PASS) return ["ok", "Đạt"];
    if (r.attempts > 0) return ["mid", `${r.best}%`];
    return ["bad", "Chưa"];
  }

  function renderList() {
    $("#list").innerHTML = state.essays.map((e) => {
      const [cls, txt] = statusClass(e.index);
      const short = e.title.replace(/^Câu \d+\.\s*/, "");
      return `<button class="qbtn ${e.index === state.current ? "active" : ""}" data-i="${e.index}">
        <span>${e.number}. ${esc(short)}</span><span class="badge ${cls}">${txt}</span></button>`;
    }).join("");
    const passed = state.essays.filter((e) => rec(e.index).best >= PASS).length;
    const memo = state.essays.filter((e) => rec(e.index).memorized).length;
    $("#overall").textContent = `Đạt ${passed}/${TOTAL} câu  •  Đã thuộc dàn ý ${memo}/${TOTAL}`;
  }

  // ---------- Tab 1: Dàn ý và bài văn ----------
  function renderRead() {
    const e = state.essays[state.current];
    const r = rec(e.index);
    const body = e.body.map((b) => (b.heading ? `<h3>${esc(b.heading)}</h3>` : `<p>${esc(b.text)}</p>`)).join("");
    $("#tab-read").innerHTML = `
      <div class="card">
        <h2>${esc(e.title)}</h2>
        <p class="meta">Bài rút gọn, mục tiêu khoảng ${WORDS_TARGET} chữ. Bài này có ${e.words} chữ.</p>
        <h3>Dàn ý cần thuộc</h3>
        <ol class="outline">${e.outline.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>
        <div class="controls">
          <label class="check"><input type="checkbox" id="memo" ${r.memorized ? "checked" : ""}> Tôi đã thuộc dàn ý</label>
          <button class="btn" id="toggleFull">${state.showFull ? "Ẩn bài đầy đủ" : "Xem bài đầy đủ"}</button>
          <button class="btn primary" id="gotoRecall">Tự kiểm tra câu này →</button>
        </div>
      </div>
      <div class="card essay ${state.showFull ? "" : "hidden"}" id="full">${body}</div>`;
    $("#memo").onchange = (ev) => {
      progress[e.index] = { ...r, memorized: ev.target.checked };
      saveProgress(progress);
      renderList();
    };
    $("#toggleFull").onclick = () => { state.showFull = !state.showFull; renderRead(); };
    $("#gotoRecall").onclick = () => setTab("recall");
  }

  // ---------- Tab 2: Tự kiểm tra bằng trí nhớ ----------
  function renderRecall() {
    const e = state.essays[state.current];
    const r = rec(e.index);
    $("#tab-recall").innerHTML = `
      <div class="card">
        <h2>Viết lại ${esc(e.title.replace(/^Câu \d+\.\s*/, "Câu " + e.number + ". "))} từ trí nhớ</h2>
        <p class="meta">Không xem bài gốc khi viết. Sau đó bấm <b>Chấm</b> để xem còn thiếu ý nào. Cần đạt ${PASS}% để tính là thuộc. Lần tốt nhất: ${r.best}% trong ${r.attempts} lần thử.</p>
        <textarea id="answer" placeholder="Viết dàn ý hoặc cả bài từ trí nhớ tại đây..."></textarea>
        <div class="controls">
          <span class="meta" id="wc">0 chữ</span>
          <button class="btn primary" id="check">Chấm</button>
          <button class="btn" id="clear">Xóa</button>
        </div>
        <div id="result"></div>
      </div>`;
    const ta = $("#answer");
    const key = "r" + e.index;
    ta.value = state.drafts[key] || "";
    $("#wc").textContent = `${countWords(ta.value)} chữ`;
    ta.oninput = () => { state.drafts[key] = ta.value; $("#wc").textContent = `${countWords(ta.value)} chữ`; };
    $("#clear").onclick = () => { ta.value = ""; state.drafts[key] = ""; $("#wc").textContent = "0 chữ"; $("#result").innerHTML = ""; };
    $("#check").onclick = () => grade(e, ta.value);
  }

  function grade(e, answer) {
    const text = " " + norm(answer) + " ";
    const covered = [];
    const missing = [];
    for (const k of e.keys) {
      const hit = k.normAlts.some((a) => a && text.includes(a));
      (hit ? covered : missing).push(k.label);
    }
    const pct = Math.round((covered.length / e.keys.length) * 100);
    const ok = pct >= PASS;
    const r = rec(e.index);
    progress[e.index] = {
      best: Math.max(r.best, pct),
      attempts: r.attempts + 1,
      memorized: r.memorized,
      last: Date.now(),
    };
    saveProgress(progress);
    renderList();
    $("#result").innerHTML = `
      <p class="score ${ok ? "ok" : "bad"}">${pct}% ý chính ${ok ? "— đạt" : "— chưa đạt"}</p>
      ${missing.length ? `<h3>Còn thiếu (${missing.length})</h3><ul class="missing">${missing.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
      ${covered.length ? `<h3>Đã có (${covered.length})</h3><ul class="covered">${covered.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
      <div class="controls"><button class="btn" id="showOrig">Xem bài gốc để đối chiếu</button></div>
      <div class="essay hidden" id="orig">${e.body.map((b) => (b.heading ? `<h3>${esc(b.heading)}</h3>` : `<p>${esc(b.text)}</p>`)).join("")}</div>`;
    $("#showOrig").onclick = () => $("#orig").classList.toggle("hidden");
  }

  // ---------- Tab 3: Đồng hồ 30 phút ----------
  function fmt(sec) {
    const m = Math.floor(sec / 60).toString().padStart(2, "0");
    const s = (sec % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  function renderTimer() {
    const e = state.essays[state.current];
    $("#tab-timer").innerHTML = `
      <div class="card">
        <h2>Luyện viết đúng thời lượng thi: ${esc(e.title.replace(/^Câu \d+\.\s*/, "Câu " + e.number + ". "))}</h2>
        <p class="meta">Viết tay hoặc gõ, không xem bài gốc. Mục tiêu khoảng ${WORDS_TARGET} chữ trong 30 phút.</p>
        <div class="timer" id="clock">${fmt(state.remaining)}</div>
        <div class="controls">
          <button class="btn primary" id="start">${state.running ? "Tạm dừng" : "Bắt đầu"}</button>
          <button class="btn" id="reset">Đặt lại 30:00</button>
        </div>
        <textarea id="ta2" placeholder="Viết bài tại đây..."></textarea>
        <p class="meta"><span id="wc2">${countWords(state.drafts.timer || "")}</span> / ${WORDS_TARGET} chữ</p>
      </div>`;
    const ta2 = $("#ta2");
    ta2.value = state.drafts.timer || "";
    ta2.oninput = () => { state.drafts.timer = ta2.value; $("#wc2").textContent = countWords(ta2.value); };
    $("#start").onclick = toggleTimer;
    $("#reset").onclick = () => {
      stopTimer();
      state.remaining = 30 * 60;
      $("#clock").textContent = fmt(state.remaining);
      $("#start").textContent = "Bắt đầu";
    };
  }

  function toggleTimer() {
    if (state.running) { stopTimer(); $("#start").textContent = "Bắt đầu"; return; }
    if (state.remaining <= 0) state.remaining = 30 * 60;
    state.running = true;
    state.timer = setInterval(() => {
      state.remaining -= 1;
      const clock = $("#clock");
      if (clock) clock.textContent = fmt(Math.max(0, state.remaining));
      if (state.remaining <= 0) {
        stopTimer();
        if (clock) clock.textContent = "Hết giờ";
        const btn = $("#start");
        if (btn) btn.textContent = "Bắt đầu";
      }
    }, 1000);
    $("#start").textContent = "Tạm dừng";
  }

  function stopTimer() {
    clearInterval(state.timer);
    state.timer = null;
    state.running = false;
  }

  // ---------- Tab 4: Tiến độ ----------
  function renderProgress() {
    const rows = state.essays.map((e) => {
      const r = rec(e.index);
      const [cls, txt] = statusClass(e.index);
      return `<tr>
        <td>${e.number}</td>
        <td>${esc(e.title.replace(/^Câu \d+\.\s*/, ""))}</td>
        <td><span class="badge ${cls}">${txt}</span></td>
        <td>${r.attempts}</td>
        <td>${r.memorized ? "Có" : "Chưa"}</td>
      </tr>`;
    }).join("");
    const unpassed = state.essays.filter((e) => rec(e.index).best < PASS).map((e) => e.index);
    $("#tab-progress").innerHTML = `
      <div class="card">
        <h2>Tiến độ ôn tập</h2>
        <table>
          <thead><tr><th>#</th><th>Nội dung</th><th>Kết quả tốt nhất</th><th>Số lần thử</th><th>Thuộc dàn ý</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="controls">
          <button class="btn primary" id="goWeak" ${unpassed.length ? "" : "disabled"}>Ôn câu chưa đạt (${unpassed.length})</button>
          <button class="btn" id="randomWeak" ${unpassed.length ? "" : "disabled"}>Ngẫu nhiên một câu chưa đạt</button>
          <button class="btn danger" id="reset-progress">Xóa toàn bộ tiến độ</button>
        </div>
        <p class="meta">${unpassed.length ? "Chỉ khi cả 12 câu đều đạt " + PASS + "% thì mới coi là ôn đủ." : "Chúc mừng: cả 12 câu đều đã đạt " + PASS + "%."}</p>
      </div>`;
    $("#goWeak").onclick = () => { if (unpassed.length) { state.current = unpassed[0]; setTab("read"); } };
    $("#randomWeak").onclick = () => {
      if (!unpassed.length) return;
      state.current = unpassed[Math.floor(Math.random() * unpassed.length)];
      setTab("recall");
    };
    $("#reset-progress").onclick = () => {
      if (confirm("Xóa toàn bộ tiến độ trên trình duyệt này?")) {
        progress = {};
        saveProgress(progress);
        renderAll();
      }
    };
  }

  // ---------- Điều khiển ----------
  function setTab(name) {
    state.tab = name;
    document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
    ["read", "recall", "timer", "progress"].forEach((t) => {
      $("#tab-" + t).hidden = t !== name;
    });
    renderAll();
  }

  function renderAll() {
    renderList();
    if (state.tab === "read") renderRead();
    if (state.tab === "recall") renderRecall();
    if (state.tab === "timer") renderTimer();
    if (state.tab === "progress") renderProgress();
  }

  document.addEventListener("click", (ev) => {
    const q = ev.target.closest(".qbtn");
    if (q) {
      state.current = Number(q.dataset.i);
      state.showFull = false;
      renderAll();
      return;
    }
    const t = ev.target.closest(".tabs button");
    if (t) setTab(t.dataset.tab);
  });

  // Khởi động
  loadAll()
    .then(renderAll)
    .catch((err) => {
      $("#tab-read").innerHTML = `<div class="card">Lỗi tải nội dung: ${esc(String(err.message || err))}. Hãy mở trang qua máy chủ (ví dụ Vercel), không mở trực tiếp file.</div>`;
    });
})();
