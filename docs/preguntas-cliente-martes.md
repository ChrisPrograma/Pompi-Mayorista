# Preguntas para el cliente — reunión del martes

Cómo usar esta lista: **no se la leas de corrido**. Las primeras seis están marcadas como
bloqueantes porque su respuesta cambia el modelo de datos y son carísimas de incorporar después.
El resto salen solas mientras le mostrás el boceto.

Regla de la reunión: preguntale por **lo que hace**, no por lo que quiere. "¿Cómo anotás hoy lo
que te deben?" da mejor información que "¿querés un módulo de cuenta corriente?".

---

## BLOQUEANTES — hay que salir de la reunión con esto respondido

### 1. ¿A todos les cobrás lo mismo?

Repreguntar: ¿le hacés precio distinto al que te lleva mucho? ¿Hay algún cliente viejo con precio
especial? ¿Hacés descuento si te paga en el momento?

- **Qué decide:** si `precios_venta` lleva una columna `lista_id` desde el día uno.
- **Por qué ahora:** agregarla después obliga a migrar datos vivos, que es exactamente lo que el
  modelo está diseñado para evitar.

### 2. ¿Vendés por unidad o por bulto?

Repreguntar: cuando le vendés pelotas, ¿le vendés 12 sueltas o una bolsa de 12? ¿El precio es por
bolsa o por pelota? ¿Alguna vez rompés un bulto para vender suelto?

- **Qué decide:** si hay unidad de compra distinta de la unidad de venta, con factor de conversión.
- **Riesgo si se pasa por alto:** el stock queda mal contado desde la primera compra.

### 3. ¿Vendés algo que se vence o que se vende por peso?

Sobre todo: **¿vendés alimento balanceado?**

- **Qué decide:** si hacen falta lotes y fechas de vencimiento. Cambia el modelo de stock entero
  (deja de ser una cantidad y pasa a ser cantidad por lote).
- **Nota:** si hoy no vende alimento pero lo está pensando, conviene saberlo igual y decidir si se
  deja preparado o se posterga explícitamente.

### 4. ¿Hacés factura, o remito, o nada?

Repreguntar: ¿estás inscripto? ¿Alguno de tus clientes te pide factura? ¿Necesitás imprimir algo
en el momento?

- **Qué decide:** si entra facturación electrónica (ARCA/AFIP) en el alcance. **Eso es otro
  proyecto**, con su propio costo y su propio plazo.
- **Cómo manejarlo:** si dice que sí, no lo prometas en la misma cotización. Separalo como etapa 2.

### 5. ¿Trabajás solo?

Repreguntar: ¿alguien más carga el auto, vende o cobra? ¿Tu señora, un hijo, un empleado?

- **Qué decide:** si hay un usuario o varios, con permisos y auditoría de quién hizo cada cosa.
- **Impacto:** con un solo usuario, la app se simplifica muchísimo. Con dos, hay que saberlo ahora.

### 6. ¿Cobrás siempre en pesos?

Repreguntar: ¿alguna vez alguien te paga en dólares? ¿Le comprás en dólares a algún proveedor?

- **Qué decide:** si el sistema es de una moneda o de varias. Multimoneda sin planificarla es de
  las refactorizaciones más dolorosas que existen.

---

## Su operación — para que la app se parezca a su día

### 7. ¿Cuántos productos manejás más o menos?
Si son 30, la lista se ve entera. Si son 300, hay que meter buscador y categorías desde el arranque.

### 8. ¿Cuántos clientes tenés? ¿Y proveedores?
Define si la lista de clientes se muestra completa o necesita búsqueda y agrupación por zona.

### 9. ¿Cuántas veces por semana salís? ¿Siempre la misma ruta?
Define si la ruta es fija por día de semana o se arma cada vez.

### 10. ¿Tenés todo en casa o llevás todo en el auto?
Confirma los dos depósitos del modelo (casa y vehículo). Si hay un tercer lugar (un galpón, la
casa de un familiar), hay que saberlo.

### 11. ¿Qué pasa si un cliente te pide algo que no llevás ese día?
¿Lo anotás? ¿Se lo llevás la próxima? ¿Se pierde la venta?

