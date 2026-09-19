@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"

set REPO=https://github.com/ChrisPrograma/Pompi-Mayorista.git
set MENSAJE=App vacia por defecto y descarga inicial desde Supabase

echo ===========================================================
echo   Pompi Mayorista  -  subir los cambios a GitHub
echo ===========================================================
echo.
echo Carpeta: %CD%
echo.

where git >nul 2>nul
if errorlevel 1 (
  echo [!] Git no esta instalado en esta computadora.
  echo     Bajalo de https://git-scm.com/download/win y dale Siguiente a todo.
  echo     Despues volve a ejecutar este archivo.
  echo.
  pause
  exit /b 1
)

if exist ".git" goto :yaEsRepo

rem ---------------------------------------------------------------------------
rem  Esta carpeta tiene los archivos pero nunca fue un repositorio git.
rem  Se la conecta con el repo que ya existe en GitHub, SIN pisar lo que hay
rem  aca adentro: "reset" mueve el puntero, no toca los archivos de la carpeta.
rem ---------------------------------------------------------------------------
echo Esta carpeta todavia no estaba conectada con GitHub. La conecto.
echo.
git init -q || goto :error
git remote add origin %REPO% || goto :error
echo === Traigo lo que hay en GitHub ===
git fetch origin || goto :error

set RAMA=main
git show-ref --verify --quiet refs/remotes/origin/main
if errorlevel 1 set RAMA=master
echo Rama del repositorio: !RAMA!
echo.

git symbolic-ref HEAD refs/heads/!RAMA! || goto :error
git reset -q origin/!RAMA! || goto :error
goto :identidad

:yaEsRepo
git remote get-url origin >nul 2>nul || git remote add origin %REPO%
echo === Traigo lo que hay en GitHub ===
git fetch origin || goto :error
for /f "delims=" %%r in ('git branch --show-current') do set RAMA=%%r
if "!RAMA!"=="" set RAMA=main
echo Rama del repositorio: !RAMA!
echo.

:identidad
rem  Git no deja commitear sin saber quien sos. Solo pregunta la primera vez.
git config user.email >nul 2>nul
if not errorlevel 1 goto :cambios
echo Git todavia no sabe quien sos en esta computadora.
set /p GITNOMBRE=  Tu nombre (ej: Chris):
set /p GITMAIL=  Tu mail de GitHub:
git config user.name "!GITNOMBRE!"
git config user.email "!GITMAIL!"
echo.

:cambios
echo === Cambios que se van a subir ===
git add -A
git status --short
echo.

rem ---------------------------------------------------------------------------
rem  Los borrados se cuentan en dos grupos, y la diferencia importa.
rem
rem  Los de dist/ son esperables y sanos: dist es la carpeta compilada. Cuando el
rem  repo se creo a mano subio con dist adentro, pero ahora Netlify compila solo
rem  desde el codigo y esa copia vieja no sirve para nada (ademas .gitignore ya
rem  la excluye). Que se vayan del repo es lo correcto.
rem
rem  Los de FUERA de dist/ son otra cosa: serian archivos que alguien subio a
rem  GitHub y que en esta carpeta no estan. Ahi si conviene frenar y mirar.
rem ---------------------------------------------------------------------------
for /f %%n in ('git diff --cached --name-only --diff-filter^=D ^| find /c /v ""') do set BORRADOS=%%n
for /f %%n in ('git diff --cached --name-only --diff-filter^=D ^| find /v "dist/" ^| find /c /v ""') do set BORRADOS_OJO=%%n

if not "!BORRADOS!"=="0" echo  (i) !BORRADOS! archivo(s) figuran como borrados; de esos, !BORRADOS_OJO! estan fuera de dist/
if "!BORRADOS_OJO!"=="0" goto :confirmar
echo.
echo -----------------------------------------------------------
echo  [!] OJO: !BORRADOS_OJO! archivo(s) FUERA de dist/ figuran como borrados.
echo      Serian archivos que estan en GitHub y no en esta carpeta.
echo      Si no esperabas eso, CERRA esta ventana y avisame.
echo -----------------------------------------------------------
echo.

:confirmar
echo Si la lista de arriba es la que esperabas, segui.
echo Si no, cerra esta ventana con la X y no se sube nada.
echo.
pause

git commit -m "%MENSAJE%"
git push -u origin !RAMA! || goto :error

echo.
echo ===========================================================
echo   LISTO.
echo   Netlify compila solo. Tarda 1 o 2 minutos.
echo   Mira el deploy en:
echo   https://app.netlify.com/projects/pompi-mayorista/deploys
echo ===========================================================
echo.
pause
exit /b 0

:error
echo.
echo [!] Algo fallo. Copiame el texto de arriba tal cual y lo vemos.
echo.
pause
exit /b 1
