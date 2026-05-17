@echo off
echo.
echo Your local network IP addresses:
echo.
ipconfig | findstr /i "IPv4"
echo.
echo Look for something like 192.168.1.25 or 192.168.0.25
echo This is the address for players in the same Wi-Fi/network.
echo.
pause
