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

const bucket = config.storageBucket || "portfolio-assets";
const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];

let siteSettings = {};
let works = [];
let awards = [];

document.addEventListener("DOMContentLoaded", init);

async function init() {
  bindInputs();
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

  await openDashboard(session);
}

function bindInputs() {
  $$('input[type="file"]').forEach((input) => {
    input.addEventListener("change", () => {
      const name = input.closest(".file-field")?.querySelector(".file-name");
      if (name) name.textContent = input.files?.[0]?.name || "未选择文件";
    });
  });
}

function bindActions() {
  $("#login-form").addEventListener("submit", signIn);
  $("#sign-out-button").addEventListener("click", signOut);
  $("#denied-sign-out").addEventListener("click", signOut);
  $("#settings-form").addEventListener("submit", saveSettings);
  $("#work-form").addEventListener("submit", saveWork);
  $("#award-form").addEventListener("submit", saveAward);
  $("#work-cancel").addEventListener("click", () => resetManager("work"));
  $("#award-cancel").addEventListener("click", () => resetManager("award"));
}

async function signIn(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = $('button[type="submit"]', form);
  button.disabled = true;
  button.textContent = "正在登录...";

  const { data, error } = await supabase.auth.signInWithPassword({
    email: $("#login-email").value.trim(),
    password: $("#login-password").value
  });

  button.disabled = false;
  button.innerHTML = `登录后台 <span>→</span>`;

  if (error) {
    toast(`登录失败：${error.message}`, true);
    return;
  }

  await openDashboard(data.session);
}

async function openDashboard(session) {
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
  const [settingsResult, worksResult, awardsResult] = await Promise.all([
    supabase.from("site_settings").select("*").eq("id", true).maybeSingle(),
    supabase.from("works").select("*").order("sort_order", { ascending: true }).order("created_at", { ascending: false }),
    supabase.from("certificates").select("*").order("sort_order", { ascending: true }).order("created_at", { ascending: false })
  ]);

  if (settingsResult.error || worksResult.error || awardsResult.error) {
    console.error(settingsResult.error, worksResult.error, awardsResult.error);
    toast("读取数据失败。若提示 category / 分类字段错误，请执行 ensure-categories.sql。", true);
    return;
  }

  siteSettings = settingsResult.data || {};
  works = worksResult.data || [];
  awards = awardsResult.data || [];

  populateSettings();
  renderWorks();
  renderAwards();
}

function populateSettings() {
  const form = $("#settings-form");
  ["full_name", "role", "email", "location", "bio"].forEach((key) => {
    form.elements[key].value = siteSettings[key] || "";
  });
}

async function saveSettings(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const status = $("#settings-status");
  lock(form, true);
  setStatus(status, "正在保存...");

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
      const upload = await uploadFile("avatars", avatarFile);
      if (avatarPath) await removeFile(avatarPath);
      avatarUrl = upload.url;
      avatarPath = upload.path;
    }

    if (resumeFile) {
      validatePdf(resumeFile);
      const upload = await uploadFile("resumes", resumeFile);
      if (resumePath) await removeFile(resumePath);
      resumeUrl = upload.url;
      resumePath = upload.path;
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

    const { data, error } = await supabase
      .from("site_settings")
      .update(payload)
      .eq("id", true)
      .select()
      .single();

    if (error) throw error;

    siteSettings = data;
    clearFileInput(form.elements.avatar_file, "未选择新文件");
    clearFileInput(form.elements.resume_file, "未选择新文件");
    setStatus(status, "已保存 ✓");
    toast("个人信息已保存。");
  } catch (error) {
    setStatus(status, `保存失败：${friendlyError(error)}`, true);
  } finally {
    lock(form, false);
  }
}

async function saveWork(event) {
  event.preventDefault();
  await saveRecord("work");
}

async function saveAward(event) {
  event.preventDefault();
  await saveRecord("award");
}

async function saveRecord(kind) {
  const form = $(`#${kind}-form`);
  const status = $(`#${kind}-status`);
  const id = form.elements.id.value;
  const existing = (kind === "work" ? works : awards).find((item) => item.id === id);
  const file = form.elements.image_file.files[0];

  if (!id && !file) {
    setStatus(status, "新建内容必须选择一张图片。", true);
    return;
  }

  lock(form, true);
  setStatus(status, id ? "正在保存修改..." : "正在新增...");

  try {
    let imageUrl = existing?.image_url || null;
    let storedPath = form.elements.stored_path.value || existing?.stored_path || null;

    if (file) {
      validateImage(file);
      const upload = await uploadFile(kind === "work" ? "works" : "certificates", file);
      if (storedPath) await removeFile(storedPath);
      imageUrl = upload.url;
      storedPath = upload.path;
    }

    let table;
    let payload;

    if (kind === "work") {
      table = "works";
      payload = {
        title: form.elements.title.value.trim(),
        category: form.elements.category.value.trim() || "作品",
        description: form.elements.description.value.trim(),
        project_url: normalizeUrl(form.elements.project_url.value.trim()),
        image_url: imageUrl,
        stored_path: storedPath
      };
    } else {
      table = "certificates";
      payload = {
        title: form.elements.title.value.trim(),
        category: form.elements.category.value.trim() || "荣誉",
        issuer: form.elements.issuer.value.trim(),
        image_url: imageUrl,
        stored_path: storedPath
      };
    }

    const result = id
      ? await supabase.from(table).update(payload).eq("id", id).select().single()
      : await supabase.from(table).insert(payload).select().single();

    if (result.error) throw result.error;

    toast(id ? "内容已更新。" : "已新增一条内容，可以继续添加下一项。");
    resetManager(kind);
    await loadData();
  } catch (error) {
    setStatus(status, `操作失败：${friendlyError(error)}`, true);
  } finally {
    lock(form, false);
  }
}

