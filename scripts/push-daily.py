#!/usr/bin/env python3
"""
黑塞研究站点每日更新脚本
1. 读取最新研究产出 (research-reports/, handover/)
2. 生成每日更新 Markdown 片段
3. 注入 hesse-research 仓库 index.md 的「每日更新」区块
4. 提交并推送

用法: python3 push-daily.py [--dry-run]
Cron: 每日 10:30 BJT (02:30 UTC)
"""

import os, sys, json, re, subprocess
from datetime import datetime, timezone, timedelta

PROJECT_DIR = "/home/gem/workspace/agent/workspace/projects/hesse-knowledge-graph"
SITE_DIR = "/home/gem/workspace/agent/workspace/archive/hesse-research"
SITE_FILE = os.path.join(SITE_DIR, "index.md")

BJT = timezone(timedelta(hours=8))

def run(cmd, cwd=None, timeout=30):
    """Run shell command, return (stdout, stderr, returncode)"""
    p = subprocess.run(cmd, shell=True, capture_output=True, text=True, cwd=cwd or PROJECT_DIR, timeout=timeout)
    return p.stdout.strip(), p.stderr.strip(), p.returncode

def get_latest_files(directory, pattern="*.md", n=3):
    """Get n most recent files in directory matching pattern"""
    import glob
    files = sorted(glob.glob(os.path.join(directory, pattern)), key=os.path.getmtime, reverse=True)
    return files[:n]

def extract_daily_section(filepath):
    """Extract key sections from a research report for the daily update"""
    if not os.path.exists(filepath):
        return ""
    with open(filepath) as f:
        content = f.read()
    
    # Extract first 50 lines as summary
    lines = content.split('\n')
    # Get title
    title = ""
    for l in lines[:5]:
        l = l.strip()
        if l.startswith('# ') and not l.startswith('## '):
            title = l
            break
    
    # Get the sections
    sections = []
    current_section = None
    for l in lines[1:100]:  # First 100 lines
        ls = l.strip()
        if ls.startswith('## '):
            if current_section:
                sections.append(current_section)
            current_section = {'title': ls, 'items': []}
        elif current_section and ls.startswith('### '):
            current_section['items'].append(ls)
        elif current_section and ls.startswith('- '):
            current_section['items'].append(ls)
    
    if current_section:
        sections.append(current_section)
    
    return sections

def get_collision_summary():
    """Get summary from handover files"""
    handover_dir = os.path.join(PROJECT_DIR, "handover")
    collisions = []
    
    collision_file = None
    for f in sorted(os.listdir(handover_dir)):
        if f.startswith("step3-collision") and f.endswith(".md"):
            collision_file = os.path.join(handover_dir, f)
    
    if collision_file:
        with open(collision_file) as f:
            content = f.read()
        # Extract collision matrix
        table_started = False
        for line in content.split('\n'):
            ls = line.strip()
            if '新文献' in ls and '辩论卡' in ls:
                table_started = True
                continue
            if table_started and ls.startswith('|') and '---' not in ls:
                collisions.append(ls)
            elif table_started and not ls.startswith('|'):
                break
    
    return collisions

def parse_debate_cards():
    """Parse full debate card details from DEBATE-HEALTH.md"""
    deb_file = os.path.join(PROJECT_DIR, "DEBATE-HEALTH.md")
    if not os.path.exists(deb_file):
        return []
    
    cards = []
    with open(deb_file) as f:
        content = f.read()
    
    # Find all ### #XXX sections
    card_pattern = re.compile(r'### (#\d+) (.+?)\n\n\*\*thesis\*\*: (.+?)\n', re.DOTALL)
    matches = card_pattern.findall(content)
    
    for match in matches:
        card_id = match[0]
        title = match[1]
        thesis = match[2]
        
        # Find evidence level
        evidence_match = re.search(rf'{re.escape(card_id)}.+?\*\*证据健康度\*\*: (.+)', content, re.DOTALL)
        evidence = evidence_match.group(1).strip() if evidence_match else "—"
        
        # Find counter-argument pressure
        pressure_match = re.search(rf'{re.escape(card_id)}.+?\*\*反方压力\*\*: (.+)', content, re.DOTALL)
        pressure = pressure_match.group(1).strip() if pressure_match else "—"
        
        # Find evidence details (the bullet points after 证据健康度)
        ev_section = re.search(rf'{re.escape(card_id)}.+?\*\*证据健康度\*\*: [^\n]+\n((?:- [^\n]+\n)+)', content, re.DOTALL)
        ev_details = ev_section.group(1).strip() if ev_section else ""
        
        # Find counter-argument details
        ct_section = re.search(rf'{re.escape(card_id)}.+?\*\*反方压力\*\*: [^\n]+\n((?:- [^\n]+\n)+)', content, re.DOTALL)
        ct_details = ct_section.group(1).strip() if ct_section else ""
        
        cards.append({
            'id': card_id,
            'title': title,
            'thesis': thesis,
            'evidence': evidence,
            'pressure': pressure,
            'ev_details': ev_details,
            'ct_details': ct_details
        })
    
    return cards

