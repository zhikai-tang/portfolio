import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const cfg = window.PORTFOLIO_CONFIG || {};
const hasConfig = Boolean(
  cfg.supabaseUrl && cfg.supabasePublishableKey &&
  !cfg.supabaseUrl.includes("YOUR_PROJECT_REF") &&
  !cfg.supabasePublishableKey.includes("YOUR_PUBLISHABLE")
);
const supabase = hasConfig ? createClient(cfg.supabaseUrl, cfg.supabasePublishableKey) : null;
const $ = (s, p = document) => p.querySelector(s);
const $$ = (s, p = document) => [...p.querySelectorAll(s)];

let works = [];
let awards = [];
let workFilter = "全部";
let awardFilter = "全部";
let activeWorkId = null;

const fallbackWorks = [
  {id:"demo-1",title:"项目档案将在这里显示",category:"作品",description:"管理员后台每新增一件作品，都会自动进入这个项目索引。",image_url:"",project_url:null},
  {id:"demo-2",title:"分类可以自由填写",category:"系统说明",description:"例如：品牌设计、视觉设计、摄影、编程项目、研究成果。",image_url:"",project_url:null}
];
const fallbackAwards = [{id:"award-1",title:"荣誉记录将在这里显示",category:"荣誉",issuer:"在后台继续新增",image_url:""}];

document.addEventListener("DOMContentLoaded", init);

