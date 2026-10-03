# Agent Notes（dsh-ui 项目）

本目录记录 dsh-theme（DSH 皮肤主题插件项目）的非平凡决定与验收结论。

## 目录与命名

```text
.agents/notes/{lifecycle}/{class}/YYYY-MM-DD-slug.md
```

- lifecycle 四选一：`proposed` / `implemented` / `rejected` / `archived`。
- class 封闭六类，严禁扩充：`feature` / `bug-fix` / `simplification` / `architecture` / `process` / `testing`。
- slug 用英文短横线；文件名日期为变更当天；标题与正文用简体中文。

## 模板（五段）

```markdown
# Agent Note: <简要标题>

Status: <proposed | implemented | rejected — 一句话原因>

## Problem
<动机；脱离解决方案也能独立成立>

## Decision
<implemented 用现在时客观叙述已落地的事实>

## Alternatives considered
<强制：每个真实备选方案一段，说明落败原因；不编造>

## Consequences
<直接收益、影响、权衡>

## Confirmation
<用什么检查/验收持续验证该决策；无验证手段须写明原因>
```

## 纪律

1. 笔记与对应文档改动同批落盘，不脱节补录。
2. 禁止索引文件，目录树即索引。
3. 先做归属检查：演进既有决策时更新归属笔记而非新建重复笔记。
4. `implemented` 只写已发生的事实；Status 行与所在目录一致。
5. 纯机械、无行为/契约变化的改动不记。