function renderWorks() {
  $("#admin-work-count").textContent = `${works.length} 个作品`;
  $("#nav-work-count").textContent = works.length;

  const container = $("#admin-work-list");
  container.innerHTML = "";

  if (!works.length) {
    container.innerHTML = `<p class="empty-record">暂无作品。请使用上方表单新增第一件作品。</p>`;
    return;
  }

  works.forEach((work) => {
    container.append(createRecord(
      work,
      `${work.category || "作品"}${work.project_url ? " · 已设置项目链接" : ""}`,
      () => editWork(work),
      () => deleteRecord("works", work, "作品")
    ));
  });
}

function renderAwards() {
  $("#admin-award-count").textContent = `${awards.length} 项荣誉`;
  $("#nav-award-count").textContent = awards.length;

  const container = $("#admin-award-list");
  container.innerHTML = "";

  if (!awards.length) {
    container.innerHTML = `<p class="empty-record">暂无荣誉。请使用上方表单新增第一项荣誉。</p>`;
    return;
  }

  awards.forEach((award) => {
    container.append(createRecord(
      award,
      `${award.category || "荣誉"}${award.issuer ? ` · ${award.issuer}` : ""}`,
      () => editAward(award),
      () => deleteRecord("certificates", award, "荣誉")
    ));
  });
}

function createRecord(record, meta, onEdit, onDelete) {
  const item = document.createElement("div");
  item.className = "admin-record";

  const image = new Image();
  image.src = record.image_url || "";
  image.alt = "";

  const copy = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = record.title || "未命名";
  const details = document.createElement("small");
  details.textContent = meta;
  copy.append(title, details);

  const actions = document.createElement("div");
  actions.className = "record-actions";

  const edit = document.createElement("button");
  edit.type = "button";
  edit.textContent = "编辑";
  edit.addEventListener("click", onEdit);

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "danger";
  remove.textContent = "删除";
  remove.addEventListener("click", onDelete);

  actions.append(edit, remove);
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
  setStatus($("#work-status"), "编辑模式：不选择新图片会保留原图。");
  $("#works-manager").scrollIntoView({ behavior: "smooth", block: "start" });
}

function editAward(award) {
  const form = $("#award-form");
  form.elements.id.value = award.id;
  form.elements.stored_path.value = award.stored_path || "";
  form.elements.title.value = award.title || "";
  form.elements.category.value = award.category || "荣誉";
  form.elements.issuer.value = award.issuer || "";
  $("#award-submit").innerHTML = `保存荣誉修改 <span>✓</span>`;
  $("#award-cancel").hidden = false;
  setStatus($("#award-status"), "编辑模式：不选择新图片会保留原图。");
  $("#awards-manager").scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetManager(kind) {
  const form = $(`#${kind}-form`);
  form.reset();
  form.elements.id.value = "";
  form.elements.stored_path.value = "";
  $(".file-name", form).textContent = "未选择文件";
  $(`#${kind}-submit`).innerHTML = kind === "work"
    ? `新增作品 <span>＋</span>`
    : `新增荣誉 <span>＋</span>`;
  $(`#${kind}-cancel`).hidden = true;
  setStatus($(`#${kind}-status`), "");
}

async function deleteRecord(table, record, label) {
  if (!window.confirm(`确定删除“${record.title || label}”吗？删除后无法恢复。`)) return;

  try {
    const { error } = await supabase.from(table).delete().eq("id", record.id);
    if (error) throw error;

    if (record.stored_path) await removeFile(record.stored_path);

    toast(`${label}已删除。`);
    await loadData();
  } catch (error) {
    toast(`删除失败：${friendlyError(error)}`, true);
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
  if (error) console.warn("无法删除旧文件：", error.message);
}

function validateImage(file) {
  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!allowedTypes.includes(file.type)) {
    throw new Error("图片仅支持 JPG、PNG、WebP 格式。");
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error("图片大小不能超过 10 MB。");
  }
}

function validatePdf(file) {
  if (file.type !== "application/pdf") {
    throw new Error("简历必须为 PDF 文件。");
  }
  if (file.size > 15 * 1024 * 1024) {
    throw new Error("PDF 文件不能超过 15 MB。");
  }
}

function normalizeUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error();
    return url.href;
  } catch {
    throw new Error("项目链接必须以 http:// 或 https:// 开头。");
  }
}

function safeFileName(name) {
  return name
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "file";
}

function clearFileInput(input, label) {
  input.value = "";
  const fileName = input.closest(".file-field")?.querySelector(".file-name");
  if (fileName) fileName.textContent = label;
}

function lock(form, locked) {
  $$("input, textarea, button", form).forEach((element) => {
    element.disabled = locked;
  });
}

function setStatus(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle("error", isError);
}

function friendlyError(error) {
  const message = error?.message || "未知错误。";
  if (message.toLowerCase().includes("category")) {
    return "数据库缺少分类字段，请执行 ensure-categories.sql。";
  }
  return message;
}

function toast(message, isError = false) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.toggle("error", isError);
  element.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove("show"), 3500);
}
