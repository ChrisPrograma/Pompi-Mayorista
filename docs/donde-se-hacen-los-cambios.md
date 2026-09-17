# Dónde se hace cada cambio

Escrito el **martes 15/09/2026** para contestar una duda concreta: ahora que la app está en línea,
¿los cambios se hacen en Netlify, en Supabase, o dónde?

**Respuesta corta: los cambios de la app se siguen haciendo en el código, igual que siempre.**
Que esté en línea no cambió eso. Lo que sí cambió es que ahora hay **datos reales**, y eso agrega
una regla nueva.

---

## Las tres cosas, y qué es cada una

| | Qué guarda | Quién la toca | Se puede rehacer |
|---|---|---|---|
| **El código** (esta carpeta) | Cómo funciona y cómo se ve la app | Yo, programando | Sí, siempre |
| **Netlify** | Una copia compilada del código, servida al mundo | Se sube, no se edita | Sí, es descartable |
| **Supabase** | Las ventas, clientes, productos y precios **de verdad** | La app, cuando él la usa | **No. Esto es lo único irreemplazable** |

### Netlify no guarda código editable

Es un error común y vale aclararlo: Netlify no es un lugar donde entrás a cambiar la app. Guarda
el **resultado** de compilar el código — unos pocos archivos de JavaScript y CSS con nombres como
`index-9prapy4k.js`, ilegibles a propósito, porque están minificados.

Para cambiar una pantalla hay que cambiar el código, volver a compilar, y subir el resultado.
Ese circuito no lo cambió que la app esté en línea: es el mismo de siempre.

Lo único que se configura **en** Netlify son las variables de entorno (las dos de Supabase) y el
nombre del sitio. Nada más.

### Supabase sí se toca directo, pero con cuidado

Acá hay dos cosas muy distintas:

- **El esquema** (qué tablas y columnas existen). Se cambia con SQL, desde el SQL Editor. **Cada
  cambio queda guardado como un archivo nuevo en `db/migrations/`**, numerado. Eso es lo que
  permite rearmar la base desde cero si hiciera falta, y saber qué se cambió y cuándo.
- **Los datos** (las ventas, los clientes). **Estos no se editan a mano, nunca.** Los escribe la
  app. Tocar una fila desde el panel de Supabase saltea las reglas del sistema — arreglar un
  número ahí puede desbalancear el stock o la deuda sin que nadie se entere.

---

## El circuito, paso a paso

```
   1. Yo cambio el código           →  acá, en esta carpeta
   2. Compilo y pruebo               →  tests + navegador real
   3. Te paso la carpeta dist/       →  ya corregida y verificada
   4. Vos la arrastrás a Netlify     →  queda en línea, misma dirección
```

Si el cambio toca la base:

```
   1b. Escribo la migración SQL      →  db/migrations/00X_loquesea.sql
   2b. La corrés en el SQL Editor    →  o la pego yo, con tu OK
```

El paso 4 lo hacés vos porque el navegador no permite que un archivo se cargue en un formulario
sin que una persona lo elija. No es una limitación que se pueda evitar, y está bien que exista.

---

## La regla nueva, ahora que hay datos reales

Antes, si algo salía mal, se borraba todo y se empezaba de nuevo. **Eso se terminó el día que el
cliente cargue su primer producto.**

De acá en adelante:

- **Las migraciones se agregan, no se editan.** Si `001_esquema.sql` ya corrió contra la base real,
  cambiar ese archivo no cambia nada — hay que escribir `006_lo_que_sea.sql` con el cambio.
- **Nada de `drop table` ni `delete` sin hablarlo antes.** Un deploy malo se arregla subiendo el
  anterior; una tabla borrada, no.
- **Antes de un cambio grande en la base, copia de seguridad.** Supabase tiene backups diarios
  automáticos en el plan gratuito, pero conviene bajarse el respaldo a mano antes de tocar algo
  serio.

---

## Y el código, ¿dónde vive?

Hoy en dos lugares, y ninguno es el ideal:

1. `C:\Users\Chris\Pictures\pompi-mayorista\` — la copia completa y al día, en tu disco.
2. El repositorio de GitHub — **aplanado**, sin las carpetas. Sirve de respaldo, no para trabajar.

**Arreglar el repositorio es lo que falta para que esto quede prolijo**, y ya está preparado: doble
clic en `SUBIR-A-GITHUB.bat`. Con el repo en orden se puede conectar a Netlify y cada `git push`
publica solo — ahí sí desaparece el paso de arrastrar la carpeta.

Mientras tanto, la fuente de verdad es la carpeta de tu disco.
