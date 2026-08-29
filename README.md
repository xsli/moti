# 墨题

数学题目与讲义整理工具：拍题识别、标签与复习、组卷导出 A4 PDF。

## 本地运行

```bash
npm install
npm run dev
```

默认开发服务在 `8080`。

应用是纯本地版本：没有账号和登录页，数据默认保存在项目的 `.data/` 目录。

## 本地 AI

识题、解题、图形定位和图形重绘通过官方 `@openai/codex-sdk` 调用本机 Codex，复用当前电脑已有的 Codex / ChatGPT 登录。默认配置：

- 模型：`gpt-5.6-sol`
- 推理强度：`medium`
- 速度：Fast

第一次使用前，请确保 Codex 已在这台电脑登录。项目不需要另行配置模型密钥。

## 本地生产运行

```bash
npm run build
npm start
```

也可以用 `npm run preview` 检查生产构建。

## 功能

- 批量拍题、自动分题、手动裁图
- 本子筛选、标签、录入日期
- 大组 / 小组、组内排序、从小组拍题带入当前分组
- 组卷：选题、拖拽排版、一级标题（一、填空题 / 二、解答题）
- 预览后生成并下载 A4 PDF / TeX
- 整本 JSON 导入导出（题目、分组、组卷篮和模板）

## 导入 / 导出

本子首页右上角 **导出** / **导入**。导出文件名形如 `墨题备份-2026-08-29.json`，UTF-8 JSON。导入内容会写入本机数据库。

当前格式 `version: 2`。也接受旧文件：根节点是题目数组。

### 根对象

```json
{
  "app": "墨题",
  "version": 2,
  "exportedAt": 1756450000000,
  "problems": [],
  "collections": [],
  "paper": {
    "basket": [],
    "templates": []
  }
}
```

| 字段 | 说明 |
|---|---|
| `app` | 固定 `"墨题"`，导入不校验 |
| `version` | 现在是 `2` |
| `exportedAt` | Unix 毫秒 |
| `problems` | 题目，最多读入 400 道 |
| `collections` | 分组（小组）。大组写在每条的 `groupName` |
| `paper` | 可选。组卷篮 + 模板 |

导入按 `id` 合并：`updatedAt` 较新的覆盖旧的；图片、分组、拍题顺序缺了会从旧记录补。同 id 不会变成两道题。

### 题目 `problems[]`

图片是 `data:image/...;base64,...`，单张最多约 16MB。导出前会尽量把云端原图拉全。

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 必填，≤80 |
| `title` | string | 必填，≤80 |
| `stem` | string | 题干，可含 `$...$` / `$$...$$` |
| `createdAt` / `updatedAt` | number | Unix 毫秒 |
| `sourceKind` | `"photo"` \| `"text"` \| `"sample"` | 缺省 `"text"` |
| `sourceImage` | data URL | 拍题原图，可缺 |
| `figures` | 数组，最多 8 | 附图 |
| `figures[].id` | string | |
| `figures[].title` | string | |
| `figures[].caption` | string | |
| `figures[].svg` | string | 现已少用 |
| `figures[].image` | data URL | 组卷用的图 |
| `subject` | 见下 | 非法则 `"other"` |
| `tags` | string[] | 每条 ≤16 字，最多 8 个 |
| `difficulty` | 1–5 | |
| `myAnswer` / `correctAnswer` / `analysis` / `notes` | string | |
| `errorReason` | 见下 | |
| `mastery` | `"new"` \| `"reviewing"` \| `"mastered"` | |
| `reviewCount` | number | |
| `nextReviewAt` | number | Unix 毫秒 |
| `collectionId` | string | 所属小组 `collections[].id` |
| `sourceBatchId` | string | 同一次拍题的批次 |
| `sourceOrder` | number | 批次内顺序，从 1 |

`subject`：`algebra` `geometry` `function` `trig` `calculus` `probability` `other`  
`errorReason`：`misread` `concept` `calc` `method` `careless` `unknown`

### 分组 `collections[]`

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 必填 |
| `name` | string | 小组名，必填，≤40 |
| `kind` | `"exam"` \| `"unit"` \| `"lesson"` \| `"custom"` | 试卷 / 单元 / 课时 / 分组 |
| `groupName` | string | 大组名，空 = 未分大组。旧字段 `bucket` 也会读 |
| `createdAt` / `updatedAt` | number | |

### 组卷 `paper`

可整段省略。

| 字段 | 说明 |
|---|---|
| `basket` | 题目 id，最多 80 |
| `templates` | 最多 20 套。同 id 取 `updatedAt` 较新的 |

模板：

| 字段 | 说明 |
|---|---|
| `id` / `name` | `name` 空则跳过这条 |
| `title` | 卷名 / 学案名 |
| `sheetKind` | `"exam"` 试卷，`"handout"` 学案 |
| `withAnswers` | 解析版 |
| `blankLines` | `2` `3` `4` `5` `6` `8` |
| `blankAuto` | 按答案估留白 |
| `rows` | 排版，最多 120 行 |
| `createdAt` / `updatedAt` | |

`rows[]`：

- 大题 `{ "kind": "heading", "id": "...", "title": "填空题", "perScore": 10, "blankLines": 5 }`
- 小题 `{ "kind": "problem", "id": "...", "problemId": "<题目 id>" }`

`problemId` 对不上本子里的题时，套用模板会跳过该行。
