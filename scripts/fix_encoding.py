#!/usr/bin/env python3
import os

# Get the absolute path to index.html
script_dir = os.path.dirname(os.path.abspath(__file__))
html_path = os.path.join(script_dir, '..', 'index.html')

print(f"[v0] Reading from: {html_path}")
print(f"[v0] File exists: {os.path.exists(html_path)}")

# Read the file
with open(html_path, 'r', encoding='utf-8') as f:
    content = f.read()

print(f"[v0] Original file size: {len(content)} chars")

# Replace corrupted characters
# â€ = em dash encoding issue, replace with -
# â• = box drawing character, replace with =
# â€¦ = ellipsis encoding issue, replace with ...
# Other variants

content = content.replace('â€"', '-')
content = content.replace('â€"', '-')  
content = content.replace('â€¢', '-')
content = content.replace('â•', '=')
content = content.replace('â€¦', '...')
content = content.replace('â"€', '-')
content = content.replace('â', '')
content = content.replace('"', '"')
content = content.replace('"', '"')
content = content.replace('â\x80\x99', "'")

print(f"[v0] Fixed file size: {len(content)} chars")

# Write the file back
with open(html_path, 'w', encoding='utf-8') as f:
    f.write(content)

print(f"[v0] Successfully fixed {html_path}")
