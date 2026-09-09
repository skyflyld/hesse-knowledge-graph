# 黑塞文学知识图谱

一个静态、可在 GitHub Pages 运行的黑塞作品知识图谱。页面把作品、母题、人物原型、结构模式、学术辩论、语法指纹、文化影响、时间线和 Image2 视觉启发式入口放在同一个可探索界面里。

## 本地预览

```bash
python3 -m http.server 4185
```

打开 `http://127.0.0.1:4185/index.html`。

## 数据来源

`data/*.json` 是唯一事实源。`data/hesse-data.js` 是为了兼容 GitHub Pages 和 `file://` 预览生成出的浏览器桥接文件，不应手工编辑。

更新数据后运行：

```bash
npm run build:data
npm run validate:data
```

## 数据文件

- `data/works.json`: 作品节点，必须包含 `id/name/year/phase/desc`。
- `data/motifs.json`: 母题节点，`works` 必须引用存在的作品 ID。
- `data/debates.json`: 学术辩论节点，`motif` 必须引用存在的母题 ID。
- `data/characters.json`: 人物原型节点。
- `data/structures.json`: 结构模式节点。
- `data/grammars.json`: 语法指纹节点。
- `data/cultures.json`: 文化影响节点。
- `data/relations.json`: 图谱边，`s/t` 必须引用存在的节点 ID。
- `data/timeline-phases.json`: 创作阶段，`workIds/motifIds` 必须引用存在的节点。
- `data/image2-rules.json`: Image2 到母题的启发式解释规则。
- `data/evidence.json`: 可追溯证据条目。

## Evidence 契约

每条 evidence 必须包含：

- `id`: 唯一证据 ID。
- `nodeId`: 证据支持的节点 ID。
- `workId`: 关联作品 ID。
- `source/location/quote/claim`: 展示给用户的来源、位置、引文或转述、解释性主张。
- `confidence`: `low | medium | high`。
- `tags`: 标签数组。
- `sourceRef`: 可追溯元数据。

`sourceRef` 字段：

- `author`: 当前必须为 `Hermann Hesse`。
- `title`: 作品名或文本名。
- `workId`: 必须等于 evidence 的 `workId`。
- `locator`: 章节、场景、母题位置或诗句位置。
- `locatorType`: `chapter-or-scene | motif-location | work-section | poem-line`。
- `quoteType`: `direct | direct_excerpt | paraphrase | interpretive`。
- `quoteLanguage`: `de` 或 `zh` 等语言码。
- `verificationStatus`: `verified_location | needs_edition | needs_page`。
- `bibliographicNote`: 版本、页码或核验说明。

不要伪造页码。没有精确版本页码时，使用 `needs_edition` 或 `needs_page`，并在后续校勘时补齐。

## Image2 边界

Image2 是视觉启发式入口，不是文本语义识别，也不是黑塞研究结论。它基于亮度、冷暖、饱和度、纹理和主色，把图片映射到可能相关的母题，适合探索，不适合当作证据。

## 发布检查

```bash
npm run check
```

GitHub Actions 会在 push 和 pull request 上运行同一套数据校验。

有本地 Chrome DevTools 端口时，可以运行交互烟测：

```bash
CDP_URL=http://127.0.0.1:9234 SITE_URL=http://127.0.0.1:4185/index.html npm run smoke:browser
```

## 新增数据集：4 文件 8 处同步清单（2026-08-30 制度化）

**任何新增 `data/<name>.json` 数据集，必须同步以下 8 处，漏一处 = validate 崩或渲染破绽：**

| # | 文件 | 位置 | 改什么 |
|---|------|------|--------|
| 1 | `scripts/build-data.mjs` | `datasets` 数组 | 加 `['<key>', '<name>.json']` |
| 2 | `scripts/validate-data.mjs` | `datasetFiles` 对象 | 加 `<key>: '<name>.json'` |
| 3 | `scripts/validate-data.mjs` | `nodeCollections` 数组 | 加 `'<key>'`（有 id 的节点集合）|
| 4 | `scripts/validate-data.mjs` | `expectedBridge` 对象 | 加 `<key>: data.<key>` |
| 5 | `index.html` | destructure `data` | 解构加 `<key>` |
| 6 | `index.html` | `layers` 数组 | 加 `{key:'<key>', label, color, data:<key>, n:<序号>}`（新增色需先加 CSS 变量）|
| 7 | `index.html` | `nodeR` 映射 | 加 `<key>: <半径>`（漏 = d3 NaN dy 渲染破绽）|
| 8 | `index.html` | `openPanel()` | 加 `<key>` 分支显示详情 |

新增数据集后运行 `npm run build:data && npm run validate:data`，并通过 playwright 截图自检新图层渲染。

### 现有数据集键（2026-08-30）

`works / motifs / debates / characters / structures / grammars / cultures / persons / receptionEvents / evidence / relations / timelinePhases / image2Rules`
（13 个；`evidence`/`relations`/`timelinePhases`/`image2Rules` 非节点集合，跳过第 3 步）
