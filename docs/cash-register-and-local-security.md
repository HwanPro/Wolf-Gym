# Caja, cuentas locales y pruebas de seguridad

Revisión del 2 de octubre de 2026, hora de Lima. Cambios locales, sin push ni despliegue. La aplicación todavía tiene bloqueos ajenos al flujo de caja: compra online de membresías, conciliación de Culqi, lector biométrico e inspección de ciertos archivos. Consulte la revisión general antes de habilitar esos módulos.

## Entorno utilizado

Se verificó PostgreSQL mediante una consulta al servidor: base `wolfgym`, dirección `127.0.0.1`, puerto `5432`, PostgreSQL 17.10. También se comprobó desde la API autenticada de la aplicación. `.env` contiene una conexión remota; no se utilizó. Las herramientas locales leen exclusivamente `.env.local`, rechazan destinos fuera de loopback y comprueban el nombre/dirección efectivos antes de iniciar Next, crear cuentas, respaldar o aplicar SQL.

El servidor de pruebas escucha en `http://127.0.0.1:3100`. Para desarrollo habitual: `npm run dev:local`, en `http://127.0.0.1:3000`. Los lanzadores fijan el origen del login al puerto utilizado y bloquean cobros Culqi y operaciones S3. Los correos de prueba se guardan en `.local/mail-outbox/`, sin envío SMTP. Esta bandeja contiene tokens privados de prueba; no compartirla ni subirla a Git.

Comandos locales:

```powershell
npm run db:local:inspect
npm run db:local:backup
npm run seed:local-test
npm run dev:local
npm run test:e2e
```

Para compilar e iniciar en modo de producción sobre la misma base local: `npm run build:local` y luego `npm run start:local`. No confundir este modo de ejecución con un despliegue ni con una conexión a producción.

`seed:local-test` conserva usuarios y productos ajenos a la auditoría. Crea/actualiza únicamente sus cuentas sintéticas; repetirlo renueva sus credenciales de sesión y restablece su 2FA. Las contraseñas aleatorias están en `.local/test-accounts.json`, ignorado por Git. No se copiaron cuentas ni hashes de producción.

| Cuenta | Función |
|---|---|
| `audit_admin` | Administrador para caja, inventario y recepción. |
| `audit_client_a` | Cliente vigente para ventas, crédito y controles de acceso. |
| `audit_client_b` | Segundo cliente para permisos A/B, correo y recuperación. |
| `audit_expired` | Membresía vencida. |
| `audit_expires_today` | Membresía que termina al finalizar hoy en Lima. |
| `audit_no_plan` | Perfil sin fecha final para comprobar la política pendiente B05. |

Las fechas de estas cuentas corresponden al último seed; para probar otro día, repetir el seed antes de iniciar sesiones. Los productos y operaciones `AUDIT` son evidencia sintética local. Se conservaron las deudas y el historial preexistentes.

## Construcción de caja

La apertura fija un fondo inicial. Existe un único turno abierto para la caja principal. Efectivo esperado = fondo + ingresos + cobros en efectivo − retiros − devoluciones en efectivo. Yape, Plin, tarjeta y transferencia se registran por separado; nunca incrementan el dinero físico esperado. El cierre guarda efectivo contado, esperado y diferencia; una diferencia necesita explicación.

El catálogo único es `InventoryItem` de PostgreSQL. Administración, tienda, recepción y caja consultan esa tabla. SKU, categoría, descuento, precio y control de stock son metadatos persistidos. Un servicio puede tener `track_stock=false`. No hay listas de productos/precios fijos en recepción ni simulación por palabras clave. El navegador conserva solo el estado de la venta y, para recuperar solicitudes inciertas, una intención pendiente; no constituye una base de inventario.

Una venta admite cliente opcional, cantidades, descuentos adicionales con motivo y hasta ocho medios de pago. Los descuentos del catálogo se aplican primero y se redondea cada precio unitario a céntimos; el descuento adicional se aplica y redondea por línea. El servidor cotiza; el cajero revisa y confirma. Si el total cambió, responde 409 y exige revisar la cotización. El pago parcial exige un cliente con perfil; el saldo se crea como deuda vinculada a la venta.

