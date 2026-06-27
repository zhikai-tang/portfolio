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
const bucket = cfg.storageBucket || "portfolio-assets";

let settings = {};
let works = [];
let certificates = [];

document.addEventListener("DOMContentLoaded", init);

async function init() {
  bindFileNames();
  bindActions();

  if (!supabase) {
    $("#setup-notice").hidden = false;
    return;
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    $("#login-panel").hidden = false;
    return;
  }
  await enterDashboard(session);
}

function bindFileNames() {
  $$('input[type="file"]').forEach((input) => {
    input.addEventListener("change", () => {
      const label = input.closest(".file-box")?.querySelector(".file-name");
      if (label) label.textContent = input.files?.[0]?.name || "未选择文件";
    });
  });
}

function bindActions() {
  $("#login-form").addEventListener("submit", signIn);
  $("#sign-out-button").addEventListener("click", signOut);
  $("#denied-sign-out").addEventListener("click", signOut);
  $("#settings-form").addEventListener("submit", saveSettings);
  $("#work-form").addEventListener("submit", saveWork);
  $("#certificate-form").addEventListener("submit", saveCertificate);
  $("#work-cancel").addEventListener("click", () => resetManager("work"));
  $("#certificate-cancel").addEventListener("click", () => resetManager("certificate"));
}

async function signIn(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = $('button[type="submit"]', form);
  button.disabled = true;
  button.textContent = "正在验证账号...";

  const { data, error } = await supabase.auth.signInWithPassword({
    email: $("#login-email").value.trim(),
    password: $("#login-password").value
  });

  button.disabled = false;
  button.innerHTML = `登录管理后台 <span>→</span>`;
  if (error) return toast(`登录失败：${error.message}`, true);
  await enterDashboard(data.session);
}

async function enterDashboard(session) {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("email, is_admin")
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
  const [settingsRes, worksRes, certificatesRes] = await Promise.all([
    supabase.from("site_settings").select("*").eq("id", true).maybeSingle(),
    supabase.from("works").select("*").order("sort_order", { ascending: true }).order("created_at", { ascending: false }),
    supabase.from("certificates").select("*").order("sort_order", { ascending: true }).order("created_at", { ascending: false })
  ]);

  if (settingsRes.error || worksRes.error || certificatesRes.error) {
    console.error(settingsRes.error, worksRes.error, certificatesRes.error);
    toast("读取失败。若提示 category 相关错误，请先执行 upgrade-v2.sql。", true);
    return;
  }

  settings = settingsRes.data || {};
  works = worksRes.data || [];
  certificates = certificatesRes.data || [];
  fillSettingsForm();
  renderWorks();
  renderCertificates();
}

function fillSettingsForm() {
  const form = $("#settings-form");
  ["full_name", "role", "email", "location", "bio"].forEach((key) => {
    form.elements[key].value = settings[key] || "";
  });
}

