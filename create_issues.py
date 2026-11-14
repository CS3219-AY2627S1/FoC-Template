import csv
import subprocess

with open('github_issues.csv', newline='') as f:
    reader = csv.DictReader(f)
    for row in reader:
        subprocess.run([
            'gh', 'issue', 'create',
            '--title', row['title'],
            '--body', row['body'],
            '--label', row['labels']
        ])