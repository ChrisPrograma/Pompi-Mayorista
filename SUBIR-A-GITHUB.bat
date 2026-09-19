@echo off
chcp 65001 >nul
setlocal

cd /d "%~dp0"

echo.
echo ===========================================================
echo   Pompi Mayorista  -  subir el proyecto a GitHub
echo ===========================================================
echo.
echo Carpeta: %CD%
echo.

where git >nul 2>nul
if errorlevel 1 (
  echo [!] Git no esta instalado en esta computadora.
  echo.
  echo     Instalalo desde:  https://git-scm.com/download/win
  echo     Dale "Siguiente" a todo. Despues volve a ejecutar este archivo.
  echo.
  echo     Alternativa sin instalar nada: abri
  echo     https://github.com/ChrisPrograma/Pompi-Mayorista/upload/main
  echo     y ARRASTRA esta carpeta entera adentro del recuadro.
  echo     Arrastrar la CARPETA conserva la estructura.
  echo     Elegir archivos con el boton "choose your files" NO la conserva.
  echo.
  pause
  exit /b 1
)

echo Esto va a REEMPLAZAR por completo el contenido del repo
echo   https://github.com/ChrisPrograma/Pompi-Mayorista
echo por el contenido de esta carpeta, con las carpetas bien puestas.
echo.
echo Los 4 commits viejos (los archivos sueltos) se pierden.
echo No hay nada valioso ahi: son los intentos de subida aplanados.
echo.
echo Si NO querés hacerlo, cerra esta ventana ahora.
echo.
pause

echo.
echo --- Preparando el repositorio local ---
if not exist ".git" (
  git init -b main || goto :error
) else (
  git checkout -B main || goto :error
)

git remote remove origin >nul 2>nul
git remote add origin https://github.com/ChrisPrograma/Pompi-Mayorista.git || goto :error

echo.
echo --- Agregando archivos ---
git add -A || goto :error
git -c user.name="Chris" -c user.email="maclarensbs@gmail.com" commit -m "Proyecto completo con la estructura de carpetas real" || goto :error

echo.
echo --- Subiendo a GitHub ---
echo     (si pide permiso, se abre el navegador para que inicies sesion)
git push --force origin main || goto :error

echo.
echo ===========================================================
echo   LISTO. Revisa: https://github.com/ChrisPrograma/Pompi-Mayorista
echo   Tienen que verse las carpetas db, docs, scripts y src.
echo ===========================================================
echo.
pause
exit /b 0

:error
echo.
echo [!] Algo fallo. Copiá el texto de arriba y pasamelo.
echo.
pause
exit /b 1
