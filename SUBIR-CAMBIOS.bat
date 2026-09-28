@echo off
chcp 65001 >nul
cd /d "%~dp0"

rem ===========================================================================
rem  Pompi Mayorista - subir los cambios a GitHub
rem ===========================================================================
rem
rem  QUE HACE, EN UNA LINEA
rem  Toma lo que hay en esta carpeta, te pide una descripcion, lo sube a GitHub
rem  y Vercel publica solo.
rem
rem  POR QUE PREGUNTA LA DESCRIPCION Y NO LA TRAE ESCRITA
rem  Antes el mensaje estaba fijo adentro del archivo, asi que las diez ultimas
rem  subidas decian todas lo mismo. El historial de GitHub es el unico lugar
rem  donde queda escrito QUE cambio cada vez; si todos los renglones dicen lo
rem  mismo, el historial no sirve para nada el dia que haya que volver atras.
rem
rem  POR QUE CHEQUEA ANTES DE SUBIR
rem  Vercel compila con `tsc`. Si los tipos no cierran, el deploy FALLA y el
rem  sitio sigue sirviendo la version vieja - o sea que desde afuera parece que
rem  los cambios no se hicieron. Ya paso dos veces (20/09 y 21/09). Chequear
rem  aca tarda medio minuto y lo evita.
rem
rem  NO USA delayed expansion a proposito: con ella activada, un signo de
rem  admiracion en la descripcion desaparece del mensaje sin avisar.
rem ===========================================================================

set REPO=https://github.com/ChrisPrograma/Pompi-Mayorista.git
set PANEL=https://vercel.com/dashboard
set SITIO=https://pompi-mayorista.vercel.app/

echo ===========================================================
echo   Pompi Mayorista  -  subir los cambios a GitHub
echo ===========================================================
echo.
echo Carpeta: %CD%
echo.

where git >nul 2>nul
if errorlevel 1 goto :sinGit

if exist ".git" goto :yaEsRepo

rem ---------------------------------------------------------------------------
rem  La carpeta tiene los archivos pero nunca fue un repositorio git.
rem  Se la conecta con el repo que ya existe en GitHub SIN pisar nada de lo que
rem  hay aca adentro: `reset` mueve el puntero, no toca los archivos.
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
echo Rama del repositorio: %RAMA%
echo.

git symbolic-ref HEAD refs/heads/%RAMA% || goto :error
git reset -q origin/%RAMA% || goto :error
goto :identidad

:yaEsRepo
git remote get-url origin >nul 2>nul || git remote add origin %REPO%
echo === Traigo lo que hay en GitHub ===
git fetch origin || goto :error
set RAMA=
for /f "delims=" %%r in ('git branch --show-current') do set RAMA=%%r
if "%RAMA%"=="" set RAMA=main
echo Rama del repositorio: %RAMA%
echo.

:identidad
rem  Git no deja commitear sin saber quien sos. Solo pregunta la primera vez.
git config user.email >nul 2>nul
if not errorlevel 1 goto :ponerseAlDia
echo Git todavia no sabe quien sos en esta computadora.
set /p GITNOMBRE=  Tu nombre (ej: Chris):
set /p GITMAIL=  Tu mail de GitHub:
git config user.name "%GITNOMBRE%"
git config user.email "%GITMAIL%"
echo.

rem ---------------------------------------------------------------------------
rem  Ponerse al dia ANTES de tocar nada.
rem
rem  Si alguna vez se sube algo al repositorio desde otro lado - otra
rem  computadora, o Claude - esta carpeta queda atras, y el push de mas abajo
rem  seria rechazado con un "non-fast-forward" que no explica nada. Con el
rem  rebase, lo de esta carpeta se apoya arriba de lo que ya esta en GitHub.
rem
rem  `--autostash` no es un adorno: cuando los archivos nuevos ya estan copiados
rem  en la carpeta -que es el caso normal- el arbol esta sucio, y un
rem  `pull --rebase` a secas se niega a correr con un mensaje que no dice que
rem  hacer. Con autostash, git guarda los cambios, se pone al dia y los vuelve a
rem  poner encima, que es exactamente lo que uno haria a mano.
rem ---------------------------------------------------------------------------
:ponerseAlDia
git rev-parse --verify --quiet origin/%RAMA% >nul
if errorlevel 1 goto :chequeo
echo === Me pongo al dia con GitHub ===
git pull --rebase --autostash origin %RAMA%
if errorlevel 1 goto :choque
echo.

rem ---------------------------------------------------------------------------
rem  El chequeo. Los mismos dos typecheck y los mismos tests que corre Vercel.
rem  Si no hay node_modules no se puede correr, y no es motivo para frenar: se
rem  avisa y se sigue.
rem ---------------------------------------------------------------------------
:chequeo
if not exist "node_modules\typescript" goto :sinChequeo
echo === Chequeo tipos y tests (medio minuto) ===
call npm run antes-de-subir
if errorlevel 1 goto :chequeoFallo
echo.
echo   [OK] tipos limpios y tests en verde.
echo.
goto :cambios

:sinChequeo
echo (i) No hay node_modules en esta carpeta, asi que salteo el chequeo de
echo     tipos y tests. Si el deploy de Vercel llegara a fallar, avisame.
echo.

