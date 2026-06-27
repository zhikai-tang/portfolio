import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const cfg = window.PORTFOLIO_CONFIG || {};
const hasConfig = Boolean(
  cfg.supabaseUrl &&
  cfg.supabasePublishableKey &&
  !cfg.supabaseUrl.includes("YOUR_PROJECT_REF") &&
  !cfg.supabasePublishableKey.includes("YOUR_PUBLISHABLE")
);
const supabase = hasConfig
  ? createClient(cfg.supabaseUrl, cfg.supabasePublishableKey)
  : null;

const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];

const fallbackWorks = [
  { id: "demo-1", title: "作品案例一", category: "视觉设计", description: "连接 Supabase 后，后台上传的作品会自动显示在这里。", image_url: "" },
  { id: "demo-2", title: "作品案例二", category: "项目实践", description: "网站展示页保持静态部署，但内容来自云端数据库。", image_url: "" }
];

const fallbackCertificates = [
  { id: "demo-c1", title: "荣誉证书展示区", issuer: "请在管理后台上传", image_url: "" }
];

let allWorks = [];
let currentCategory = "all";

document.addEventListener("DOMContentLoaded", init);

async function init() {
  $("#current-year").textContent = new Date().getFullYear();
  bindModal();

  if (!supabase) {
    applySettings({});
    renderWorks(fallbackWorks);
    renderCertificates(fallbackCertificates);
    return;
  }

  const [settingsResult, worksResult, certificatesResult] = await Promise.all([
    supabase.from("site_settings").select("*").eq("id", true).maybeSingle(),
    supabase.from("works").select("*").order("sort_order", { ascending: true }).order("created_at", { ascending: false }),
    supabase.from("certificates").select("*").order("sort_order", { ascending: true }).order("created_at", { ascending: false })
  ]);

  if (settingsResult.error) console.error("读取个人设置失败：", settingsResult.error.message);
  if (worksResult.error) console.error("读取作品失败：", worksResult.error.message);
  if (certificatesResult.error) console.error("读取证书失败：", certificatesResult.error.message);

  applySettings(settingsResult.data || {});
  allWorks = worksResult.data || [];
  renderFilters(allWorks);
  renderWorks(allWorks);
  renderCertificates(certificatesResult.data || []);
}

function applySettings(settings) {
  const value = (key, fallback) => settings[key] || fallback;

  $$("[data-full-name]").forEach((el) => { el.textContent = value("full_name", "你的名字"); });
  $$("[data-brand-name]").forEach((el) => { el.textContent = `${value("full_name", "个人作品集")} · 作品集`; });
  $$("[data-role]").forEach((el) => { el.textContent = value("role", "创作者 · 设计师"); });
  $$("[data-bio]").forEach((el) => { el.textContent = value("bio", "在这里展示作品、项目经验与成长轨迹。每一份成果，都记录着持续探索与认真完成。"); });
  $$("[data-about-copy]").forEach((el) => { el.textContent = value("bio", "这里可以补充你的学习经历、擅长方向、项目经验与未来目标。管理后台可以随时更新个人信息、上传作品和荣誉证书。"); });
  $$("[data-email]").forEach((el) => { el.textContent = value("email", "your@email.com"); });
  $$("[data-location]").forEach((el) => { el.textContent = value("location", "中国"); });

  const avatar = $("#avatar-image");
  const placeholder = $("#avatar-placeholder");
  if (settings.avatar_url) {
    avatar.src = settings.avatar_url;
    avatar.hidden = false;
    placeholder.hidden = true;
  }

  const resume = $("#resume-button");
  if (settings.resume_url) {
    resume.href = settings.resume_url;
    resume.hidden = false;
    resume.firstChild.textContent = settings.resume_name || "查看简历 ";
  }
}

function renderFilters(works) {
  const categories = [...new Set(works.map((item) => item.category).filter(Boolean))];
  const container = $("#work-filters");
  container.innerHTML = "";

  [{ label: "全部", value: "all" }, ...categories.map((category) => ({ label: category, value: category }))]
    .forEach(({ label, value }) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `filter-button${value === currentCategory ? " is-active" : ""}`;
      button.dataset.category = value;
      button.textContent = label;
      button.addEventListener("click", () => {
        currentCategory = value;
        $$(".filter-button", container).forEach((item) => item.classList.toggle("is-active", item.dataset.category === value));
        renderWorks(allWorks);
      });
      container.append(button);
    });
}

function renderWorks(works) {
  const container = $("#works-grid");
  container.innerHTML = "";
  const visibleWorks = currentCategory === "all" ? works : works.filter((item) => item.category === currentCategory);

  if (!visibleWorks.length) {
    container.innerHTML = `<div class="empty-state"><p>这个分类暂时还没有作品。</p></div>`;
    return;
  }

  visibleWorks.forEach((work, index) => {
    const node = $("#work-template").content.cloneNode(true);
    const imageButton = $(".work-image-button", node);
    const image = $(".work-image", node);
    const title = $(".work-title", node);
    const category = $(".work-category", node);
    const description = $(".work-description", node);
    const projectLink = $(".project-link", node);

    title.textContent = work.title || "未命名作品";
    category.textContent = work.category || "项目作品";
    description.textContent = work.description || "暂无作品简介。";
    image.alt = work.title || "作品图片";

    if (work.image_url) {
      image.src = work.image_url;
    } else {
      image.remove();
      imageButton.style.background = index % 2 ? "var(--lime)" : "var(--cream)";
      imageButton.innerHTML = `<span style="font:500 20px var(--mono); padding:22px; display:block;">${String(index + 1).padStart(2, "0")} / IMAGE</span>`;
    }

    imageButton.addEventListener("click", () => openModal(work.image_url, `${work.title || "作品"}${work.description ? ` · ${work.description}` : ""}`));

    if (work.project_url) {
      projectLink.href = work.project_url;
      projectLink.hidden = false;
    }

    container.append(node);
  });
}

function renderCertificates(certificates) {
  const container = $("#certificate-list");
  container.innerHTML = "";
  $("#certificate-count").innerHTML = `${String(certificates.length).padStart(2, "0")} <span>项</span>`;

  if (!certificates.length) {
    container.innerHTML = `<div class="empty-state compact"><p>荣誉证书将展示在这里。</p></div>`;
    return;
  }

  certificates.forEach((certificate, index) => {
    const node = $("#certificate-template").content.cloneNode(true);
    const card = $(".certificate-card", node);
    const image = $(".certificate-image", node);

    $(".certificate-number", node).textContent = String(index + 1).padStart(2, "0");
    $(".certificate-title", node).textContent = certificate.title || "未命名证书";
    $(".certificate-issuer", node).textContent = certificate.issuer || "荣誉证书";
    image.alt = certificate.title || "证书图片";

    if (certificate.image_url) {
      image.src = certificate.image_url;
    } else {
      image.style.background = "var(--cream)";
    }

    card.addEventListener("click", () => openModal(certificate.image_url, `${certificate.title || "证书"}${certificate.issuer ? ` · ${certificate.issuer}` : ""}`));
    container.append(node);
  });
}

function bindModal() {
  const modal = $("#image-modal");
  const close = $(".modal-close", modal);

  close.addEventListener("click", () => modal.close());
  modal.addEventListener("click", (event) => {
    if (event.target === modal) modal.close();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal.open) modal.close();
  });
}

function openModal(src, caption) {
  if (!src) return;
  const modal = $("#image-modal");
  $("#modal-image").src = src;
  $("#modal-image").alt = caption;
  $("#modal-caption").textContent = caption;
  modal.showModal();
}