async function init() {
  $("#current-year").textContent = new Date().getFullYear();
  $("#current-date").textContent = new Intl.DateTimeFormat("zh-CN", {year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()).replaceAll("/", ".");
  bindBootScreen();
  bindModal();
  bindCursor();

  if (!supabase) {
    applySettings({});
    works = fallbackWorks;
    awards = fallbackAwards;
    renderAll();
    return;
  }

  const [settingsRes, worksRes, awardsRes] = await Promise.all([
    supabase.from("site_settings").select("*").eq("id", true).maybeSingle(),
    supabase.from("works").select("*").order("sort_order", {ascending:true}).order("created_at", {ascending:false}),
    supabase.from("certificates").select("*").order("sort_order", {ascending:true}).order("created_at", {ascending:false})
  ]);

  if (settingsRes.error) console.error(settingsRes.error);
  if (worksRes.error) console.error(worksRes.error);
  if (awardsRes.error) console.error(awardsRes.error);

  applySettings(settingsRes.data || {});
  works = worksRes.data || [];
  awards = awardsRes.data || [];
  renderAll();
}

function bindBootScreen() {
  const boot = $("#boot-screen");
  const enter = () => {
    boot.classList.add("exit");
    document.body.classList.add("initialized");
    setTimeout(() => boot.remove(), 650);
  };
  $("#press-start").addEventListener("click", enter);
  window.addEventListener("keydown", (event) => {
    if ((event.key === "Enter" || event.key === " ") && !document.body.classList.contains("initialized")) {
      event.preventDefault(); enter();
    }
  });
}
function bindCursor() {
  const glow = $(".cursor-glow");
  window.addEventListener("pointermove", (e) => {
    glow.style.transform = `translate(${e.clientX - 180}px, ${e.clientY - 180}px)`;
  });
}
function applySettings(s) {
  const get = (k, d) => s[k] || d;
  $$("[data-full-name]").forEach(el => el.textContent = get("full_name","你的名字"));
  $$("[data-brand-name]").forEach(el => el.textContent = `${get("full_name","你的名字")} · 作品集`);
  $$("[data-role]").forEach(el => el.textContent = get("role","创作者 · 设计师"));
  $$("[data-bio]").forEach(el => el.textContent = get("bio","用持续的观察、思考和执行，把抽象的想法转化为可以被看见、被使用的成果。"));
  $$("[data-about-copy]").forEach(el => el.textContent = get("bio","这里是我对项目、成长和专业方向的长期记录。好的作品不仅拥有完成度，也应该有清晰的逻辑、真实的价值和持续演化的空间。"));
  $$("[data-email]").forEach(el => el.textContent = get("email","your@email.com"));
  $$("[data-location]").forEach(el => el.textContent = get("location","中国"));

  const avatar = $("#avatar-image");
  if (s.avatar_url) {
    avatar.src = s.avatar_url;
    avatar.hidden = false;
    $("#avatar-placeholder").hidden = true;
  }
  const resume = $("#resume-button");
  if (s.resume_url) {
    resume.href = s.resume_url;
    resume.hidden = false;
  }
  document.title = `${get("full_name","个人作品集")} — 个人档案`;
}
function renderAll() {
  renderFilters($("#work-filters"), works, workFilter, (v) => {workFilter = v; renderWorks();});
  renderFilters($("#award-filters"), awards, awardFilter, (v) => {awardFilter = v; renderAwards();});
  renderWorks();
  renderAwards();
}
function renderFilters(container, data, active, onChange) {
  const categories = [...new Set(data.map(x => x.category || "未分类"))];
  const list = ["全部", ...categories];
  container.innerHTML = "";
  list.forEach(category => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `filter-button${category === active ? " active" : ""}`;
    const count = category === "全部" ? data.length : data.filter(x => (x.category || "未分类") === category).length;
    btn.innerHTML = `<span>${category}</span><b>${String(count).padStart(2,"0")}</b>`;
    btn.addEventListener("click", () => {
      onChange(category);
      $$(".filter-button", container).forEach(x => x.classList.toggle("active", x === btn));
    });
    container.append(btn);
  });
}
function filtered(data, filter) {
  return filter === "全部" ? data : data.filter(x => (x.category || "未分类") === filter);
}
function renderWorks() {
  const list = $("#works-list");
  const data = filtered(works, workFilter);
  list.innerHTML = "";
  $("#work-count").textContent = `${String(data.length).padStart(2,"0")} RECORDS`;

  if (!data.length) {
    list.innerHTML = `<div class="empty-row">NO RECORDS IN THIS CATEGORY</div>`;
    resetPreview();
    return;
  }
  data.forEach((work, index) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "work-row";
    item.dataset.id = work.id;
    item.innerHTML = `<span class="row-number">${String(index+1).padStart(2,"0")}</span><span class="row-copy"><small>${escapeHtml(work.category || "作品")}</small><strong>${escapeHtml(work.title || "未命名作品")}</strong></span><span class="row-arrow">↗</span>`;
    item.addEventListener("mouseenter", () => setPreview(work, index + 1));
    item.addEventListener("focus", () => setPreview(work, index + 1));
    item.addEventListener("click", () => openModal(work, "WORK", index + 1));
    list.append(item);
  });
  const selected = data.find(x => x.id === activeWorkId) || data[0];
  setPreview(selected, data.indexOf(selected) + 1);
}
function setPreview(work, number) {
  activeWorkId = work.id;
  $$(".work-row").forEach(x => x.classList.toggle("selected", x.dataset.id === work.id));
  const image = $("#preview-image");
  const placeholder = $("#preview-placeholder");
  if (work.image_url) {
    image.src = work.image_url;
    image.alt = work.title || "作品图片";
    image.hidden = false;
    placeholder.hidden = true;
  } else {
    image.hidden = true;
    placeholder.hidden = false;
  }
  $("#preview-id").textContent = `REC.${String(number).padStart(2,"0")}`;
  $("#preview-category").textContent = work.category || "作品";
  $("#preview-title").textContent = work.title || "未命名作品";
}
function resetPreview() {
  $("#preview-image").hidden = true;
  $("#preview-placeholder").hidden = false;
  $("#preview-id").textContent = "---";
  $("#preview-category").textContent = "WAITING FOR INPUT";
  $("#preview-title").textContent = "选择左侧项目";
}
function renderAwards() {
  const grid = $("#awards-grid");
  const data = filtered(awards, awardFilter);
  grid.innerHTML = "";
  $("#award-total").textContent = String(awards.length).padStart(2,"0");
  if (!data.length) {
    grid.innerHTML = `<div class="empty-award">NO ENTRIES IN THIS CATEGORY</div>`;
    return;
  }
  data.forEach((award, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "award-card";
    const image = award.image_url ? `<img src="${escapeAttr(award.image_url)}" alt="">` : `<span>AWARD<br>LOG</span>`;
    button.innerHTML = `<span class="award-index">${String(index+1).padStart(2,"0")}</span><div class="award-thumb">${image}</div><div class="award-copy"><small>${escapeHtml(award.category || "荣誉")}</small><strong>${escapeHtml(award.title || "未命名荣誉")}</strong><em>${escapeHtml(award.issuer || "荣誉记录")}</em></div><span class="award-open">OPEN ↗</span>`;
    button.addEventListener("click", () => openModal(award, "AWARD", index + 1));
    grid.append(button);
  });
}
function bindModal() {
  const dialog = $("#project-modal");
  $(".modal-close", dialog).addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
}
function openModal(entry, type, index) {
  const dialog = $("#project-modal");
  const image = $("#modal-image");
  const placeholder = $("#modal-placeholder");
  $("#modal-index").textContent = `[ ${String(index).padStart(2,"0")} / ${type} ]`;
  $("#modal-title").textContent = entry.title || "未命名条目";
  $("#modal-meta").textContent = type === "WORK" ? (entry.category || "作品") : `${entry.category || "荣誉"}${entry.issuer ? " · " + entry.issuer : ""}`;
  $("#modal-description").textContent = entry.description || (type === "WORK" ? "暂无项目说明。" : "点击查看荣誉证书原图。");
  if (entry.image_url) {
    image.src = entry.image_url; image.alt = entry.title || "";
    image.hidden = false; placeholder.hidden = true;
  } else { image.hidden = true; placeholder.hidden = false; }
  const link = $("#modal-project-link");
  if (entry.project_url) { link.href = entry.project_url; link.hidden = false; } else link.hidden = true;
  dialog.showModal();
}
function escapeHtml(v) { return String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function escapeAttr(v) { return escapeHtml(v); }
