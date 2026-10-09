# Pruebas manuales antes de usar Wolf Gym con datos reales

Revisión: 2 de octubre de 2026. Esta guía interpreta «entrar en software» como pasar a operación real. Incluye comportamiento esperado, errores, permisos y persistencia. **Todos los casos manuales están pendientes de ejecución**: revisar código o aprobar una prueba con respuestas simuladas no equivale a aprobar estos casos.

Leer también [la revisión de seguridad y bloqueos](security-review-2026-10-02.md) y [las reglas de negocio](business-rules.md). Algunos resultados de esta guía son criterios de aceptación que la aplicación todavía debe demostrar; los bloqueos conocidos se identifican expresamente.

## Preparación y criterio para aprobar

Ejecutar en una base de pruebas aislada, con Culqi de pruebas, buzón de pruebas y almacenamiento separado. No usar tarjetas, huellas ni datos personales reales para descubrir errores. Preparar:

- Un administrador y dos clientes diferentes, A y B. Probar también navegador sin sesión.
- Clientes con membresía vigente, vencida ayer, que termina hoy y sin fecha final; uno con deuda mensual y diaria.
- Un cliente sin huella, uno con huella registrada y uno con correo verificado; teléfonos/DNI conocidos y duplicados controlados.
- Producto público de S/10, descuento 10%, stock 3; otro exclusivo del gimnasio; otro agotado.
- Rutina borrador y publicada, programa asignado, sesiones de entrenamiento propias y ajenas; plan nutricional borrador y publicado.
- Imágenes JPEG/PNG/WebP válidas, archivo vacío, archivo de más de 5 MiB y texto/SVG renombrado como imagen.
- Acceso al lector real, servicio biométrico local, dos pestañas y dos navegadores. Para fechas límite, usar un entorno de pruebas con reloj controlado, sin cambiar el reloj de producción.

**P0**: bloqueo para operar, cobrar o proteger datos. **P1**: requisito funcional para habilitar el módulo. **P2**: usabilidad y calidad. Aprobar todos los P0 y los P1 de cada módulo que se habilitará. Un módulo con P0 pendiente debe permanecer fuera de operación. La compra de membresías y la conciliación de Culqi tienen bloqueos abiertos B01/B02.

Registrar cada ejecución con esta ficha; repetir el caso tras corregir un fallo:

Para registrar toda la ronda, usar el [Excel con los 200 casos](../outputs/01a0fedc-6cce-77e1-ade8-e0610d80bbd8/pruebas-manuales-wolf-gym.xlsx). Incluye resumen automático, filtros, columnas separadas, texto ajustado y estados editables. La [copia CSV](manual-acceptance-checklist.csv) usa punto y coma, BOM UTF-8 y `sep=;` para evitar que Excel coloque toda la fila en una sola columna. Todos los casos empiezan pendientes; completar responsable, fecha Lima, versión, entorno, resultado real y evidencia al ejecutarlos.

| Caso | Versión/commit | Fecha Lima | Persona | Estado: pendiente/aprobado/fallido/no aplica | Resultado real | Evidencia sin secretos | Incidencia |
|---|---|---|---|---|---|---|---|
| ID de abajo | | | | Pendiente | | | |

«No aplica» requiere motivo; no sirve para omitir un fallo. Las capturas deben ocultar contraseñas, códigos, tokens, documentos y datos de salud.

## Comportamiento común de cualquier acción

| ID | Nivel | Acción y pasos | Debe responder así |
|---|---|---|---|
| GEN01 | P1 | Guardar un formulario válido con red lenta. | Indicar carga, impedir envíos duplicados, mostrar éxito solo tras confirmación del servidor y actualizar los datos. |
| GEN02 | P1 | Guardar con campos vacíos, espacios, valores inválidos y límites. | Señalar el campo y el problema; conservar lo escrito; no crear registros parciales. |
| GEN03 | P1 | Abrir edición, cambiar datos y cancelar/cerrar/Escape. | No persistir cambios; volver a los valores guardados al abrir de nuevo. Advertir si se pierde una edición significativa. |
| GEN04 | P0 | Hacer doble clic, pulsar Enter repetidamente y reenviar desde dos pestañas. | Una acción lógica no debe producir dos cobros, dos ventas, dos entradas ni dos registros accidentales. Verificar base y reporte, no solo el mensaje. |
| GEN05 | P1 | Recargar tras crear/editar/eliminar y abrir otro navegador. | Los cambios confirmados persisten; no depender solo del estado de React o del almacenamiento del navegador. |
| GEN06 | P1 | Cortar la conexión antes/durante/después de guardar. | Mostrar error o estado incierto correcto; no prometer éxito, no perder datos escritos y permitir recuperar sin duplicar. |
| GEN07 | P0 | Expirar/revocar la sesión con un formulario abierto e intentar guardar. | Rechazar la operación; pedir iniciar sesión. No mantener acceso porque la pantalla sigue abierta. |
| GEN08 | P1 | Forzar respuestas 400/401/403/404/409/429/500/502/503 en pruebas. | Mensaje entendible; 401 invita al login, 403 niega permiso, 409 exige refrescar, 429 respeta espera. No mostrar SQL, stack, secretos ni JSON crudo de proveedores. |
| GEN09 | P1 | Listado vacío, búsqueda sin resultados y error de carga. | Diferenciar «sin datos» de «no se pudieron cargar»; ofrecer reintento; no mostrar ceros como si fueran datos reales tras un error. |
| GEN10 | P0 | Copiar URL de un recurso de A y abrirla como B o sin sesión; repetir petición desde Network. | Rechazo en servidor; ocultar controles en la interfaz por sí solo no es suficiente. |

## Inicio público y navegación

