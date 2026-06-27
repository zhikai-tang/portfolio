import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const config = window.PORTFOLIO_CONFIG || {};
const configured = Boolean(
  config.supabaseUrl &&
  config.supabasePublishableKey &&
  !config.supabaseUrl.includes("YOUR_PROJECT_REF") &&
  !config.supabasePublishableKey.includes("YOUR_PUBLISHABLE")
);

const supabase = configured
  ? createClient(config.supabaseUrl, config.supabasePublishableKey)
  : null;

const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];

let works = [];
let awards = [];
let activeWorkCategory = "全部";
let activeAwardCategory = "全部";

const demoWorks = [
  {
    id: "demo-work-1",
    title: "作品将在这里展示",
    category: "作品",
    description: "登录后台后，可以不断新增作品；每一个项目都会自动显示在这个区域。",
    image_url: "",
    project_url: null
  }
];

const demoAwards = [
  {
    id: "demo-award-1",
    title: "荣誉记录将在这里展示",
    category: "荣誉",
    issuer: "登录后台后持续添加",
    image_url: ""
  }
];

document.addEventListener("DOMContentLoaded", init);

async function init() {
  $("#current-year").textContent = new Date().getFullYear();
  $("#display-year").textContent = new Date().getFullYear();
  bindModal();
  setupReveal();

  if (!supabase) {
    applySettings({});
    works = demoWorks;
    awards = demoAwards;
    renderAll();
    return;
  }

  const [settingsResult, worksResult, awardsResult] = await Promise.all([
    supabase.from("site_settings").select("*").eq("id", true).maybeSingle(),
    supabase.from("works").select("*").order("sort_order", { ascending: true }).order("created_at", { ascending: false }),
    supabase.from("certificates").select("*").order("sort_order", { ascending: true }).order("created_at", { ascending: false })
  ]);

  if (settingsResult.error) console.error(settingsResult.error);
  if (worksResult.error) console.error(worksResult.error);
  if (awardsResult.error) console.error(awardsResult.error);

  applySettings(settingsResult.data || {});
  works = worksResult.data || [];
  awards = awardsResult.data || [];
  renderAll();
}

function applySettings(settings) {
  const getValue = (key, fallback) => settings[key] || fallback;

  $$("[data-full-name]").forEach((element) => {
    element.textContent = getValue("full_name", "你的名字");
  });
  $$("[data-brand-name]").forEach((element) => {
    element.textContent = `${getValue("full_name", "你的名字")} · 作品集`;
  });
  $$("[data-role]").forEach((element) => {
    element.textContent = getValue("role", "创作者 · 设计师");
  });
  $$("[data-bio]").forEach((element) => {
    element.textContent = getValue("bio", "以清晰的思考、可靠的执行和持续的好奇心，把每一个想法推向更完整的结果。");
  });
  $$("[data-about-copy]").forEach((element) => {
    element.textContent = getValue("bio", "这里记录的不只是成果，也是一段持续积累和不断精进的过程。期待用专业能力参与更多有价值的项目。");
  });
  $$("[data-email]").forEach((element) => {
    element.textContent = getValue("email", "your@email.com");
  });
  $$("[data-location]").forEach((element) => {
    element.textContent = getValue("location", "中国");
  });

  const avatar = $("#avatar-image");
  const placeholder = $("#avatar-placeholder");
  if (settings.avatar_url) {
    avatar.src = settings.avatar_url;
    avatar.hidden = false;
    placeholder.hidden = true;
  }

  const resumeButton = $("#resume-button");
  if (settings.resume_url) {
    resumeButton.href = settings.resume_url;
    resumeButton.hidden = false;
  }

  document.title = `${getValue("full_name", "个人作品集")} · 个人作品集`;
}

function renderAll() {
  renderFilters($("#work-filters"), works, activeWorkCategory, (category) => {
    activeWorkCategory = category;
    renderWorks();
  });

  renderFilters($("#award-filters"), awards, activeAwardCategory, (category) => {
    activeAwardCategory = category;
    renderAwards();
  });

  renderWorks();
  renderAwards();
}

function renderFilters(container, entries, activeCategory, onSelect) {
  const categories = [...new Set(entries.map((entry) => entry.category || "未分类"))];
  const allCategories = ["全部", ...categories];
  container.innerHTML = "";

  allCategories.forEach((category) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `filter-chip${category === activeCategory ? " active" : ""}`;

    const count = category === "全部"
      ? entries.length
      : entries.filter((entry) => (entry.category || "未分类") === category).length;

    const name = document.createElement("span");
    name.textContent = category;
    const number = document.createElement("b");
    number.textContent = String(count).padStart(2, "0");

    button.append(name, number);
    button.addEventListener("click", () => {
      onSelect(category);
      $$(".filter-chip", container).forEach((chip) => chip.classList.toggle("active", chip === button));
    });
    container.append(button);
  });
}

function filteredEntries(entries, category) {
  if (category === "全部") return entries;
  return entries.filter((entry) => (entry.category || "未分类") === category);
}