- **Qué decide:** si hace falta un módulo de **pedidos pendientes**. Sospecho que sí y que hoy lo
  resuelve con memoria, que es plata que se pierde sin que nadie la mida.

### 12. ¿Te devuelven mercadería alguna vez?
Rotura, algo que no se vendió, un cambio de talle. Define el tipo de movimiento "devolución" y si
la devolución vuelve al auto o a la casa.

### 13. ¿Te quedás sin stock seguido? ¿Cómo te das cuenta?
Define si hace falta un aviso de stock mínimo y con qué criterio.

### 14. ¿Tomás pedidos por WhatsApp?
Define si más adelante entra un canal de entrada de pedidos, y si conviene que la app genere el
mensaje de confirmación.

---

## Plata — cómo entra y cómo sale

### 15. ¿Cómo anotás hoy lo que te deben?
Cuaderno, notas del celular, memoria, Excel. Define **de dónde salen los datos iniciales** y
cuánto trabajo de carga hay el primer día. Si es un cuaderno, pedile una foto ahí mismo.

### 16. ¿Te pagan con cheque o con pagaré?
Si la respuesta es sí, hay fecha de cobro futura y el saldo deja de ser un número simple.

### 17. ¿Aceptás transferencia? ¿Mercado Pago? ¿Tarjeta?
Define los medios de pago de la lista y si alguno tiene comisión que haya que descontar de la
ganancia real.

### 18. ¿Le das plazo a todos por igual? ¿A los cuántos días te empezás a preocupar?
Define el umbral de las alertas de deuda vieja. En el boceto puse 30 días de arranque, pero el
número tiene que ser el suyo.

### 19. ¿Vos le pagás a tus proveedores en el momento o en cuenta corriente?
Confirma la mitad del modelo que hoy está menos verificada.

### 20. ¿Cada cuánto te aumentan los proveedores?
Define qué tan seguido va a aparecer la sugerencia de precio y si conviene que sea una revisión
masiva de lista en vez de producto por producto.

---

## El celular y la conexión — condiciona la arquitectura

### 21. ¿Qué celular usás? ¿Android o iPhone? ¿De qué año?
Define el piso de compatibilidad. Un Android viejo con poca memoria cambia decisiones reales.

### 22. ¿Tenés datos en el celular? ¿Te quedás sin señal en alguna zona?
Confirma que el modo sin conexión es obligatorio y no un lujo. (Apuesto a que sí.)

### 23. ¿Usás la compu para algo del negocio, o todo del celular?
Define si hace falta una vista de escritorio de verdad o solo la app responsive.

### 24. ¿Te manejás con el teclado del celular o preferís tocar?
Si escribe poco y mal, todo tiene que ser botones y listas. Es un dato de diseño, no un detalle.

---

## Arranque — qué hace falta para el día uno

### 25. ¿Tenés la lista de precios en algún lado?
Excel, PDF, un mensaje de WhatsApp, el cuaderno. Define si se importa o se carga a mano, y cuánto
sale esa carga inicial.

### 26. ¿Sabés cuánto stock tenés hoy?
Define si el arranque necesita un recuento físico. Conviene que el primer día del sistema sea
después de un conteo, no antes.

### 27. ¿Cuándo querrías empezar a usarlo?
Define si hay que priorizar un mínimo usable antes que la versión completa.

---

## Para tu propuesta — no para el sistema

### 28. ¿Cuánto tiempo por semana te come esto hoy?
Es el número con el que después justificás el precio. Que lo diga él, no vos.

### 29. De todo lo que viste recién, ¿qué es lo primero que querrías dejar de hacer a mano?
Te ordena las prioridades del desarrollo y te dice qué mostrar primero la próxima vez.

### 30. ¿Cómo preferís manejarlo: un pago por el sistema y un abono por el acompañamiento, o todo
mensual?
Él ya pidió el acompañamiento en el audio. Dejalo que elija la forma, no si lo quiere.

---

## Antes de irte de la reunión

- [ ] Foto del cuaderno o del Excel donde anota hoy
- [ ] Foto de la lista de precios actual
- [ ] Nombre exacto del negocio y logo si tiene
- [ ] Qué celular usa (modelo)
- [ ] Fecha tentativa de arranque
