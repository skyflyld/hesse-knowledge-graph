# 黑塞知识图谱 — 数据层

> 2026-05-15 新增
> 薄数据层：保持所有 markdown 资产完整，增加可查询的机器读数

## 目录结构

```
data/
├── nodes.yaml           # 节点注册表 — 66个节点，7层分类
├── edges.yaml           # 边注册表 — 65条边，8种类型，51条已确认
├── grammar-metrics.yaml # 语法指标数据 — 5部作品Satzklammer深度分析
└── README.md            # 本文件
```

## 三层原则

1. **Markdown 页是唯一权威来源** — 节点/边数据从 pages 提取，pages 不变
2. **数据层只做"抄录+标准化"** — 不应写 pages 没有的数据
3. **隐边(suggested) = 研究假设** — 需要人工确认才能升级为 confirmed

## 边类型

| 类型 | 来源层 | 说明 |
|------|--------|------|
| theme_carrier | Ⓣ→Ⓦ | 母题在作品中的承载 |
| struct_instance | Ⓢ→Ⓦ | 结构模式在工作中的实例 |
| influence | Ⓑ→Ⓦ | 外部文化影响 |
| grammar_analysis | 🄶→Ⓦ | 语法指纹 → 作品 |
| philosophical_continuum | Ⓦ→Ⓦ | 作品间的哲学延续 |
| debate_ref | Ⓓ→Ⓦ/Ⓑ/🄶 | 辩论引用的节点 |
| hidden_pending | 跨层 | 发现报告建议的新边 |
| negative | 跨层 | 未使用（预留）

## 查询示例

用 grep/yq/jq 即可查询：

```bash
# 所有未解决的辩论
grep "status: 有争议" data/nodes.yaml

# 所有隐边建议
grep "status: suggested" data/edges.yaml

# 所有语法分析完成的作品
grep "grammar_analyzed: true" data/nodes.yaml

# 嵌入深度最高的作品 (Python)
python3 -c "import yaml; d=yaml.safe_load(open('data/grammar-metrics.yaml')); [print(w['name_de'], w['mittelfeld_depth']) for w in d['works'] if w['grammar_analyzed']]"
```
