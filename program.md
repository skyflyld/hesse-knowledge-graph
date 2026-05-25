# 黑塞知识图谱 · 自主研究程序

> 借鉴 Karpathy autoresearch 模式：program.md 定义研究目标，agent 系统性执行，
> 结果结构化反馈给 Sky 审查。学术判断留在人类手里。

## 核心约束

1. **只做增量** — 不修改现有页面，只输出提议/发现/更新
2. **标注审查** — 每个提议必须标注 `⚠️待审查` 或 `📋待确认`
3. **不关闭辩论** — 可以添加新证据，不可自行裁决
4. **不替代 Sky** — 不向群聊发送未经审查的图谱修改

## 执行步骤

### Step 1: 论文发现

搜索最近文献（Google Scholar / 学术数据库），关键词轮替：
- "Hermann Hesse" + cognitive / cognition / metaphor / narrative
- "Hermann Hesse" + Eastern philosophy / India / China / Buddhism
- "Hermann Hesse" + modernity / modernism / romanticism
- "Hermann Hesse" + reception / Rezeption / 接受
- "黑塞" + 认知 / 接受 / 东方 / 现代性

对每篇发现的新论文：
1. 提取标题、作者、年份、来源
2. 提取核心论点（1-2句）
3. 与现有知识图谱做语义匹配：
   - 填充了哪个 gap-card？
   - 与哪个 debate-record 相关？
   - 是否引入全新视角（不在现有图谱中）？
4. 标记：`🆕 新发现` / `🔗 相关已知` / `⚠️ 待确认`

### Step 1b: 多维度生态扫描（三条新通道）

搜索德语和中文两个生态的近期动态，关键词轮替：

**通道①：德语出版与学术动态**
- "Hermann Hesse" + Neuerscheinung / Neuauflage / Suhrkamp
- "Hermann Hesse" + Inszenierung / Aufführung / Theater / Ausstellung
- "Hermann Hesse" + Tagung / Konferenz / Symposium

**通道②：中文黑塞动态**
- "黑塞" + 新刊 / 新书 / 新译
- "黑塞" + 讲座 / 研讨会 / 会议
- "黑塞" + 改编 / 戏剧 / 演出 / 展览

**通道③：跨媒介事件**
- "Hermann Hesse" + film / documentary / adaptation / concert / music
- "Hermann Hesse" + opera / ballet / musical

每条通道返回结果后：
1. 是否是图谱 B 层（文化接受史）的新节点？
2. 是否与现有辩论或 gap-card 相关？
3. 是否是灰线信号（不需入库但有趣）？

标记：`🆕 新节点` / `🔗 图谱补强` / `💡 灰线`

### Step 2: 辩论进化追踪

对每张辩论卡（001-011）：
1. 搜索 thesis 侧最近 2 年新证据
2. 搜索 antithesis 侧最近 2 年新证据
3. 判定：
   - thesis 侧有新支持？→ `📈 thesis+`
   - antithesis 侧有新支持？→ `📉 antithesis+`
   - 无新证据？→ `➡️ 无变化`
4. 更新 debate-records/进化日志.md（追加，不覆盖）

### Step 3: 知识图谱质量审计

扫描 `data/nodes.yaml` 和 `data/edges.yaml`：
1. 孤立节点（入度=0 且 出度=0）
2. 缺失边（两个节点主题高度相关但无连接）
3. 过期内容（引用来源早于 2020 且无最近更新）
4. 断链（vault/ 中 [[link]] 指向不存在的页面）

### Step 4: 生成报告

输出到 `projects/hesse-knowledge-graph/research-reports/YYYY-MM-DD.md`。

格式：
```markdown
# 黑塞研究周报 — YYYY-MM-DD

## 📚 新文献发现 (N 篇)
- [🆕/🔗] **标题** (作者, 年份)
  - 核心论点: ...
  - 关联: gap-card #X / debate #Y
  - ⚠️待审查

## ⚔️ 辩论证据变化
- Debate #001: ➡️ 无变化
- Debate #003: 📈 thesis+ — 新发现...

## 🔍 质量审计
- 孤立节点: X 个
- 缺失边建议: Y 条
- 过期内容: Z 项

## 📋 建议 Sky 审查
1. ...
2. ...
```

### Step 5: 推送群聊

用 message 工具发送摘要到群 `oc_e88b5a330f14c0b2bb53a3d730b77f7c`。
格式：简短摘要 + 报告路径。不发送完整报告（太长）。
