import os

files_to_update = [
    'frontend/src/pages/LodgeInternal.jsx',
    'frontend/src/pages/LodgeExternal.jsx',
    'frontend/src/pages/LodgeContract.jsx',
    'frontend/src/components/Chatbot.jsx'
]

for filepath in files_to_update:
    if not os.path.exists(filepath): continue
    
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original = content
    
    content = content.replace('fetch("http://localhost:8000', 'apiClient("')
    content = content.replace("fetch('http://localhost:8000", "apiClient('")
    
    if original != content and 'import { apiClient }' not in content:
        lines = content.split('\n')
        last_import = max([i for i, l in enumerate(lines) if l.startswith('import ')], default=0)
        lines.insert(last_import + 1, 'import { apiClient } from "../services/api";')
        content = '\n'.join(lines)
        
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f'Updated {filepath}')
