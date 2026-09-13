@echo off
chcp 65001 >nul
cd /d "%~dp0.."
echo HotS Scrap 로컬 서버: http://localhost:8801/site/
echo 패치 노트:            http://localhost:8801/site/patchnotes/
echo (이 창을 닫으면 서버가 꺼집니다)
start "" http://localhost:8801/site/patchnotes/
python tools\devserver.py 8801
pause