def get_debate_health():
    """Get debate card health summary (flat table for compatibility)"""
    cards = parse_debate_cards()
    health = []
    for c in cards:
        health.append([c['id'], c['title'], c['evidence'], c['pressure']])
    alerts = [h for h in health if '🔴' in str(h)]
    return health[:9], alerts

def generate_update_block():
    """Generate the daily update markdown block"""
    now = datetime.now(BJT)
    date_str = now.strftime("%Y-%m-%d")
    weekday = ["周一","周二","周三","周四","周五","周六","周日"][now.weekday()]
    
    block = f"""
---

## 📡 每日更新 · {date_str} {weekday}

> 🦞 自动推送 · 黑塞研究碰撞追踪引擎
"""
    
    # Debate health alerts
    health, alerts = get_debate_health()
    if alerts:
        block += "\n### ⚠️ 辩论卡预警\n\n"
        for alert in alerts:
            block += f"- **{alert[1]}**: 证据{str(alert[2]).strip()} 反方{str(alert[3]).strip()}\n"
    else:
        block += "\n### ✅ 辩论卡状态\n\n所有辩论卡状态稳定，无红色预警。\n"
    
    # Latest collisions
    collisions = get_collision_summary()
    if collisions:
        block += "\n### 🔬 最新碰撞\n\n"
        for c in collisions[:5]:
            block += f"{c}\n"
    
    # Latest research report
    reports = get_latest_files(os.path.join(PROJECT_DIR, "research-reports"), pattern="*.md", n=1)
    if reports:
        rpt_date = os.path.basename(reports[0]).replace('.md', '')
        block += f"\n### 📊 最新周报\n\n详见: [research-reports/{rpt_date}.md](https://github.com/skyflyld/hesse-knowledge-graph/blob/main/research-reports/{rpt_date}.md)\n"
    
    # Handover links
    handover_files = get_latest_files(os.path.join(PROJECT_DIR, "handover"), pattern="step*.md", n=3)
    if handover_files:
        block += "\n### 📁 管线文件\n\n"
        for hf in handover_files:
            name = os.path.basename(hf)
            block += f"- `handover/{name}`\n"
    
    block += f"\n> ⏰ 推送时间: {now.strftime('%Y-%m-%d %H:%M')} BJT\n"
    
    return block

def generate_daily_file():
    """Generate full daily markdown file with debate card details"""
    now = datetime.now(BJT)
    date_str = now.strftime("%Y-%m-%d")
    weekday = ["周一","周二","周三","周四","周五","周六","周日"][now.weekday()]
    month_num = now.strftime("%m")
    
    # Parse debate cards with full details
    cards = parse_debate_cards()
    
    # Build debate card sections
    card_sections = ""
    for c in cards:
        card_sections += f"""### {c['id']} {c['title']}

**thesis**: **{c['thesis']}**

| 维度 | 内容 |
|------|------|
| {c['evidence'][:1]} 证据 | {c['ev_details'].replace(chr(10), ' ')[:150] if c['ev_details'] else '—'} |
| {c['pressure'][:1]} 反方 | {c['ct_details'].replace(chr(10), ' ')[:150] if c['ct_details'] else '—'} |

---

"""
    
    # Collisions
    collisions = get_collision_summary()
    collision_text = "\n".join(collisions[:6]) if collisions else "暂无新碰撞数据"
    
    # Latest research report summary
    reports = get_latest_files(os.path.join(PROJECT_DIR, "research-reports"), pattern="*.md", n=1)
    report_link = ""
    if reports:
        rpt_date = os.path.basename(reports[0]).replace('.md', '')
        report_link = f"\n📊 最新周报: [research-reports/{rpt_date}.md](https://github.com/skyflyld/hesse-knowledge-graph/blob/main/research-reports/{rpt_date}.md)\n"
    
    content = f"""# 🔬 黑塞文学研究前沿 · 每日碰撞追踪

### {date_str} {weekday}

> 🦞 自动生成 · Hesse Research Collision Tracker
> 来源: 管线 Step1-3 → DEBATE-HEALTH.md → research-reports/

---

## ⚔️ 辩论卡全展开

{card_sections}
---

## 🔬 最新碰撞

{collision_text}
{report_link}

---

> 📡 下次更新: 明日 07:30 BJT | 每周一 10:00 BJT 为碰撞追踪主窗口
> 🔗 完整辩论卡: [DEBATE-HEALTH.md](https://github.com/skyflyld/hesse-knowledge-graph/blob/main/DEBATE-HEALTH.md)
> 📁 研究报告: [research-reports/](https://github.com/skyflyld/hesse-knowledge-graph/tree/main/research-reports)
"""
    return content, date_str, month_num

