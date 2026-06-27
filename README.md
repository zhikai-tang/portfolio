# 云端个人作品集

这是一个可直接部署到 GitHub Pages、Vercel 或 Netlify 的静态网站项目：

- 公开页面：`index.html`
- 管理后台：`admin.html`
- 管理员邮箱密码登录
- 作品、证书、头像与简历上传到 Supabase Storage
- 作品信息、个人简介保存到 Supabase Postgres 数据库
- 上传后不需要再改 HTML、图片文件名或 GitHub `main` 分支内容
- 访客刷新网址即可看到最新内容

> **重要**：这个项目只需要一次性填写 Supabase 配置。之后内容都在 `admin.html` 后台管理，不再需要修改代码。

---

## 一、部署前的准备

你需要：

1. 一个 [Supabase](https://supabase.com/) 账号和项目。
2. 一个 GitHub 仓库（用于 GitHub Pages），或 Vercel / Netlify 账号。
3. 一个只属于自己的管理员邮箱和密码。

项目不使用 Node.js，不需要安装任何依赖。

---

## 二、初始化 Supabase

### 1. 新建项目

在 Supabase 新建一个项目，等待数据库创建完成。

### 2. 创建数据库、表和文件存储权限

打开：

```text
Supabase Dashboard → SQL Editor → New query
```

把 `supabase/schema.sql` **完整复制**进去并执行。

它会创建：

```text
profiles             # 管理员权限
site_settings        # 姓名、简介、头像、简历
works                # 作品
certificates         # 证书
portfolio-assets     # 云端图片与 PDF 文件 Bucket
```

并且已经配置好权限：

```text
访客：只能查看公开内容
管理员：可上传、编辑、删除
非管理员登录用户：不能上传或修改
```

### 3. 创建管理员账号

打开：

```text
Supabase Dashboard → Authentication → Users → Add user
```

创建自己的邮箱和密码。

然后回到 **SQL Editor**，执行下面这条语句，并把邮箱改成刚才创建的管理员邮箱：

```sql
update public.profiles
set is_admin = true
where email = 'your-admin-email@example.com';
```

这是一次性授权动作。以后管理员账号只需在 `admin.html` 登录即可。

### 4. 填写前端配置

打开项目中的：

```text
assets/config.js
```

在 Supabase Dashboard 打开：

```text
Project Settings → API
```

复制项目 URL 和 **Publishable Key**（如果你的项目仍显示旧版 Key，也可以使用 `anon` key），填入：

```js
window.PORTFOLIO_CONFIG = {
  supabaseUrl: "https://你的项目ID.supabase.co",
  supabasePublishableKey: "你的 Publishable Key 或 Anon Key",
  storageBucket: "portfolio-assets"
};
```

**绝对不要**填入 `service_role` 或 `secret` key。它们拥有绕过权限的能力，只能在安全的服务端环境中使用。

---

## 三、上传到 GitHub Pages

### 方式 A：网页上传

1. 在 GitHub 新建一个仓库，例如：`portfolio`
2. 上传本项目文件夹内的所有内容，确保 `index.html` 位于仓库根目录。
3. 打开仓库：

```text
Settings → Pages
```

4. 选择：

```text
Source: Deploy from a branch
Branch: main
Folder: /(root)
```

5. 保存，等待 GitHub Pages 生成网址。

网址通常是：

```text
https://你的GitHub用户名.github.io/portfolio/
```

管理后台网址是：

```text
https://你的GitHub用户名.github.io/portfolio/admin.html
```

### 方式 B：Git 命令上传

在本项目文件夹中执行：

```bash
git init
git add .
git commit -m "Deploy cloud portfolio"
git branch -M main
git remote add origin https://github.com/你的用户名/portfolio.git
git push -u origin main
```

然后按上面的 GitHub Pages 设置发布。

---

## 四、日常使用

部署完成后：

1. 打开：`你的网址/admin.html`
2. 输入在 Supabase 创建的管理员邮箱和密码
3. 上传头像、PDF 简历、作品图片和证书图片
4. 点击保存或上传
5. 打开公开首页，刷新即可看到最新内容

上传内容在 Supabase 云端：

```text
portfolio-assets/
  avatars/
  works/
  certificates/
  resumes/
```

这些目录由程序自动生成文件名；你不用改 `index.html`，也不用手动重命名图片。

---

## 五、安全说明

- `assets/config.js` 中的 Publishable / Anon Key 会公开在浏览器中，这是正常的。
- 真正的安全边界来自 `schema.sql` 配置的 Row Level Security（RLS）策略。
- 不要把 `service_role` / `secret` key 放到 GitHub、HTML、JavaScript 或任何公开网页中。
- 公开网站上的作品图片、证书、公开邮箱和简历链接，所有访客都可以查看；不要上传身份证、住址、私人手机号等敏感信息。
- 管理后台路径不是安全措施。真正阻止未授权写入的是 Supabase Auth 与数据库 / Storage 的 RLS 权限。

---

## 六、常见问题

### 登录成功，但显示“该账号不是管理员”

确认你已在 SQL Editor 执行：

```sql
update public.profiles
set is_admin = true
where email = '你的管理员邮箱';
```

### 上传失败，提示权限不足

确认：

1. `supabase/schema.sql` 已完整执行。
2. 账号已经登录。
3. 账号的 `profiles.is_admin` 是 `true`。
4. `assets/config.js` 填写的是正确项目的 URL 与 Publishable / Anon Key。

### 公开首页没有显示最新内容

确认部署的网站使用的是已填写配置的最新版 `assets/config.js`。上传后刷新首页；如果浏览器缓存较强，可强制刷新页面。

### 能否设置多个管理员？

可以。每创建一个 Auth 用户后，执行：

```sql
update public.profiles
set is_admin = true
where email = '另一位管理员的邮箱';
```

---

## 项目结构

```text
personal_portfolio_cloud/
├── index.html              # 公开作品集首页
├── admin.html              # 管理员登录与上传后台
├── assets/
│   ├── config.js           # 一次性填写 Supabase 配置
│   ├── style.css           # 页面样式
│   ├── app.js              # 公开页面读取云端内容
│   └── admin.js            # 管理后台上传、编辑、删除逻辑
└── supabase/
    └── schema.sql          # 数据库 + 权限 + Storage 初始化
```