function renderWorks() {
  const grid = $("#works-grid");
  const visibleWorks = filteredEntries(works, activeWorkCategory);
  grid.innerHTML = "";
  $("#work-total").textContent = `${String(visibleWorks.length).padStart(2, "0")} PROJECTS`;

  if (!visibleWorks.length) {
    grid.innerHTML = `<div class="empty-state"><p>这个分类暂时没有作品。</p></div>`;
    return;
  }

  visibleWorks.forEach((work, index) => {
    const card = document.createElement("article");
    card.className = `work-card reveal work-card-${(index % 3) + 1}`;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "work-card-button";

    const imageWrap = document.createElement("div");
    imageWrap.className = "work-image-wrap";

    if (work.image_url) {
      const image = new Image();
      image.src = work.image_url;
      image.alt = work.title || "作品图片";
      image.loading = "lazy";
      imageWrap.append(image);
    } else {
      const placeholder = document.createElement("div");
      placeholder.className = "work-placeholder";
      placeholder.textContent = `PROJECT ${String(index + 1).padStart(2, "0")}`;
      imageWrap.append(placeholder);
    }

    const hover = document.createElement("span");
    hover.className = "work-hover";
    hover.textContent = "查看项目 ↗";
    imageWrap.append(hover);

    const content = document.createElement("div");
    content.className = "work-card-content";

    const top = document.createElement("div");
    top.className = "work-card-top";

    const category = document.createElement("small");
    category.textContent = work.category || "作品";
    const indexLabel = document.createElement("span");
    indexLabel.textContent = String(index + 1).padStart(2, "0");
    top.append(category, indexLabel);

    const title = document.createElement("h3");
    title.textContent = work.title || "未命名作品";

    const description = document.createElement("p");
    description.textContent = work.description || "暂无项目介绍。";

    content.append(top, title, description);
    button.append(imageWrap, content);
    button.addEventListener("click", () => openDetail(work, "作品展示", index + 1, visibleWorks.length));
    card.append(button);
    grid.append(card);
  });

  observeNewReveals(grid);
}

function renderAwards() {
  const list = $("#awards-list");
  const visibleAwards = filteredEntries(awards, activeAwardCategory);
  list.innerHTML = "";
  $("#award-total").textContent = String(awards.length).padStart(2, "0");

  if (!visibleAwards.length) {
    list.innerHTML = `<div class="empty-state light-empty"><p>这个分类暂时没有荣誉记录。</p></div>`;
    return;
  }

  visibleAwards.forEach((award, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "award-item reveal";

    const number = document.createElement("span");
    number.className = "award-number";
    number.textContent = String(index + 1).padStart(2, "0");

    const imageWrap = document.createElement("div");
    imageWrap.className = "award-image";

    if (award.image_url) {
      const image = new Image();
      image.src = award.image_url;
      image.alt = award.title || "证书图片";
      image.loading = "lazy";
      imageWrap.append(image);
    } else {
      const placeholder = document.createElement("span");
      placeholder.textContent = "AWARD";
      imageWrap.append(placeholder);
    }

    const copy = document.createElement("div");
    copy.className = "award-copy";

    const category = document.createElement("small");
    category.textContent = award.category || "荣誉";
    const title = document.createElement("strong");
    title.textContent = award.title || "未命名荣誉";
    const issuer = document.createElement("em");
    issuer.textContent = award.issuer || "荣誉记录";
    copy.append(category, title, issuer);

    const open = document.createElement("span");
    open.className = "award-open";
    open.textContent = "↗";

    button.append(number, imageWrap, copy, open);
    button.addEventListener("click", () => openDetail(award, "荣誉记录", index + 1, visibleAwards.length));
    list.append(button);
  });

  observeNewReveals(list);
}

function bindModal() {
  const modal = $("#detail-modal");
  $(".modal-close", modal).addEventListener("click", () => modal.close());
  modal.addEventListener("click", (event) => {
    if (event.target === modal) modal.close();
  });
}

function openDetail(entry, label, position, total) {
  const modal = $("#detail-modal");
  const image = $("#modal-image");
  const placeholder = $("#modal-placeholder");

  $("#modal-kicker").textContent = label;
  $("#modal-title").textContent = entry.title || "未命名条目";
  $("#modal-meta").textContent = label === "作品展示"
    ? (entry.category || "作品")
    : `${entry.category || "荣誉"}${entry.issuer ? ` · ${entry.issuer}` : ""}`;
  $("#modal-description").textContent = entry.description || (label === "作品展示"
    ? "暂无项目介绍。"
    : "点击查看荣誉证书原图。");
  $("#modal-sequence").textContent = `${String(position).padStart(2, "0")} / ${String(total).padStart(2, "0")}`;

  if (entry.image_url) {
    image.src = entry.image_url;
    image.alt = entry.title || "";
    image.hidden = false;
    placeholder.hidden = true;
  } else {
    image.hidden = true;
    placeholder.hidden = false;
  }

  const projectLink = $("#modal-project-link");
  if (entry.project_url) {
    projectLink.href = entry.project_url;
    projectLink.hidden = false;
  } else {
    projectLink.hidden = true;
  }

  modal.showModal();
}

function setupReveal() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("visible");
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.1 });

  window.revealObserver = observer;
  observeNewReveals(document);
}

function observeNewReveals(parent) {
  const observer = window.revealObserver;
  $$(".reveal:not(.visible)", parent).forEach((element, index) => {
    element.style.setProperty("--delay", `${Math.min(index * 60, 300)}ms`);
    observer.observe(element);
  });
}