| ID | Nivel | Acción y pasos | Debe responder así |
|---|---|---|---|
| PUB01 | P1 | Abrir `/` sin sesión; navegar a planes, historias, galería y tienda. | Cargar contenido público, navegación y llamadas a acción sin errores ni controles de administración. |
| PUB02 | P1 | Abrir la portada sin planes persistidos. | Mostrar planes de respaldo; leer la portada no debe crear planes en la base. |
| PUB03 | P0 | Elegir plan sin sesión. | Pedir login antes de cualquier pago; preservar una navegación comprensible. |
| PUB04 | P0 | Elegir un plan autenticado y revisar el flujo completo. | Por defecto informa activación en recepción y no abre pago. Antes de habilitar compra online: pago y asignación exacta del plan/duración. **B01: flujo online pendiente; no aprobar su habilitación.** |
| PUB05 | P1 | Bloquear la carga del script de Culqi. | Informar pasarela no disponible; no abrir checkout vacío ni indicar compra exitosa. |
| PUB06 | P1 | Abrir imágenes rotas y enlaces externos/WhatsApp/contacto. | Fallback de imagen; destino correcto. Abrir un enlace no debe enviar automáticamente mensajes. |
| PUB07 | P0 | Intentar editar planes, historias o galería con cliente y anónimo. | API rechaza; solo el administrador puede modificar contenido. |

## Registro, login y sesión

| ID | Nivel | Acción y pasos | Debe responder así |
|---|---|---|---|
| AUT01 | P0 | Registrar cliente válido; enviar también `role: admin` en la petición. | Crear usuario y perfil una sola vez, siempre como cliente; nunca aceptar escalada de rol. |
| AUT02 | P1 | Registrar usuario/teléfono/email duplicado; repetir con mayúsculas y distintos formatos de teléfono. | No crear otra identidad equivalente; error claro. Variantes y concurrencia requieren validación especial B08. |
| AUT03 | P0 | Registrar contraseñas de 7 caracteres, 8 caracteres y más de 72 bytes UTF-8. | Rechazar corta/excesiva; aceptar válida. No truncar silenciosamente una contraseña con emojis. |
| AUT04 | P1 | Nombre vacío, email inválido, teléfono inválido, datos muy largos o HTML en campos. | Validar; HTML se muestra como texto. No permitir páginas o scripts incrustados. |
| AUT05 | P0 | Login correcto como admin y cliente; intentar ir al panel del otro rol. | Redirigir a su panel; servidor niega las operaciones del otro rol. |
| AUT06 | P0 | Login con usuario inexistente y con contraseña incorrecta. | Mismo error genérico de credenciales; no revelar contraseña, hash o secreto 2FA. |
| AUT07 | P0 | Hacer 8 intentos fallidos para una misma identidad; intentar otro antes de 15 minutos. | Bloquear temporalmente y comunicar espera; no reiniciar contador refrescando la página. En varios procesos, ver B06. |
| AUT08 | P0 | Cliente con 2FA: login sin OTP, OTP incorrecto, expirado y válido. | Solo OTP válido permite sesión; el código debe tener seis dígitos. |
| AUT09 | P0 | Abrir dos navegadores, cambiar/restablecer contraseña desde uno y usar la sesión anterior. | La sesión anterior deja de autorizar APIs y `/api/auth/session` deja de entregar sesión válida; contraseña antigua falla. |
| AUT10 | P0 | Cambiar rol, activar 2FA o borrar cuenta de una sesión abierta en pruebas. | Revocar los JWT anteriores y los permisos elevados; las conexiones de eventos también dejan de entregar datos. |
| AUT11 | P0 | Cerrar sesión; usar atrás, recargar y volver a pedir datos privados. | No recuperar datos ni poder guardar. Revisar el caché del navegador y Network. |
| AUT12 | P0 | Revisar cookies en HTTPS y en localhost. | Cookie de sesión HttpOnly, SameSite=Lax; Secure en HTTPS. No guardar contraseña ni token de sesión en localStorage. |
| AUT13 | P1 | Volver a entrar tras desplegar estas correcciones. | Las sesiones antiguas sin versión de credenciales requieren nuevo login; informar este cambio al personal. |

## Recuperación, verificación de correo y 2FA

| ID | Nivel | Acción y pasos | Debe responder así |
|---|---|---|---|
| SEG01 | P0 | Solicitar recuperación para cuenta existente e inexistente. | Mensaje externo genérico; el correo debe enviarse solo al destino verificado de la cuenta correspondiente. |
| SEG02 | P0 | Solicitar recuperación más de tres veces para la misma identidad en 15 minutos. | 429 y Retry-After; no inundar el buzón. |
| SEG03 | P0 | Abrir recuperación válida, usada, alterada y vencida (>60 min). | Solo la válida cambia contraseña; las demás fallan sin modificar cuenta. |
| SEG04 | P0 | Enviar simultáneamente dos restablecimientos con el mismo token. | Un único consumo y una única contraseña final; segundo intento rechazado. |
| SEG05 | P0 | Cambiar contraseña con la actual incorrecta, nueva corta/excesiva o igual a la actual. | Rechazar sin cambios; conservar sesión hasta un cambio válido. |
| SEG06 | P0 | Solicitar verificación sin sesión o usando el `userId` de B desde A. | 401 o 403; no generar ni enviar desafío para otra cuenta. |
| SEG07 | P0 | Verificar con código/token vacío, inventado, usado, vencido o acompañado de un `userId` ajeno. | No verificar una cuenta por conocer su ID. Un enlace válido identifica al dueño del token; un código exige la sesión del dueño. |
| SEG08 | P0 | Abrir enlace real de correo sin sesión y sin `userId` en la URL. | Verificar únicamente al dueño; actualizar su usuario al correo probado; ir a `/auth/login`. |
| SEG09 | P0 | Cambiar email directamente por `/api/user/username`, `/api/user/update`, `/api/profile/update` o edición admin. | No convertir un correo nuevo no verificado en identidad verificada. |
| SEG10 | P0 | Reenviar verificación y usar el desafío anterior. | El anterior deja de funcionar; máximo 3 envíos y 8 verificaciones de código por 15 minutos. |
| SEG11 | P0 | Iniciar alta 2FA, escanear QR y confirmar OTP válido dentro de 10 minutos. | Activar solo el secreto emitido para esa sesión; cerrar sesión y requerir nuevo login con OTP. |
| SEG12 | P0 | Confirmar 2FA sin iniciar alta, cambiar secreto enviado, copiar cookie de otra cuenta o usar alta vencida. | Rechazar sin modificar el factor. Cookie de alta HttpOnly, SameSite=Strict, Secure en HTTPS. |
| SEG13 | P0 | Volver a iniciar/confirmar 2FA cuando ya estaba activo. | Conflicto 409; no sobrescribir el factor existente. |
| SEG14 | P1 | SMTP caído y conexión lenta al enviar código/recuperación. | Mensaje de fallo, no de email enviado; no exponer credenciales SMTP. Probar entrega real en buzón de pruebas. |

