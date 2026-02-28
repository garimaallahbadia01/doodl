@echo off
set PATH=C:\Program Files\Git\cmd;%PATH%
git add -A
git commit -m "fix coordinate mapping aspect ratio"
git push origin main
