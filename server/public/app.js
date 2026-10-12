const state = { user: null, token: localStorage.getItem("interviewiq_token"), companies: [], company: "", questions: [], questionPage: 1, questionTotal: 0, experiences: [], attempts: [], ai: {}, currentQuestion: null, editor: null, timerStart: null, attemptsDone: 0, runnerLanguages: [] };
const $ = (s, root = document) => root.querySelector(s);
const esc = (value = "") => String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const dateLabel = (date) => new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const exactDate = (date) => {
  if (!date) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(date))) return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  return new Date(date).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
};
function sourcePlatform(question) { return question.sourceLinks?.[0]?.platform || question.sourcePlatform || question.source || "InterviewIQ"; }
function sourceLogoUrl(question) {
  const platform = sourcePlatform(question).toLowerCase();
  const icon = platform.includes("leetcode") ? "leetcode/FFA116" : platform.includes("codechef") ? "codechef/5B4638" : platform.includes("geeksforgeeks") || platform.includes("geeks for geeks") ? "geeksforgeeks/2F8D46" : platform.includes("reddit") ? "reddit/FF4500" : platform.includes("gemini") || platform.includes("gemma") ? "google/4285F4" : platform === "x" || platform.includes("twitter") ? "x/FFFFFF" : "";
  if (icon) return `https://cdn.simpleicons.org/${icon}`;
  const url = question.sourceLinks?.[0]?.url || question.sourceUrl;
  try { return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(new URL(url).hostname)}&sz=64`; } catch { return ""; }
}
function sourceInfo(question) {
  const source = question.sourceLinks?.find((item) => item.askedAt || item.postedAt) || question.sourceLinks?.[0] || {};
  const logo = sourceLogoUrl(question);
  const posted = question.sourceAskedAt || source.askedAt || question.sourcePostedAt || source.postedAt;
  const date = posted ? ` · ${source.askedAt || question.sourceAskedAt ? "Asked" : "Posted"} ${exactDate(posted)}` : (source.url || question.sourceUrl) ? " · Source date not listed" : question.createdAt ? ` · Generated ${exactDate(question.createdAt)}` : "";
  return `<span class="source-mark">${logo ? `<img class="source-logo" src="${esc(logo)}" alt="" loading="lazy">` : ""}${esc(sourcePlatform(question))}${esc(date)}</span>`;
}
const api = async (url, options = {}) => {
  const response = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}), ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { if (response.status === 401 && state.token) logout(false); throw new Error(data.message || "Request failed."); }
  return data;
};
function toast(message) { const el = $("#toast"); el.textContent = message; el.classList.add("show"); clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove("show"), 3000); }
function setView(view) { document.querySelectorAll(".nav-item").forEach((n) => n.classList.toggle("active", n.dataset.view === view)); $("#crumb").textContent = ({ home: "Overview", questions: "Question bank", experiences: "Experiences", editor: "Practice" })[view] || "Overview"; if (view === "home") renderHome(); if (view === "questions") renderQuestions(); if (view === "experiences") renderExperiences(); }
async function loadBase() {
  try {
    const data = await api("/api/companies"); state.companies = data.companies || []; state.ai = data.ai || {};
    if (state.token) { try { const me = await api("/api/auth/me"); state.user = me.user; } catch { state.user = null; } }
    renderProfile(); renderTargets(); renderHome();
  } catch (e) { $("#page-content").innerHTML = `<div class="empty-state"><strong>Could not connect to InterviewIQ</strong>${esc(e.message)}<br><br>Make sure the API and MongoDB are running.</div>`; }
}
function renderProfile() { const name = state.user?.name || "Guest learner"; const initial = state.user?.name?.[0]?.toUpperCase() || "G"; $("#profile-name").textContent = name; $("#profile-plan").textContent = state.user ? (state.user.role === "admin" ? "Workspace admin" : "Free workspace") : "Sign in to save progress"; $("#avatar").textContent = initial; $("#top-avatar").textContent = initial; }
function renderTargets() { $("#target-list").innerHTML = state.companies.slice(0, 8).map((c) => `<button class="target-item ${state.company === c.name ? "selected" : ""}" data-company="${esc(c.name)}"><span class="company-dot" style="color:${esc(c.color)}">${esc(c.mark)}</span>${esc(c.name)}<span class="target-count">${c.questions}</span></button>`).join(""); }
function companyCards() { return state.companies.map((c) => `<article class="company-card" data-open-company="${esc(c.name)}"><div class="company-card-top"><span class="company-mark" style="color:${esc(c.color)}">${esc(c.mark)}</span><span class="company-arrow">↗</span></div><h3>${esc(c.name)}</h3><p>${esc(c.focus)}</p><div class="company-stats"><span><b>${c.questions}</b> questions</span><span><b>${c.experiences}</b> stories</span></div></article>`).join(""); }
async function renderHome() {
  const [attemptData, experienceData] = await Promise.allSettled([state.user ? api("/api/attempts") : Promise.resolve(null), api("/api/experiences")]);
  state.attempts = attemptData?.status === "fulfilled" && attemptData.value ? attemptData.value.attempts : [];
  const stats = attemptData?.status === "fulfilled" && attemptData.value ? attemptData.value.stats : { solved: 0, streak: 0, experiences: 0 };
  const stories = experienceData?.status === "fulfilled" ? experienceData.value.experiences : [];
  const today = new Date(); $("#today-label").textContent = today.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }).toUpperCase();
  $("#page-content").innerHTML = `<div class="hero-row"><div><div class="welcome-line"><span class="welcome-dot"></span>${state.user ? `Welcome back, ${esc(state.user.name.split(" ")[0])}` : "A better way to prepare"}</div><h1 class="hero-title">Practice with <em>intent.</em></h1><p class="hero-copy">Know what to expect. Find the patterns. Walk in ready.</p></div><div class="hero-actions"><button class="button subtle" id="share-experience">＋ Share experience</button><button class="button primary" id="start-practice">Start practicing <span>↗</span></button></div></div>
  <section class="stats-grid"><div class="stat-card"><div class="stat-head">QUESTIONS SOLVED <span class="stat-icon">◈</span></div><div class="stat-num">${stats.solved}<span class="stat-note">${state.user ? "saved to your profile" : "sign in to track"}</span></div></div><div class="stat-card"><div class="stat-head">PRACTICE STREAK <span class="stat-icon">↗</span></div><div class="stat-num">${stats.streak}<span class="stat-note">days in a row</span></div></div><div class="stat-card"><div class="stat-head">INTERVIEW STORIES <span class="stat-icon">▤</span></div><div class="stat-num">${state.companies.reduce((n, c) => n + c.experiences, 0)}<span class="stat-note">from the community</span></div></div><div class="stat-card"><div class="stat-head">TARGET COMPANIES <span class="stat-icon">◎</span></div><div class="stat-num">${state.companies.length}<span class="stat-note">and growing</span></div></div></section>
  <div class="section-heading"><div><h2>Choose your next move</h2><p>Practice with focused company guides, built from real candidate stories.</p></div><button class="link-button" data-view="questions">Explore all companies →</button></div>
  <section class="companies-grid">${companyCards()}</section><section class="lower-grid"><div class="panel"><h3 class="panel-title">Recent practice</h3><p class="panel-subtitle">Your latest sessions, all in one place.</p>${state.attempts.length ? state.attempts.slice(0, 3).map((a) => `<div class="focus-row"><span class="focus-number">✓</span><span class="focus-text">${esc(a.title)}<small>${esc(a.company)} · ${dateLabel(a.createdAt)}</small></span><button class="link-button" data-view="questions">Practice again</button></div>`).join("") : `<div class="activity-empty"><div><span>◌</span>${state.user ? "Your first solved question starts here." : "Sign in to keep your practice history."}</div></div>`}</div><div class="panel"><h3 class="panel-title">From the community</h3><p class="panel-subtitle">Candidate-shared interview experiences.</p>${stories.length ? stories.slice(0, 3).map((e) => `<div class="focus-row"><span class="focus-number">${esc(e.company[0])}</span><span class="focus-text">${esc(e.company)} · ${esc(e.role)}<small>${e.rounds.length} rounds · shared by ${esc(e.author?.name || "Candidate")}</small></span></div>`).join("") : `<div class="activity-empty"><div><span>▤</span>Real experiences help everyone prepare better.</div></div>`}<button class="link-button" data-view="experiences">Browse experiences →</button></div></section>`;
  bindPage();
}
function renderQuestions() {
  const allCompanies = ["All companies", ...new Set(state.companies.map((c) => c.name))];
  $("#page-content").innerHTML = `<div class="page-title-row"><div><div class="eyebrow">THE PRACTICE LIBRARY</div><h1 class="page-title">Question bank</h1><p class="page-description">A focused question set for the interviews you care about.</p></div><button class="button primary" id="generate-open">✳ Generate with AI</button></div><div class="filter-bar"><div class="search-box"><span>⌕</span><input id="question-search" placeholder="Search questions, topics, companies…"></div><select class="select-field" id="difficulty-filter"><option value="">All difficulty</option><option>Easy</option><option>Medium</option><option>Hard</option></select><span class="ai-pill">✳ ${state.ai.available ? `${esc(state.ai.provider)} connected` : "Add AI key"}</span></div><div class="question-layout"><aside class="company-filter"><h3>COMPANY</h3>${allCompanies.map((c) => `<button class="${(state.company || "All companies") === c ? "selected" : ""}" data-filter-company="${esc(c)}">${esc(c)} <span>${c === "All companies" ? "" : state.companies.find((x) => x.name === c)?.questions || 0}</span></button>`).join("")}</aside><div class="question-list" id="question-list"><div class="skeleton"></div><div class="skeleton"></div></div></div>`;
  if (state.user?.role === "admin") {
    const importButton = document.createElement("button");
    importButton.className = "button subtle small"; importButton.textContent = "Import licensed dataset";
    importButton.addEventListener("click", openImportModal); $("#generate-open").before(importButton);
  }
  bindPage(); loadQuestions();
}
async function loadQuestions() {
  try {
    const params = new URLSearchParams(); if (state.company) params.set("company", state.company); const difficulty = $("#difficulty-filter")?.value; if (difficulty) params.set("difficulty", difficulty); const q = $("#question-search")?.value.trim(); if (q) params.set("search", q); params.set("page", "1");
    const data = await api(`/api/questions?${params}`); state.questions = data.questions || [];
    state.questionPage = 1; state.questionTotal = data.total || state.questions.length;
    const list = $("#question-list"); if (!list) return;
    list.innerHTML = state.questions.length ? state.questions.map((q) => `<article class="question-card" data-question-id="${esc(q._id)}"><div class="question-card-top"><span class="tag ${q.difficulty.toLowerCase()}">${esc(q.difficulty)}</span><span class="tag">${esc(q.topic)}</span>${(q.companyTags?.length ? q.companyTags : [q.company]).slice(0, 3).map((company) => `<span class="tag">${esc(company)}</span>`).join("")}</div><h3>${esc(q.title)}</h3><p>${esc(q.prompt.slice(0, 155))}${q.prompt.length > 155 ? "…" : ""}</p><div class="question-foot"><span>${esc(q.round || "Technical")}</span><span>${esc(q.sourcePlatform || "Community")}</span><span class="source-mark">${q.sourceLinks?.length ? `${q.sourceLinks.length} source${q.sourceLinks.length === 1 ? "" : "s"}` : q.isGenerated ? "✳ Original AI practice" : esc(q.source || "Community")}</span></div></article>`).join("") : `<div class="empty-state"><strong>No questions yet</strong>${state.company ? `Generate an original practice set for ${esc(state.company)} to get started.` : "Choose a company and generate an original set tailored to your interview."}<br><br><button class="button primary small" id="empty-generate">✳ Generate practice</button></div>`;
    state.questions.forEach((question, index) => {
      const card = list.children[index];
      if (!card) return;
      const sourceMark = card.querySelector(".source-mark"); if (sourceMark) sourceMark.outerHTML = sourceInfo(question);
      card.querySelector(".question-foot > span:nth-child(2)")?.remove();
      card.addEventListener("click", () => openEditor(question));
      if (question.sourceLinks?.length) {
        const sources = document.createElement("div"); sources.className = "question-source-links";
        for (const source of question.sourceLinks.slice(0, 4)) {
          const link = document.createElement("a"); link.href = source.url; link.target = "_blank"; link.rel = "noopener noreferrer";
          link.textContent = `${source.platform} · ${source.license || "Source"} ↗`; link.addEventListener("click", (event) => event.stopPropagation()); sources.append(link);
        }
        card.append(sources);
      }
    });
    if (state.questionTotal > state.questions.length) {
      const more = document.createElement("button"); more.className = "button subtle small question-load-more"; more.id = "load-more-questions";
      more.textContent = `Load more · ${state.questions.length} of ${state.questionTotal}`; more.onclick = loadMoreQuestions; list.append(more);
    }
    $("#empty-generate")?.addEventListener("click", openGenerateModal);
  } catch (e) { const list = $("#question-list"); if (list) list.innerHTML = `<div class="empty-state">${esc(e.message)}</div>`; }
}
async function loadMoreQuestions() {
  const button = $("#load-more-questions"); if (!button) return; button.disabled = true; button.textContent = "Loading…";
  try {
    const params = new URLSearchParams({ page: String(state.questionPage + 1) });
    if (state.company) params.set("company", state.company);
    const difficulty = $("#difficulty-filter")?.value; if (difficulty) params.set("difficulty", difficulty);
    const term = $("#question-search")?.value.trim(); if (term) params.set("search", term);
    const data = await api(`/api/questions?${params}`); const list = $("#question-list");
    const questions = data.questions || []; state.questionPage += 1; state.questions.push(...questions);
    const html = questions.map((q) => `<article class="question-card" data-question-id="${esc(q._id)}"><div class="question-card-top"><span class="tag ${q.difficulty.toLowerCase()}">${esc(q.difficulty)}</span><span class="tag">${esc(q.topic)}</span>${(q.companyTags?.length ? q.companyTags : [q.company]).slice(0, 3).map((company) => `<span class="tag">${esc(company)}</span>`).join("")}</div><h3>${esc(q.title)}</h3><p>${esc(q.prompt.slice(0, 155))}${q.prompt.length > 155 ? "…" : ""}</p><div class="question-foot"><span>${esc(q.round || "Technical")}</span><span>${esc(q.sourcePlatform || "Community")}</span><span class="source-mark">${q.sourceLinks?.length ? `${q.sourceLinks.length} source${q.sourceLinks.length === 1 ? "" : "s"}` : q.isGenerated ? "✳ Original AI practice" : esc(q.source || "Community")}</span></div></article>`).join("");
    button.insertAdjacentHTML("beforebegin", html);
    questions.forEach((question, index) => {
      const card = list.children[list.children.length - questions.length - 1 + index]; if (!card) return;
      const sourceMark = card.querySelector(".source-mark"); if (sourceMark) sourceMark.outerHTML = sourceInfo(question);
      card.querySelector(".question-foot > span:nth-child(2)")?.remove();
      card.addEventListener("click", () => openEditor(question));
      for (const source of (question.sourceLinks || []).slice(0, 4)) { const link = document.createElement("a"); link.href = source.url; link.target = "_blank"; link.rel = "noopener noreferrer"; link.textContent = `${source.platform} · ${source.license || "Source"} ↗`; link.addEventListener("click", (event) => event.stopPropagation()); let box = card.querySelector(".question-source-links"); if (!box) { box = document.createElement("div"); box.className = "question-source-links"; card.append(box); } box.append(link); }
    });
    if (state.questions.length >= state.questionTotal) button.remove(); else { button.disabled = false; button.textContent = `Load more · ${state.questions.length} of ${state.questionTotal}`; }
  } catch (error) { button.disabled = false; button.textContent = error.message || "Try loading more"; }
}
async function renderExperiences() {
  $("#page-content").innerHTML = `<div class="page-title-row"><div><div class="eyebrow">CANDIDATES HELP CANDIDATES</div><h1 class="page-title">Interview experiences</h1><p class="page-description">Community-shared stories plus live public-source research.</p></div><button class="button primary" id="share-experience">＋ Share your experience</button></div><div class="filter-bar"><select class="select-field" id="experience-company"><option value="">All companies</option>${state.companies.map((c) => `<option ${state.company === c.name ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select><button class="button subtle small" id="research-company">✳ Find Reddit / X reports</button><span class="auth-note">Community stories are reviewed before they appear publicly.</span></div><div id="research-results"></div><div class="experience-list" id="experience-list"><div class="skeleton"></div><div class="skeleton"></div></div>`;
  bindPage(); await loadExperiences();
}
async function loadExperiences() {
  const company = $("#experience-company")?.value || state.company; const params = company ? `?company=${encodeURIComponent(company)}` : "";
  try { const data = await api(`/api/experiences${params}`); state.experiences = data.experiences || []; const list = $("#experience-list"); if (!list) return;
    list.innerHTML = state.experiences.length ? state.experiences.map((e) => `<article class="experience-card"><div class="experience-header"><div><h3>${esc(e.company)} · ${esc(e.role)}</h3><p>${esc(e.level || "Role level not specified")} · Shared by ${esc(e.author?.name || "Candidate")} · ${dateLabel(e.createdAt)}</p></div>${e.sourceUrl ? `<a class="link-button" href="${esc(e.sourceUrl)}" target="_blank" rel="noopener noreferrer">Source ↗</a>` : ""}</div><div class="round-list">${e.rounds.map((r) => `<div class="round-chip"><b>${esc(r.name)}</b><small>${esc(r.details || r.questions.join(" · ") || "Round details shared by candidate")}</small></div>`).join("")}</div>${e.tips ? `<p class="page-description" style="margin-top:12px">${esc(e.tips)}</p>` : ""}</article>`).join("") : `<div class="empty-state"><strong>No stories here yet</strong>Be the first to share a first-hand experience. It helps the next candidate walk in prepared.<br><br><button class="button primary small" id="empty-share">Share an experience</button></div>`;
    state.experiences.forEach((experience, index) => {
      const card = list.children[index]; if (!card) return;
      const meta = [experience.location, experience.workMode, experience.overallDurationDays ? `${experience.overallDurationDays} day process` : "", experience.outcome && experience.outcome !== "not-shared" ? `Outcome: ${experience.outcome}` : "", experience.difficultyRating ? `Difficulty ${experience.difficultyRating}/5` : "", experience.wouldRecommend ? "Would recommend" : ""].filter(Boolean);
      if (meta.length) card.insertAdjacentHTML("beforeend", `<div class="experience-facets">${meta.map((item) => `<span class="tag">${esc(item)}</span>`).join("")}</div>`);
      if (experience.processSummary) card.insertAdjacentHTML("beforeend", `<p class="experience-summary"><b>Process</b> ${esc(experience.processSummary)}</p>`);
      if (experience.preparation) card.insertAdjacentHTML("beforeend", `<p class="experience-summary"><b>Preparation</b> ${esc(experience.preparation)}</p>`);
      card.querySelectorAll(".round-chip").forEach((roundCard, roundIndex) => {
        const round = experience.rounds[roundIndex]; const facets = [round.format, round.durationMinutes ? `${round.durationMinutes} min` : "", ...(round.topics || []), round.result && round.result !== "not-shared" ? round.result : ""].filter(Boolean);
        if (facets.length) roundCard.insertAdjacentHTML("beforeend", `<div class="experience-facets">${facets.map((item) => `<span class="tag">${esc(item)}</span>`).join("")}</div>`);
        if (round.questions?.length) roundCard.insertAdjacentHTML("beforeend", `<ul class="experience-questions">${round.questions.map((question) => `<li>${esc(question)}</li>`).join("")}</ul>`);
      });
    });
    $("#empty-share")?.addEventListener("click", openExperienceModal);
  } catch (e) { const list = $("#experience-list"); if (list) list.innerHTML = `<div class="empty-state">${esc(e.message)}</div>`; }
}
function bindPage() {
  document.querySelectorAll("[data-view]").forEach((el) => el.addEventListener("click", () => setView(el.dataset.view)));
  document.querySelectorAll("[data-open-company]").forEach((el) => el.addEventListener("click", () => { state.company = el.dataset.openCompany; setView("questions"); }));
  document.querySelectorAll("[data-company]").forEach((el) => el.addEventListener("click", () => { state.company = el.dataset.company; renderTargets(); setView("questions"); }));
  document.querySelectorAll("[data-filter-company]").forEach((el) => el.addEventListener("click", () => { state.company = el.dataset.filterCompany === "All companies" ? "" : el.dataset.filterCompany; renderQuestions(); }));
  $("#start-practice")?.addEventListener("click", () => setView("questions")); $("#share-experience")?.addEventListener("click", openExperienceModal); $("#generate-open")?.addEventListener("click", openGenerateModal);
  $("#research-company")?.addEventListener("click", runCompanyResearch);
  $("#question-search")?.addEventListener("input", debounce(loadQuestions, 300)); $("#difficulty-filter")?.addEventListener("change", loadQuestions); $("#experience-company")?.addEventListener("change", loadExperiences);
  document.querySelectorAll("[data-question-id]").forEach((el) => el.addEventListener("click", () => openEditor(state.questions.find((q) => q._id === el.dataset.questionId))));
}
function debounce(fn, delay) { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); }; }
async function runCompanyResearch() {
  if (!state.user) return openAuth("login");
  const company = $("#experience-company")?.value || state.company;
  if (!company) return toast("Choose a company first.");
  const button = $("#research-company"); const panel = $("#research-results");
  button.disabled = true; button.textContent = "Searching public sources…";
  panel.innerHTML = `<div class="panel research-panel"><div class="skeleton"></div><p class="auth-note">Gemini is searching public interview reports and linking the sources it used.</p></div>`;
  try {
    const result = await api("/api/research/company", { method: "POST", body: JSON.stringify({ company }) });
    panel.innerHTML = `<section class="panel research-panel"><div class="eyebrow">GEMINI · LIVE PUBLIC WEB RESEARCH</div><h2>${esc(company)} interview reports <span class="tag">${result.sources.length} linked sources</span></h2><div class="research-summary">${esc(result.text).replace(/\n/g, "<br>")}</div><div class="research-sources">${result.sources.map((source, i) => `<a class="link-button" href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${i + 1}. ${esc(source.title)} ↗</a>`).join("") || `<span class="auth-note">No citation links were returned. Try again shortly.</span>`}</div><p class="auth-note">${esc(result.disclaimer || "Public reports are not official company guidance.")} Findings are temporary; open source links to read the original posts.</p><button class="button primary small" id="research-generate">Generate original practice questions →</button></section>`;
    $("#research-generate")?.addEventListener("click", () => { state.company = company; openGenerateModal(); });
  } catch (error) { panel.innerHTML = `<div class="empty-state">${esc(error.message)}</div>`; }
  finally { button.disabled = false; button.textContent = "✳ Find Reddit / X reports"; }
}
function openAuth(mode = "login") {
  const root = $("#modal-root"); const register = mode === "register";
  root.innerHTML = `<div class="modal-backdrop"><section class="modal"><button class="modal-close" aria-label="Close">×</button><div class="eyebrow">YOUR PREP, SAVED</div><h2>${register ? "Create your workspace" : "Welcome back"}</h2><p>${register ? "Save your progress and contribute to the community." : "Sign in to continue your preparation."}</p><form id="auth-form">${register ? `<div class="form-field"><label>Name</label><input name="name" autocomplete="name" required minlength="2" maxlength="80" placeholder="Your name"></div>` : ""}<div class="form-field"><label>Email</label><input name="email" autocomplete="email" type="email" required placeholder="you@example.com"></div><div class="form-field"><label>Password</label><input name="password" autocomplete="${register ? "new-password" : "current-password"}" type="password" minlength="8" required placeholder="At least 8 characters"></div><div class="form-error" id="form-error"></div><div class="modal-footer"><button class="modal-switch" type="button" id="auth-switch">${register ? "Already have an account? Sign in" : "New to InterviewIQ? Create an account"}</button><button class="button primary" type="submit">${register ? "Create account" : "Sign in"}</button></div></form><p class="auth-note">Your password is securely hashed. Your code stays private.</p></section></div>`;
  $(".modal-close", root).onclick = closeModal; $(".modal-backdrop", root).addEventListener("click", (e) => { if (e.target.classList.contains("modal-backdrop")) closeModal(); }); $("#auth-switch", root).onclick = () => openAuth(register ? "login" : "register");
  $("#auth-form", root).onsubmit = async (e) => { e.preventDefault(); const form = new FormData(e.currentTarget); const button = $("button[type=submit]", e.currentTarget); button.disabled = true; try { const data = await api(`/api/auth/${register ? "register" : "login"}`, { method: "POST", body: JSON.stringify(Object.fromEntries(form)) }); state.token = data.token; state.user = data.user; localStorage.setItem("interviewiq_token", data.token); closeModal(); renderProfile(); toast(register ? "Your workspace is ready." : "Welcome back."); loadBase(); } catch (err) { $("#form-error", root).textContent = err.message; button.disabled = false; } };
}
function logout(show = true) { localStorage.removeItem("interviewiq_token"); state.token = null; state.user = null; renderProfile(); if (show) toast("You have signed out."); }
function closeModal() { $("#modal-root").innerHTML = ""; }
function openGenerateModal() {
  if (!state.user) return openAuth("login");
  const options = state.companies.map((c) => `<option ${state.company === c.name ? "selected" : ""}>${esc(c.name)}</option>`).join("");
  $("#modal-root").innerHTML = `<div class="modal-backdrop"><section class="modal"><button class="modal-close">×</button><div class="eyebrow">✳ AI PRACTICE BUILDER</div><h2>Make a focused set.</h2><p>Build this company catalog toward 100 original, deduplicated practice questions. This runs in several Gemini batches and may take a minute.</p><form id="generate-form"><div class="form-grid"><div class="form-field"><label>Company</label><input name="company" list="companies" value="${esc(state.company)}" placeholder="e.g. Google" required><datalist id="companies">${options}</datalist></div><div class="form-field"><label>Role</label><input name="role" value="Software Engineer" maxlength="100"></div></div><div class="form-grid"><div class="form-field"><label>Topic</label><select name="topic"><option>Algorithms</option><option>Data structures</option><option>System design</option><option>JavaScript</option><option>Behavioral</option><option>SQL</option></select></div><div class="form-field"><label>Difficulty</label><select name="difficulty"><option>Medium</option><option>Easy</option><option>Hard</option></select></div></div><div class="form-grid"><div class="form-field"><label>Build company catalog to</label><select name="count"><option>100</option><option>75</option><option>50</option><option>25</option></select></div><div class="form-field"><label>Model</label><select name="model"><option value="default">${esc(state.ai.provider === "Gemma" ? "Configured model" : "Gemini")}</option>${state.ai.gemmaAvailable ? `<option value="gemma">Gemma 4</option>` : ""}</select></div></div><div class="form-error" id="form-error"></div><div class="modal-footer"><span class="auth-note">✳ ${state.ai.gemmaAvailable ? "Gemini & Gemma 4 connected" : "Gemini API connected"}</span><button class="button primary" type="submit">Build catalog →</button></div></form><p class="auth-note">Generated questions are original practice material, not verified company interview questions.</p></section></div>`;
  $(".modal-close").onclick = closeModal; $(".modal-backdrop").addEventListener("click", (e) => { if (e.target.classList.contains("modal-backdrop")) closeModal(); });
  $("#generate-form").onsubmit = async (e) => { e.preventDefault(); const form = Object.fromEntries(new FormData(e.currentTarget)); const btn = $("button[type=submit]", e.currentTarget); btn.disabled = true; btn.textContent = "Building company catalog…"; $("#form-error").textContent = "";
    try { const result = await api("/api/questions/generate", { method: "POST", body: JSON.stringify(form) }); state.company = form.company; closeModal(); await loadBase(); setView("questions"); toast(`Catalog: ${result.currentCount} of ${result.target} questions${result.remaining ? ` · ${result.remaining} still needed` : " ready"}.`); }
    catch (err) { $("#form-error").textContent = err.message; btn.disabled = false; btn.textContent = "Build catalog →"; }
  };
}
function openImportModal() {
  if (state.user?.role !== "admin") return toast("Admin access is required.");
  $("#modal-root").innerHTML = `<div class="modal-backdrop"><section class="modal"><button class="modal-close">×</button><div class="eyebrow">CURATED DATASET IMPORT</div><h2>Import an authorized source.</h2><p>Use the JSON template to import content you own, have licensed for redistribution, or have written permission to republish. This importer does not crawl third-party sites.</p><form id="import-form"><div class="form-grid"><div class="form-field"><label>Source / platform</label><input name="platform" required maxlength="80" placeholder="e.g. CC-licensed dataset"></div><div class="form-field"><label>License name</label><input name="licenseName" required maxlength="160" placeholder="e.g. CC BY 4.0"></div></div><div class="form-grid"><div class="form-field"><label>License URL</label><input name="licenseUrl" type="url" placeholder="https://…"></div><div class="form-field"><label>Terms URL (optional)</label><input name="termsUrl" type="url" placeholder="https://…"></div></div><div class="form-field"><label>Written permission reference (if no public license URL)</label><input name="permissionReference" maxlength="300" placeholder="Agreement ID, contact, or permission record"></div><div class="form-field"><label>Question dataset JSON</label><input id="import-file" type="file" accept="application/json,.json" required></div><p class="auth-note">Up to 250 questions / 5 MB. Questions are matched by normalized text and source URL. Near-duplicates are skipped for review.</p><a class="link-button" href="/question-import-template.json" download>Download JSON template ↗</a><div class="form-error" id="form-error"></div><div class="modal-footer"><span class="auth-note">Source and license are saved on every record</span><button class="button primary" type="submit">Import dataset</button></div></form></section></div>`;
  $(".modal-close").onclick = closeModal;
  $(".modal-backdrop").addEventListener("click", (event) => { if (event.target.classList.contains("modal-backdrop")) closeModal(); });
  $("#import-file").closest(".form-field").insertAdjacentHTML("afterend", `<label class="auth-note" style="display:flex;align-items:flex-start;gap:8px;margin:10px 0"><input name="rightsConfirmed" type="checkbox" required> I confirm that I have the right to redistribute this dataset, and it was not obtained through prohibited scraping or access.</label>`);
  $("#import-form").onsubmit = async (event) => {
    event.preventDefault(); const form = event.currentTarget; const file = $("#import-file").files?.[0]; const error = $("#form-error"); const button = $("button[type=submit]", form);
    if (!file || file.size > 5 * 1024 * 1024) { error.textContent = "Choose a JSON file under 5 MB."; return; }
    let data; try { data = JSON.parse(await file.text()); } catch { error.textContent = "The file is not valid JSON."; return; }
    if (!Array.isArray(data.questions)) { error.textContent = "The JSON file needs a questions array. Use the sample template."; return; }
    const values = Object.fromEntries(new FormData(form)); button.disabled = true; button.textContent = "Importing…"; error.textContent = "";
    try {
      const result = await api("/api/admin/import/questions", { method: "POST", body: JSON.stringify({
        source: { ...data.source, platform: values.platform, termsUrl: values.termsUrl || data.source?.termsUrl },
        rights: { licenseName: values.licenseName, licenseUrl: values.licenseUrl || data.rights?.licenseUrl, permissionReference: values.permissionReference || data.rights?.permissionReference, confirmed: values.rightsConfirmed === "on" },
        questions: data.questions,
      }) });
      const s = result.summary; closeModal(); toast(`Imported ${s.imported}; merged ${s.merged}; flagged ${s.review}; invalid ${s.invalid}.`); await loadBase(); setView("questions");
      if (s.review || s.invalid) showImportReview(result.results);
    } catch (err) { error.textContent = err.message; button.disabled = false; button.textContent = "Import dataset"; }
  };
}
function showImportReview(results) {
  const flagged = results.filter((item) => item.status === "review" || item.status === "invalid");
  $("#modal-root").innerHTML = `<div class="modal-backdrop"><section class="modal"><button class="modal-close">×</button><div class="eyebrow">IMPORT REVIEW</div><h2>Review skipped rows.</h2><p>Possible duplicates were not added automatically. Compare the source and existing question before importing a distinct problem.</p>${flagged.slice(0, 30).map((item) => `<article class="experience-card"><b>${esc(item.title)}</b><p>${item.status === "review" ? `Possible match: ${item.possibleDuplicates.map((match) => `${esc(match.title)} (${Math.round(match.similarity * 100)}% similar)`).join(" · ")}` : esc(item.reason)}</p></article>`).join("")}</section></div>`;
  $(".modal-close").onclick = closeModal; $(".modal-backdrop").addEventListener("click", (event) => { if (event.target.classList.contains("modal-backdrop")) closeModal(); });
}