## Clientes y perfil administrativo

| ID | Nivel | Acción y pasos | Debe responder así |
|---|---|---|---|
| CLI01 | P1 | Buscar por nombre, teléfono y DNI; limpiar filtro; cambiar página. | Resultado correcto, acentos manejados de forma consistente; no confundir ID de usuario con ID de perfil. |
| CLI02 | P0 | Crear cliente válido con contraseña vacía y con contraseña personalizada. | Generar contraseña aleatoria o respetar la válida; perfil ligado al usuario correcto. Respuesta privada sin caché. |
| CLI03 | P1 | Crear/editar DNI que no tenga 8 dígitos y teléfonos PE con/sin +51. | Rechazar inválidos; normalizar sin crear duplicados ni buscar otra persona accidentalmente. |
| CLI04 | P1 | Editar nombre, contacto, emergencia, dirección, plan y fechas; guardar y recargar. | Persistir usuario/perfil de forma coherente; tarjetas y búsquedas reflejan los cambios. |
| CLI05 | P0 | Fecha inexistente, inicio posterior al final, deuda negativa y plan vacío. | Rechazar con validación, sin registros inconsistentes ni error genérico por dato inválido. |
| CLI06 | P0 | Renovar membresía vencida, que termina hoy y vigente; usar promoción. | Aplicar duración acordada sin restar días; fecha final coherente en perfil, panel y check-in. **B04: validar fuentes de membresía distintas.** |
| CLI07 | P0 | Solicitar credenciales de cliente sin correo verificado. | Generar contraseña temporal solo para ese cliente; revocar sesiones anteriores; no enviarla automáticamente. |
| CLI08 | P0 | Solicitar credenciales de cliente con correo verificado. | Mantener contraseña; indicar recuperación por email y mostrar email enmascarado. |
| CLI09 | P0 | Abrir detalle/editar/listar perfil; inspeccionar JSON y consola. | No devolver password/hash, otpCode, twoFASecret, tokens de recuperación ni plantilla biométrica. |
| CLI10 | P1 | Cambiar foto; archivo inválido; cancelar; repetir. | Solo imagen aceptada modifica avatar; fallo/cancelación conserva foto anterior. |
| CLI11 | P0 | Borrar cliente con ventas, pagos, deuda, huellas y asignaciones; primero cancelar, luego confirmar en datos de pruebas. | Cancelar no cambia nada. Si existen registros financieros: 409 y conservar cliente e historial; no eliminar pagos, compras ni deudas. |
| CLI12 | P0 | Crear cliente sin fecha final; probar entrada. Asignar membresía vigente y repetir. | Sin fecha final válida: rechazar con membership_required sin asistencia. Con membresía vigente: permitir entrada según horario y límites. La salida de una entrada abierta sigue permitida. Regla confirmada el 6 de octubre de 2026. |

## Entrada, salida y pantalla de recepción

Rutas reales: `/check-in`, `/check-in/display` y `/admin/attendence` (así está escrito el nombre actual).

| ID | Nivel | Acción y pasos | Debe responder así |
|---|---|---|---|
| ASI01 | P0 | Abrir recepción/display e invocar check-in/historial/streams sin sesión y como cliente. | Anónimo va al login y API 401; cliente no tiene acceso administrativo/API 403. |
| ASI02 | P0 | Entrada con DNI de 8 dígitos, teléfono de 9 dígitos/+51 y huella de un cliente vigente. | Registrar al mismo cliente; canal correcto; mostrar nombre, plan, vencimiento, deuda y confirmación. |
| ASI03 | P1 | Identificador incompleto, inexistente y ambiguo por duplicados. | No registrar a una persona equivocada; mensaje de inválido/no encontrado. Resolver duplicados antes de operar. |
| ASI04 | P0 | Entrada con membresía vencida ayer y que termina hoy. | Ayer: 400 membership_expired sin entrada. Hoy: activa hasta fin del día Lima, daysLeft=0. |
| ASI05 | P0 | Lunes-viernes 05:59/06:00/20:59/21:00; sábado 19:59/20:00; domingo. | Apertura 06:00, cierre 21:00 entre semana/20:00 sábado, domingo cerrado; fuera de horario no crear entrada. |
| ASI06 | P0 | Repetir huella/DNI dentro de 60 s; volver a entrar después de 60 s sin haber salido. | Mensaje «registro ya tomado»/«entrada ya abierta»; ningún registro extra ni evento extra. |
| ASI07 | P0 | Entrada→salida→segunda entrada→salida→tercera entrada en un día Lima. | Dos entradas admitidas, tercera rechazada con limit_reached. |
| ASI08 | P0 | Entrada simultánea desde dos pestañas/equipos para el mismo cliente. | Una sola asistencia abierta; segundo resultado indica repetición. Verificar PostgreSQL real y contador diario. |
| ASI09 | P0 | Salida con entrada abierta; salida sin entrada abierta. | Cerrar solo la abierta y calcular minutos; sin abierta: 400 no_open_attendance. Nunca crear entrada al pedir salida. |
| ASI10 | P0 | Salida después del cierre o tras vencer la membresía. | Permitir cerrar una entrada existente; no bloquear salida por horario o deuda. |
| ASI11 | P1 | Dejar entrada abierta 179/180/181 min y refrescar/registrar otra acción. | Autocierre según política de 180 min; duración/historial correctos. Comprobar cuándo se dispara, no asumir un cron que no existe. |
| ASI12 | P0 | Registros cerca de medianoche Lima con servidor configurado en otra zona. | Historial, límite y días restantes usan fecha Lima; no trasladar asistencia al día UTC siguiente. |
| ASI13 | P1 | Entrada con deuda mensual/diaria y sin deuda. | Mostrar total correcto; la deuda por sí sola no modifica la política de vencimiento. No divulgar deuda a visitantes. |
| ASI14 | P1 | Abrir display, marcar en recepción, desconectar/reconectar y recargar ambos. | Evento una vez, historial recuperable del servidor; no depender de localStorage. Probar misma sala. |
| ASI15 | P0 | Mantener stream abierto y revocar contraseña/rol/cuenta. | Dejar de recibir datos; la revalidación se produce con eventos/heartbeat de 15 s. Probar cierre real de conexión. |
| ASI16 | P0 | Dos procesos de aplicación: marcar en uno y mostrar en otro. | El display debe recibir eventos o tener recuperación equivalente. **B09: los gestores actuales son locales al proceso.** |
| ASI17 | P1 | Editar/borrar asistencia como admin; cliente intenta la misma petición. | Respetar permisos y persona seleccionada; actualización de duración/reportes coherente. Registrar quién hizo una corrección si el negocio lo exige. |

