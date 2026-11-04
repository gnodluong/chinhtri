(() => {
  "use strict";

  const TOTAL = 12;
  const PASS = 80;               // % trắc nghiệm cần đạt để tính là nắm được câu
  const STORE = "chinhtri-progress-v2";
  const WORDS_TARGET = 500;      // số chữ gợi ý khi viết 30 phút
  const TABS = ["read", "quiz", "sort", "timer", "progress"];

  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const titleOf = (e) => e.title.replace(/^Câu \d+\.\s*/, "");
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  // ---------- Đọc file Markdown: chỉ lấy dàn ý và bài văn ----------
  function parseEssay(md, index) {
    const out = { index, number: index + 1, title: "", outline: [], body: [] };
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
      }
    }
    out.words = out.body.reduce((n, b) => n + (b.text ? b.text.split(/\s+/).length : 0), 0);
    return out;
  }

  // ---------- Tiến độ lưu trên trình duyệt ----------
  function loadProgress() {
    try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; }
  }
  function saveProgress(p) {
    try { localStorage.setItem(STORE, JSON.stringify(p)); } catch { /* bỏ qua nếu bị chặn */ }
  }
  let progress = loadProgress();
  const rec = (i) => ({ quizBest: 0, quizTries: 0, sortDone: false, ...(progress[i] || {}) });
  const mastered = (i) => rec(i).quizBest >= PASS && rec(i).sortDone;
  function update(i, patch) {
    progress[i] = { ...rec(i), ...patch };
    saveProgress(progress);
  }

  // ---------- Trạng thái ----------
  const state = {
    essays: [],
    quizData: [],
    current: 0,
    tab: "read",
    showFull: false,
    order: {},      // sắp xếp: câu -> thứ tự hiện tại của các mục dàn ý
    quiz: {},       // trắc nghiệm: câu -> đáp án đã chọn và thứ tự đáp án đã xáo
    timer: null,
    remaining: 30 * 60,
    running: false,
    drafts: {},
  };

  async function loadAll() {
    const files = Array.from({ length: TOTAL }, (_, i) => `content/cau-${String(i + 1).padStart(2, "0")}.md`);
    const [texts, quiz] = await Promise.all([
      Promise.all(files.map((f) => fetch(f).then((r) => {
        if (!r.ok) throw new Error(`Không đọc được ${f}`);
        return r.text();
      }))),
      fetch("content/quiz.json").then((r) => {
        if (!r.ok) throw new Error("Không đọc được content/quiz.json");
        return r.json();
      }),
    ]);
    state.essays = texts.map((t, i) => parseEssay(t, i));
    state.quizData = quiz;
  }

  function quizFor(i) {
    return state.quizData.find((x) => x.id === i + 1);
  }

  function newQuiz(i) {
    const qs = quizFor(i).questions;
    return {
      perm: qs.map((q) => shuffle(q.options.map((_, k) => k))),
      ans: qs.map(() => null),
      submitted: false,
      score: 0,
    };
  }
  function quizState(i) {
    if (!state.quiz[i]) state.quiz[i] = newQuiz(i);
    return state.quiz[i];
  }

  function sortState(i) {
    if (!state.order[i]) state.order[i] = shuffle(state.essays[i].outline.map((_, k) => k));
    return state.order[i];
  }

  // ---------- Danh sách và tổng quan ----------
  function statusClass(i) {
    if (mastered(i)) return ["ok", "Đạt"];
    if (rec(i).quizBest > 0) return ["mid", `${rec(i).quizBest}%`];
    return ["bad", "Chưa"];
  }

  function renderList() {
    $("#list").innerHTML = state.essays.map((e) => {
      const [cls, txt] = statusClass(e.index);
      return `<button class="qbtn ${e.index === state.current ? "active" : ""}" data-i="${e.index}">
        <span>${e.number}. ${esc(titleOf(e))}</span><span class="badge ${cls}">${txt}</span></button>`;
    }).join("");
    const done = state.essays.filter((e) => mastered(e.index)).length;
    $("#overall").textContent = `Đã nắm ${done} trên ${TOTAL} câu.`;
    $("#ticks").innerHTML = state.essays.map((e) => `<span class="${mastered(e.index) ? "on" : ""}" title="Câu ${e.number}"></span>`).join("");
  }

  function bodyHTML(e) {
    return e.body.map((b) => (b.heading ? `<h3>${esc(b.heading)}</h3>` : `<p>${esc(b.text)}</p>`)).join("");
  }

  // ---------- Tab 1: Dàn ý và bài văn ----------
  function renderRead() {
    const e = state.essays[state.current];
    $("#tab-read").innerHTML = `
      <div class="card">
        <h2>${esc(e.title)}</h2>
        <p class="meta">Bài rút gọn, khoảng ${WORDS_TARGET} chữ. Bài này có ${e.words} chữ.</p>
        <h3>Dàn ý</h3>
        <ol class="outline">${e.outline.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>
        <div class="controls">
          <button class="btn" id="toggleFull">${state.showFull ? "Ẩn bài đầy đủ" : "Xem bài đầy đủ"}</button>
          <button class="btn" data-go="sort">Sắp xếp dàn ý</button>
          <button class="btn primary" data-go="quiz">Làm trắc nghiệm</button>
        </div>
      </div>
      <div class="card essay ${state.showFull ? "" : "hidden"}" id="full">${bodyHTML(e)}</div>`;
    $("#toggleFull").onclick = () => { state.showFull = !state.showFull; renderRead(); };
    document.querySelectorAll("#tab-read [data-go]").forEach((b) => {
      b.onclick = () => setTab(b.dataset.go);
    });
  }

  // ---------- Tab 2: Trắc nghiệm ----------
  function renderQuiz() {
    const i = state.current;
    const e = state.essays[i];
    const data = quizFor(i);
    const qz = quizState(i);
    const r = rec(i);
    if (!data) {
      $("#tab-quiz").innerHTML = `<div class="card"><p class="meta">Chưa có câu hỏi cho bài này.</p></div>`;
      return;
    }
    const items = data.questions.map((q, qi) => {
      const opts = qz.perm[qi].map((orig) => {
        let cls = "";
        if (qz.submitted) {
          if (orig === q.a) cls = "right";
          else if (qz.ans[qi] === orig) cls = "wrong";
        }
        return `<label class="opt ${cls}">
          <input type="radio" name="q${qi}" value="${orig}" ${qz.ans[qi] === orig ? "checked" : ""} ${qz.submitted ? "disabled" : ""}>
          <span>${esc(q.options[orig])}</span></label>`;
      }).join("");
      const why = qz.submitted
        ? `<p class="why">${qz.ans[qi] === null ? "Chưa chọn đáp án. " : ""}${esc(q.why)}</p>`
        : "";
      return `<fieldset class="q"><legend><span class="qn">${qi + 1}.</span> ${esc(q.q)}</legend>${opts}${why}</fieldset>`;
    }).join("");
    const answered = qz.ans.filter((a) => a !== null).length;
    $("#tab-quiz").innerHTML = `
      <div class="card">
        <h2>Trắc nghiệm: ${esc(titleOf(e))}</h2>
        <p class="meta">Mỗi câu có một đáp án đúng. Thứ tự đáp án được xáo mỗi lần làm, nên không thể nhớ theo vị trí. Cần đúng ${PASS}% trở lên. Lần tốt nhất: ${r.quizBest}%. Đã làm: ${r.quizTries} lần.</p>
        <form id="quizForm" class="quiz">${items}</form>
        <div class="controls">
          ${qz.submitted
            ? `<p class="score ${qz.score >= PASS ? "ok" : "bad"}">${qz.score}%</p>
               <button class="btn primary" id="retry">Làm lại</button>`
            : `<button class="btn primary" id="submitQuiz">Nộp bài</button>
               <span class="meta">Đã chọn ${answered}/${data.questions.length} câu</span>`}
        </div>
      </div>`;
  }

  function submitQuiz() {
    const i = state.current;
    const qz = quizState(i);
    const data = quizFor(i);
    const correct = data.questions.filter((q, qi) => qz.ans[qi] === q.a).length;
    qz.score = Math.round((correct / data.questions.length) * 100);
    qz.submitted = true;
    update(i, { quizBest: Math.max(rec(i).quizBest, qz.score), quizTries: rec(i).quizTries + 1 });
    renderAll();
  }

  // ---------- Tab 3: Sắp xếp dàn ý ----------
  function renderSort() {
    const i = state.current;
    const e = state.essays[i];
    const order = sortState(i);
    const items = order.map((k, pos) => `
      <li class="sort-item" draggable="true" data-pos="${pos}">
        <span class="sort-text">${esc(e.outline[k])}</span>
        <span class="moves">
          <button class="btn sm" data-act="up" data-pos="${pos}" ${pos === 0 ? "disabled" : ""}>Lên</button>
          <button class="btn sm" data-act="down" data-pos="${pos}" ${pos === order.length - 1 ? "disabled" : ""}>Xuống</button>
        </span>
      </li>`).join("");
    $("#tab-sort").innerHTML = `
      <div class="card">
        <h2>Sắp xếp dàn ý: ${esc(titleOf(e))}</h2>
        <p class="meta">Các mục đang bị xáo trộn. Kéo thả từng mục, hoặc chọn nút Lên, Xuống để xếp lại theo đúng thứ tự dàn ý. Khi xong, bấm Kiểm tra thứ tự.</p>
        <ul class="sortlist" id="sortlist">${items}</ul>
        <div class="controls">
          <button class="btn primary" id="checkSort">Kiểm tra thứ tự</button>
          <button class="btn" id="reshuffle">Xáo lại</button>
        </div>
        <div id="sortResult">${sortResultHTML(i)}</div>
      </div>`;
  }

  function sortResultHTML(i) {
    if (!state.sortChecked || state.sortChecked.i !== i) return "";
    const { wrong } = state.sortChecked;
    if (!wrong.length) return `<p class="score ok">Đúng thứ tự</p><p class="meta">Đã ghi nhận cho câu này.</p>`;
    return `<p class="score bad">Chưa đúng</p><p class="meta">Các vị trí chưa đúng: ${wrong.join(", ")}.</p>`;
  }

  function moveItem(pos, delta) {
    const order = sortState(state.current);
    const target = pos + delta;
    if (target < 0 || target >= order.length) return;
    [order[pos], order[target]] = [order[target], order[pos]];
    state.sortChecked = null;
    renderSort();
    const act = delta < 0 ? "up" : "down";
    const btn = document.querySelector(`#sortlist [data-act="${act}"][data-pos="${target}"]`);
    if (btn && !btn.disabled) btn.focus();
  }

  function moveTo(from, to) {
    if (from === to) return;
    const order = sortState(state.current);
    const [item] = order.splice(from, 1);
    order.splice(to, 0, item);
    state.sortChecked = null;
    renderSort();
  }

  function checkSort() {
    const i = state.current;
    const order = sortState(i);
    const wrong = order.map((k, pos) => (k !== pos ? pos + 1 : null)).filter((x) => x !== null);
    state.sortChecked = { i, wrong };
    if (!wrong.length) update(i, { sortDone: true });
    renderSort();
    if (wrong.length) {
      const el = $("#sortResult");
      if (el) el.scrollIntoView({ block: "nearest" });
    }
  }

  // ---------- Tab 4: Đồng hồ 30 phút ----------
  function fmt(sec) {
    const m = Math.floor(sec / 60).toString().padStart(2, "0");
    const s = (sec % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  function renderTimer() {
    const e = state.essays[state.current];
    $("#tab-timer").innerHTML = `
      <div class="card">
        <h2>Viết thử đúng thời lượng thi: ${esc(titleOf(e))}</h2>
        <p class="meta">Viết không xem bài gốc. Mục tiêu khoảng ${WORDS_TARGET} chữ trong 30 phút.</p>
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

  function countWords(text) {
    const t = text.trim();
    return t ? t.split(/\s+/).length : 0;
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

  // ---------- Tab 5: Tiến độ ----------
  function renderProgress() {
    const rows = state.essays.map((e) => {
      const r = rec(e.index);
      return `<tr>
        <td>${e.number}</td>
        <td>${esc(titleOf(e))}</td>
        <td>${r.quizBest ? r.quizBest + "%" : "Chưa làm"}</td>
        <td>${r.quizTries}</td>
        <td>${r.sortDone ? "Đúng" : "Chưa"}</td>
        <td><span class="badge ${mastered(e.index) ? "ok" : "bad"}">${mastered(e.index) ? "Đạt" : "Chưa đạt"}</span></td>
      </tr>`;
    }).join("");
    const todo = state.essays.filter((e) => !mastered(e.index)).map((e) => e.index);
    $("#tab-progress").innerHTML = `
      <div class="card">
        <h2>Tiến độ</h2>
        <p class="meta">Một câu được tính là đạt khi làm trắc nghiệm được ${PASS}% trở lên và xếp đúng thứ tự dàn ý.</p>
        <table>
          <thead><tr><th>#</th><th>Nội dung</th><th>Trắc nghiệm tốt nhất</th><th>Số lần làm</th><th>Sắp xếp dàn ý</th><th>Kết quả</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="controls">
          <button class="btn primary" id="goWeak" ${todo.length ? "" : "disabled"}>Ôn câu chưa đạt (${todo.length})</button>
          <button class="btn" id="randomWeak" ${todo.length ? "" : "disabled"}>Ngẫu nhiên một câu chưa đạt</button>
          <button class="btn danger" id="resetProgress">Xóa toàn bộ tiến độ</button>
        </div>
        <p class="meta">${todo.length ? "Chưa đủ 12 câu đạt." : "Đã đạt cả 12 câu."}</p>
      </div>`;
    $("#goWeak").onclick = () => { if (todo.length) { state.current = todo[0]; setTab("quiz"); } };
    $("#randomWeak").onclick = () => {
      if (!todo.length) return;
      state.current = todo[Math.floor(Math.random() * todo.length)];
      setTab("quiz");
    };
    $("#resetProgress").onclick = () => {
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
    TABS.forEach((t) => { $("#tab-" + t).hidden = t !== name; });
    renderAll();
  }

  function renderAll() {
    renderList();
    if (state.tab === "read") renderRead();
    if (state.tab === "quiz") renderQuiz();
    if (state.tab === "sort") renderSort();
    if (state.tab === "timer") renderTimer();
    if (state.tab === "progress") renderProgress();
  }

  // Sự kiện: danh sách câu, tab
  document.addEventListener("click", (ev) => {
    const q = ev.target.closest(".qbtn");
    if (q) {
      state.current = Number(q.dataset.i);
      state.showFull = false;
      state.sortChecked = null;
      renderAll();
      return;
    }
    const t = ev.target.closest(".tabs button");
    if (t) setTab(t.dataset.tab);
  });

  // Sự kiện: trắc nghiệm
  $("#tab-quiz").addEventListener("change", (ev) => {
    if (ev.target.matches('input[type="radio"]')) {
      const qi = Number(ev.target.name.slice(1));
      quizState(state.current).ans[qi] = Number(ev.target.value);
      renderQuiz();
    }
  });
  $("#tab-quiz").addEventListener("click", (ev) => {
    if (ev.target.closest("#submitQuiz")) submitQuiz();
    if (ev.target.closest("#retry")) {
      state.quiz[state.current] = newQuiz(state.current);
      renderAll();
    }
  });

  // Sự kiện: sắp xếp (nút và kéo thả)
  const sortBox = $("#tab-sort");
  sortBox.addEventListener("click", (ev) => {
    const b = ev.target.closest("button[data-act]");
    if (b) { moveItem(Number(b.dataset.pos), b.dataset.act === "up" ? -1 : 1); return; }
    if (ev.target.closest("#checkSort")) checkSort();
    if (ev.target.closest("#reshuffle")) {
      delete state.order[state.current];
      state.sortChecked = null;
      renderSort();
    }
  });
  sortBox.addEventListener("dragstart", (ev) => {
    const li = ev.target.closest(".sort-item");
    if (!li) return;
    ev.dataTransfer.setData("text/plain", li.dataset.pos);
    ev.dataTransfer.effectAllowed = "move";
  });
  sortBox.addEventListener("dragover", (ev) => {
    if (ev.target.closest(".sort-item")) ev.preventDefault();
  });
  sortBox.addEventListener("drop", (ev) => {
    const li = ev.target.closest(".sort-item");
    if (!li) return;
    ev.preventDefault();
    moveTo(Number(ev.dataTransfer.getData("text/plain")), Number(li.dataset.pos));
  });

  // Khởi động
  loadAll()
    .then(renderAll)
    .catch((err) => {
      $("#tab-read").innerHTML = `<div class="card">Lỗi tải nội dung: ${esc(err.message || err)}. Hãy mở trang qua máy chủ (ví dụ Vercel), không mở trực tiếp file.</div>`;
    });
})();