def update_index_md(daily_date_str):
    """Update index.md archive section with new daily link"""
    if not os.path.exists(SITE_FILE):
        return False
    
    with open(SITE_FILE) as f:
        content = f.read()
    
    # Update the last-updated timestamp
    now = datetime.now(BJT)
    date_short = daily_date_str  # e.g. "2026-05-17"
    
    # Format daily link line
    month_cn = ["","一月","二月","三月","四月","五月","六月","七月","八月","九月","十月","十一月","十二月"][now.month]
    day_str = now.strftime("%d.")
    link_line = f"  - [{day_str} {month_cn}](daily/{now.year}/{now.strftime('%m')}/{date_short}.md)"
    
    # Check if this day's link already exists
    if date_short in content:
        print(f"Link for {date_short} already exists in index.md, skipping")
        return True
    
    # Insert after the "Mai · 五月" line or similar
    month_pattern = rf'- \[{now.strftime("%m")}月.*\(daily/{now.year}/{now.strftime("%m")}/\)'
    if re.search(month_pattern, content):
        # Insert before the closing of the month list
        content = re.sub(
            rf'(\[{now.strftime("%m")}月.*\(daily/{now.year}/{now.strftime("%m")}/\)\s*\n)',
            f'\\1{link_line}\n',
            content
        )
    
    # Update timestamp
    content = re.sub(
        r'📅 最后更新：.*',
        f'📅 最后更新：{now.strftime("%Y-%m-%d")} · 🦞 Ariste (自动推送)',
        content
    )
    
    with open(SITE_FILE, 'w') as f:
        f.write(content)
    
    print(f"Updated index.md with link to {date_short}")
    return True

def write_daily_and_push(dry_run=False):
    """Generate daily file and update index, then push"""
    # Generate daily content
    content, date_str, month_num = generate_daily_file()
    
    # Write daily file
    daily_dir = os.path.join(SITE_DIR, "daily", str(datetime.now(BJT).year), month_num)
    os.makedirs(daily_dir, exist_ok=True)
    daily_file = os.path.join(daily_dir, f"{date_str}.md")
    
    if dry_run:
        print(f"[DRY RUN] Would write {daily_file}")
        print(content[:500])
        return True
    
    with open(daily_file, 'w') as f:
        f.write(content)
    print(f"Created {daily_file}")
    
    # Update index.md
    update_index_md(date_str)
    
    return True

def git_commit_and_push(dry_run=False):
    """Commit and push the updated site"""
    now = datetime.now(BJT).strftime("%Y-%m-%d %H:%M BJT")
    msg = f"📡 每日碰撞追踪 {now}"
    
    cmds = [
        f"cd {SITE_DIR} && git add daily/ index.md",
        f"cd {SITE_DIR} && git commit -m '{msg}'",
        f"cd {SITE_DIR} && git push origin main"
    ]
    
    for cmd in cmds:
        if dry_run:
            print(f"[DRY RUN] {cmd}")
            continue
        out, err, rc = run(cmd)
        if rc != 0 and 'nothing to commit' not in out + err:
            print(f"ERROR: {cmd}\n{err}")
            return False
        print(f"OK: {out[:100] if out else err[:100]}")
    
    return True

def main():
    dry_run = '--dry-run' in sys.argv
    
    print(f"🦞 Hesse Research Daily Update - {datetime.now(BJT).strftime('%Y-%m-%d %H:%M BJT')}")
    print("=" * 50)
    
    # Generate update
    block = generate_update_block()
    print(block[:500])
    print("...")
    
    # Write daily file + update index
    if not write_daily_and_push(dry_run=dry_run):
        return 1
    
    # Git push
    if not dry_run:
        print("\n📤 Pushing to GitHub...")
        git_commit_and_push(dry_run=dry_run)
    
    print("\n✅ Done!" if not dry_run else "\n✅ Dry run complete")
    return 0

if __name__ == "__main__":
    sys.exit(main())