## Huellas y servicio biométrico real

| ID | Nivel | Acción y pasos | Debe responder así |
|---|---|---|---|
| BIO01 | P0 | Consultar status/ping/capture/identify/active-target sin admin. | 401/403; no revelar usuario activo, disponibilidad o plantilla ni activar lector. |
| BIO02 | P1 | Iniciar captura del cliente A y completar las muestras requeridas con el mismo dedo. | Progreso claro; guardar una huella vinculada a A y confirmar únicamente al terminar. |
| BIO03 | P0 | Cambiar dedo, usar huella registrada de B, cancelar o cambiar cliente durante captura. | No asociar a A una identidad incorrecta; limpiar objetivo activo; cancelar no crea huella parcial. |
| BIO04 | P1 | Desconectar lector/servicio antes y durante captura. | Fallo claro, timeout acotado; detener indicador de carga y permitir reintento sin duplicar. |
| BIO05 | P0 | Identificar dedo desconocido, plantilla inválida o dato excesivamente grande. | Rechazar sin check-in; nunca aceptar un `userId` de proveedor sin verificarlo. |
| BIO06 | P1 | Borrar huella y volver a identificarla/registrarla. | Ya no identifica al cliente borrado; recolección nueva posible; repetición del borrado no rompe la interfaz. |
| BIO07 | P0 | Probar identificación de A y B repetida, con diferentes orientaciones, lector real. | Sin confundir personas; medir rechazo/falsa aceptación según criterios del lector. Estas pruebas no se sustituyen con mocks. |
| BIO08 | P0 | Intentar conectar al puerto 8001 desde otro equipo. | Servicio local no expuesto a la red; revisar binding real, CORS y ausencia de proxy público. **B07.** |
| BIO09 | P0 | Revisar Network, logs, almacenamiento y exportaciones. | No imprimir ni exportar plantillas biométricas; definir autorización, retención y borrado antes de recoger huellas reales. |

## Inventario y archivos

| ID | Nivel | Acción y pasos | Debe responder así |
|---|---|---|---|
| INV01 | P1 | Crear producto válido y editar nombre/descripción/precio/descuento/stock/imagen. | Persistir todos los campos; reflejar precio descontado y visibilidad en las pantallas correspondientes. |
| INV02 | P0 | Precio/stock negativos; stock 1.5; descuento -1/101; texto «10abc»; Infinity/NaN; nombre vacío. | Rechazar 400 sin cambios. No convertir «10abc» en 10 ni truncar cantidades fraccionarias. |
| INV03 | P1 | Precio cero, descuento cero/100%, stock cero y máximo admitido. | Comportamiento explícito y consistente; no habilitar un cobro de importe cero que la pasarela no soporta. |
| INV04 | P0 | Marcar producto exclusivo del gimnasio y consultar como anónimo/cliente. | No aparece en catálogo público ni puede comprarse por Culqi. `/api/products/gym` requiere admin. |
| INV05 | P0 | Cliente invoca POST directo de `/api/products/public`. | 403: no debe registrar compra ni descontar stock saltándose el pago. |
| INV06 | P1 | Borrar producto nuevo y otro con compras asociadas. | Cancelar no borra; confirmación clara; conservar coherencia de ventas y resolver referencias sin error inesperado. |
| INV07 | P0 | Subir JPEG/PNG/WebP válido al avatar, galería, producto y carga general. | Validar MIME/extensión/tamaño y contenido; recodificar imágenes; nueva URL usable. |
| INV08 | P0 | Archivo vacío/>5 MiB/texto o SVG renombrado `.jpg`; multipart con `file` de tipo texto. | 400 sin guardar contenido ejecutable. Verificar también edición de galería, no solo creación. |
| INV09 | P1 | Imagen muy grande en píxeles o corrupta; extensión doble; nombre con `../`. | Rechazar contenido inválido y normalizar clave; no salir del prefijo permitido. Límite de decodificación: 40 millones de píxeles. |
| INV10 | P0 | PDF con cabecera falsa y PDF real en carga general. | Se comprueba cabecera `%PDF-`, **no** análisis antimalware. Definir uso/descarga segura; no declarar PDF limpio por aceptar la cabecera. |
| INV11 | P0 | Subir media mediante URL firmada de ejercicios, tamaños excesivos y MIME/extensión distintos. | Debe existir política de tamaño/contenido del objeto. **B10: este flujo directo a S3 no pasa por recodificación ni límite general de 5 MiB.** |
| INV12 | P1 | S3 sin configuración, permiso denegado o fallo después de subir. | Error claro; no sustituir URL existente por una inexistente; revisar archivos huérfanos sin borrar producción a ciegas. |