Venta, líneas, compras compatibles, cobros, deuda y reducción de stock se confirman en una transacción. Bloqueos PostgreSQL por caja y por producto serializan operaciones y protegen los precios/stock usados. `CashAction` conserva una clave de intención UUID y el resultado. Repetir una intención devuelve el mismo resultado; cambiar su contenido responde 409. Las solicitudes inciertas de caja se conservan en `sessionStorage` para consultar/reintentar tras una recarga.

Se probó perder la respuesta después de confirmar en PostgreSQL: la interfaz bloquea otra venta, recupera el ticket por intención y vacía el carrito confirmado, tanto en la misma pantalla como tras recargar. Un 401/403/428/429 conserva la intención para resolverla tras recuperar acceso; no se descarta una operación cuyo resultado anterior todavía puede ser incierto.

El cobro posterior permite pago parcial o completo en un turno abierto. La deuda solo desaparece al cobrar el saldo completo, dejando historial. Una anulación requiere contraseña administrativa reciente, motivo y turno original aún abierto; restituye el stock una vez y revierte los cobros del registro sin borrar compras/ticket. No se implementó devolución automática a pasarelas: el cajero debe verificar y efectuar la devolución bancaria con el proveedor. El ticket es interno, sin pretensión de comprobante tributario.

La pantalla incluye búsqueda por nombre/SKU, filtro de categoría, pagos divididos, efectivo recibido/vuelto, créditos, movimientos, arqueo, historial de turnos, fecha Lima, filtros de ventas, impresión y CSV de los resultados visibles. Historial y saldos muestran hasta 100 registros por consulta; movimientos recientes hasta 50. La interfaz informa estos límites. Las deudas históricas anteriores a caja se conservan en la ficha del cliente; su migración/cobro unificado requiere un flujo posterior.