async function saveSettings(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const status = $("#settings-status");
  disable(form, true);
  setStatus(status, "正在保存...");

  try {
    const avatar = form.elements.avatar_file.files[0];
    const resume = form.elements.resume_file.files[0];

    let avatarUrl = settings.avatar_url || null;
    let avatarPath = settings.avatar_path || null;
    let resumeUrl = settings.resume_url || null;
    let resumePath = settings.resume_path || null;
    let resumeName = settings.resume_name || null;

    if (avatar) {
      validateImage(avatar);
      const upload = await uploadFile("avatars", avatar);
      if (avatarPath) await removeFile(avatarPath);
      avatarUrl = upload.url;
      avatarPath = upload.path;
    }
    if (resume) {
      validatePdf(resume);
      const upload = await uploadFile("resumes", resume);
      if (resumePath) await removeFile(resumePath);
      resumeUrl = upload.url;
      resumePath = upload.path;
      resumeName = resume.name;
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
    settings = data;
    resetFileInput(form.elements.avatar_file);
    resetFileInput(form.elements.resume_file);
    setStatus(status, "已保存，公开网站刷新后即可显示。");
    toast("个人信息已保存。");
  } catch (error) {
    console.error(error);
    setStatus(status, `保存失败：${humanError(error)}`, true);
  } finally {
    disable(form, false);
  }
}

async function saveWork(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const status = $("#work-status");
  const id = form.elements.id.value;
  const file = form.elements.image_file.files[0];
  const old = works.find((item) => item.id === id);

  if (!id && !file) return setStatus(status, "新建作品需要先选择封面图片。", true);
  disable(form, true);
  setStatus(status, id ? "正在保存修改..." : "正在新增作品...");

  try {
    let imageUrl = old?.image_url || null;
    let storedPath = form.elements.stored_path.value || old?.stored_path || null;

    if (file) {
      validateImage(file);
      const upload = await uploadFile("works", file);
      if (storedPath) await removeFile(storedPath);
      imageUrl = upload.url;
      storedPath = upload.path;
    }

    const payload = {
      title: form.elements.title.value.trim(),
      category: form.elements.category.value.trim() || "作品",
      description: form.elements.description.value.trim(),
      project_url: normalizeUrl(form.elements.project_url.value.trim()),
      image_url: imageUrl,
      stored_path: storedPath
    };

    const response = id
      ? await supabase.from("works").update(payload).eq("id", id).select().single()
      : await supabase.from("works").insert(payload).select().single();

    if (response.error) throw response.error;
    toast(id ? "作品已更新。" : "新作品已新增，可以继续上传下一件。");
    resetManager("work");
    await loadData();
  } catch (error) {
    console.error(error);
    setStatus(status, `操作失败：${humanError(error)}`, true);
  } finally {
    disable(form, false);
  }
}

async function saveCertificate(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const status = $("#certificate-status");
  const id = form.elements.id.value;
  const file = form.elements.image_file.files[0];
  const old = certificates.find((item) => item.id === id);

  if (!id && !file) return setStatus(status, "新建荣誉需要先选择证书图片。", true);
  disable(form, true);
  setStatus(status, id ? "正在保存修改..." : "正在新增荣誉...");

  try {
    let imageUrl = old?.image_url || null;
    let storedPath = form.elements.stored_path.value || old?.stored_path || null;

    if (file) {
      validateImage(file);
      const upload = await uploadFile("certificates", file);
      if (storedPath) await removeFile(storedPath);
      imageUrl = upload.url;
      storedPath = upload.path;
    }

    const payload = {
      title: form.elements.title.value.trim(),
      category: form.elements.category.value.trim() || "荣誉",
      issuer: form.elements.issuer.value.trim(),
      image_url: imageUrl,
      stored_path: storedPath
    };

    const response = id
      ? await supabase.from("certificates").update(payload).eq("id", id).select().single()
      : await supabase.from("certificates").insert(payload).select().single();

    if (response.error) throw response.error;
    toast(id ? "荣誉已更新。" : "新荣誉已新增，可以继续上传下一项。");
    resetManager("certificate");
    await loadData();
  } catch (error) {
    console.error(error);
    setStatus(status, `操作失败：${humanError(error)}`, true);
  } finally {
    disable(form, false);
  }
}

function renderWorks() {
  $("#admin-work-count").textContent = `${works.length} 个作品`;
  $("#nav-work-count").textContent = works.length;
  const container = $("#admin-work-list");
  container.innerHTML = "";

  if (!works.length) {
    container.innerHTML = `<p class="muted">还没有作品。用上方表单提交第一件作品后，可以连续继续上传更多作品。</p>`;
    return;
  }

  works.forEach((work) => {
    container.append(makeItem(work.image_url, work.title, `${work.category || "作品"}${work.project_url ? " · 有项目链接" : ""}`, () => editWork(work), () => deleteItem("works", work, "作品")));
  });
}

function renderCertificates() {
  $("#admin-certificate-count").textContent = `${certificates.length} 项荣誉`;
  $("#nav-certificate-count").textContent = certificates.length;
  const container = $("#admin-certificate-list");
  container.innerHTML = "";

  if (!certificates.length) {
    container.innerHTML = `<p class="muted">还没有荣誉。用上方表单提交第一项后，可以连续继续上传更多奖项或证书。</p>`;
    return;
  }

  certificates.forEach((certificate) => {
    container.append(makeItem(certificate.image_url, certificate.title, `${certificate.category || "荣誉"}${certificate.issuer ? ` · ${certificate.issuer}` : ""}`, () => editCertificate(certificate), () => deleteItem("certificates", certificate, "荣誉")));
  });
}

function makeItem(imageUrl, title, meta, edit, remove) {
  const item = document.createElement("div");
  item.className = "admin-item";
  const image = document.createElement("img");
  image.src = imageUrl || "";
  image.alt = "";
  const copy = document.createElement("div");
  const heading = document.createElement("strong");
  heading.textContent = title || "未命名";
  const sub = document.createElement("small");
  sub.textContent = meta || "";
  copy.append(heading, sub);
  const actions = document.createElement("div");
  actions.className = "item-actions";
  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.textContent = "编辑";
  editButton.addEventListener("click", edit);
  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.textContent = "删除";
  deleteButton.className = "danger";
  deleteButton.addEventListener("click", remove);
  actions.append(editButton, deleteButton);
  item.append(image, copy, actions);
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
  setStatus($("#work-status"), "编辑模式：不选择新图片，将继续保留旧图片。");
  $("#work-manager").scrollIntoView({ behavior: "smooth", block: "start" });
}

function editCertificate(certificate) {
  const form = $("#certificate-form");
  form.elements.id.value = certificate.id;
  form.elements.stored_path.value = certificate.stored_path || "";
  form.elements.title.value = certificate.title || "";
  form.elements.category.value = certificate.category || "荣誉";
  form.elements.issuer.value = certificate.issuer || "";
  $("#certificate-submit").innerHTML = `保存荣誉修改 <span>✓</span>`;
  $("#certificate-cancel").hidden = false;
  setStatus($("#certificate-status"), "编辑模式：不选择新图片，将继续保留旧图片。");
  $("#certificate-manager").scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetManager(type) {
  const form = $(`#${type}-form`);
  form.reset();
  form.elements.id.value = "";
  form.elements.stored_path.value = "";
  const fileName = $(".file-name", form);
  if (fileName) fileName.textContent = "未选择文件";
  $(`#${type}-submit`).innerHTML = type === "work" ? `新增作品 <span>＋</span>` : `新增荣誉 <span>＋</span>`;
  $(`#${type}-cancel`).hidden = true;
  setStatus($(`#${type}-status`), "");
}

async function deleteItem(table, record, label) {
  if (!window.confirm(`确定删除“${record.title || label}”吗？删除后无法恢复。`)) return;
  try {
    const { error } = await supabase.from(table).delete().eq("id", record.id);
    if (error) throw error;
    if (record.stored_path) await removeFile(record.stored_path);
    toast(`${label}已删除。`);
    await loadData();
  } catch (error) {
    toast(`删除失败：${humanError(error)}`, true);
  }
}

async function uploadFile(folder, file) {
  const path = `${folder}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${safeName(file.name)}`;
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
  if (error) console.warn("旧文件清理失败：", error.message);
}

function validateImage(file) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("图片仅支持 JPG、PNG、WebP。");
  if (file.size > 10 * 1024 * 1024) throw new Error("图片不能超过 10 MB。");
}

function validatePdf(file) {
  if (file.type !== "application/pdf") throw new Error("简历必须是 PDF 文件。");
  if (file.size > 15 * 1024 * 1024) throw new Error("简历不能超过 15 MB。");
}

function normalizeUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol)) throw new Error();
    return url.href;
  } catch {
    throw new Error("项目链接需以 http:// 或 https:// 开头。");
  }
}

function safeName(name) {
  return name.normalize("NFKD").replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "file";
}

function resetFileInput(input) {
  input.value = "";
  const fileName = input.closest(".file-box")?.querySelector(".file-name");
  if (fileName) fileName.textContent = "未选择新文件";
}

function disable(form, value) {
  $$("input, textarea, button", form).forEach((node) => node.disabled = value);
}

function setStatus(node, message, error = false) {
  node.textContent = message;
  node.classList.toggle("error", error);
}

function humanError(error) {
  const message = error?.message || "未知错误。";
  if (message.toLowerCase().includes("category")) return "数据库缺少分类字段，请先执行 supabase/upgrade-v2.sql。";
  return message;
}

function toast(message, error = false) {
  const node = $("#toast");
  node.textContent = message;
  node.classList.toggle("error", error);
  node.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove("show"), 3600);
}