## Tienda, Culqi y caja

| ID | Nivel | Acción y pasos | Debe responder así |
|---|---|---|---|
| VEN01 | P1 | Añadir/quitar productos, aumentar/reducir cantidades y vaciar carrito. | Subtotal y total correctos; cantidades enteras positivas; carrito vacío no abre pago. |
| VEN02 | P0 | Comprar 2 unidades de S/10 con descuento 10%; mandar total falso desde Network. | Servidor calcula S/18.00; ignora total del navegador; stock baja 2 y compra corresponde al cliente de sesión. |
| VEN03 | P0 | Enviar el mismo producto en varias líneas. | Agrupar cantidades antes de validar stock y calcular; no evadir disponibilidad ni descuento. |
| VEN04 | P0 | Comprar más del stock; dos compradores disputan las últimas unidades. | Sin stock negativo; conflicto claro, sin cobro si no se pudo reservar. Comprobar transacción real. |
| VEN05 | P0 | Cliente A manda `customerId` de B o producto exclusivo. | No atribuir compra a B ni vender producto restringido. |
| VEN06 | P0 | Culqi aprueba en sandbox. | Un cargo, pago COMPLETED con referencia, compras por línea y descuento exacto de stock; vaciar carrito solo al confirmar. |
| VEN07 | P0 | Culqi rechaza explícitamente tarjeta; usuario cierra/cancela checkout. | No compra completada; reserva liberada cuando corresponda; mensaje claro. Cancelar antes de enviar no genera cobro. |
| VEN08 | P0 | Culqi acepta pero la respuesta se pierde/timeout; servidor se reinicia. | Mantener estado incierto y conciliar por referencia; no marcar rechazo confirmado ni cobrar otra vez. **B02: comportamiento actual insuficiente.** |
| VEN09 | P0 | Repetir petición de pago y dos clics simultáneos. | Idempotencia persistente: una compra/cargo por intento lógico. **B02: no hay garantía implementada.** |
| VEN10 | P0 | Culqi cobra y falla la transacción posterior de base de datos. | Mostrar «pendiente de confirmación», guardar trazabilidad y permitir conciliación; no invitar a pagar de nuevo. **B02.** |
| VEN11 | P0 | Registrar venta de caja con cliente, productos repetidos y forma de pago. | Importe del servidor, stock transaccional, pago/compra asociados y visibles en caja del día Lima. |
| VEN12 | P1 | Enviar fila inválida/cantidad fraccionaria/>50 líneas en venta admin. | Rechazar la venta completa, no ignorar silenciosamente filas inválidas. |
| VEN13 | P0 | Registrar venta antes/después de medianoche Lima; comparar caja y reportes. | Importes y fechas consistentes; pagos PENDING/FAILED no cuentan como ingresos cobrados. Revisar diferencias entre endpoints heredados. |
| VEN14 | P0 | Revisar logs de checkout, error de Culqi y consola del navegador. | Sin token de tarjeta, clave privada, datos sensibles de pago o autorización HTTP. |

## Caja completa y catálogo compartido

Estos casos validan la nueva caja. Preparar un turno, productos físicos, un servicio sin stock, cliente A y B, y dos pestañas. Los importes y datos se verifican también en PostgreSQL; la revisión automática no sustituye la aprobación del cajero.

