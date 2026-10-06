# El idioma de la plata: "saldo" y "deber"

Pablo empezó a manejar términos contables, así que la app habla así. Este
documento es **el inventario completo**: qué dice cada lugar, cómo llegar a
mirarlo, y qué NO se cambia a propósito.

Existe porque la primera pasada se hizo sin inventario y quedaron cosas afuera
que después aparecieron usando la app. Un barrido con buscar-y-reemplazar no
alcanza: la misma palabra significa cosas distintas según de quién sea la plata.

---

## La regla, en una línea

> **La plata que un COMERCIO todavía no pagó se llama SALDO.
> La plata que PABLO le debe a un proveedor se sigue diciendo "deber".**

No es un capricho de estilo: son las dos puntas de su plata y son lo que más
fácil se confunde mirando rápido. Si las dos dijeran "saldo", habría que leer
la pantalla entera para saber de qué lado está cada número.

---

## Control antes de un deploy

Recorrido de 5 minutos. Cada renglón dice **cómo llegar** y **qué tiene que
decir**. Para que sirva, hay que mirarlo con un comercio que tenga saldo y otro
que no.

### Inicio

| Dónde | Tiene que decir |
|---|---|
| Encabezado, arriba a la derecha | **Saldo** |
| Barra de abajo, segundo ícono | **Saldo** |
| *Tu día en 2 pasos*, segunda misión | **Cobrar un saldo** |
| Tira de actividad, en un cobro | **Te pagó un saldo** |
| Tira de actividad, en una venta a cuenta | **saldo** (a la derecha) |
| Aviso de deuda vieja (si aparece) | *"X te debe hace N días"* — **ver nota 1** |

### Vender

| Dónde | Tiene que decir |
|---|---|
| Paso 1, lista de comercios | chapita **saldo $X** / **sin saldo** |
| Paso 1, al elegir uno con saldo | *"Ojo: ya tiene un saldo de $X, de hace N días."* |
| Paso 1, al elegir uno sin saldo | *"No tiene saldo pendiente."* |
| Paso 3, tercera opción de cobro | **Queda todo como saldo** · *El total se suma al saldo del comercio* |
| Paso 3, "me paga una parte" | renglón en vivo: **Saldo** |
| Pantalla de éxito, venta a cuenta | **Saldo del comercio** |

### Saldo (la pantalla del segundo ícono)

| Dónde | Tiene que decir |
|---|---|
| Número grande de arriba | **Saldo total en la calle** |
| Título de la lista | **Saldo por comercio** |
| Sección de los que no deben | **Sin saldo** |
| Si no debe nadie | **Ningún comercio tiene saldo** |
| Hoja de cobro → al confirmar | *"A X le queda un saldo de $Y"* o *"X quedó sin saldo"* |
| Hoja de cobro → el delta | **Saldo total en la calle** |

### Mis clientes

| Dónde | Tiene que decir |
|---|---|
| Chapita de cada comercio | **saldo $X** / **sin saldo** |
| Chips de *Ordenar por* | **Saldo** (no "Deuda") |
| Ficha del comercio, número grande | **de saldo, hace N días** / **sin saldo** |
| Ficha → *Sus últimas ventas* | **saldo $X** debajo del importe |
| Al agregar un comercio | *"Ya podés venderle y llevarle el saldo."* |
| Al archivar un comercio | *"Sus ventas y su saldo siguen en el historial"* |

### La venta en detalle, y el comprobante

| Dónde | Tiene que decir |
|---|---|
| Ficha de la venta, al lado de la fecha | **Saldo** (si no está cobrada) |
| Ficha de la venta, último renglón | **Saldo** — o **Saldo anterior** si está anulada |
| Comprobante (imagen y texto), renglón | **Saldo** |
| Comprobante, cápsula de estado | **SALDO** |
| Al anular una venta | *"…ya no figura en el saldo del comercio"* + **Saldo del comercio** |

### Números

| Dónde | Tiene que decir |
|---|---|
| Tarjeta del cuarto reporte | **Saldos a cobrar** |
| Adentro, título | **Saldos a cobrar** |
| Si no debe nadie | **Ningún comercio tiene saldo** |
| Columna del Excel que se baja | **Saldo desde** |

### Recorrido guiado

El recorrido es documentación: si las etiquetas cambian y él no, miente. Los
pasos que nombran saldos son el 2, el 9, el 13, el 14 y el 23. **Hay un test que
exige que la palabra "saldo" aparezca en el texto del recorrido** — si alguien
saca el concepto y se olvida, se pone en rojo.

---

## Lo que a propósito NO dice "saldo"

Si aparece alguna de estas, **está bien**: es plata que debe Pablo, no un
comercio.

| Dónde | Dice |
|---|---|
| Hub de *Mis cosas*, tarjeta de proveedores | *les debés $X* / *estás al día* |
| Lista de proveedores | *le debés $X* / *al día* |
| Ficha del proveedor | *Vos les debés* |
| Entrada de mercadería en cuenta | *Se suma a lo que vos le debés a él* |
| Comprobante de un ingreso | *Queda a pagar* / **QUEDA A PAGAR** |
| Ficha de una compra al contado | *sin deuda* |
| Tira de actividad, en una compra en cuenta | *se lo debés* |
| Aviso de la caja, en Números | *"Falta contar lo que le debés a proveedores"* |
| Chips de *Ordenar por* de proveedores | **Deuda** |

**Nota 1 — el aviso del inicio.** Sigue diciendo *"X te debe hace N días"*. Es la
única excepción del lado del cliente, y es a propósito: ese cartel es una
alarma, no una etiqueta de dato, y ahí el idioma directo golpea más que el
contable. **Si lo querés unificado, es una línea** — decilo y lo cambio.

**Nota 2 — *Mis precios · al día*.** Aparece un "al día" en la pantalla de
precios sugeridos. No habla de plata que debe nadie: dice que la lista de
precios está actualizada.

---

## Lo que es interno y nunca se ve

Un buscador de "debe" o "deuda" en el código va a encontrar esto. **No son
textos de pantalla y no hay que tocarlos**: cambiarlos no mejora nada y mueve
cosas que están atadas a la base de datos y a los tests.

| Qué | Dónde |
|---|---|
| La ruta `deudas` | `src/ui/rutas.ts` |
| El ancla `lista-deudas` del recorrido | `src/ui/recorrido.ts` |
| El id de orden `'deuda'` | `src/ui/orden.ts` |
| El estado `'debe'` de una venta | `src/ui/vistas.ts` |
| La opción de cobro `forma === 'debe'` | `src/ui/pantallas.tsx` |
| Las clases de CSS `.debe`, `.debt` | `src/ui/estilos.css` |
| `vistaDeudas`, `deudas.totalCent`, `deboCent`, `debeCent` | en todo el dominio |

---

## Si hay que seguir cambiando el idioma

La próxima pasada, el método que funciona:

1. **Inventario primero.** Buscar todas las variantes de la palabra en
   `src/ui/`, y clasificar cada una en: etiqueta de cliente, etiqueta de
   proveedor, prosa, o identificador interno. Mostrar la lista **antes** de
   tocar nada.
2. **Cambiar, y hacer que el recorrido guiado siga.** Es la regla 5 de
   `src/ui/recorrido.ts`.
3. **Actualizar este documento en el mismo lote.** Si queda viejo, la próxima
   vez hay que rehacer el inventario desde cero — que es exactamente lo que pasó
   esta vez.
