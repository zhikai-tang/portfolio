# 个人作品集 — 精英版视觉升级包

这个升级包保留你已经连接好的 Supabase，不需要重新创建数据库、也不会影响已上传的作品、证书、头像或简历。

## 新增内容

- 作品可持续新增：每次点击“新增作品”都会多一条，不会覆盖旧作品
- 荣誉可持续新增：每次点击“新增荣誉”都会多一条
- 作品分类筛选：例如品牌设计、摄影、项目实践、研究等
- 荣誉分类筛选：例如竞赛奖项、职业证书、学术荣誉等
- 作品点击后进入全屏沉浸式详情动画
- 首屏加载动画、卡片逐个进场动画、卡片悬浮放大与光影效果
- 更偏高端作品档案 / 创意总监风格的排版

## 先做第一步：升级数据库

1. 打开 Supabase Dashboard
2. 左侧打开 `SQL Editor`
3. 点击 `New query`
4. 打开本升级包的 `supabase/upgrade-v2.sql`
5. 复制全部内容粘贴进去
6. 点击 `Run`

看到 `Success. No rows returned` 就表示成功。

## 第二步：替换 GitHub 中的 5 个网站文件

本升级包内要上传 / 替换的文件：

```text
index.html
admin.html
assets/app.js
assets/admin.js
assets/style.css
```

### 非常重要

**不要替换或删除 GitHub 里的：**

```text
assets/config.js
```

这个文件里已经是你自己的 Supabase 项目地址与 Publishable Key，必须保留。

## 最简单替换方法

1. 解压升级包
2. 打开 GitHub 仓库 `portfolio`
3. 点击 `Add file` → `Upload files`
4. 将解压后的 `index.html`、`admin.html`、`assets` 文件夹中的 `app.js`、`admin.js`、`style.css` 拖进上传区
5. 如果 GitHub 提示同名文件，确认替换 / 更新
6. 点击 `Commit changes`
7. 等待 GitHub Pages 更新约 1–2 分钟
8. 用 `Ctrl + F5` 强制刷新公开主页和后台页面

## 日常使用

打开：

```text
https://zhikai-tang.github.io/portfolio/admin.html
```

- 新增作品：填写名称、分类、简介、图片，点击“新增作品”
- 想继续传下一件：直接清空后重新填写，再点一次“新增作品”
- 新增荣誉：填写奖项名称、荣誉分类、颁发单位、证书图片，点击“新增荣誉”
- 已上传的内容会显示在各自表单下方，可以“编辑”或“删除”