function openExperienceModal() {
  if (!state.user) return openAuth("login");
  $("#modal-root").innerHTML = `<div class="modal-backdrop"><section class="modal"><button class="modal-close">×</button><div class="eyebrow">PASS IT FORWARD</div><h2>Share your experience.</h2><p>Only share details you have permission to disclose. Please don't include confidential company material.</p><form id="experience-form"><div class="form-grid"><div class="form-field"><label>Company</label><input name="company" required maxlength="100" value="${esc(state.company)}" placeholder="e.g. Acme"></div><div class="form-field"><label>Role</label><input name="role" required maxlength="120" placeholder="e.g. Backend Engineer"></div></div><div class="form-grid"><div class="form-field"><label>Experience level</label><select name="level"><option>Entry-level</option><option>Mid-level</option><option>Senior</option><option>Internship</option><option>Not specified</option></select></div><div class="form-field"><label>Interview date</label><input name="interviewDate" type="date"></div></div><div id="rounds"><div class="round-editor"><div class="form-field"><label>Round 1</label><input name="roundName" value="Technical screen" required></div><div class="form-field"><label>What was covered?</label><textarea name="roundDetails" placeholder="Topics, format, or questions you remember"></textarea></div></div></div><button type="button" class="button small" id="add-round">＋ Add a round</button><div class="form-field"><label>Advice for the next candidate</label><textarea name="tips" maxlength="2000" placeholder="What would you want someone to know before this interview?"></textarea></div><div class="form-field"><label>Public source link (optional)</label><input name="sourceUrl" type="url" placeholder="https://…"></div><div class="form-error" id="form-error"></div><div class="modal-footer"><span class="auth-note">Reviewed before public posting</span><button class="button primary" type="submit">Submit for review</button></div></form></section></div>`;
  $(".modal-close").onclick = closeModal; $(".modal-backdrop").addEventListener("click", (e) => { if (e.target.classList.contains("modal-backdrop")) closeModal(); });
  const form = $("#experience-form");
  $("#rounds").insertAdjacentHTML("beforebegin", `<div class="form-grid"><div class="form-field"><label>Location (optional)</label><input name="location" maxlength="100" placeholder="City / region"></div><div class="form-field"><label>Interview format</label><select name="workMode"><option value="not-specified">Not specified</option><option value="onsite">Onsite</option><option value="remote">Remote</option><option value="hybrid">Hybrid</option></select></div></div><div class="form-grid"><div class="form-field"><label>How did you apply?</label><input name="applicationChannel" maxlength="120" placeholder="Referral, careers page, recruiter…"></div><div class="form-field"><label>Process length (days)</label><input name="overallDurationDays" type="number" min="0" max="365" placeholder="e.g. 21"></div></div><div class="form-grid"><div class="form-field"><label>Outcome (optional)</label><select name="outcome"><option value="not-shared">Prefer not to say</option><option value="offer">Offer</option><option value="rejected">Not selected</option><option value="withdrew">Withdrew</option><option value="in-progress">In progress</option></select></div><div class="form-field"><label>Overall difficulty (1–5)</label><select name="difficultyRating"><option value="">Skip</option><option>1</option><option>2</option><option>3</option><option>4</option><option>5</option></select></div></div>`);
  const decorateRound = (round, index) => round.insertAdjacentHTML("beforeend", `<div class="form-grid"><div class="form-field"><label>Format</label><select name="roundFormat"><option value="">Choose format</option><option>Live coding</option><option>Take-home</option><option>System design</option><option>Behavioral</option><option>Hiring manager</option><option>Other</option></select></div><div class="form-field"><label>Length (minutes)</label><input name="roundDuration" type="number" min="0" max="600" placeholder="45"></div></div><div class="form-field"><label>Topics covered (comma separated)</label><input name="roundTopics" maxlength="500" placeholder="Arrays, graph traversal, complexity"></div><div class="form-field"><label>Questions you remember (one per line)</label><textarea name="roundQuestions" maxlength="1500" placeholder="Share only what you are permitted to share"></textarea></div><div class="form-field"><label>Round outcome</label><select name="roundResult"><option value="not-shared">Prefer not to say</option><option value="passed">Passed</option><option value="not-passed">Not passed</option></select></div>`);
  decorateRound($("#rounds").firstElementChild, 1);
  $("#rounds").insertAdjacentHTML("beforebegin", `<div class="form-field"><label>Process overview</label><textarea name="processSummary" maxlength="2000" placeholder="Application, recruiter screen, rounds, follow-up, timeline…"></textarea></div><div class="form-field"><label>How did you prepare?</label><textarea name="preparation" maxlength="1500" placeholder="Resources, study plan, and what helped most"></textarea></div>`);
  $("#rounds").insertAdjacentHTML("afterend", `<label class="auth-note" style="display:flex;align-items:center;gap:8px;margin:12px 0"><input name="wouldRecommend" type="checkbox" value="true"> I would recommend this interview process</label><label class="auth-note" style="display:flex;align-items:center;gap:8px;margin:12px 0"><input name="anonymous" type="checkbox" value="true" checked> Show my story anonymously</label>`);
  $("#add-round").onclick = () => { const n = $("#rounds").children.length + 1; if (n > 8) return toast("You can add up to 8 rounds."); $("#rounds").insertAdjacentHTML("beforeend", `<div class="round-editor"><div class="form-field"><label>Round ${n}</label><input name="roundName" value="Round ${n}" required></div><div class="form-field"><label>What was covered?</label><textarea name="roundDetails" placeholder="Topics, format, and anything useful to know"></textarea></div></div>`); decorateRound($("#rounds").lastElementChild, n); };
  form.onsubmit = async (e) => {
    e.preventDefault(); const currentForm = e.currentTarget; const fd = new FormData(currentForm); const payload = Object.fromEntries(fd);
    payload.wouldRecommend = fd.has("wouldRecommend"); payload.anonymous = fd.has("anonymous");
    payload.rounds = [...currentForm.querySelectorAll(".round-editor")].map((round) => ({
      name: round.querySelector('[name="roundName"]').value,
      details: round.querySelector('[name="roundDetails"]').value,
      format: round.querySelector('[name="roundFormat"]').value,
      durationMinutes: round.querySelector('[name="roundDuration"]').value,
      topics: round.querySelector('[name="roundTopics"]').value.split(",").map((x) => x.trim()).filter(Boolean),
      questions: round.querySelector('[name="roundQuestions"]').value.split("\n").map((x) => x.trim()).filter(Boolean),
      result: round.querySelector('[name="roundResult"]').value,
    }));
    const btn = $("button[type=submit]", currentForm); btn.disabled = true;
    try { const result = await api("/api/experiences", { method: "POST", body: JSON.stringify(payload) }); closeModal(); toast(result.message); }
    catch (err) { $("#form-error").textContent = err.message; btn.disabled = false; }
  };
}
function openEditor(question) {
  if (!question) return; state.currentQuestion = question; state.timerStart = Date.now();
  $("#page-content").innerHTML = `<div class="editor-page"><div class="editor-head"><button class="back-button" id="back-questions">← Back</button><div><h1 class="editor-title">${esc(question.title)}</h1><div class="editor-meta">${esc(question.company)} · ${esc(question.difficulty)} · ${esc(question.topic)}</div></div><span class="ai-pill" style="margin-left:auto">Practice mode</span></div><div class="editor-layout"><section class="problem-panel"><span class="tag ${question.difficulty.toLowerCase()}">${esc(question.difficulty)}</span><h2>${esc(question.title)}</h2><div class="problem-body">${esc(question.prompt)}</div><div class="problem-detail"><h3>EXAMPLES & HINTS</h3>${(question.examples || []).map((ex, i) => `<div class="example-block">Example ${i + 1}\n${esc(ex.input || "Input")}: ${esc(ex.output || "Output")}</div>`).join("")}${(question.hints || []).length ? `<ul class="hint-list">${question.hints.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>` : `<p class="page-description">Think out loud, explain your approach, then analyze the complexity.</p>`}</div></section><section class="code-panel"><div class="editor-toolbar"><span class="editor-label">EDITOR</span><select id="language"><option value="javascript">JavaScript</option><option value="typescript">TypeScript</option><option value="python">Python</option><option value="java">Java</option><option value="cpp">C++</option></select><span class="spacer"></span><span class="editor-label" id="timer">00:00</span></div><div class="editor-container" id="editor-container"><textarea class="editor-fallback" id="code-editor" spellcheck="false">function solution(input) {\n  // Your solution here\n  return input;\n}</textarea></div><div class="editor-output"><div class="output-head"><span>OUTPUT</span><span>RUN ISOLATED · JAVASCRIPT ONLY</span></div><div id="output-body" class="output-body">Run your code to see console output here. Test cases are not evaluated.</div></div><div class="editor-actions"><button class="button small" id="reset-code">Reset</button><button class="button small" id="run-code">▶ Run code</button><span class="spacer"></span><button class="button primary small" id="submit-attempt">Finish & save</button></div></section></div></div>`;
  $("#back-questions").onclick = () => setView("questions");
  $(".problem-detail").insertAdjacentHTML("afterbegin", `${sourceInfo(question)}${question.sourceLinks?.[0]?.url ? ` <a class="link-button" href="${esc(question.sourceLinks[0].url)}" target="_blank" rel="noopener noreferrer">Open source ↗</a>` : ""}`);
  $("#editor-container").insertAdjacentHTML("afterend", `<div class="runner-input"><label for="code-input">STANDARD INPUT</label><textarea id="code-input" placeholder="Optional stdin for your program"></textarea></div>`);
  $(".output-head span:last-child").textContent = "JUDGE0 SANDBOX · MULTI-LANGUAGE";
  $("#output-body").textContent = "Enter optional input, then run your code. Output appears here.";
  setupEditor(); loadRunnerLanguages();
  $("#language").onchange = (e) => { const language = state.runnerLanguages.find((item) => item.value === e.target.value); if (!language) return; if (state.editor) { window.monaco.editor.setModelLanguage(state.editor.getModel(), language.monaco); if (state.editor.getValue() === state.editorStarter) { state.editorStarter = starterFor(language.value); state.editor.setValue(state.editorStarter); } } else if ($("#code-editor").value === state.editorStarter) { state.editorStarter = starterFor(language.value); $("#code-editor").value = state.editorStarter; } };
  $("#reset-code").onclick = () => { state.editorStarter = starterFor($("#language").value); if (state.editor) state.editor.setValue(state.editorStarter); else $("#code-editor").value = state.editorStarter; };
  $("#run-code").onclick = runCode; $("#submit-attempt").onclick = saveAttempt; updateTimer(); state.timerInterval = setInterval(updateTimer, 1000);
}
function setupEditor() {
  const fallback = $("#code-editor"); const monacoUrl = "https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.52.2/min/vs";
  fallback.value = starterFor($("#language").value);
  state.editorStarter = fallback.value;
  const start = () => { if (!window.require) return; window.require.config({ paths: { vs: monacoUrl } }); window.require(["vs/editor/editor.main"], () => { if (!$("#editor-container")) return; state.editor = window.monaco.editor.create($("#editor-container"), { value: fallback.value, language: "javascript", theme: "vs-dark", automaticLayout: true, minimap: { enabled: false }, fontSize: 12, fontFamily: "DM Mono, monospace", scrollBeyondLastLine: false, padding: { top: 12 }, roundedSelection: false }); fallback.remove(); }); };
  if (window.monaco) start(); else { const script = document.createElement("script"); script.src = `${monacoUrl}/loader.min.js`; script.onload = start; script.onerror = () => {}; document.head.append(script); }
}
function getCode() { return state.editor ? state.editor.getValue() : $("#code-editor")?.value || ""; }
function starterFor(language) {
  return ({
    javascript: 'console.log("Hello, InterviewIQ");', typescript: 'console.log("Hello, InterviewIQ");', python: 'print("Hello, InterviewIQ")',
    java: 'public class Main {\n  public static void main(String[] args) {\n    System.out.println("Hello, InterviewIQ");\n  }\n}',
    cpp: '#include <iostream>\nint main() {\n  std::cout << "Hello, InterviewIQ\\n";\n  return 0;\n}',
    c: '#include <stdio.h>\nint main(void) {\n  printf("Hello, InterviewIQ\\n");\n  return 0;\n}',
    csharp: 'using System;\nclass Program { static void Main() { Console.WriteLine("Hello, InterviewIQ"); } }',
    go: 'package main\nimport "fmt"\nfunc main() { fmt.Println("Hello, InterviewIQ") }',
    rust: 'fn main() {\n  println!("Hello, InterviewIQ");\n}', ruby: 'puts "Hello, InterviewIQ"', php: '<?php\necho "Hello, InterviewIQ\\n";',
  })[language] || 'console.log("Hello, InterviewIQ");';
}
async function loadRunnerLanguages() {
  try {
    const result = await api("/api/runner/languages"); state.runnerLanguages = result.languages || [];
    const select = $("#language"); const previous = select.value;
    select.innerHTML = state.runnerLanguages.map((language) => `<option value="${esc(language.value)}">${esc(language.label)}</option>`).join("");
    select.value = state.runnerLanguages.some((language) => language.value === previous) ? previous : state.runnerLanguages[0]?.value;
    if (!state.runnerLanguages.length) throw new Error("No supported runner languages were returned.");
  } catch (error) { toast(`Code runner unavailable: ${error.message}`); }
}
async function runCode() {
  if (!state.user) return openAuth("login");
  const output = $("#output-body"); const button = $("#run-code"); const language = state.runnerLanguages.find((item) => item.value === $("#language").value);
  if (!language) { output.className = "output-body error"; output.textContent = "The code runner is not configured. Add Judge0 settings to the server environment."; return; }
  output.className = "output-body"; output.textContent = `Submitting ${language.label} code to the isolated runner…`; button.disabled = true;
  try {
    const result = await api("/api/runner/execute", { method: "POST", body: JSON.stringify({ code: getCode(), languageId: language.id, stdin: $("#code-input").value }) });
    output.className = `output-body ${result.complete ? (result.ok ? "success" : "error") : ""}`;
    output.textContent = `${result.status || "Queued"}${result.time ? ` · ${result.time}s` : ""}${result.memory ? ` · ${result.memory} KB` : ""}\n\n${result.output}`;
  } catch (error) { output.className = "output-body error"; output.textContent = error.message; }
  finally { button.disabled = false; }
}
async function saveAttempt() {
  if (!state.user) return openAuth("login");
  const button = $("#submit-attempt"); button.disabled = true;
  try { await api("/api/attempts", { method: "POST", body: JSON.stringify({ questionId: state.currentQuestion._id, code: getCode(), language: $("#language").value, durationSeconds: Math.round((Date.now() - state.timerStart) / 1000) }) }); clearInterval(state.timerInterval); toast("Practice saved to your profile."); state.attemptsDone += 1; setView("questions"); }
  catch (e) { toast(e.message); button.disabled = false; }
}
function updateTimer() { const el = $("#timer"); if (!el || !state.timerStart) return; const s = Math.floor((Date.now() - state.timerStart) / 1000); el.textContent = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; }
$("#profile-button").addEventListener("click", () => state.user ? showProfileMenu() : openAuth("login")); $("#top-avatar").addEventListener("click", () => state.user ? showProfileMenu() : openAuth("login"));
function showProfileMenu() { const actions = state.user ? `<button class="button small" id="profile-signout">Sign out</button>${state.user.role === "admin" ? `<button class="button small" id="admin-review">Review stories</button>` : ""}` : `<button class="button primary small" id="profile-login">Sign in / Create account</button>`; $("#modal-root").innerHTML = `<div class="modal-backdrop"><section class="modal"><button class="modal-close">×</button><div class="eyebrow">YOUR ACCOUNT</div><h2>${esc(state.user?.name || "Guest learner")}</h2><p>${esc(state.user?.email || "Practice without an account, or sign in to save your progress.")}</p><div class="modal-footer">${actions}</div></section></div>`; $(".modal-close").onclick = closeModal; $(".modal-backdrop").addEventListener("click", (e) => { if (e.target.classList.contains("modal-backdrop")) closeModal(); }); $("#profile-login")?.addEventListener("click", () => openAuth()); $("#profile-signout")?.addEventListener("click", () => { closeModal(); logout(); }); $("#admin-review")?.addEventListener("click", loadAdminQueue); }
async function loadAdminQueue() { try { const { experiences } = await api("/api/admin/experiences"); $("#modal-root").innerHTML = `<div class="modal-backdrop"><section class="modal"><button class="modal-close">×</button><div class="eyebrow">MODERATION</div><h2>Pending stories</h2>${experiences.length ? experiences.map((e) => `<article class="experience-card"><b>${esc(e.company)} · ${esc(e.role)}</b><p>${esc(e.author?.name)} · ${e.rounds.length} rounds</p><div class="modal-footer"><button class="button small" data-review="rejected" data-id="${e._id}">Reject</button><button class="button primary small" data-review="approved" data-id="${e._id}">Approve</button></div></article>`).join("") : `<p>No stories are waiting for review.</p>`}</section></div>`; $(".modal-close").onclick = closeModal; document.querySelectorAll("[data-review]").forEach((b) => b.onclick = async () => { await api(`/api/admin/experiences/${b.dataset.id}`, { method: "PATCH", body: JSON.stringify({ status: b.dataset.review }) }); await loadAdminQueue(); await loadBase(); }); } catch (e) { toast(e.message); } }
$("#help-button").addEventListener("click", () => toast("Choose a company, generate a practice set, then open any question to start the editor.")); $("#add-target").addEventListener("click", () => openGenerateModal());
document.querySelectorAll(".nav-item").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));
loadBase();
