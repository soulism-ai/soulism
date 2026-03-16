import os
import json
import re

def title_case(s):
    parts = re.split(r'[-_]', s)
    return ' '.join(p.capitalize() for p in parts if p)

def section_title(section):
    if section == 'adr':
        return 'Architecture Decisions'
    if section == 'api':
        return 'APIs'
    return title_case(section)

def strip_markdown(text):
    text = re.sub(r'`([^`]+)`', r'\1', text)
    text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', text)
    text = re.sub(r'[*_>#-]', ' ', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def parse_summary(body):
    for line in body.split('\n'):
        line = line.strip()
        if not line or line.startswith('#') or line.startswith('```') or line.startswith('- ') or line.startswith('* '):
            continue
        clean = strip_markdown(line)
        if len(clean) > 40:
            return clean
    return 'Operational guidance, architecture, and product references for the Cognitive AI platform.'

def build_manifest(docs_dir):
    docs = []
    for root, _, files in os.walk(docs_dir):
        for name in files:
            if not name.endswith('.md'):
                continue
            file_path = os.path.join(root, name)
            rel_path = os.path.relpath(file_path, docs_dir).replace('\\', '/')
            slug = re.sub(r'\.md$', '', rel_path).split('/')
            
            with open(file_path, 'r', encoding='utf-8') as f:
                body = f.read()
            
            title_match = re.search(r'^#\s+(.+)$', body, re.MULTILINE)
            if title_match:
                title = title_match.group(1).strip()
            else:
                title = title_case(slug[-1]) if slug else 'Document'
                
            section = section_title(slug[0] if slug else 'docs')
            
            docs.append({
                'slug': slug,
                'href': '/docs/' + '/'.join(slug),
                'title': title,
                'section': section,
                'summary': parse_summary(body),
                'body': body,
                'filePath': rel_path
            })
            
    docs.sort(key=lambda x: x['href'])
    return docs

if __name__ == '__main__':
    root_dir = os.getcwd()
    docs_dir = os.path.join(root_dir, 'docs')
    out_path = os.path.join(root_dir, 'apps/landing/src/generated/docs.generated.json')
    
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    manifest = build_manifest(docs_dir)
    
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2)
        
    print(f"wrote {len(manifest)} docs to {out_path}")
