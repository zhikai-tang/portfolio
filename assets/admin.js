import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const cfg = window.PORTFOLIO_CONFIG || {};
const hasConfig = Boolean(cfg.supabaseUrl && cfg.supabasePublishableKey && !cfg.supabaseUrl.includes("YOUR_PROJECT_REF") && !cfg.supabasePublishableKey.includes("YOUR_PUBLISHABLE"));
const supabase = hasConfig ? createClient(cfg.supabaseUrl, cfg.supabasePublishableKey) : null;
const bucket = cfg.storageBucket || "portfolio-assets";
const $ = (s,p=document) => p.querySelector(s);
const $$ = (s,p=document) => [...p.querySelectorAll(s)];

let settings = {}, works = [], awards = [];
document.addEventListener("DOMContentLoaded", init);

async function init() {
  bindFileNames();
  bindForms();
  if (!supabase) { $("#setup-notice").hidden = false; return; }
  const {data:{session}} = await supabase.auth.getSession();
  if (!session) { $("#login-panel").hidden = false; return; }
  await enter(session);
}
function bindFileNames() {
  $$('input[type="file"]').forEach(input => input.addEventListener("change", () => {
    const label = input.closest(".file-field")?.querySelector(".file-name");
    if (label) label.textContent = input.files?.[0]?.name || "未选择文件";
  }));
}
function bindForms() {
  $("#login-form").addEventListener("submit", login);
  $("#sign-out-button").addEventListener("click", logout);
  $("#denied-sign-out").addEventListener("click", logout);
  $("#settings-form").addEventListener("submit", saveSettings);
  $("#work-form").addEventListener("submit", saveWork);
  $("#award-form").addEventListener("submit", saveAward);
  $("#work-cancel").addEventListener("click", ()=>resetForm("work"));
  $("#award-cancel").addEventListener("click", ()=>resetForm("award"));
}
async function login(e) {
  e.preventDefault();
  const button = $('button[type="submit"]', e.currentTarget);
  button.disabled = true; button.textContent = "AUTHENTICATING...";
  const {data,error} = await supabase.auth.signInWithPassword({email:$("#login-email").value.trim(),password:$("#login-password").value});
  button.disabled = false; button.innerHTML = `AUTHENTICATE <b>→</b>`;
  if (error) return toast("登录失败：" + error.message, true);
  await enter(data.session);
}
async function enter(session) {
  const {data:profile,error} = await supabase.from("profiles").select("email,is_admin").eq("id",session.user.id).maybeSingle();
  if (error || !profile?.is_admin) { $("#login-panel").hidden=true; $("#access-denied").hidden=false; return; }
  $("#login-panel").hidden = true; $("#dashboard").hidden=false; $("#sign-out-button").hidden=false;
  $("#admin-email").textContent = profile.email || session.user.email || "管理员";
  await load();
}
async function logout() { if (supabase) await supabase.auth.signOut(); location.reload(); }
async function load() {
  const [a,b,c] = await Promise.all([
    supabase.from("site_settings").select("*").eq("id",true).maybeSingle(),
    supabase.from("works").select("*").order("sort_order",{ascending:true}).order("created_at",{ascending:false}),
    supabase.from("certificates").select("*").order("sort_order",{ascending:true}).order("created_at",{ascending:false})
  ]);
  if (a.error || b.error || c.error) { console.error(a.error,b.error,c.error); toast("读取失败。若分类字段报错，请执行之前升级包中的 upgrade-v2.sql。",true); return; }
  settings = a.data || {}; works = b.data || []; awards = c.data || [];
  populateSettings(); renderWorks(); renderAwards();
}
function populateSettings() {
  const form=$("#settings-form");
  ["full_name","role","email","location","bio"].forEach(k=>form.elements[k].value=settings[k]||"");
}
async function saveSettings(e) {
  e.preventDefault(); const form=e.currentTarget, status=$("#settings-status"); setStatus(status,"SAVING..."); disable(form,true);
  try {
    const avatar=form.elements.avatar_file.files[0], resume=form.elements.resume_file.files[0];
    let avatar_url=settings.avatar_url||null, avatar_path=settings.avatar_path||null, resume_url=settings.resume_url||null, resume_path=settings.resume_path||null, resume_name=settings.resume_name||null;
    if (avatar) { validateImage(avatar); const x=await upload("avatars",avatar); if(avatar_path) await remove(avatar_path); avatar_url=x.url; avatar_path=x.path; }
    if (resume) { validatePdf(resume); const x=await upload("resumes",resume); if(resume_path) await remove(resume_path); resume_url=x.url; resume_path=x.path; resume_name=resume.name; }
    const payload={id:true,full_name:form.elements.full_name.value.trim(),role:form.elements.role.value.trim(),email:form.elements.email.value.trim(),location:form.elements.location.value.trim(),bio:form.elements.bio.value.trim(),avatar_url,avatar_path,resume_url,resume_path,resume_name};
    const {data,error}=await supabase.from("site_settings").update(payload).eq("id",true).select().single(); if(error) throw error;
    settings=data; resetFile(form.elements.avatar_file,"未选择新文件"); resetFile(form.elements.resume_file,"未选择新文件"); setStatus(status,"SAVED ✓"); toast("个人信息已保存。");
  } catch(error) { setStatus(status,"FAILED: "+readError(error),true); } finally { disable(form,false); }
}
async function saveWork(e) {
  e.preventDefault(); await saveRecord("work");
}
async function saveAward(e) {
  e.preventDefault(); await saveRecord("award");
}
async function saveRecord(kind) {
  const form=$(`#${kind}-form`), status=$(`#${kind}-status`), id=form.elements.id.value, old=(kind==="work"?works:awards).find(x=>x.id===id), file=form.elements.image_file.files[0];
  if(!id&&!file) return setStatus(status,"新建记录必须选择图片。",true);
  disable(form,true); setStatus(status,id?"UPDATING...":"ADDING...");
  try {
    let image_url=old?.image_url||null, stored_path=form.elements.stored_path.value||old?.stored_path||null;
    if(file){ validateImage(file); const x=await upload(kind==="work"?"works":"certificates",file); if(stored_path) await remove(stored_path); image_url=x.url; stored_path=x.path; }
    let payload, table;
    if(kind==="work"){table="works"; payload={title:form.elements.title.value.trim(),category:form.elements.category.value.trim()||"作品",description:form.elements.description.value.trim(),project_url:urlValue(form.elements.project_url.value.trim()),image_url,stored_path};}
    else {table="certificates"; payload={title:form.elements.title.value.trim(),category:form.elements.category.value.trim()||"荣誉",issuer:form.elements.issuer.value.trim(),image_url,stored_path};}
    const result=id?await supabase.from(table).update(payload).eq("id",id).select().single():await supabase.from(table).insert(payload).select().single();
    if(result.error) throw result.error;
    toast(id?"记录已更新。":"新记录已添加，可继续新增下一条。"); resetForm(kind); await load();
  } catch(error) { setStatus(status,"FAILED: "+readError(error),true); } finally { disable(form,false); }
}
function renderWorks() {
  $("#admin-work-count").textContent=`${works.length} RECORDS`; $("#nav-work-count").textContent=works.length;
  const box=$("#admin-work-list"); box.innerHTML="";
  if(!works.length){box.innerHTML='<p class="empty-record">NO WORK RECORDS YET</p>';return;}
  works.forEach(x=>box.append(record(x,`${x.category||"作品"}${x.project_url?" · LINKED":""}`,()=>editWork(x),()=>del("works",x,"作品")));
}
function renderAwards() {
  $("#admin-award-count").textContent=`${awards.length} RECORDS`; $("#nav-award-count").textContent=awards.length;
  const box=$("#admin-award-list"); box.innerHTML="";
  if(!awards.length){box.innerHTML='<p class="empty-record">NO AWARD RECORDS YET</p>';return;}
  awards.forEach(x=>box.append(record(x,`${x.category||"荣誉"}${x.issuer?" · "+x.issuer:""}`,()=>editAward(x),()=>del("certificates",x,"荣誉")));
}
function record(x,meta,onEdit,onDelete) {
  const el=document.createElement("div"); el.className="record-item";
  el.innerHTML=`<img src="${esc(x.image_url||"")}" alt=""><div><strong></strong><small></small></div><div class="record-actions"><button type="button">EDIT</button><button class="delete" type="button">DELETE</button></div>`;
  $("strong",el).textContent=x.title||"未命名"; $("small",el).textContent=meta;
  const [a,b]=$$("button",el);a.addEventListener("click",onEdit);b.addEventListener("click",onDelete);return el;
}
function editWork(x){const f=$("#work-form");f.elements.id.value=x.id;f.elements.stored_path.value=x.stored_path||"";f.elements.title.value=x.title||"";f.elements.category.value=x.category||"";f.elements.description.value=x.description||"";f.elements.project_url.value=x.project_url||"";$("#work-submit").innerHTML="SAVE EDIT <b>✓</b>";$("#work-cancel").hidden=false;setStatus($("#work-status"),"EDIT MODE: 不选择新图会保留旧图。");$("#works-panel").scrollIntoView({behavior:"smooth"});}
function editAward(x){const f=$("#award-form");f.elements.id.value=x.id;f.elements.stored_path.value=x.stored_path||"";f.elements.title.value=x.title||"";f.elements.category.value=x.category||"荣誉";f.elements.issuer.value=x.issuer||"";$("#award-submit").innerHTML="SAVE EDIT <b>✓</b>";$("#award-cancel").hidden=false;setStatus($("#award-status"),"EDIT MODE: 不选择新图会保留旧图。");$("#awards-panel").scrollIntoView({behavior:"smooth"});}
function resetForm(kind){const f=$(`#${kind}-form`);f.reset();f.elements.id.value="";f.elements.stored_path.value="";$(".file-name",f).textContent="未选择文件";$(`#${kind}-submit`).innerHTML=kind==="work"?"ADD WORK <b>＋</b>":"ADD AWARD <b>＋</b>";$(`#${kind}-cancel`).hidden=true;setStatus($(`#${kind}-status`),"");}
async function del(table,x,label){if(!confirm(`确定删除“${x.title||label}”吗？`))return;try{const {error}=await supabase.from(table).delete().eq("id",x.id);if(error)throw error;if(x.stored_path)await remove(x.stored_path);toast(label+"已删除。");await load();}catch(e){toast("删除失败："+readError(e),true);}}
async function upload(folder,file){const path=`${folder}/${new Date().toISOString().slice(0,10)}/${crypto.randomUUID()}-${safe(file.name)}`;const {error}=await supabase.storage.from(bucket).upload(path,file,{cacheControl:"3600",upsert:false,contentType:file.type});if(error)throw error;const {data}=supabase.storage.from(bucket).getPublicUrl(path);return{path,url:data.publicUrl};}
async function remove(path){const {error}=await supabase.storage.from(bucket).remove([path]);if(error)console.warn(error);}
function validateImage(file){if(!["image/jpeg","image/png","image/webp"].includes(file.type))throw new Error("仅支持 JPG、PNG、WebP 图片。");if(file.size>10*1024*1024)throw new Error("图片不能超过 10 MB。");}
function validatePdf(file){if(file.type!=="application/pdf")throw new Error("简历必须为 PDF。");if(file.size>15*1024*1024)throw new Error("PDF 不能超过 15 MB。");}
function urlValue(v){if(!v)return null;try{const u=new URL(v);if(!["http:","https:"].includes(u.protocol))throw 0;return u.href;}catch{throw new Error("项目链接必须以 http:// 或 https:// 开头。");}}
function safe(v){return v.normalize("NFKD").replace(/[^\w.-]+/g,"-").replace(/-+/g,"-").replace(/^-|-$/g,"").toLowerCase()||"file";}
function resetFile(input,label){input.value="";const n=input.closest(".file-field")?.querySelector(".file-name");if(n)n.textContent=label;}
function disable(form,v){$$("input,textarea,button",form).forEach(x=>x.disabled=v);}
function setStatus(el,t,error=false){el.textContent=t;el.classList.toggle("error",error);}
function readError(e){const m=e?.message||"未知错误";return m.toLowerCase().includes("category")?"数据库缺少分类字段，请先执行 upgrade-v2.sql。":m;}
function esc(v){return String(v).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
function toast(t,error=false){const el=$("#toast");el.textContent=t;el.classList.toggle("error",error);el.classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove("show"),3400);}
