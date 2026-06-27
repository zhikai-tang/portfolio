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
const bucket = cfg.storageBucket || "portfolio-assets";
let siteSettings = {};
let works = [];
let certificates = [];

document.addEventListener("DOMContentLoaded", init);

async function init() {
  bindFileLabels();
  bindForms();
  if (!supabase) {
    $("#setup-notice").hidden = false;
    return;
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    $("#login-panel").hidden = false;
    return;
  }
  await openDashboard(session);
}

function bindFileLabels() {
  $$('input[type="file"]').forEach((input) => {
    input.addEventListener("change", () => {
      const target = $(`[data-file-name="${input.name}"]`);
      if (target) target.textContent = input.files?.[0]?.name || "未选择文件";
    });
  });
}

function bindForms() {
  $("#login-form").addEventListener("submit", signIn);
  $("#sign-out-button").addEventListener("click", signOut);
  $("#denied-sign-out").addEventListener("click", signOut);
  $("#settings-form").addEventListener("submit", saveSettings);
  $("#work-form").addEventListener("submit", saveWork);
  $("#certificate-form").addEventListener("submit", saveCertificate);
  $("#work-cancel").addEventListener("click", () => resetManagerForm("work"));
  $("#certificate-cancel").addEventListener("click", () => resetManagerForm("certificate"));
}

async function signIn(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = $('button[type="submit"]', form);
  const email = $("#login-email").value.trim();
  const password = $("#login-password").value;

  button.disabled = true;
  button.textContent = "正在登录...";
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  button.disabled = false;
  button.innerHTML = `登录管理后台 <span>→</span>`;

  if (error) return toast(`登录失败：${error.message}`, true);
  await openDashboard(data.session);
}

async function openDashboard(session) {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("is_admin, email")
    .eq("id", session.user.id)
    .maybeSingle();

  if (error || !profile?.is_admin) {
    $("#login-panel").hidden = true;
    $("#access-denied").hidden = false;
    return;
  }

  $("#login-panel").hidden = true;
  $("#access-denied").hidden = true;
  $("#dashboard").hidden = false;
  $("#sign-out-button").hidden = false;
  $("#admin-email").textContent = profile.email || session.user.email || "管理员";

  await loadData();
}

async function signOut() {
  if (supabase) await supabase.auth.signOut();
  window.location.reload();
}

async function loadData() {
  const [settingsResult, worksResult, certificatesResult] = await Promise.all([
    supabase.from("site_settings").select("*").eq("id", true).maybeSingle(),
    supabase.from("works").select("*").order("sort_order", { ascending: true }).order("created_at", { ascending: false }),
    supabase.from("certificates").select("*").order("sort_order", { ascending: true }).order("created_at", { ascending: false })
  ]);

  if (settingsResult.error || worksResult.error || certificatesResult.error) {
    toast("读取数据失败，请检查 SQL 初始化和权限设置。", true);
    console.error(settingsResult.error, worksResult.error, certificatesResult.error);
    return;
  }

  siteSettings = settingsResult.data || {};
  works = worksResult.data || [];
  certificates = certificatesResult.data || [];

  hydrateSettingsForm();
  renderAdminWorks();
  renderAdminCertificates();
}

function hydrateSettingsForm() {
  const form = $("#settings-form");
  ["full_name", "role", "email", "location", "bio"].forEach((key) => {
    if (form.elements[key]) form.elements[key].value = siteSettings[key] || "";
  });
}

async function saveSettings(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const status = $("#settings-status");
  setStatus(status, "正在保存...");
  disableForm(form, true);

  try {
    const avatarFile = form.elements.avatar_file.files[0];
    const resumeFile = form.elements.resume_file.files[0];
    let avatarUrl = siteSettings.avatar_url || null;
    let avatarPath = siteSettings.avatar_path || null;
    let resumeUrl = siteSettings.resume_url || null;
    let resumePath = siteSettings.resume_path || null;
    let resumeName = siteSettings.resume_name || null;

    if (avatarFile) {
      validateImage(avatarFile);
      const uploaded = await uploadFile("avatars", avatarFile);
      if (avatarPath) await removeFile(avatarPath);
      avatarUrl = uploaded.url;
      avatarPath = uploaded.path;
    }

    if (resumeFile) {
      validatePdf(resumeFile);
      const uploaded = await uploadFile("resumes", resumeFile);
      if (resumePath) await removeFile(resumePath);
      resumeUrl = uploaded.url;
      resumePath = uploaded.path;
      resumeName = resumeFile.name;
    }

    const payload = {
      id: true,
      full_name: form.elements.full_name.value.trim(),
      role: form.elements.role.value.trim(),
      email: form.elements.email.value.trim(),
      location: form.elements.location.value.trim(),
      bio: form.elements.bio.value.trim(),
      avatar_url: avatarUrl,
      avatar_path: avatarPath,
      resume_url: resumeUrl,
      resume_path: resumePath,
      resume_name: resumeName
    };

    const { data, error } = await supabase.from("site_settings").update(payload).eq("id", true).select().single();
    if (error) throw error;
    siteSettings = data;
    form.elements.avatar_file.value = "";
    form.elements.resume_file.value = "";
    $(`[data-file-name="avatar_file"]`).textContent = "未选择新文件";
    $(`[data-file-name="resume_file"]`).textContent = "未选择新文件";
    setStatus(status, "已保存 ✓");
    toast("个人信息已更新，公开页面刷新后即可看到。");
  } catch (error) {
    console.error(error);
    setStatus(status, `保存失败：${humanError(error)}`, true);
  } finally {
    disableForm(form, false);
  }
}

