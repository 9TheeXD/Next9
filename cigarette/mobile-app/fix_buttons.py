import os
import glob
import re

for file_path in glob.glob('src/components/*.tsx') + glob.glob('src/app/**/*.tsx', recursive=True):
    with open(file_path, 'r') as f:
        content = f.read()

    # Look for button text styles ending with "Text" and containing color: '#1e293b'
    # Example: buttonText: { color: '#1e293b', ... }
    
    # We will replace color: '#1e293b' or color: "#1e293b" with "#ffffff" ONLY inside styles that are button texts.
    # A simple regex: (ButtonText|buttonText|saveButtonText|submitButtonText)[^}]*color:\s*['"]#1e293b['"]
    
    def replacer(match):
        return match.group(0).replace('#1e293b', '#ffffff')

    new_content = re.sub(r'[A-Za-z]+[bB]uttonText[^}]*color:\s*[\'"]#1e293b[\'"]', replacer, content)
    
    if new_content != content:
        with open(file_path, 'w') as f:
            f.write(new_content)
        print(f"Fixed {file_path}")
