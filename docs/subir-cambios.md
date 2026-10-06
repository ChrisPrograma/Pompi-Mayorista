# Cómo se sube un cambio

El circuito completo, de una modificación hasta que está en vivo, y qué hace
cada uno.

---

## Dónde vive el proyecto

```
D:\BACK UP\Chris\Documentos\Proyectos Claude\Pompi Mayorista
```

Esa carpeta está **conectada a la sesión de Claude**, que es lo que hace que el
circuito de abajo funcione: Claude escribe los archivos ahí adentro
directamente, sin pasar por un .zip.

Antes el proyecto estaba en `C:\Users\Chris\Pictures\pompi-mayorista`. **Esa
carpeta quedó obsoleta y hay que borrarla**: su contenido era del 16/09 —le
faltaban los dos `tsconfig` nuevos y le sobraban `_headers`, `netlify.toml` y
`SUBIR-A-GITHUB.bat`—, así que subir desde ahí habría borrado del repositorio
decenas de archivos buenos.

---

## El circuito

```
Maclarens: prompt  →  Claude escribe los archivos en la carpeta
                   →  doble clic en SUBIR-CAMBIOS.bat
                   →  una línea de descripción
                   →  GitHub  →  Vercel publica solo
```

**Lo único que Maclarens hace a mano es ejecutar el `.bat` y escribir la
descripción.**

---

## `SUBIR-CAMBIOS.bat`, paso por paso

El archivo está en la raíz del proyecto. Doble clic y sigue solo. En orden:

| # | Qué hace | Por qué |
|---|---|---|
| 1 | Se fija que git esté instalado | Sin git no hay nada que hacer, y conviene decirlo en la primera línea y no a la mitad |
| 2 | Conecta la carpeta con GitHub si todavía no lo estaba | Hace `reset`, que mueve el puntero y **no toca los archivos** de la carpeta |
| 3 | **Trae lo que hay en GitHub** (`pull --rebase --autostash`) | Si alguna vez se sube algo desde otro lado, esta carpeta queda atrás y el push sería rechazado con un mensaje que no explica nada. El `--autostash` es el que deja que esto funcione con los archivos nuevos ya copiados adentro: git los guarda, se pone al día y los vuelve a poner encima |
| 4 | **Corre los dos typecheck y los 366 tests** | Es lo que compila Vercel. Si los tipos no cierran, el deploy **falla** y el sitio sigue mostrando la versión vieja |
| 5 | Muestra la lista de cambios | Para poder frenar antes de subir algo que no se esperaba |
| 6 | Avisa si hay borrados **fuera de `dist/`** | Serían archivos que están en GitHub y en la carpeta no. Los de `dist/` son normales: esa carpeta la genera Vercel |
| 7 | **Pide una línea de descripción** | El historial de GitHub es el único lugar donde queda escrito qué cambió cada vez |
| 8 | Muestra el mensaje y espera confirmación | Última puerta antes de subir |
| 9 | Commit y push | |
| 10 | Recuerda mirar que el deploy diga **READY** | Un deploy en **ERROR** deja el sitio en la versión anterior y desde afuera parece que los cambios no se hicieron |

### El paso 4 no es opcional, y ya costó caro

Pasó dos veces: el **20/09** por dos importaciones sin usar en un test, y el
**21/09** por un `node:fs` adentro de otro test. Las dos veces el deploy falló,
el sitio siguió sirviendo la versión anterior, y desde afuera parecía que los
cambios no se habían hecho.

Si no hay `node_modules` en la carpeta, el chequeo se saltea con un aviso en vez
de frenar: es mejor subir sin chequear que no poder subir.

### La descripción

Una línea, en castellano, diciendo **qué cambia**. No "cambios" ni
"actualización":

```
Gastos operativos: cargar, ver y anular
Números: caja real y reportes exportables
Arreglo del campo de cantidad en el teléfono
```

Sin descripción no sube. Antes el mensaje estaba escrito fijo adentro del
archivo, así que diez subidas seguidas decían todas lo mismo y el historial no
servía para nada el día que hubiera que volver atrás.

---

## `SUBIR-A-GITHUB.bat` está borrado, y conviene saber por qué

Hacía `git push --force`, que **reemplaza el repositorio entero** por lo que haya
en la carpeta. Tenía sentido una sola vez, el 17/09, cuando el repo estaba
aplanado y había que rehacerlo desde cero.

Hoy el repositorio tiene más de cuarenta commits buenos. Ejecutar ese archivo por
error —o por costumbre, porque el nombre se parece— **borra todo el historial**.
Por eso se sacó del proyecto en vez de dejarlo "por las dudas".

**Si todavía está en la carpeta de la computadora, hay que borrarlo a mano.**

---

## El último paso que queda, y es opcional

Claude **no puede escribir en el repositorio de GitHub**. Lo comprobado,
textual:

```
access denied by the git proxy: ChrisPrograma/Pompi-Mayorista is not in this
session's authorized repository set
```

Puede **clonar y leer** el repositorio, pero no subir. Para que pueda, el
repositorio tiene que estar agregado a las **fuentes de la sesión** desde la
aplicación de escritorio de Claude.

Con eso hecho, el circuito queda así:

```
Claude escribe el código  →  Claude sube a GitHub  →  Vercel publica solo
```

y Maclarens deja de ejecutar nada.

**Es opcional y no urgente.** Con la carpeta conectada, el circuito ya es el de
un solo doble clic. Y hay algo a favor de dejarlo así: ese doble clic es el
momento en que la lista de cambios se ve antes de subir. Automatizarlo también
saca esa mirada del medio.

Si algún día se activa, el `.bat` no se tira: sigue siendo el camino cuando es
él quien toca un archivo, y el `pull --rebase --autostash` del paso 3 está
justamente para que las dos puntas convivan sin pisarse.

---

## Reglas que no cambian aunque el circuito se automatice

1. **Las migraciones se agregan, nunca se editan** una vez corridas.
2. **Antes de cada `apply_migration` se muestra el SQL exacto y se espera el
   OK.** Que la herramienta pueda escribir no cambia quién decide.
3. **Las filas de datos no se tocan a mano** desde el panel de Supabase.
4. **Nada de `drop` ni `delete`** sin hablarlo antes.
5. **Ninguna prueba contra la base real** que deje un asiento en la contabilidad
   del negocio.
6. **El recorrido guiado se revisa en cada lote.** Acordado el 01/10. Si un lote
   agrega, saca o cambia una función que el cliente usa, en ese mismo lote se
   toca `src/ui/recorrido.ts` — no "más adelante".

   El botón *"Ver cómo funciona, paso a paso"* del inicio es **la única
   documentación que el cliente lee**, y es la que más fácil se despega: nadie la
   abre trabajando, así que puede quedar meses describiendo una app que no es la
   que tiene adelante. Ya pasó una vez y hubo que reescribirla entera el 21/09.

   Dos tests obligan a decidir, pero no alcanzan solos:

   - `cada pantalla está en el recorrido o exenta a propósito` — agregar una
     pantalla y no decidir qué hacer con ella pone el test en rojo.
   - `todas las anclas declaradas se usan` — un lugar marcado para el recorrido
     que ningún paso señala es una parte de la app que el recorrido no cuenta.

   **Lo que ningún test puede atrapar es una función nueva adentro de una
   pantalla que ya tenía paso.** Para eso está esta regla escrita.