async function saveWork(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const status = $("#work-status");
  const id = form.elements.id.value;
  const existingPath = form.elements.stored_path.value || null;
  const imageFile = form.elements.image_file.files[0];

  if (!id && !imageFile) {
    return setStatus(status, "新建作品时必须选择一张图片。", true);
  }

  disableForm(form, true);
  setStatus(status, id ? "正在更新..." : "正在上传...");

  try {
    let imageUrl = id ? works.find((item) => item.id === id)?.image_url : null;
    let storedPath = existingPath;

    if (imageFile) {
      validateImage(imageFile);
      const uploaded = await uploadFile("works", imageFile);
      if (storedPath) await removeFile(storedPath);
      imageUrl = uploaded.url;
      storedPath = uploaded.path;
    }

    const payload = {
      title: form.elements.title.value.trim(),
      category: form.elements.category.value.trim() || "作品",
      description: form.elements.description.value.trim(),
      project_url: normalizedUrl(form.elements.project_url.value.trim()),
      image_url: imageUrl,
      stored_path: storedPath
    };

    const response = id
      ? await supabase.from("works").update(payload).eq("id", id).select().single()
      : await supabase.from("works").insert(payload).select().single();

    if (response.error) throw response.error;
    toast(id ? "作品已更新。" : "作品已上传。");
    resetManagerForm("work");
    await loadData();
  } catch (error) {
    console.error(error);
    setStatus(status, `操作失败：${humanError(error)}`, true);
  } finally {
    disableForm(form, false);
  }
}

async function saveCertificate(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const status = $("#certificate-status");
  const id = form.elements.id.value;
  const existingPath = form.elements.stored_path.value || null;
  const imageFile = form.elements.image_file.files[0];

  if (!id && !imageFile) {
    return setStatus(status, "新建证书时必须选择一张图片。", true);
  }

  disableForm(form, true);
  setStatus(status, id ? "正在更新..." : "正在上传...");

  try {
    let imageUrl = id ? certificates.find((item) => item.id === id)?.image_url : null;
    let storedPath = existingPath;

    if (imageFile) {
      validateImage(imageFile);
      const uploaded = await uploadFile("certificates", imageFile);
      if (storedPath) await removeFile(storedPath);
      imageUrl = uploaded.url;
      storedPath = uploaded.path;
    }

    const payload = {
      title: form.elements.title.value.trim(),
      issuer: form.elements.issuer.value.trim(),
      image_url: imageUrl,
      stored_path: storedPath
    };

    const response = id
      ? await supabase.from("certificates").update(payload).eq("id", id).select().single()
      : await supabase.from("certificates").insert(payload).select().single();

    if (response.error) throw response.error;
    toast(id ? "证书已更新。" : "证书已上传。");
    resetManagerForm("certificate");
    await loadData();
  } catch (error) {
    console.error(error);
    setStatus(status, `操作失败：${humanError(error)}`, true);
  } finally {
    disableForm(form, false);
  }
}

function renderAdminWorks() {
  const container = $("#admin-work-list");
  $("#admin-work-count").textContent = `${works.length} 个作品`;
  container.innerHTML = "";

  if (!works.length) {
    container.innerHTML = `<p class="muted">还没有作品，使用上方表单上传第一项吧。</p>`;
    return;
  }

  works.forEach((work) => {
    container.append(adminItem({
      image: work.image_url,
      title: work.title,
      meta: `${work.category || "作品"}${work.project_url ? " · 已设置项目链接" : ""}`,
      onEdit: () => editWork(work),
      onDelete: () => deleteRecord("works", work, "作品")
    }));
  });
}

