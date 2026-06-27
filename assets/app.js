import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const cfg = window.PORTFOLIO_CONFIG || {};
const isConfigured = Boolean(
  cfg.supabaseUrl &&
  cfg.supabasePublishableKey &&
  !cfg.supabaseUrl.includes("YOUR_PROJECT_REF") &&
  !cfg.supabasePublishableKey.includes("YOUR_PUBLISHABLE")
);
const supabase = isConfigured ? createClient(cfg.supabaseUrl, cfg.supabasePublishableKey) : null;
const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];

const demoWorks = [
  { id: "demo-1", title: "作品档案将在这里展开", category: "品牌设计", description: "登录后台后，每次上传一件作品都会新增到这个作品墙中。", image_url: "", project_url: null },
  { id: "demo-2", title: "分类让项目更有结构", category: "项目实践", description: "可以按视觉设计、摄影、研究、开发或任何自定义分类筛选。", image_url: "", project_url: null }
];
const demoCertificates = [
  { id: "demo-c1", title: "荣誉与证书", category: "竞赛奖项", issuer: "在管理后台持续添加", image_url: "" }
];

let allWorks = [];
let allCertificates = [];
let activeWorkCategory = "全部";
let activeCertificateCategory = "全部";

document.addEventListener("DOMContentLoaded", init);

async function init() {
  $("#current-year").textContent = new Date().getFullYear();
  $("#year-label").textContent = new Date().getFullYear();
  setupModal();
  setupReveal();

  if (!supabase) {
    applySettings({});
    allWorks = demoWorks;
    allCertificates = demoCertificates;
    renderAll();
    finishLoading();
    return;
  }

  const [settingsRes, worksRes, certificatesRes] = await Promise.all([
    supabase.from("site_settings").select("*").eq("id", true).maybeSingle(),
    supabase.from("works").select("*").order("sort_order", { ascending: true }).order("created_at", { ascending: false }),
    supabase.from("certificates").select("*").order("sort_order", { ascending: true }).order("created_at", { ascending: false })
  ]);

  if (settingsRes.error) console.error(settingsRes.error);
  if (worksRes.error) console.error(worksRes.error);
  if (certificatesRes.error) console.error(certificatesRes.error);

  applySettings(settingsRes.data || {});
  allWorks = worksRes.data || [];
  allCertificates = certificatesRes.data || [];
  renderAll();
  finishLoading();
}

function renderAll() {
  renderFilterBar($("#work-filters"), allWorks, activeWorkCategory, (category) => {
    activeWorkCategory = category;
    renderWorks();
  });
  renderFilterBar($("#certificate-filters"), allCertificates, activeCertificateCategory, (category) => {
    activeCertificateCategory = category;
    renderCertificates();
  });
  renderWorks();
  renderCertificates();
}

function applySettings(settings) {
  const get = (key, fallback) => settings[key] || fallback;
  $$("[data-full-name]").forEach((el) => el.textContent = get("full_name", "你的名字"));
  $$("[data-brand-name]").forEach((el) => el.textContent = `${get("full_name", "你的名字")} · 作品集`);
  $$("[data-role]").forEach((el) => el.textContent = get("role", "创作者 · 设计师"));
  $$("[data-bio]").forEach((el) => el.textContent = get("bio", "用审美、策略与执行，把每一个想法推向更清晰的结果。这里记录作品、认可与持续成长的轨迹。"));
  $$("[data-about-copy]").forEach((el) => el.textContent = get("bio", "这里可以继续补充你的学习经历、项目经验、擅长方向与长期目标。作品集不是终点，而是一份不断更新的行动记录。"));
  $$("[data-email]").forEach((el) => el.textContent = get("email", "your@email.com"));
  $$("[data-location]").forEach((el) => el.textContent = get("location", "中国"));

  const avatar = $("#avatar-image");
  if (settings.avatar_url) {
    avatar.src = settings.avatar_url;
    avatar.hidden = false;
    $("#avatar-fallback").hidden = true;
  }
  const resume = $("#resume-button");
  if (settings.resume_url) {
    resume.href = settings.resume_url;
    resume.hidden = false;
  }
  document.title = `${get("full_name", "个人作品集")} — 作品档案`;
}

function renderFilterBar(container, entries, activeCategory, onSelect) {
  const categories = [...new Set(entries.map((item) => item.category || (container.id === "certificate-filters" ? "荣誉" : "作品")).filter(Boolean))];
  const values = ["全部", ...categories];
  container.innerHTML = "";

  values.forEach((category) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `filter-chip${category === activeCategory ? " active" : ""}`;
    button.innerHTML = `<span>${category}</span><i>${category === "全部" ? entries.length : entries.filter((entry) => (entry.category || (container.id === "certificate-filters" ? "荣誉" : "作品")) === category).length}</i>`;
    button.addEventListener("click", () => {
      onSelect(category);
      [...container.children].forEach((node) => node.classList.toggle("active", node === button));
    });
    container.append(button);
  });
}

