#!/usr/bin/env python3
"""
Hesse Knowledge Graph — Automated publication ingestion
Runs in GitHub Actions (US/EU runners, no GFW restrictions)
Fetches new Hesse publications from OpenAlex, adds structured evidence to KG
"""

import requests
import json
import os
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

# ── Config ──
DATA_DIR = Path('data')
PUB_CACHE_FILE = DATA_DIR / '_ingested_dois.json'

# ── Load existing KG data ──
def load_json(path):
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

def save_json(path, data):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

# ── Primary source: OpenAlex Hesse publications ──
def fetch_openalex_hesse():
    """Fetch recent Hesse publications from OpenAlex."""
    url = (
        'https://api.openalex.org/works?'
        'filter=title_and_abstract.search:%22hermann+hesse%22,'
        'from_publication_date:2024-01-01&'
        'sort=publication_date:desc&'
        'per_page=50'
    )
    print("  🔄 OpenAlex API...", end=' ', flush=True)
    try:
        r = requests.get(url, headers={'Accept': 'application/json', 'User-Agent': 'HesseKG/1.0'}, timeout=20)
        data = r.json()
        works = data.get('results', [])
        print(f"✅ {len(works)} works")
        return works
    except Exception as e:
        print(f"❌ {e}")
        return []

def fetch_crossref_hesse():
    """Fetch recent Hesse publications from Crossref."""
    url = (
        'https://api.crossref.org/works?'
        'query=Hermann+Hesse&'
        'filter=from-pub-date:2024-01-01&'
        'sort=published&order=desc&'
        'rows=20'
    )
    print("  🔄 Crossref API...", end=' ', flush=True)
    try:
        r = requests.get(url, headers={'Accept': 'application/json', 'User-Agent': 'HesseKG/1.0'}, timeout=20)
        data = r.json()
        items = data.get('message', {}).get('items', [])
        print(f"✅ {len(items)} works")
        return items
    except Exception as e:
        print(f"❌ {e}")
        return []

# ── Deduplication ──
def load_ingested_dois():
    """Load the cache of already-ingested DOIs."""
    if PUB_CACHE_FILE.exists():
        with open(PUB_CACHE_FILE) as f:
            return set(json.load(f))
    return set()

def save_ingested_dois(dois):
    with open(PUB_CACHE_FILE, 'w') as f:
        json.dump(sorted(dois), f, indent=2)

# ── Main ──
def main():
    today = datetime.now(timezone.utc)
    print(f"🧠 Hesse Knowledge Graph — Data Ingestion")
    print(f"📅 {today.strftime('%Y-%m-%d %H:%M')} UTC")
    
    # Load existing data
    evidence = load_json(DATA_DIR / 'evidence.json')
    relations = load_json(DATA_DIR / 'relations.json')
    works = load_json(DATA_DIR / 'works.json')
    motifs = load_json(DATA_DIR / 'motifs.json')
    debates = load_json(DATA_DIR / 'debates.json')
    
    existing_dois = load_ingested_dois()
    
    # Fetch new publications
    alex_works = fetch_openalex_hesse()
    crossref_works = fetch_crossref_hesse()
    
    # Process OpenAlex results
    new_entries = 0
    new_dois = set(existing_dois)
    
    for w in alex_works:
        title = w.get('title', '')
        if not title:
            continue
        
        doi = (w.get('doi') or '').replace('https://doi.org/', '')
        if not doi:
            continue
        
        # Skip if already ingested
        if doi in existing_dois:
            continue
        
        # Skip noise (non-Hesse matches)
        title_lower = title.lower()
        if any(kw in title_lower for kw in ['hermann göring', 'eva hesse']):
            continue
        if 'hermann hesse' not in title_lower and 'hesse' not in title_lower:
            continue
        
        # Extract metadata
        pub_date = w.get('publication_date', '')
        authors = []
        for a in w.get('authorships', []):
            name = a.get('author', {}).get('display_name', '')
            if name:
                authors.append(name)
        
        source_info = w.get('primary_location', {}).get('source', {}) or {}
        journal = source_info.get('display_name', '') if source_info else ''
        
        # Determine a relevant motif
        # Check title for motif keywords
        assigned_motif = None
        for m in motifs:
            mname = m.get('name', '').lower()
            if mname.split('/')[0].strip() in title_lower:
                assigned_motif = m['id']
                break
        
        # Create evidence entry
        new_id = f"e-ext-{len(evidence) + new_entries + 1}"
        authors_str = ', '.join(authors[:3])
        
        evidence_entry = {
            "id": new_id,
            "nodeId": assigned_motif or "t08",  # Default to 孤独/个体化
            "workId": "w12",  # External scholarly source
            "source": title[:80],
            "location": doi or "OpenAlex",
            "quote": f"External scholarship: {title[:120]}",
            "claim": title[:200],
            "confidence": "medium",
            "tags": ["external_scholarship", "automated_ingest"],
            "sourceRef": {
                "author": authors_str if authors_str else "Unknown",
                "title": title[:200],
                "workId": "w12",
                "locator": doi or pub_date,
                "locatorType": "doi",
                "quoteType": "metadata",
                "quoteLanguage": "en",
                "verificationStatus": "needs_verification",
                "bibliographicNote": f"Automatically ingested from OpenAlex. Journal: {journal}. Date: {pub_date}. DOI: {doi}."
            }
        }
        evidence.append(evidence_entry)
        
        # Create relation to connect external pub to motif
        relation = {
            "s": "w12",
            "t": assigned_motif or "t08",
            "rel": "external_evidence",
            "label": f"外部学术来源: {title[:60]}",
            "weight": 0.8
        }
        relations.append(relation)
        
        new_dois.add(doi)
        new_entries += 1
        print(f"  ➕ New: {title[:70]}...")
    
    # Also check if w12 (external works) exists; add if not
    existing_work_ids = {w['id'] for w in works}
    if 'w12' not in existing_work_ids:
        works.append({
            "id": "w12",
            "name": "External Scholarship",
            "name_de": "Externe Forschungsliteratur",
            "year": 2024,
            "phase": "p04",
            "desc": "External academic publications about Hesse, automatically ingested from OpenAlex/Crossref.",
            "desc_de": "Automatisch erfasste externe Forschungsliteratur zu Hermann Hesse."
        })
    
    # Save updated data
    save_json(DATA_DIR / 'evidence.json', evidence)
    save_json(DATA_DIR / 'relations.json', relations)
    save_json(DATA_DIR / 'works.json', works)
    save_ingested_dois(new_dois)
    
    print(f"\n📊 Summary:")
    print(f"   New evidence entries: {new_entries}")
    print(f"   Total evidence: {len(evidence)}")
    print(f"   Total relations: {len(relations)}")
    print(f"   Ingested DOIs tracked: {len(new_dois)}")
    
    if new_entries == 0:
        print("   No new publications to ingest.")
    
    print(f"\n✅ Ingestion complete")

if __name__ == '__main__':
    main()