| ID | Nivel | Acción y pasos | Debe responder así |
|---|---|---|---|
| CAJ01 | P0 | Abrir caja con fondo S/100; repetir el mismo intento y pedir otra apertura. | Misma intención recupera el turno; segunda apertura distinta: 409. Solo un turno abierto. |
| CAJ02 | P0 | Intentar vender, retirar o cobrar sin turno abierto. | Rechazar 409 sin modificar venta, cobro, deuda ni stock. |
| CAJ03 | P1 | Crear producto sin imagen, con SKU/categoría; buscarlo en inventario, caja y recepción. | Un registro en InventoryItem; misma identidad, precio y stock en todas las pantallas. Imagen opcional con fallback. |
| CAJ04 | P0 | Crear un servicio de S/20, desmarcar Controlar stock y dejar stock cero. | Se puede vender repetidamente; no reduce stock ni necesita aumentar existencias ficticias. |
| CAJ05 | P1 | Buscar por nombre/SKU, filtrar categoría, no encontrar resultados y actualizar. | Filtrado claro, vacío explícito; no aparecer productos de listas fijas o categorías deducidas del nombre. |
| CAJ06 | P0 | Añadir producto agotado; pedir más unidades del stock y cantidades inválidas. | Botón agotado deshabilitado; servidor rechaza exceso/fracción/negativo sin escrituras parciales. |
| CAJ07 | P1 | Añadir/quitar líneas, cambiar cantidades y vaciar antes de confirmar. | Total estimado actualizado; no crea ventas mientras solo se edita el carrito. |
| CAJ08 | P0 | Revisar venta; cambiar precio/stock desde otra sesión antes de confirmarla. | Precio distinto: 409 y revisar otra vez. Stock insuficiente: 409. Nunca aceptar el total antiguo silenciosamente. |
| CAJ09 | P0 | Producto S/9.99 con 15% de descuento, cantidad 2 y descuento adicional 10%. | Precio unitario S/8.49, subtotal S/16.98, total S/15.28; motivo obligatorio del descuento adicional. |
| CAJ10 | P0 | Registrar venta anónima de S/10, recibido S/20, aplicado S/10 en efectivo. | Ticket S/10, pago S/10, vuelto S/10; efectivo esperado aumenta S/10. |
| CAJ11 | P0 | Dividir S/10 en S/2 efectivo, S/3 Yape y S/5 tarjeta; recibido S/5. | Pagada, vuelto S/3; efectivo físico aumenta S/2; desglose conserva cada medio y referencia. |
| CAJ12 | P0 | Registrar Yape/Plin/transferencia sin verificar el proveedor. | No confundir el registro manual con aprobación bancaria. El cajero verifica la transacción antes de confirmarla. |
| CAJ13 | P0 | Pago mayor al total, efectivo insuficiente o recibido sin pago en efectivo. | 400 y explicar el problema; no registrar sobrepago/vuelto ficticio. |
| CAJ14 | P0 | Habilitar crédito sin cliente y con cliente A. | Sin perfil: 400. Con A: venta y deuda vinculadas, pago parcial separado del saldo. No atribuir a B. |
| CAJ15 | P0 | Doble clic/Enter y dos peticiones con la misma Idempotency-Key; cambiar el contenido con esa clave. | Un ticket y una reducción de stock; replay recupera resultado. Contenido distinto: 409. |
| CAJ16 | P0 | Perder respuesta después de confirmar; consultar en la misma pantalla y tras recargar la pestaña. | Mantener intención pendiente, bloquear otra venta y consultar/reintentar con la misma clave. Recuperar el ticket y vaciar el carrito confirmado; no volver a cobrar. |
| CAJ17 | P0 | Dos cajeros compran la última unidad con intenciones diferentes. | Una venta; segundo conflicto. Stock nunca negativo, cobro registrado solo para la venta aceptada. |
| CAJ18 | P0 | Recepción agrega producto a crédito; agotar última unidad y repetir el intento. | Mismo catálogo/precio; un crédito/compra, stock reducido una vez. Replay confirma incluso si ya está agotado. |
| CAJ19 | P0 | Cobrar parte del saldo y luego todo; reenviar cada cobro. | Reducir deuda por importes efectivamente cobrados. Al completar, archivar deuda y conservar ticket/cobros. Sin duplicación. |
| CAJ20 | P0 | Intentar cobrar saldo cero/anulado y cobrar más que el saldo. | 409 para saldo no cobrable; 400 para exceso. Sin cobros extras. |
| CAJ21 | P0 | Cerrar turno con créditos; abrir otro y cobrar una deuda del anterior. | Cierre conserva crédito. Nuevo cobro entra en el turno actual; historia de la venta original se conserva. |
| CAJ22 | P0 | Ingreso S/20 con motivo; retiro S/10; retiro mayor al efectivo esperado. | Movimientos firmados +20/−10; motivo obligatorio; retiro excesivo 409 sin saldo negativo. |
| CAJ23 | P0 | Cerrar contando exactamente el esperado y contando una diferencia. | Guarda esperado, contado y diferencia. Diferencia exige explicación y queda visible en historial. |
| CAJ24 | P0 | Otra pestaña vende/mueve dinero mientras se cierra la caja. | Operaciones serializadas; ninguna escritura puede quedar asignada después del cierre confirmado. |
| CAJ25 | P0 | Anular venta con contraseña errónea, sin motivo o sin reautenticación. | 401/400/428 según causa, sin devolución ni restauración de stock. |
| CAJ26 | P0 | Anular venta cobrada; repetir con la misma clave y con otra nueva. | Un retorno de stock/caja, pagos reversados, ticket conservado. Replay devuelve resultado; nueva anulación: 409. |
| CAJ27 | P0 | Anular venta del turno cerrado o cuya devolución exige más efectivo disponible. | 409; requiere resolución auditada fuera de esta anulación simple, sin alterar el turno cerrado. |
| CAJ28 | P1 | Abrir ticket, imprimir, cerrar; filtrar fecha Lima/estado/cliente. | Datos históricos de la venta, importes/medios/saldo correctos; impresión interna legible. Sin prometer factura tributaria. |
| CAJ29 | P0 | Exportar CSV con nombre de cliente que empieza por signo igual o arroba. | Escapar texto como celda; no ejecutar fórmulas. Exportar solo resultados visibles y avisar límites de consulta. |
| CAJ30 | P0 | Anular una venta y comparar caja, dashboard e ingresos. | Venta anulada excluida de ventas; pagos reversados excluidos de ingresos. No sumar venta y pago dos veces. |
| CAJ31 | P1 | Probar caja a 1440×900, 390×844 y 844×390; teclado, Tab y Escape. | Controles accesibles y utilizables, sin scroll horizontal de página; tabla puede desplazar dentro de su contenedor. |
| CAJ32 | P0 | Borrar producto/cliente con ventas, cobros o deudas. | Rechazar borrado que destruiría trazabilidad; conservar referencias e historial. |
| CAJ33 | P0 | Abrir editor de inventario, realizar una venta desde otra pestaña y guardar el editor antiguo. | 409 por versión desactualizada; conservar el stock de la venta. Refrescar y revisar valores antes de volver a editar. |
| LOC01 | P0 | Ejecutar db:local:inspect y consultar API de entorno autenticada. | Base wolfgym, loopback y puerto local confirmados; no conectarse a la URL remota de .env. |
| LOC02 | P0 | Cambiar la URL del lanzador local a un host remoto en una copia de configuración. | Rechazar antes de abrir Next/seed/migración; no hacer consulta ni escritura remota. |
| LOC03 | P0 | Probar login admin/cliente, correo y recuperación con cuentas audit. | Sesiones reales; correo en bandeja local. Culqi/S3 bloqueados; ningún envío o cargo externo. |
| LOC04 | P0 | Activar 2FA o cambiar rol/contraseña; restaurar estado anterior de credenciales. | securityVersion aumenta; JWT antiguo continúa inválido. No reactivar una sesión vieja al volver al estado previo. |

## Deudas e historial financiero (conservación)

