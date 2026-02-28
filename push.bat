@echo off
set PATH=C:\Program Files\Git\cmd;%PATH%
git add -A
git commit -m "rebuild: MediaPipe Tasks Vision API + visionOS design"
git push origin main