:cambios
echo === Cambios que se van a subir ===
git add -A
git status --short
echo.

git diff --cached --quiet
if not errorlevel 1 goto :nadaQueSubir

rem ---------------------------------------------------------------------------
rem  Los borrados se cuentan en dos grupos, y la diferencia importa.
rem
rem  Los de dist/ son esperables: dist es la carpeta compilada, Vercel la genera
rem  sola y .gitignore ya la excluye. Que se vayan del repo es lo correcto.
rem
rem  Los de FUERA de dist/ son otra cosa: serian archivos que estan en GitHub y
rem  que en esta carpeta no estan. Ahi si conviene frenar y mirar.
rem ---------------------------------------------------------------------------
set BORRADOS=0
set BORRADOS_OJO=0
for /f %%n in ('git diff --cached --name-only --diff-filter^=D ^| find /c /v ""') do set BORRADOS=%%n
for /f %%n in ('git diff --cached --name-only --diff-filter^=D ^| find /v "dist/" ^| find /c /v ""') do set BORRADOS_OJO=%%n

if not "%BORRADOS%"=="0" echo  (i) %BORRADOS% archivo(s) figuran como borrados; de esos, %BORRADOS_OJO% estan fuera de dist/
if "%BORRADOS_OJO%"=="0" goto :descripcion
echo.
echo -----------------------------------------------------------
echo  [!] OJO: %BORRADOS_OJO% archivo(s) FUERA de dist/ figuran como borrados.
echo      Serian archivos que estan en GitHub y no en esta carpeta.
echo      Si no esperabas eso, CERRA esta ventana y avisame.
echo -----------------------------------------------------------
echo.

rem ---------------------------------------------------------------------------
rem  La descripcion. Una linea, en castellano, diciendo QUE cambio.
rem  Las comillas se sacan porque romperian el `git commit -m "..."`.
rem ---------------------------------------------------------------------------
:descripcion
echo Escribi en UNA LINEA que cambia esta actualizacion.
echo   Ejemplos:  Gastos operativos: cargar, ver y anular
echo              Numeros: caja real y reportes exportables
echo              Arreglo del campo de cantidad en el telefono
echo.
set MENSAJE=
set /p MENSAJE=  Descripcion:
if "%MENSAJE%"=="" goto :sinDescripcion
set MENSAJE=%MENSAJE:"=%
goto :confirmar

:sinDescripcion
echo.
echo  [!] Sin descripcion no se sube: el historial de GitHub es el unico lugar
echo      donde queda escrito que cambio cada vez.
echo.
pause
exit /b 1

:confirmar
echo.
echo -----------------------------------------------------------
echo   Se va a subir con este mensaje:
echo   "%MENSAJE%"
echo -----------------------------------------------------------
echo.
echo Si la lista de cambios de arriba es la que esperabas, segui.
echo Si no, cerra esta ventana con la X y no se sube nada.
echo.
pause

git commit -m "%MENSAJE%" || goto :error
git push -u origin %RAMA% || goto :error

echo.
echo ===========================================================
echo   LISTO. Subido a GitHub.
echo.
echo   Vercel compila solo. Tarda 1 o 2 minutos.
echo   Panel:  %PANEL%
echo   Sitio:  %SITIO%
echo.
echo   Antes de darlo por hecho, fijate que el ultimo deploy
echo   diga READY. Si dice ERROR, el sitio sigue mostrando la
echo   version vieja: copiame el error y lo vemos.
echo ===========================================================
echo.
pause
exit /b 0

:nadaQueSubir
echo -----------------------------------------------------------
echo   No hay nada nuevo para subir: esta carpeta esta igual que
echo   GitHub. Si esperabas cambios, fijate que hayas copiado los
echo   archivos nuevos adentro de esta carpeta.
echo -----------------------------------------------------------
echo.
pause
exit /b 0

:chequeoFallo
echo.
echo -----------------------------------------------------------
echo  [!] El chequeo fallo, asi que NO se subio nada.
echo.
echo      Esto es lo que habria hecho fallar el deploy de Vercel
echo      dejando el sitio en la version vieja.
echo.
echo      Copiame el texto de arriba tal cual y lo arreglo.
echo -----------------------------------------------------------
echo.
pause
exit /b 1

:choque
echo.
echo -----------------------------------------------------------
echo  [!] Lo de esta carpeta choca con lo que hay en GitHub.
echo.
echo      Pasa cuando el mismo archivo se toco en los dos lados.
echo      NO se subio nada y NO se perdio nada.
echo.
echo      Para dejar la carpeta como estaba:
echo        git rebase --abort
echo.
echo      Si tus cambios no aparecen, estan guardados aparte. Volven con:
echo        git stash list
echo        git stash pop
echo.
echo      Copiame el texto de arriba y lo resolvemos.
echo -----------------------------------------------------------
echo.
pause
exit /b 1

:sinGit
echo [!] Git no esta instalado en esta computadora.
echo     Bajalo de https://git-scm.com/download/win y dale Siguiente a todo.
echo     Despues volve a ejecutar este archivo.
echo.
pause
exit /b 1

:error
echo.
echo [!] Algo fallo. Copiame el texto de arriba tal cual y lo vemos.
echo.
pause
exit /b 1