function renderWorks() {
  const grid = $("#works-grid");
  grid.innerHTML = "";
  const items = activeWorkCategory === "全部"
    ? allWorks
    : allWorks.filter((item) => (item.category || "作品") === activeWorkCategory);

  if (!items.length) {
    grid.innerHTML = `<div class="empty-archive"><b>NO ENTRY</b><p>这个分类还没有作品。</p></div>`;
    return;
  }

  items.forEach((work, index) => {
    const card = document.createElement("article");
    card.className = `work-tile reveal tile-${(index % 5) + 1}`;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "work-open";

    const media = document.createElement("div");
    media.className = "work-media";
    if (work.image_url) {
      const image = new Image();
      image.src = work.image_url;
      image.alt = work.title || "作品图片";
      image.loading = "lazy";
      media.append(image);
    } else {
      const placeholder = document.createElement("div");
      placeholder.className = "media-placeholder";
      placeholder.textContent = `WORK / ${String(index + 1).padStart(2, "0")}`;
      media.append(placeholder);
    }

    const shade = document.createElement("span");
    shade.className = "media-shade";
    const open = document.createElement("span");
    open.className = "open-mark";
    open.textContent = "VIEW CASE ↗";
    media.append(shade, open);

    const content = document.createElement("div");
    content.className = "work-content";
    const eyebrow = document.createElement("p");
    eyebrow.className = "card-kicker";
    eyebrow.textContent = `${String(index + 1).padStart(2, "0")} / ${work.category || "作品"}`;
    const title = document.createElement("h3");
    title.textContent = work.title || "未命名作品";
    const description = document.createElement("p");
    description.textContent = work.description || "暂无项目介绍。";
    content.append(eyebrow, title, description);

    button.append(media, content);
    button.addEventListener("click", () => openArchive(work, "作品档案", index + 1, items.length));
    card.append(button);
    grid.append(card);
  });
  observeNewReveals(grid);
}

function renderCertificates() {
  const grid = $("#certificate-grid");
  grid.innerHTML = "";
  const items = activeCertificateCategory === "全部"
    ? allCertificates
    : allCertificates.filter((item) => (item.category || "荣誉") === activeCertificateCategory);

  $("#certificate-count").textContent = String(allCertificates.length).padStart(2, "0");

  if (!items.length) {
    grid.innerHTML = `<div class="empty-archive empty-on-dark"><b>NO ENTRY</b><p>这个分类还没有荣誉记录。</p></div>`;
    return;
  }

  items.forEach((certificate, index) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "recognition-card reveal";

    const number = document.createElement("span");
    number.className = "recognition-number";
    number.textContent = String(index + 1).padStart(2, "0");

    const media = document.createElement("div");
    media.className = "recognition-media";
    if (certificate.image_url) {
      const image = new Image();
      image.src = certificate.image_url;
      image.alt = certificate.title || "证书图片";
      image.loading = "lazy";
      media.append(image);
    } else {
      media.innerHTML = `<span>AWARD<br>ENTRY</span>`;
    }

    const body = document.createElement("span");
    body.className = "recognition-body";
    const category = document.createElement("small");
    category.textContent = certificate.category || "荣誉";
    const title = document.createElement("strong");
    title.textContent = certificate.title || "未命名荣誉";
    const issuer = document.createElement("em");
    issuer.textContent = certificate.issuer || "荣誉档案";
    body.append(category, title, issuer);

    const arrow = document.createElement("span");
    arrow.className = "recognition-arrow";
    arrow.textContent = "↗";
    card.append(number, media, body, arrow);
    card.addEventListener("click", () => openArchive(certificate, "荣誉档案", index + 1, items.length));
    grid.append(card);
  });
  observeNewReveals(grid);
}

function setupModal() {
  const dialog = $("#archive-modal");
  $(".modal-close", dialog).addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
}

function openArchive(entry, type, sequence, total) {
  const dialog = $("#archive-modal");
  const image = $("#modal-image");
  const noImage = $("#modal-no-image");

  $("#modal-type").textContent = type;
  $("#modal-title").textContent = entry.title || "未命名条目";
  $("#modal-meta").textContent = type === "作品档案"
    ? (entry.category || "作品")
    : `${entry.category || "荣誉"}${entry.issuer ? ` · ${entry.issuer}` : ""}`;
  $("#modal-description").textContent = entry.description || (type === "作品档案" ? "暂无项目介绍。" : "点击查看荣誉证书原图。");
  $("#modal-sequence").textContent = `${String(sequence).padStart(2, "0")} / ${String(total).padStart(2, "0")}`;

  if (entry.image_url) {
    image.src = entry.image_url;
    image.alt = entry.title || "";
    image.hidden = false;
    noImage.hidden = true;
  } else {
    image.hidden = true;
    noImage.hidden = false;
  }

  const link = $("#modal-project-link");
  if (entry.project_url) {
    link.href = entry.project_url;
    link.hidden = false;
  } else {
    link.hidden = true;
  }

  dialog.showModal();
}

function setupReveal() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });

  window.__revealObserver = observer;
  observeNewReveals(document);
}

function observeNewReveals(parent) {
  const observer = window.__revealObserver;
  $$(".reveal:not(.is-visible)", parent).forEach((element, index) => {
    element.style.setProperty("--reveal-delay", `${Math.min(index * 55, 330)}ms`);
    observer?.observe(element);
  });
}

function finishLoading() {
  requestAnimationFrame(() => {
    document.body.classList.add("ready");
    observeNewReveals(document);
  });
}