| ID | Nivel | Acción y pasos | Debe responder así |
|---|---|---|---|
| DEU01 | P1 | Crear crédito de recepción por producto del catálogo con cantidad 2. | Precio de PostgreSQL; venta, stock y deuda vinculados; suma diaria y total visibles. |
| DEU02 | P0 | Enviar productos/precios fijos antiguos, nombre/monto arbitrarios o cantidad 0/-1/1.5. | 400 sin deuda. Registrar productos/servicios primero en el inventario central. |
| DEU03 | P0 | Enviar perfil inexistente/ID de usuario donde se pide perfil. | 404; no crear deuda huérfana. |
| DEU04 | P0 | Cliente intenta crear/borrar/limpiar deudas por API. | 403, sin alterar sus deudas ni las ajenas. |
| DEU05 | P0 | Invocar DELETE de deuda y luego cobrar o anular desde caja. | DELETE 409. Cobro/anulación explícitos y transaccionales; historial conservado. |
| DEU06 | P0 | Invocar limpieza diaria con deuda impaga y cabecera x-internal-call verdadera. | Anónimo 401, cliente 403, admin 409; conteos y saldos idénticos. |
| DEU07 | P0 | Invocar limpieza semanal con historial de 6/7/8 días. | 409 autenticado; conservar todo el historial financiero. |
| DEU08 | P0 | Interrumpir cobro/anulación entre operaciones y reintentar. | Transacción completa o rollback; intención persistente evita duplicación. |

## Dashboard, asistencia y reportes/exportación

| ID | Nivel | Acción y pasos | Debe responder así |
|---|---|---|---|
| REP01 | P1 | Abrir dashboards con dataset conocido y sin registros. | Totales verificables; vacío legítimo distinto de error de consulta. |
| REP02 | P0 | Comparar ingreso con pagos completados, ventas y deudas. | No sumar dos veces venta+pago ni considerar deuda como efectivo cobrado; estados pendientes/fallidos excluidos. |
| REP03 | P1 | Filtrar fecha/mes y revisar cerca de fin de mes/año Lima. | Límites coherentes; ninguna omisión/duplicación por zona del servidor. **B04: revisar endpoints heredados.** |
| REP04 | P1 | Reporte con plan faltante, fechas invertidas, stock/precio inválido o teléfonos repetidos. | Informar inconsistencia sin alterar silenciosamente la base. |
| REP05 | P0 | Exportar Excel y JSON con datos conocidos. | Abrir archivos, revisar todas las hojas/campos, fechas, importes, conteos y caracteres; exportar exactamente el reporte autorizado. |
| REP06 | P0 | Nombre/descripción de prueba empieza con `=`, `+`, `-` o `@` y se exporta. | Excel trata contenido de usuario como texto; no ejecutar fórmulas originadas en ese contenido. |
| REP07 | P1 | Exportar mientras carga/sin datos/falla generación; doble clic. | Botón deshabilitado mientras genera; error visible; archivo no corrupto ni descarga duplicada. |
| REP08 | P0 | Cliente/anónimo intenta reportes, exportaciones y métricas por API. | Rechazar; no descargar información de otros clientes. |

## Rutinas, ejercicios y entrenamientos

| ID | Nivel | Acción y pasos | Debe responder así |
|---|---|---|---|
| RUT01 | P1 | Crear/editar ejercicio con instrucciones, músculos, nivel y equipo. | Persistir y buscarlo; validar obligatorios y mostrar instrucciones como texto. |
| RUT02 | P0 | Publicar/despublicar y abrir como cliente por API. | Cliente solo ve recursos permitidos; borradores no se descubren cambiando el ID. |
| RUT03 | P1 | Añadir imagen/video, ordenar y cambiar portada; borrar media. | Orden/portada coherentes tras recarga; DELETE exitoso devuelve 204 sin cuerpo. Archivo de S3 puede requerir limpieza independiente B10. |
| RUT04 | P1 | Crear rutina/programa y añadir/quitar/reordenar ejercicios, series, repeticiones, descanso y carga. | Guardar cada cambio en orden correcto; valores inválidos rechazados; cancelar no modifica plantilla. |
| RUT05 | P0 | Asignar programa/rutina a A por días; consultar A y B. | Solo A obtiene su asignación; acceso directo de B rechazado; el admin ve la asignación correcta. |
| RUT06 | P0 | Cliente sin membresía/vencida inicia entrenamiento por pantalla y API. | Misma regla en UI y servidor. **B04: las fuentes/horas de vigencia pueden diferir del check-in.** |
| RUT07 | P1 | Iniciar sesión, añadir serie, editar peso/reps, quitar serie y recargar. | Cada cambio confirmado persiste; no perder series ni duplicarlas por reintento. |
| RUT08 | P1 | Serie de calentamiento y serie efectiva; peso cero; números negativos/fraccionarios donde no corresponden. | Cálculo de volumen/series/reps según regla acordada; validación de números; distinguir calentamiento. |
| RUT09 | P0 | Modificar/completar entrenamiento de B usando ID desde A. | 403/404 sin cambios en registro ajeno. Probar ambas rutas existentes de series. |
| RUT10 | P1 | Completar entrenamiento dos veces, historial reciente y progreso. | Una finalización coherente; fechas, duración y totales correctos; no repetir sugerencias/volumen. |
| RUT11 | P1 | Cambiar rutina asignada mientras existe una sesión en curso. | Sesión histórica permanece consistente; cambio no reescribe entrenamiento ya realizado. |

## Nutrición

