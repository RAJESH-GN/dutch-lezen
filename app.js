(function () {
  "use strict";

  // ---- STATE ----

  let allExams = [];        // array of exam objects from JSON
  let examData = null;      // currently selected exam
  let flatQuestions = [];    // { passageIdx, questionIdx, passage, question }
  let answers = {};          // questionGlobalIdx → answer string
  let currentQIdx = 0;
  let timerInterval = null;
  let secondsLeft = 0;
  let examFinished = false;

  // ---- DOM REFS ----

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const screens = {
    select: $("#screen-select"),
    start: $("#screen-start"),
    exam: $("#screen-exam"),
    results: $("#screen-results"),
    weakness: $("#screen-weakness"),
  };

  // ---- HELPERS ----

  function showScreen(name) {
    Object.values(screens).forEach((s) => s.classList.remove("active"));
    screens[name].classList.add("active");
    window.scrollTo(0, 0);
  }

  function buildFlatQuestions() {
    flatQuestions = [];
    examData.passages.forEach((passage, pi) => {
      passage.questions.forEach((q, qi) => {
        flatQuestions.push({ passageIdx: pi, questionIdx: qi, passage, question: q });
      });
    });
  }

  // ---- LOAD JSON ----

  async function loadExam() {
    try {
      const res = await fetch("exam.json");
      if (!res.ok) throw new Error("Failed to load exam.json");
      const json = await res.json();

      if (json.exams && Array.isArray(json.exams)) {
        allExams = json.exams;
      } else if (json.exam) {
        allExams = [json.exam];
      } else {
        allExams = [];
      }

      if (allExams.length === 1) {
        selectExam(0);
      } else {
        renderSelectScreen();
      }
    } catch (err) {
      $("#exam-list").innerHTML = `<p style="color:var(--color-danger)">Fout bij laden: ${err.message}</p>`;
      console.error(err);
    }
  }

  // ---- SELECT SCREEN ----

  function renderSelectScreen() {
    const list = $("#exam-list");
    list.innerHTML = "";

    if (allExams.length === 0) {
      list.innerHTML = "<p>Geen examens gevonden.</p>";
      return;
    }

    allExams.forEach((exam, idx) => {
      const card = document.createElement("div");
      card.className = "exam-card";

      const passageCount = (exam.passages || []).length;
      const questionCount = (exam.passages || []).reduce((sum, p) => sum + (p.questions || []).length, 0);

      card.innerHTML = `
        <div class="exam-card-info">
          <div class="exam-card-title">${escapeHTML(exam.title || `Examen ${idx + 1}`)}</div>
          <div class="exam-card-desc">${escapeHTML(exam.description || "")}</div>
          <div class="exam-card-meta">
            <span class="badge">${passageCount} teksten</span>
            <span class="badge badge-outline">${questionCount} vragen</span>
            <span class="badge badge-outline">${exam.timerMinutes || 15} min</span>
          </div>
        </div>
        <span class="exam-card-arrow">\u2192</span>
      `;

      card.addEventListener("click", () => selectExam(idx));
      list.appendChild(card);
    });

    showScreen("select");
  }

  function selectExam(idx) {
    examData = allExams[idx];
    buildFlatQuestions();
    renderStartScreen();
    showScreen("start");
  }

  // ---- START SCREEN ----

  function renderStartScreen() {
    $("#exam-title").textContent = examData.title || "Dutch A1 Reading Exam";
    $("#exam-description").textContent = examData.description || "";
    $("#exam-start-message").textContent = examData.startMessage || "";

    const btn = $("#btn-start");
    if (flatQuestions.length === 0) {
      btn.textContent = "Geen vragen geladen";
      btn.disabled = true;
    } else {
      btn.textContent = "Start examen";
      btn.disabled = false;
    }

    $("#btn-back").style.display = allExams.length > 1 ? "" : "none";
  }

  // ---- TIMER ----

  function startTimer() {
    secondsLeft = (examData.timerMinutes || 15) * 60;
    updateTimerDisplay();
    timerInterval = setInterval(() => {
      secondsLeft--;
      updateTimerDisplay();
      if (secondsLeft <= 0) {
        finishExam();
      }
    }, 1000);
  }

  function updateTimerDisplay() {
    const m = String(Math.max(0, Math.floor(secondsLeft / 60))).padStart(2, "0");
    const s = String(Math.max(0, secondsLeft % 60)).padStart(2, "0");
    const el = $("#timer");
    el.textContent = `${m}:${s}`;
    el.classList.toggle("warning", secondsLeft <= 60);
  }

  function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  // ---- NAV PANEL ----

  function renderNav() {
    const nav = $("#question-nav");
    nav.innerHTML = "";

    let globalIdx = 0;
    examData.passages.forEach((passage, pi) => {
      const group = document.createElement("div");
      group.className = "nav-group";

      const label = document.createElement("span");
      label.className = "nav-group-label";
      label.textContent = `Tekst ${pi + 1}`;
      group.appendChild(label);

      const btnWrap = document.createElement("div");
      btnWrap.className = "nav-group-buttons";

      passage.questions.forEach(() => {
        const idx = globalIdx;
        const btn = document.createElement("button");
        btn.className = "nav-btn";
        btn.dataset.idx = idx;
        btn.textContent = idx + 1;
        btn.addEventListener("click", () => goToQuestion(idx));
        btnWrap.appendChild(btn);
        globalIdx++;
      });

      group.appendChild(btnWrap);
      nav.appendChild(group);
    });

    updateNav();
  }

  function updateNav() {
    const btns = $$("#question-nav .nav-btn");
    btns.forEach((btn) => {
      const i = parseInt(btn.dataset.idx, 10);
      btn.classList.remove("active", "answered");
      if (i === currentQIdx) {
        btn.classList.add("active");
      } else if (answers[i] !== undefined && answers[i] !== "") {
        btn.classList.add("answered");
      }
    });
  }

  // ---- QUESTION RENDERING ----

  function goToQuestion(idx) {
    saveCurrentAnswer();
    currentQIdx = idx;
    renderCurrentQuestion();
    updateNav();
  }

  function renderCurrentQuestion() {
    if (flatQuestions.length === 0) return;

    const { passage, question } = flatQuestions[currentQIdx];

    // Passage context + hint + text
    const contextEl = $("#passage-context");
    if (passage.context) {
      contextEl.textContent = passage.context;
      contextEl.style.display = "";
    } else {
      contextEl.style.display = "none";
    }
    const hintEl = $("#passage-hint");
    hintEl.innerHTML = "Lees eerst de vraag.<br>Kijk dan naar de tekst.";
    $("#passage-text").textContent = passage.text || "";
    $("#passage-theme").textContent = passage.theme || "";
    $("#passage-type").textContent = passage.textType || "";
    $("#passage-level").textContent = passage.level ? `Niveau ${passage.level}` : "";

    // Question
    const panel = $("#question-panel");
    panel.innerHTML = "";

    const card = document.createElement("div");
    card.className = "question-card";

    const { passageIdx, questionIdx } = flatQuestions[currentQIdx];

    const num = document.createElement("div");
    num.className = "q-number";
    num.textContent = `Tekst ${passageIdx + 1} \u2014 Vraag ${currentQIdx + 1} van ${flatQuestions.length}`;

    const text = document.createElement("div");
    text.className = "q-text";
    text.textContent = question.question;

    card.appendChild(num);
    card.appendChild(text);
    card.appendChild(buildAnswerInput(question, currentQIdx));
    panel.appendChild(card);

    // Navigation buttons
    const navRow = document.createElement("div");
    navRow.style.display = "flex";
    navRow.style.gap = "0.75rem";
    navRow.style.marginTop = "0.75rem";

    if (currentQIdx > 0) {
      const prev = document.createElement("button");
      prev.className = "btn btn-primary";
      prev.textContent = "\u2190 Vorige";
      prev.addEventListener("click", () => goToQuestion(currentQIdx - 1));
      navRow.appendChild(prev);
    }

    if (currentQIdx < flatQuestions.length - 1) {
      const next = document.createElement("button");
      next.className = "btn btn-primary";
      next.textContent = "Volgende \u2192";
      next.addEventListener("click", () => goToQuestion(currentQIdx + 1));
      navRow.appendChild(next);
    }

    panel.appendChild(navRow);
  }

  function buildAnswerInput(question, globalIdx) {
    const container = document.createElement("div");

    switch (question.type) {
      case "multiple_choice":
        return buildMultipleChoice(question, globalIdx);
      case "true_false":
        return buildTrueFalse(question, globalIdx);
      case "fill_in":
        return buildFillIn(question, globalIdx);
      case "matching":
        return buildMatching(question, globalIdx);
      default:
        container.textContent = `Unknown question type: ${question.type}`;
        return container;
    }
  }

  function buildMultipleChoice(question, globalIdx) {
    const list = document.createElement("div");
    list.className = "option-list";
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

    (question.options || []).forEach((opt, i) => {
      const label = document.createElement("label");
      label.className = "option-label";

      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = `q-${globalIdx}`;
      radio.value = opt;
      radio.disabled = examFinished;
      if (answers[globalIdx] === opt) radio.checked = true;
      radio.addEventListener("change", () => {
        answers[globalIdx] = opt;
        updateNav();
      });

      const letter = document.createElement("span");
      letter.className = "option-letter";
      letter.textContent = letters[i] || "";

      const span = document.createElement("span");
      span.textContent = opt;

      label.appendChild(radio);
      label.appendChild(letter);
      label.appendChild(span);
      list.appendChild(label);
    });

    return list;
  }

  function buildTrueFalse(question, globalIdx) {
    const list = document.createElement("div");
    list.className = "option-list";

    ["Waar", "Niet waar"].forEach((opt) => {
      const label = document.createElement("label");
      label.className = "option-label";

      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = `q-${globalIdx}`;
      radio.value = opt;
      radio.disabled = examFinished;
      if (answers[globalIdx] === opt) radio.checked = true;
      radio.addEventListener("change", () => {
        answers[globalIdx] = opt;
        updateNav();
      });

      const span = document.createElement("span");
      span.textContent = opt;

      label.appendChild(radio);
      label.appendChild(span);
      list.appendChild(label);
    });

    return list;
  }

  function buildFillIn(question, globalIdx) {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "fill-in-input";
    input.placeholder = "Type your answer\u2026";
    input.disabled = examFinished;
    input.value = answers[globalIdx] || "";
    input.addEventListener("input", () => {
      answers[globalIdx] = input.value;
      updateNav();
    });
    return input;
  }

  function buildMatching(question, globalIdx) {
    const container = document.createElement("div");
    const stored = answers[globalIdx] ? JSON.parse(answers[globalIdx]) : {};

    (question.options || []).forEach((opt, i) => {
      const row = document.createElement("div");
      row.className = "matching-row";

      const label = document.createElement("span");
      label.textContent = `${i + 1}.`;
      label.style.fontWeight = "600";

      const select = document.createElement("select");
      select.disabled = examFinished;

      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "-- Select --";
      select.appendChild(placeholder);

      (question.options || []).forEach((o) => {
        const option = document.createElement("option");
        option.value = o;
        option.textContent = o;
        if (stored[i] === o) option.selected = true;
        select.appendChild(option);
      });

      select.addEventListener("change", () => {
        const current = answers[globalIdx] ? JSON.parse(answers[globalIdx]) : {};
        current[i] = select.value;
        answers[globalIdx] = JSON.stringify(current);
        updateNav();
      });

      row.appendChild(label);
      row.appendChild(select);
      container.appendChild(row);
    });

    return container;
  }

  // ---- SAVE CURRENT ----

  function saveCurrentAnswer() {
    /* Answers are saved live via event listeners, but fill-in needs a final capture */
    const fillIn = document.querySelector("#question-panel .fill-in-input");
    if (fillIn) {
      answers[currentQIdx] = fillIn.value;
    }
  }

  // ---- FINISH EXAM ----

  function finishExam() {
    if (examFinished) return;
    examFinished = true;
    saveCurrentAnswer();
    stopTimer();

    // Disable all inputs
    $$("#question-panel input, #question-panel select").forEach((el) => {
      el.disabled = true;
    });

    renderResults();
    showScreen("results");
  }

  // ---- RESULTS ----

  function renderResults() {
    let correct = 0;

    const review = $("#results-review");
    review.innerHTML = "";

    flatQuestions.forEach((item, i) => {
      const q = item.question;
      const userAnswer = answers[i] || "(no answer)";
      const isCorrect = normalizeAnswer(userAnswer) === normalizeAnswer(q.correctAnswer);

      if (isCorrect) correct++;

      const card = document.createElement("div");
      card.className = `review-card ${isCorrect ? "correct" : "incorrect"}`;

      card.innerHTML = `
        <div class="review-q">Q${i + 1}: ${escapeHTML(q.question)}</div>
        <div class="review-detail">Your answer: <span>${escapeHTML(userAnswer)}</span></div>
        <div class="review-detail">Correct answer: <span>${escapeHTML(q.correctAnswer)}</span></div>
        <div class="review-detail">${isCorrect ? "\u2705 Correct" : "\u274c Incorrect"}</div>
        <div class="review-explanation">${escapeHTML(q.explanation || "")}</div>
      `;

      review.appendChild(card);
    });

    const total = flatQuestions.length;
    $("#score-banner").textContent = `${correct} / ${total}`;
  }

  function normalizeAnswer(val) {
    if (!val) return "";
    return val.toString().trim().toLowerCase();
  }

  function escapeHTML(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // ---- WEAKNESS ANALYSIS ----

  function renderWeakness() {
    const categories = {};

    flatQuestions.forEach((item, i) => {
      const q = item.question;
      const cat = q.category || "unknown";
      if (!categories[cat]) categories[cat] = { total: 0, wrong: 0 };
      categories[cat].total++;

      const userAnswer = answers[i] || "";
      if (normalizeAnswer(userAnswer) !== normalizeAnswer(q.correctAnswer)) {
        categories[cat].wrong++;
      }
    });

    const container = $("#weakness-summary");
    container.innerHTML = "";

    const struggles = [];

    Object.entries(categories)
      .sort((a, b) => b[1].wrong / b[1].total - a[1].wrong / a[1].total)
      .forEach(([cat, data]) => {
        const pct = Math.round(((data.total - data.wrong) / data.total) * 100);
        const isStruggle = data.wrong / data.total > 0.5;

        if (isStruggle) struggles.push(cat);

        const row = document.createElement("div");
        row.className = `weakness-row ${isStruggle ? "struggle" : "strong"}`;
        row.innerHTML = `
          <span class="category-name">${escapeHTML(cat)}</span>
          <span class="category-score">${data.total - data.wrong}/${data.total} (${pct}%)</span>
        `;
        container.appendChild(row);
      });

    if (struggles.length > 0) {
      const msg = document.createElement("div");
      msg.className = "weakness-message";
      msg.textContent = `Je hebt moeite met: ${struggles.join(", ")}. Oefen meer op ${struggles.length === 1 ? "dit onderwerp" : "deze onderwerpen"}.`;
      container.insertBefore(msg, container.firstChild);
    }
  }

  // ---- RESET ----

  function resetExam() {
    answers = {};
    currentQIdx = 0;
    examFinished = false;
    stopTimer();
    if (allExams.length > 1) {
      showScreen("select");
    } else {
      showScreen("start");
    }
  }

  // ---- EVENT LISTENERS ----

  function bindEvents() {
    $("#btn-start").addEventListener("click", () => {
      if (!examData || flatQuestions.length === 0) return;
      showScreen("exam");
      renderNav();
      goToQuestion(0);
      startTimer();
    });

    $("#btn-finish").addEventListener("click", () => {
      if (confirm("Weet u zeker dat u het examen wilt afronden?")) {
        finishExam();
      }
    });

    $("#btn-to-weakness").addEventListener("click", () => {
      renderWeakness();
      showScreen("weakness");
    });

    $("#btn-retake").addEventListener("click", () => {
      resetExam();
    });

    $("#btn-back").addEventListener("click", () => {
      if (allExams.length > 1) {
        showScreen("select");
      }
    });
  }

  // ---- INIT ----

  function init() {
    bindEvents();
    loadExam();
  }

  init();
})();