function renderAdminCertificates() {
  const container = $("#admin-certificate-list");
  $("#admin-certificate-count").textContent = `${certificates.length} 项荣誉`;
  container.innerHTML = "";

  if (!certificates.length) {
    container.innerHTML = `<p class="muted">还没有证书，使用上方表单上传第一项吧。</p>`;
    return;
  }

  certificates.forEach((certificate) => {
    container.append(adminItem({
      image: certificate.image_url,
      title: certificate.title,
      meta: certificate.issuer || "荣誉证书",
      onEdit: () => editCertificate(certificate),
      onDelete: () => deleteRecord("certificates", certificate, "证书")
    }));
  });
}

function adminItem({ image, title, meta, onEdit, onDelete }) {
  const item = document.createElement("div");
  item.className = "admin-item";
  item.innerHTML = `
    <img src="${escapeAttribute(image || "")}" alt="">
    <div>
      <p class="admin-item-title"></p>
      <p class="admin-item-meta"></p>
    </div>
    <div class="item-actions">
      <button type="button">编辑</button>
      <button class="delete" type="button">删除</button>
    </div>
  `;
  $(".admin-item-title", item).textContent = title || "未命名";
  $(".admin-item-meta", item).textContent = meta || "";
  const [editButton, deleteButton] = $$("button", item);
  editButton.addEventListener("click", onEdit);
  deleteButton.addEventListener("click", onDelete);
  return item;
}

function editWork(work) {
  const form = $("#work-form");
  form.elements.id.value = work.id;
  form.elements.stored_path.value = work.stored_path || "";
  form.elements.title.value = work.title || "";
  form.elements.category.value = work.category || "";
  form.elements.description.value = work.description || "";
  form.elements.project_url.value = work.project_url || "";
  $("#work-submit").innerHTML = `保存作品修改 <span>✓</span>`;
  $("#work-cancel").hidden = false;
  $("#work-status").textContent = "编辑模式：不选择新图片会保留原图。";
  $("#work-manager").scrollIntoView({ behavior: "smooth", block: "start" });
}

function editCertificate(certificate) {
  const form = $("#certificate-form");
  form.elements.id.value = certificate.id;
  form.elements.stored_path.value = certificate.stored_path || "";
  form.elements.title.value = certificate.title || "";
  form.elements.issuer.value = certificate.issuer || "";
  $("#certificate-submit").innerHTML = `保存证书修改 <span>✓</span>`;
  $("#certificate-cancel").hidden = false;
  $("#certificate-status").textContent = "编辑模式：不选择新图片会保留原图。";
  $("#certificate-manager").scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetManagerForm(kind) {
  const form = $(`#${kind}-form`);
  form.reset();
  form.elements.id.value = "";
  form.elements.stored_path.value = "";
  $(`[data-file-name="image_file"]`, form).textContent = "未选择文件";
  $(`#${kind}-submit`).innerHTML = kind === "work" ? `上传作品 <span>↑</span>` : `上传证书 <span>↑</span>`;
  $(`#${kind}-cancel`).hidden = true;
  $(`#${kind}-status`).textContent = "";
}

async function deleteRecord(table, record, label) {
  if (!window.confirm(`确定删除“${record.title}”吗？删除后无法恢复。`)) return;
  try {
    const { error } = await supabase.from(table).delete().eq("id", record.id);
    if (error) throw error;
    if (record.stored_path) await removeFile(record.stored_path);
    toast(`${label}已删除。`);
    await loadData();
  } catch (error) {
    console.error(error);
    toast(`删除失败：${humanError(error)}`, true);
  }
}

async function uploadFile(folder, file) {
  const path = `${folder}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type
  });
  if (error) throw error;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return { path, url: data.publicUrl };
}

async function removeFile(path) {
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) console.warn("旧文件未删除：", error.message);
}

function validateImage(file) {
  const allowed = ["image/jpeg", "image/png", "image/webp"];
  if (!allowed.includes(file.type)) throw new Error("图片只支持 JPG、PNG 或 WebP 格式。");
  if (file.size > 10 * 1024 * 1024) throw new Error("图片不能超过 10 MB。");
}

function validatePdf(file) {
  if (file.type !== "application/pdf") throw new Error("简历必须是 PDF 文件。");
  if (file.size > 15 * 1024 * 1024) throw new Error("简历不能超过 15 MB。");
}

function safeFileName(name) {
  return name
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "file";
}

function normalizedUrl(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
    return parsed.href;
  } catch {
    throw new Error("项目链接必须以 http:// 或 https:// 开头。");
  }
}

function disableForm(form, disabled) {
  $$("input, textarea, button", form).forEach((control) => { control.disabled = disabled; });
}

function setStatus(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle("error", isError);
}

function humanError(error) {
  return error?.message || "未知错误，请检查网络和 Supabase 配置。";
}

function toast(message, isError = false) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.toggle("error", isError);
  element.classList.add("show");
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => element.classList.remove("show"), 3600);
}

function escapeAttribute(value) {
  return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