| ID | Nivel | Acción y pasos | Debe responder así |
|---|---|---|---|
| NUT01 | P1 | Crear plan en modo cuantificado, porciones, cualitativo e híbrido. | Cada modo permite sus unidades/indicaciones; vista cliente coincide con lo guardado. |
| NUT02 | P1 | Cuantificado sin cantidad/unidad, porciones sin cantidad, cualitativo sin indicación visual e híbrido sin ninguna. | Rechazar publicación inválida con detalle útil; no publicar plan incompleto. |
| NUT03 | P1 | Energía calculada, manual y no controlada (NOT_TRACKED). | Modos que requieren objetivo lo validan; no controlada no inventa calorías ni exige un objetivo innecesario. |
| NUT04 | P1 | Añadir días/comidas/alimentos/alternativas, cambiar orden y guardar. | Persistir orden y alternativas; no sumar alternativas como si hubiera que comerlas todas. |
| NUT05 | P0 | Publicar y asignar a A un plan con fechas; abrir como A, B y anónimo. | Solo A ve su asignación activa; borradores y datos de salud privados. |
| NUT06 | P0 | Registrar peso/alergias/notas sin marcar autorización de datos de salud. | Rechazar registro de datos que exige autorización; confirmar vínculo con el cliente correcto. |
| NUT07 | P1 | Asignar sin peso/datos opcionales; cantidades negativas; unidad incompatible; día duplicado. | Opcionales realmente opcionales; inválidos rechazados; no duplicar días/comidas por accidente. |
| NUT08 | P1 | Editar plantilla publicada/versionar y revisar asignación previa. | No alterar sin aviso el plan ya asignado; verificar versión y fechas vigentes. |
| NUT09 | P1 | Pausar/cambiar/finalizar asignación; navegar días desde cliente. | Mostrar estado correcto y plan activo esperado; sin plan: mensaje útil, sin datos de otro usuario. |
| NUT10 | P1 | Base sin tablas/migración de nutrición; error real de consulta. | 503 o mensaje de módulo no disponible; no pantalla vacía ni «sin plan» que oculte fallo. |
| NUT11 | P0 | Revisar reportes, consola y permisos de nutrición. | Datos de salud no salen en respuestas públicas ni logs; acceso mínimo necesario. |

## Edición pública y acciones sensibles

| ID | Nivel | Acción y pasos | Debe responder así |
|---|---|---|---|
| ADM01 | P0 | Abrir `/admin/Edit` y `/admin/images` como cliente/anónimo. | No acceso a edición/archivo privado; probar las APIs además del middleware. |
| ADM02 | P0 | Ejecutar operación que requiere confirmación sensible sin contraseña reciente. | 428 y flujo de reautenticación; no ejecutar la operación previamente. |
| ADM03 | P0 | Reautenticar con contraseña incorrecta, válida y tras 10 minutos. | Incorrecta rechazada/limitada; válida habilita solo ventana temporal; vencida exige nueva prueba. |
| ADM04 | P0 | Copiar permiso sensible entre cuentas; cambiar contraseña y reutilizarlo. | Token firmado ligado a usuario y versión actual de credenciales; rechazo al copiar/revocar. |
| ADM05 | P1 | Editar plan/historia/galería; guardar y consultar portada sin sesión. | Contenido actualizado tras confirmar; error conserva contenido anterior; no ejecutar HTML de campos de texto. |
| ADM06 | P0 | Servidor con NODE_ENV=production: `/api/test-checkin`, `/api/test-checkout`, `/api/test/exercises`, `/api/exercises/seed`. | Admin recibe 404; no exponer simulaciones/seed en operación. Sin sesión sigue sin autorizar. |
| ADM07 | P0 | Revisar headers y abrir sitio dentro de iframe ajeno. | X-Frame-Options DENY/CSP frame-ancestors; nosniff; HTTPS y cookies seguras en despliegue real. La CSP actual es parcial, no una política estricta completa. |

## Usabilidad, accesibilidad y operación

| ID | Nivel | Acción y pasos | Debe responder así |
|---|---|---|---|
| OPS01 | P1 | Repetir flujos críticos en 1440×900, 390×844 y 844×390. | Sin scroll horizontal, botones inaccesibles ni modales fuera de pantalla; tablas con desplazamiento propio. |
| OPS02 | P1 | Navegar con Tab/Shift+Tab/Enter/Escape, sin ratón. | Foco visible, orden útil, etiquetas y retorno del foco al cerrar modal; no atrapar teclado. |
| OPS03 | P1 | Zoom 200%, texto largo y lector de pantalla; ejecutar Axe. | Controles comprensibles y errores anunciados; sin violaciones críticas/graves en pantallas habilitadas. |
| OPS04 | P1 | Móvil con teclado virtual; búsqueda/inputs/modales. | Campo y botón principal visibles; no perder edición al rotar pantalla. |
| OPS05 | P0 | Arrancar build de producción y reiniciar proceso con sesiones/ventas pendientes de prueba. | No ejecutar seed/migraciones/limpieza automáticamente; estado persistente recuperable. |
| OPS06 | P0 | Copia de seguridad y restauración en base aislada. | Restaurar clientes, pagos, stock, asignaciones y referencias; medir recuperación real y documentar responsable. |
| OPS07 | P0 | Verificar despliegue sin leer secretos en pantalla. | NEXTAUTH_URL real HTTPS, secreto fuerte, DB/S3/SMTP/Culqi correctos por ambiente, servicio biométrico local y credenciales fuera del repositorio/logs. |
| OPS08 | P1 | Carga simultánea acordada para recepción/caja/reportes y pérdida de red. | Respuesta dentro del tiempo acordado, sin stock negativo ni saturación de conexiones; documentar umbral medido. |
| OPS09 | P0 | Ejecutar build, typecheck, lint, tests y audit sobre la versión que se liberará. | Sin errores; avisos revisados. No trasladar resultados de otra versión ni sustituir integraciones reales con mocks. |
| OPS10 | P0 | Revisar bloqueos B01–B10 y fichas de casos. | Registrar aprobación del responsable funcional; mantener deshabilitados los módulos no aprobados. |

## Orden recomendado de ejecución

1. Acceso por roles, revocación, correo/2FA, recuperación y aislamiento A/B.
2. Alta/renovación de cliente y reglas Lima de entrada/salida, incluyendo concurrencia y lector real.
3. Inventario, caja, deudas y conciliación de reportes; pagos exclusivamente en sandbox.
4. Rutinas, nutrición y edición de contenido, con persistencia y permisos.
5. Responsive, accesibilidad, fallo de red, reinicio y restauración de respaldo.

Al cerrar la ronda, conservar evidencia de los P0 y ejecutar de nuevo los flujos afectados por cada corrección. Esta revisión no aprueba automáticamente producción.
