@echo off
ping -n 10 127.0.0.1 2> nul
cd /d %1 2> nul
for /F "delims=" %%i in ('dir /b') do (rmdir "%%i" /s/q || del "%%i" /s/q 2> nul)
%2
