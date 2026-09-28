#!/usr/bin/env python3
"""Fix all TypeScript errors in index.test.ts"""
import re

TEST_FILE = r"D:\HERMES AGENT\ICON Email Browser Lab\packages\database\src\index.test.ts"

with open(TEST_FILE, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix createEmailAccount calls - remove last_synced_at
# Match patterns like "last_synced_at: null,\n    });" or "last_synced_at: null,\n    })"
content = re.sub(r'\s+last_synced_at:.*?,?\n(?=\s+\})', '', content)

# Fix createVerificationCode calls - remove received_at
content = re.sub(r'\s+received_at:.*?,?\n(?=\s+\})', '', content)

# Fix updateVerificationCodeStatus -> markVerificationCodeUsed/markVerificationCodeExpired
content = content.replace('db.updateVerificationCodeStatus(vc.id, "used")', 'db.markVerificationCodeUsed(vc.id)')
content = content.replace('db.updateVerificationCodeStatus(vc.id, "expired")', 'db.markVerificationCodeExpired(vc.id)')
content = content.replace('db.updateVerificationCodeStatus(vc.id, "pending")', 'db.markVerificationCodeUsed(vc.id)')

# Fix createSession - remove started_at (auto-generated)
def fix_session_create(m):
    inner = m.group(1)
    # Remove started_at line
    inner = re.sub(r'\s+started_at:.*?,?\n', '', inner)
    return f'db.createSession({inner})'

content = re.sub(r'db\.createSession\(\{([^}]+)\}\)', fix_session_create, content, flags=re.DOTALL)

# Fix createTestRun - remove started_at (auto-generated)
def fix_testrun_create(m):
    inner = m.group(1)
    inner = re.sub(r'\s+started_at:.*?,?\n', '', inner)
    return f'db.createTestRun({inner})'

content = re.sub(r'db\.createTestRun\(\{([^}]+)\}\)', fix_testrun_create, content, flags=re.DOTALL)

# Fix updateTestRunStatus -> updateTestRun
content = content.replace('db.updateTestRunStatus(', 'db.updateTestRun(')

# Fix createBrowserProfile - remove status, notes (not in signature)
def fix_profile_create(m):
    inner = m.group(1)
    inner = re.sub(r'\s+status:.*?,?\n', '', inner)
    inner = re.sub(r'\s+notes:.*?,?\n', '', inner)
    return f'db.createBrowserProfile({inner})'

content = re.sub(r'db\.createBrowserProfile\(\{([^}]+)\}\)', fix_profile_create, content, flags=re.DOTALL)

# Fix updateBrowserProfile - remove notes if present (not in signature)
def fix_profile_update(m):
    inner = m.group(1)
    inner = re.sub(r'\s+notes:.*?,?\n', '', inner)
    return f'db.updateBrowserProfile({m.group(2)}, {inner})'

content = re.sub(r'db\.updateBrowserProfile\(([^,]+), \{([^}]+)\}\)', fix_profile_update, content, flags=re.DOTALL)

with open(TEST_FILE, 'w', encoding='utf-8') as f:
    f.write(content)

print(f"Patched {TEST_FILE}")
