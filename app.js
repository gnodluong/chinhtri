(() => {
  "use strict";

  // Theo "Phương pháp học văn": hiểu trước, nhớ sau; 3-5-1; tự nhắc không nhìn tài liệu;
  // ôn cách quãng 1-3-7-14 ngày; checklist cuối buổi.
  const TOTAL = 12;
  const PASS = 80;               // % trắc nghiệm để hiện là "đạt" (không tính vào lịch ôn)
  const STORE = "chinhtri-progress-v3";
  const DAY_KEY = "chinhtri-day-v3";
  const WORDS_TARGET = 500;
  const GAPS = [1, 3, 7, 14];    // ngày chờ sau lần ôn 1, 2, 3, 4
  const MASTER_REVIEWS = 5;      // ôn đủ 5 lần và lần cuối nhớ đủ thì coi là nhớ bền
  const TABS = ["today", "read", "recall", "practice", "write", "progress"];

  const PLAN = [
    { t: "5 phút", s: "Đọc lại kiến thức và xác định phần chưa hiểu." },
    { t: "10 phút", s: "Rút gọn thành 3 ý lớn, 5 từ khóa và 1 câu chốt (tab Học bài)." },
    { t: "10 phút", s: "Đóng tài liệu, tự nói lại hoặc viết lại (tab Tự nhắc)." },
    { t: "5 phút", s: "Kiểm tra cho quen, ghi phần còn thiếu và đánh dấu chỗ cần ôn lại." },
  ];
  const CHECK = [
    "Tôi nói được tên và nội dung chính của bài.",
    "Tôi nhớ được 3 ý lớn.",
    "Tôi nhớ các từ khóa quan trọng.",
    "Tôi tự giải thích được bằng lời của mình.",
    "Tôi có ít nhất một dẫn chứng phù hợp.",
    "Tôi viết được một đoạn theo MỞ - GIẢI - DẪN - PHÂN - CHỐT.",
    "Tôi đã đánh dấu phần chưa chắc để ôn lại.",
  ];
  const KHUNG = [
    ["MỞ", "mo"], ["GIẢI", "giai"], ["DẪN", "dan"], ["PHÂN", "phan"], ["CHỐT", "chot"],
  ];

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
  const countWords = (text) => {
    const t = text.trim();
    return t ? t.split(/\s+/).length : 0;
  };
  // Chuẩn hóa tiếng Việt để so khớp từ khóa: bỏ dấu, chữ thường
  const norm = (s) => s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // ---------- Ngày (YYYY-MM-DD, theo giờ địa phương) ----------
  const pad = (n) => String(n).padStart(2, "0");
  const fmtDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const dayStr = (off = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + off);
    return fmtDay(d);
  };
  const addDays = (s, n) => {
    const d = new Date(s + "T00:00:00");
    d.setDate(d.getDate() + n);
    return fmtDay(d);
  };
  const fmtDM = (s) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;

  // ---------- Đọc Markdown: dàn ý và bài văn ----------
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

  // ---------- Lưu trữ ----------
  function loadJSON(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
  }
  function saveJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* bỏ qua nếu bị chặn */ }
  }
  let progress = loadJSON(STORE, {});
  const saveProgress = () => saveJSON(STORE, progress);
  const rec = (i) => ({ quizBest: 0, quizTries: 0, sortDone: false, reviews: [], ...(progress[i] || {}) });
  const update = (i, patch) => { progress[i] = { ...rec(i), ...patch }; saveProgress(); };
  const lastReview = (i) => { const rv = rec(i).reviews; return rv[rv.length - 1]; };

  // Lịch ôn: sau lần nhớ đủ thứ n, chờ GAPS[n-1] ngày; quên hoặc nhớ một phần thì chờ 1 ngày.
  function nextDue(i) {
    const rv = rec(i).reviews;
    if (!rv.length) return null;
    const last = rv[rv.length - 1];
    const gap = last.r === "nho" ? GAPS[Math.min(rv.length - 1, GAPS.length - 1)] : 1;
    return addDays(last.d, gap);
  }
  function status(i) {
    const rv = rec(i).reviews;
    if (!rv.length) return "new";
    if (rv.length >= MASTER_REVIEWS && lastReview(i).r === "nho") return "mastered";
    return nextDue(i) <= dayStr(0) ? "due" : "later";
  }
  const addReview = (i, r) => update(i, { reviews: [...rec(i).reviews, { d: dayStr(0), r }] });

  // Checklist và kế hoạch theo từng ngày
  function loadDay() {
    const today = dayStr(0);
    const d = loadJSON(DAY_KEY, null);
    if (!d || d.date !== today) return { date: today, plan: {}, check: {} };
    return d;
  }
  let day = loadDay();
  const saveDay = () => saveJSON(DAY_KEY, day);

  // ---------- Trạng thái ----------
  const state = {
    essays: [],
    study: [],
    quizData: [],
    current: 0,
    tab: "today",
    showFull: false,
    hints: {},          // câu -> số từ khóa đã gợi ý
    revealed: {},       // câu -> đã xem đáp án
    sub: "quiz",        // luyện hiểu: quiz | sort
    quiz: {},           // câu -> trạng thái trắc nghiệm
    order: {},          // câu -> thứ tự mục dàn ý khi sắp xếp
    sortChecked: null,
    drafts: {},
    timer: null,
    remaining: 30 * 60,
    running: false,
  };

  async function loadAll() {
    const files = Array.from({ length: TOTAL }, (_, i) => `content/cau-${pad(i + 1)}.md`);
    const [texts, study, quiz] = await Promise.all([
      Promise.all(files.map((f) => fetch(f).then((r) => {
        if (!r.ok) throw new Error(`Không đọc được ${f}`);
        return r.text();
      }))),
      fetch("content/study.json").then((r) => r.json()),
      fetch("content/quiz.json").then((r) => r.json()),
    ]);
    state.essays = texts.map((t, i) => parseEssay(t, i));
    state.study = study;
    state.quizData = quiz;
  }

  const studyFor = (i) => state.study.find((x) => x.id === i + 1);
  const quizFor = (i) => state.quizData.find((x) => x.id === i + 1);

  // ---------- Danh sách và đầu trang ----------
  const BADGE = {
    mastered: ["ok", "Nhớ bền"],
    due: ["mid", "Đến hạn"],
    later: ["", ""],
    new: ["", "Mới"],
  };

  function renderList() {
    $("#list").innerHTML = state.essays.map((e) => {
      const st = status(e.index);
      let [cls, txt] = BADGE[st];
      if (st === "later") txt = fmtDM(nextDue(e.index));
      return `<button class="qbtn ${e.index === state.current ? "active" : ""}" data-i="${e.index}">
        <span>${e.number}. ${esc(titleOf(e))}</span><span class="badge ${cls}">${txt}</span></button>`;
    }).join("");
    const due = state.essays.filter((e) => ["new", "due"].includes(status(e.index))).length;
    const nhoBen = state.essays.filter((e) => status(e.index) === "mastered").length;
    $("#overall").textContent = `Đến hạn hôm nay: ${due} câu. Nhớ bền: ${nhoBen} trên ${TOTAL} câu.`;
    $("#ticks").innerHTML = state.essays.map((e) => `<span class="${status(e.index) === "mastered" ? "on" : ""}" title="Câu ${e.number}"></span>`).join("");
  }

  const bodyHTML = (e) => e.body.map((b) => (b.heading ? `<h3>${esc(b.heading)}</h3>` : `<p>${esc(b.text)}</p>`)).join("");

  // ---------- Hôm nay ----------
  function renderToday() {
    const due = state.essays.filter((e) => ["new", "due"].includes(status(e.index)));
    $("#tab-today").innerHTML = `
      <div class="card">
        <h2>Hôm nay</h2>
        <p class="meta">${due.length ? `Có ${due.length} câu cần ôn hôm nay.` : "Hôm nay không có câu nào đến hạn."} Dự kiến 30 phút.</p>
        ${due.length ? `<ul class="duelist">${due.map((e) => `
          <li><button class="linkbtn" data-goto="${e.index}">${e.number}. ${esc(titleOf(e))}</button>
          <span class="meta">${status(e.index) === "new" ? "Học lần đầu" : "Đến hạn"}</span></li>`).join("")}</ul>` : ""}
      </div>
      <div class="card">
        <h3>Kế hoạch 30 phút</h3>
        <ol class="plan">${PLAN.map((p, k) => `
          <li><label class="check"><input type="checkbox" data-plan="${k}" ${day.plan[k] ? "checked" : ""}>
          <span><b>${p.t}.</b> ${p.s}</span></label></li>`).join("")}</ol>
      </div>
      <div class="card">
        <h3>Checklist cuối buổi</h3>
        <ul class="checklist">${CHECK.map((c, k) => `
          <li><label class="check"><input type="checkbox" data-check="${k}" ${day.check[k] ? "checked" : ""}>
          <span>${c}</span></label></li>`).join("")}</ul>
      </div>`;
  }

  // ---------- Học bài: thẻ 3-5-1, sơ đồ một trang và dàn ý ----------
  function mindMapHTML(i) {
    const st = studyFor(i);
    return `
      <div class="mmap">
        <div class="mm-col">${st.big.map((x) => `<div class="mm-node">${esc(x)}</div>`).join("")}</div>
        <div class="mm-root"><span>${esc(titleOf(state.essays[i]))}</span></div>
        <div class="mm-col mm-keys">${st.keys.map((x) => `<span class="mm-key">${esc(x)}</span>`).join("")}</div>
        <div class="mm-chot"><span class="klabel">Câu chốt</span> ${esc(st.chot)}</div>
      </div>`;
  }

  function renderRead() {
    const e = state.essays[state.current];
    const st = studyFor(state.current);
    $("#tab-read").innerHTML = `
      <div class="card">
        <h2>${esc(e.title)}</h2>
        <p class="meta">Hiểu trước, nhớ sau. Đọc phần 3-5-1 và dàn ý, không cần học thuộc cả bài.</p>
        <h3>Sơ đồ một trang</h3>
        ${mindMapHTML(state.current)}
        <div class="s351">
          <h3>3 ý lớn</h3>
          <ol class="big">${st.big.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>
          <h3>5 từ khóa</h3>
          <div class="chips">${st.keys.map((x) => `<span class="chip">${esc(x)}</span>`).join("")}</div>
          <h3>1 câu chốt</h3>
          <p class="chot">${esc(st.chot)}</p>
        </div>
        <h3>Dàn ý</h3>
        <ol class="outline">${e.outline.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>
        <div class="controls">
          <button class="btn primary" data-go="recall">Tự nhắc câu này</button>
          <button class="btn" data-go="write">Viết theo khung</button>
          <button class="btn" id="toggleFull">${state.showFull ? "Ẩn bài đầy đủ" : "Xem bài đầy đủ"}</button>
        </div>
      </div>
      <div class="card essay ${state.showFull ? "" : "hidden"}">${bodyHTML(e)}</div>
      <p class="meta">Bài rút gọn, khoảng ${WORDS_TARGET} chữ. Bài này có ${e.words} chữ.</p>`;
    $("#toggleFull").onclick = () => { state.showFull = !state.showFull; renderRead(); };
  }

  // ---------- Tự nhắc: nhìn không tài liệu, rồi mới xem đáp án ----------
  function nextText(i) {
    const s = status(i);
    if (s === "new") return "Chưa ôn lần nào.";
    if (s === "mastered") return "Đã ôn đủ, nhớ bền.";
    return `Lần ôn tiếp theo: ${fmtDM(nextDue(i))}.`;
  }

  function renderRecall() {
    const i = state.current;
    const e = state.essays[i];
    const st = studyFor(i);
    const hintN = state.hints[i] || 0;
    const shown = state.revealed[i];
    const key = "r" + i;
    $("#tab-recall").innerHTML = `
      <div class="card">
        <h2>Tự nhắc: ${esc(titleOf(e))}</h2>
        <p class="meta">Đóng tài liệu. Tự nói lại hoặc viết lại 3 ý lớn, 5 từ khóa và 1 câu chốt. Nếu quên, thử nhớ lại từ khóa trước. Chỉ mở đáp án khi đã cố nhớ.</p>
        <textarea id="recallText" placeholder="Viết những gì bạn nhớ được (không bắt buộc)"></textarea>
        <div class="controls">
          <button class="btn" id="hint" ${hintN >= st.keys.length || shown ? "disabled" : ""}>Gợi ý một từ khóa</button>
          <button class="btn primary" id="reveal" ${shown ? "disabled" : ""}>Xem đáp án</button>
        </div>
        ${hintN ? `<p class="hintline">Từ khóa gợi ý: ${st.keys.slice(0, hintN).map(esc).join(", ")}</p>` : ""}
        ${shown ? `
          <div class="s351 answer">
            <h3>3 ý lớn</h3>
            <ol class="big">${st.big.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>
            <h3>5 từ khóa</h3>
            <div class="chips">${st.keys.map((x) => `<span class="chip">${esc(x)}</span>`).join("")}</div>
            <h3>1 câu chốt</h3>
            <p class="chot">${esc(st.chot)}</p>
          </div>
          <h3>Tự đánh giá</h3>
          <p class="meta">Chọn đúng mức bạn nhớ. Quên hoặc nhớ một phần thì ngày mai ôn lại.</p>
          <div class="controls">
            <button class="btn primary" data-rate="nho">Nhớ đủ</button>
            <button class="btn" data-rate="mot_phan">Nhớ một phần</button>
            <button class="btn danger" data-rate="quen">Quên</button>
          </div>` : ""}
        <p class="meta">Đã ôn ${rec(i).reviews.length} lần. ${nextText(i)}</p>
      </div>`;
    const ta = $("#recallText");
    ta.value = state.drafts[key] || "";
    ta.oninput = () => { state.drafts[key] = ta.value; };
  }

  // ---------- Luyện hiểu: trắc nghiệm và sắp xếp (không tính vào lịch ôn) ----------
  function renderPractice() {
    const sub = state.sub;
    const head = `
      <div class="subtabs">
        <button data-sub="quiz" class="${sub === "quiz" ? "active" : ""}">Trắc nghiệm</button>
        <button data-sub="sort" class="${sub === "sort" ? "active" : ""}">Sắp xếp dàn ý</button>
      </div>
      <p class="meta">Dùng để kiểm tra hiểu thêm. Kết quả không thay đổi lịch ôn.</p>`;
    $("#tab-practice").innerHTML = head + (sub === "quiz" ? quizHTML() : sortHTML());
  }

  function quizState(i) {
    if (!state.quiz[i]) {
      const qs = quizFor(i).questions;
      state.quiz[i] = {
        perm: qs.map((q) => shuffle(q.options.map((_, k) => k))),
        ans: qs.map(() => null),
        submitted: false,
        score: 0,
      };
    }
    return state.quiz[i];
  }

  function quizHTML() {
    const i = state.current;
    const data = quizFor(i);
    const qz = quizState(i);
    const r = rec(i);
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
    return `
      <div class="card">
        <h2>Trắc nghiệm: ${esc(titleOf(state.essays[i]))}</h2>
        <p class="meta">Thứ tự đáp án được xáo mỗi lần làm. Lần tốt nhất: ${r.quizBest}%. Đã làm: ${r.quizTries} lần.</p>
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

  function sortState(i) {
    if (!state.order[i]) state.order[i] = shuffle(state.essays[i].outline.map((_, k) => k));
    return state.order[i];
  }

  function sortHTML() {
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
    let result = "";
    if (state.sortChecked && state.sortChecked.i === i) {
      const { wrong } = state.sortChecked;
      result = wrong.length
        ? `<p class="score bad">Chưa đúng</p><p class="meta">Các vị trí chưa đúng: ${wrong.join(", ")}.</p>`
        : `<p class="score ok">Đúng thứ tự</p>`;
    }
    return `
      <div class="card">
        <h2>Sắp xếp dàn ý: ${esc(titleOf(e))}</h2>
        <p class="meta">Kéo thả từng mục, hoặc dùng nút Lên, Xuống để xếp đúng thứ tự dàn ý.</p>
        <ul class="sortlist" id="sortlist">${items}</ul>
        <div class="controls">
          <button class="btn primary" id="checkSort">Kiểm tra thứ tự</button>
          <button class="btn" id="reshuffle">Xáo lại</button>
        </div>
        <div id="sortResult">${result}</div>
      </div>`;
  }

  function moveItem(pos, delta) {
    const order = sortState(state.current);
    const target = pos + delta;
    if (target < 0 || target >= order.length) return;
    [order[pos], order[target]] = [order[target], order[pos]];
    state.sortChecked = null;
    renderPractice();
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
    renderPractice();
  }

  function checkSort() {
    const order = sortState(state.current);
    const wrong = order.map((k, pos) => (k !== pos ? pos + 1 : null)).filter((x) => x !== null);
    state.sortChecked = { i: state.current, wrong };
    if (!wrong.length) update(state.current, { sortDone: true });
    renderPractice();
  }

  // ---------- Viết theo khung + đồng hồ 30 phút ----------
  const fmt = (sec) => `${pad(Math.floor(sec / 60))}:${pad(sec % 60)}`;

  // Kiểm tra cấu trúc bằng quy tắc (không dùng AI): chỉ kiểm tra hình thức và từ khóa
  const CONN = {
    dan: ["vi du", "chang han", "nhu the"],
    phan: ["cho thay", "chung to", "vi", "dieu nay", "bo i"],
    chot: ["vi vay", "do do", "qua do", "tom lai", "tu do"],
  };
  const hasAny = (text, list) => {
    const t = " " + norm(text) + " ";
    return list.some((w) => t.includes(" " + w + " "));
  };

  function checkWriting(i) {
    const st = studyFor(i);
    const part = (k) => (state.drafts[`w${i}-${k}`] || "").trim();
    const all = KHUNG.map(([, k]) => part(k)).join(" ");
    const usedKeys = st.keys.filter((k) => (" " + norm(all) + " ").includes(" " + norm(k) + " "));
    const longSent = all.split(/[.!?]+/).filter((s) => countWords(s) > 40).length;
    const items = [
      [countWords(part("mo")) >= 6, "MỞ: có ít nhất 6 chữ nêu vấn đề."],
      [countWords(part("giai")) >= 8, "GIẢI: có ít nhất 8 chữ giải thích khái niệm."],
      [countWords(part("dan")) >= 8 || hasAny(part("dan"), CONN.dan), "DẪN: có dẫn chứng cụ thể, như một ví dụ hoặc một sự việc."],
      [hasAny(part("phan"), CONN.phan), "PHÂN: có câu nói dẫn chứng cho thấy điều gì (ví dụ: cho thấy, vì)."],
      [hasAny(part("chot"), CONN.chot), "CHỐT: có câu khẳng định lại (ví dụ: vì vậy, do đó, tóm lại)."],
      [usedKeys.length >= 3, `Dùng ít nhất 3 trong 5 từ khóa. Hiện dùng ${usedKeys.length}.`],
      [longSent === 0, longSent ? `Có ${longSent} câu trên 40 chữ, nên tách ngắn lại.` : "Không có câu nào trên 40 chữ."],
    ];
    return { i, items, usedKeys };
  }

  function checkHTML(chk) {
    const passed = chk.items.filter(([ok]) => ok).length;
    return `
      <h3>Kiểm tra cấu trúc: ${passed}/${chk.items.length} mục đạt</h3>
      <p class="meta">Chỉ kiểm tra hình thức và từ khóa, không chấm nội dung hay văn phong.</p>
      <ul class="checks">${chk.items.map(([ok, t]) => `<li><span class="mark ${ok ? "ok" : "todo"}">${ok ? "Đạt" : "Chưa"}</span> ${esc(t)}</li>`).join("")}</ul>`;
  }

  function renderWrite() {
    const i = state.current;
    const e = state.essays[i];
    const st = studyFor(i);
    const chk = state.writeChecked && state.writeChecked.i === i ? state.writeChecked : null;
    $("#tab-write").innerHTML = `
      <div class="card">
        <h2>Viết thử: ${esc(titleOf(e))}</h2>
        <p class="meta">Viết không xem bài gốc. Mục tiêu khoảng ${WORDS_TARGET} chữ trong 30 phút.</p>
        <div class="timer" id="clock">${fmt(state.remaining)}</div>
        <div class="controls">
          <button class="btn primary" id="start">${state.running ? "Tạm dừng" : "Bắt đầu"}</button>
          <button class="btn" id="reset">Đặt lại 30:00</button>
        </div>
      </div>
      <div class="card">
        <h3>Viết theo khung MỞ - GIẢI - DẪN - PHÂN - CHỐT</h3>
        <p class="meta">Mỗi phần viết trong ô riêng. Dẫn chứng phải liên quan trực tiếp đến luận điểm.</p>
        ${KHUNG.map(([label, k]) => `
          <div class="wpart">
            <p class="wlabel"><span class="klabel">${label}</span> <span class="meta">${esc(st.khung[k])}</span></p>
            <textarea data-wk="${k}" aria-label="${label}"></textarea>
          </div>`).join("")}
        <div class="controls">
          <button class="btn primary" id="checkWrite">Kiểm tra cấu trúc</button>
          <span class="meta" id="wcTotal"></span>
        </div>
        <div id="writeResult">${chk ? checkHTML(chk) : ""}</div>
      </div>`;
    const updateCount = () => {
      const n = KHUNG.reduce((s, [, k]) => s + countWords(state.drafts[`w${i}-${k}`] || ""), 0);
      $("#wcTotal").textContent = `${n} chữ`;
    };
    document.querySelectorAll("#tab-write textarea[data-wk]").forEach((ta) => {
      const k = ta.dataset.wk;
      ta.value = state.drafts[`w${i}-${k}`] || "";
      ta.oninput = () => {
        state.drafts[`w${i}-${k}`] = ta.value;
        state.writeChecked = null;
        updateCount();
      };
    });
    updateCount();
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

  // ---------- Tiến độ ----------
  function renderProgress() {
    const rows = state.essays.map((e) => {
      const r = rec(e.index);
      const st = status(e.index);
      return `<tr>
        <td>${e.number}</td>
        <td>${esc(titleOf(e))}</td>
        <td>${st === "mastered" ? "Nhớ bền" : st === "new" ? "Chưa ôn" : st === "due" ? "Đến hạn" : "Đang ôn"}</td>
        <td>${r.reviews.length}</td>
        <td>${st === "new" ? "" : st === "mastered" ? "" : st === "due" ? "Hôm nay" : fmtDM(nextDue(e.index))}</td>
        <td>${r.quizBest ? r.quizBest + "%" : "Chưa làm"}</td>
      </tr>`;
    }).join("");
    const dueFirst = state.essays.find((e) => ["new", "due"].includes(status(e.index)));
    $("#tab-progress").innerHTML = `
      <div class="card">
        <h2>Tiến độ ôn</h2>
        <p class="meta">Một câu được coi là nhớ bền khi đã ôn đủ ${MASTER_REVIEWS} lần cách quãng và lần cuối nhớ đủ. Lịch: 1, 3, 7, 14 ngày.</p>
        <table>
          <thead><tr><th>#</th><th>Nội dung</th><th>Trạng thái</th><th>Số lần ôn</th><th>Ôn tiếp</th><th>Trắc nghiệm tốt nhất</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="controls">
          <button class="btn primary" id="goDue" ${dueFirst ? "" : "disabled"}>Ôn câu đến hạn đầu tiên</button>
          <button class="btn danger" id="resetProgress">Xóa toàn bộ tiến độ</button>
        </div>
      </div>`;
    $("#goDue").onclick = () => { if (dueFirst) { state.current = dueFirst.index; setTab("recall"); } };
    $("#resetProgress").onclick = () => {
      if (confirm("Xóa toàn bộ tiến độ trên trình duyệt này?")) {
        progress = {};
        saveProgress();
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
    if (state.tab === "today") renderToday();
    if (state.tab === "read") renderRead();
    if (state.tab === "recall") renderRecall();
    if (state.tab === "practice") renderPractice();
    if (state.tab === "write") renderWrite();
    if (state.tab === "progress") renderProgress();
  }

  // Danh sách câu và tab
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
    const go = ev.target.closest("[data-go]");
    if (go) setTab(go.dataset.go);
  });

  // Hôm nay: kế hoạch, checklist, mở câu
  $("#tab-today").addEventListener("change", (ev) => {
    const p = ev.target.dataset.plan;
    const c = ev.target.dataset.check;
    if (p !== undefined) day.plan[p] = ev.target.checked;
    if (c !== undefined) day.check[c] = ev.target.checked;
    saveDay();
  });
  $("#tab-today").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-goto]");
    if (b) { state.current = Number(b.dataset.goto); setTab("recall"); }
  });

  // Tự nhắc: gợi ý, xem đáp án, tự đánh giá
  $("#tab-recall").addEventListener("click", (ev) => {
    const i = state.current;
    if (ev.target.closest("#hint")) {
      state.hints[i] = Math.min((state.hints[i] || 0) + 1, studyFor(i).keys.length);
      renderRecall();
    }
    if (ev.target.closest("#reveal")) {
      state.revealed[i] = true;
      renderRecall();
    }
    const rate = ev.target.closest("[data-rate]");
    if (rate) {
      addReview(i, rate.dataset.rate);
      state.revealed[i] = false;
      state.hints[i] = 0;
      renderAll();
    }
  });

  // Luyện hiểu: chuyển tab con, trắc nghiệm, sắp xếp
  const practice = $("#tab-practice");
  practice.addEventListener("click", (ev) => {
    const sub = ev.target.closest("[data-sub]");
    if (sub) { state.sub = sub.dataset.sub; renderPractice(); return; }
    if (ev.target.closest("#submitQuiz")) { submitQuiz(); return; }
    if (ev.target.closest("#retry")) {
      delete state.quiz[state.current];
      renderPractice();
      return;
    }
    const b = ev.target.closest("button[data-act]");
    if (b) { moveItem(Number(b.dataset.pos), b.dataset.act === "up" ? -1 : 1); return; }
    if (ev.target.closest("#checkSort")) { checkSort(); return; }
    if (ev.target.closest("#reshuffle")) {
      delete state.order[state.current];
      state.sortChecked = null;
      renderPractice();
    }
  });
  practice.addEventListener("change", (ev) => {
    if (ev.target.matches('input[type="radio"]')) {
      const qi = Number(ev.target.name.slice(1));
      quizState(state.current).ans[qi] = Number(ev.target.value);
      renderPractice();
    }
  });
  practice.addEventListener("dragstart", (ev) => {
    const li = ev.target.closest(".sort-item");
    if (!li) return;
    ev.dataTransfer.setData("text/plain", li.dataset.pos);
    ev.dataTransfer.effectAllowed = "move";
  });
  practice.addEventListener("dragover", (ev) => {
    if (ev.target.closest(".sort-item")) ev.preventDefault();
  });
  practice.addEventListener("drop", (ev) => {
    const li = ev.target.closest(".sort-item");
    if (!li) return;
    ev.preventDefault();
    moveTo(Number(ev.dataTransfer.getData("text/plain")), Number(li.dataset.pos));
  });

  // Viết theo khung: kiểm tra cấu trúc
  $("#tab-write").addEventListener("click", (ev) => {
    if (ev.target.closest("#checkWrite")) {
      state.writeChecked = checkWriting(state.current);
      renderWrite();
    }
  });

  // Khởi động
  loadAll()
    .then(renderAll)
    .catch((err) => {
      $("#tab-today").innerHTML = `<div class="card">Lỗi tải nội dung: ${esc(err.message || err)}. Hãy mở trang qua máy chủ (ví dụ Vercel), không mở trực tiếp file.</div>`;
    });
})();