Se tomó como referencia el manejo de [turnos y arqueo de Shopify POS](https://help.shopify.com/en/manual/sell-in-person/shopify-pos/cash-register-management/register-sessions-in-shopify-pos), sus [cobros en efectivo y vuelto](https://help.shopify.com/en/manual/sell-in-person/shopify-pos/payment-management/cash-payments) y las [órdenes/idempotencia de Square](https://developer.squareup.com/docs/orders-api/create-orders). La implementación se adapta a los modelos y permisos existentes de Wolf Gym.

## Ataques y correcciones

Se utilizaron las skills `security-review`, `agent-skills:security-and-hardening`, `api-and-interface-design`, `backend-patterns` y `frontend-ui-engineering`. No se encontró una skill especializada de pentest/red team instalada. La revisión ofensiva se limitó a esta aplicación local y a cuentas/productos sintéticos; no es una certificación de infraestructura.

| Prueba ofensiva | Resultado inicial / corrección | Comportamiento comprobado |
|---|---|---|
| Venta con `Origin` ajeno y sesión administrativa. | Reprodujo una venta: 200. Se añadió control de origen de escrituras en middleware. | 403; sin venta ni reducción de stock. Se sigue la [guía CSRF de OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html). |
| Reenviar el mismo intento de venta. | Reprodujo dos compras: 200/200. Se añadió idempotencia persistente/transaccional. | Dos respuestas 200 devuelven un ticket, un cobro y un descuento de stock; contenido diferente con la misma clave: 409. |
| Cabecera `x-internal-call: true` para limpiar deudas. | Bypass confirmado por código. No se ejecutó antes del fix porque había deudas que preservar. | Anónimo 401; cliente 403; admin 409. Las deudas y el historial permanecen. |
| Restaurar el estado anterior de 2FA/credenciales. | El digest basado solo en valores podía volver al anterior. Se añadió contador monotónico `securityVersion` y trigger PostgreSQL. | Tras activar y retirar 2FA, el JWT antiguo sigue rechazado; lo mismo al restablecer/restaurar contraseña de prueba. |
| Falsificar precio, cantidad negativa/fraccionaria, total, pagos excesivos o cliente inválido. | Contratos estrictos y cotización de servidor. | 400/404/409 según causa, sin escrituras parciales. |
| Dos ventas por la última unidad. | Bloqueos y actualización condicional de stock. | Una venta 200 y otra 409; stock final cero. |
| Repetir crédito de recepción por la última unidad. | Unificación con la transacción e intención de caja. | Un crédito/compra y un descuento de stock; reintento recupera la operación. |
| Cliente intenta caja/reportes/recepción; JWT con rol admin falso. | Autorización y validación de credenciales actuales. | Cliente 403; JWT inválido 401. |
| Cliente A modifica/completa workout de B o verifica correo de B. | Propiedad y sesión verificadas en servidor. | Workout 404, correo 403; dato de B permanece. Patrón de [IDOR de OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Insecure_Direct_Object_Reference_Prevention_Cheat_Sheet.html). |
| Dos consumos simultáneos de correo o recuperación. | Reclamo atómico de token. | Una respuesta 200 y otra 400; token no reutilizable. |
| Anular dos veces o escribir tras cerrar caja. | Estado, intención y contraseña reciente. | Misma intención reproduce resultado; nueva anulación o escritura en turno cerrado responde 409. |
| Borrar deuda, limpiar historial o borrar cliente con actividad financiera. | Limpieza destructiva retirada; comprobación de historial. | Se conserva la trazabilidad. El cobro y la anulación son operaciones explícitas. |

La normalización de Next.js cambiaba `127.0.0.1` por `localhost` al redirigir y perdía la cookie local. Se preservó el origen en el lanzador y se desactivó esa normalización exclusivamente en ejecución local. Referencia: [flags de middleware de Next.js 15](https://nextjs.org/docs/15/app/api-reference/file-conventions/middleware).

Un editor antiguo de inventario ya no puede reponer existencias vendidas: PUT exige expectedUpdatedAt y actualiza condicionalmente; una venta intermedia causa 409. Se comprobó contra DB y se vendió un servicio con stock cero, visible con la misma identidad en inventario, recepción y tienda pública.

Los pagos online quedan deshabilitados por defecto: servidor requiere WOLF_ENABLE_ONLINE_PAYMENTS y tienda NEXT_PUBLIC_ENABLE_ONLINE_PAYMENTS. El checkout de planes permanece deshabilitado mediante NEXT_PUBLIC_ENABLE_ONLINE_MEMBERSHIPS. No activar estas opciones antes de resolver y aprobar B01/B02; la nueva caja no depende de ellas. La ejecución local siempre bloquea cobros externos, incluso con las opciones activas.

## Migraciones y alcance de verificación

Se respaldó la base local en `.local/backups/`. Esta base existente no tenía `_prisma_migrations`; no se reseteó ni se ejecutó toda la cadena de migraciones sobre ella. Se revisaron y aplicaron solo dos archivos aditivos con el lanzador local: `20261002000100_add_cash_register` y `20261002000200_persistent_session_revocation`. El segundo incorpora un trigger que incrementa `securityVersion` cuando cambia contraseña, factor o rol, incluso en cambios administrativos/SQL. No eliminar ese trigger al desplegar. Una instalación existente debe revisar su historial/baseline antes de desplegar migraciones; no asumir que el estado local constituye un historial de producción.

Las pruebas reales están en `tests/e2e/local-cash-security.spec.ts`; verifican también el destino DB desde la API. Las otras pruebas de interfaz incluyen escenarios con respuestas simuladas, identificados en sus archivos. La compilación y tests no prueban hardware, delivery SMTP real, bucket S3 real ni autorización de cobros de Culqi.

La aceptación humana sigue pendiente: [200 casos y respuestas por acción](manual-acceptance-tests.md), [Excel con resumen/filtros/estados](../outputs/01a0fedc-6cce-77e1-ade8-e0610d80bbd8/pruebas-manuales-wolf-gym.xlsx) y [CSV compatible con Excel](manual-acceptance-checklist.csv). Antes de operar, aprobar los casos P0 y los P1 del módulo habilitado. Las trazas y credenciales de las pruebas se mantienen locales/ignoradas; no publicarlas.
