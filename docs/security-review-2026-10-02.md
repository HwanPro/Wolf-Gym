# Revisión de seguridad y preparación para operación

Fecha: 2 de octubre de 2026. Alcance: código Next.js/Prisma/NextAuth, límites HTTP, sesiones, archivos, inventario/caja, asistencia, biometría, rutinas, nutrición y pruebas disponibles. Se inspeccionaron los puntos de entrada de API y los flujos principales; no se ejecutó una auditoría externa de infraestructura ni una prueba con datos reales. [Inventario de rutas](api-review-inventory.md). [Pruebas manuales](manual-acceptance-tests.md).

**La aplicación todavía no debe considerarse aprobada para operación completa.** La nueva caja y las correcciones se implementaron y probaron contra PostgreSQL local `127.0.0.1:5432/wolfgym`; se aplicaron dos migraciones aditivas revisadas después de respaldar esa base. Se crearon cuentas y movimientos sintéticos de auditoría. No se tocó producción, no hubo despliegue, cobros externos ni envíos SMTP/S3. Quedan aprobación manual e integraciones de pagos/hardware. Ver [evidencia local y caja](cash-register-and-local-security.md).

## Correcciones aplicadas

| Riesgo previo | Corrección | Evidencia en código |
|---|---|---|
| Verificación de correo podía confiar en identidad indicada por el solicitante y no probar correctamente el token. | Código de la cuenta autenticada o token exacto de 32 bytes; caducidad, límites de intentos, consumo atómico; enlace funciona sin `userId`. Evitar cambios a email nuevo por rutas alternativas. | `src/app/api/auth/verify-email/route.ts`, `src/server/auth/email-ownership.ts` y pruebas. |
| JWT anterior seguía útil después de cambio de contraseña/factor/rol o borrado; restaurar credenciales podía recuperar el digest anterior. | Validación DB y contador monotónico securityVersion, incrementado por trigger PostgreSQL. Las sesiones antiguas permanecen revocadas aun al restaurar credenciales. | `src/server/auth/session-validity.ts`, migración `20261002000200_persistent_session_revocation`, pruebas reales de 2FA/recuperación. |
| Recepción, eventos y proxies biométricos exponían acciones/datos sin guardia uniforme. | Admin obligatorio; middleware de recepción; streams revalidan con cada mensaje/heartbeat; limpieza de conexiones, sin wildcard CORS. | `src/app/api/check-in/*`, `biometric/*`, `stream/route.ts`, `src/middleware.ts`. |
| Alta 2FA aceptaba un secreto suministrado por navegador. | Desafío cifrado de 10 minutos ligado a cuenta/sesión; prueba TOTP, intentos limitados y actualización condicional; no reemplazar factor activo. | `src/app/api/auth/2FA/route.ts` y pruebas. |
| Reutilización concurrente de recuperación y truncamiento bcrypt. | Reclamar token una vez dentro de transacción; mínimo 8 caracteres/máximo 72 bytes; hash cost 12 en nuevas contraseñas y credenciales admin. | `auth/set-new-password`, `change-password`, `register`, `clients`. |
| Respuestas y logs podían contener contraseña/hash/secretos o tokens. | Selecciones explícitas de campos seguros y eliminación de logs de sesión/usuario/plantilla/token de checkout; respuestas genéricas. Credenciales temporales solo en acción administrativa explícita, sin caché. | `clients/manual`, `clients/[id]`, `profile/update`, `admin/update-user`, páginas y stream-manager. |
| Permiso administrativo sensible sobrevivía a cambio de credenciales. | Firma + usuario + vencimiento + versión de credenciales; validar estructura del token; cookies seguras según HTTPS. | `src/server/security/sensitive-admin-access.ts`. |
| Compras podían registrarse sin pasar por pago desde endpoint público. | POST directo reservado a administrador; inventario exclusivo también exige admin. Compra Culqi se liga a sesión y calcula total en servidor. | `products/public`, `products/gym`. |
| Números parcialmente interpretados o deudas inválidas. | Esquema de inventario con números estrictos/finitos, stock entero, descuento 0–100; venta rechaza filas inválidas; deuda valida cantidad, importe, nombre y perfil existente. | `src/server/validation/inventory-input.ts`, `products`, `admin/sales/daily`, `debts`. |
| Imagen maliciosa disfrazada y archivos multipart no válidos. | Verificación de File, tamaño/MIME/extensión; decodificar y recodificar JPEG/PNG/WebP, eliminar metadatos y contenido sobrante; límite de píxeles. PDF: solo cabecera, ver B10. | `src/server/files/file-validation.ts` y rutas de avatar/producto/galería/uploads. |
| Dos check-ins podían crear asistencias simultáneas. | Transacción con bloqueo PostgreSQL por usuario antes de evaluar antirrebote/abierta/límite/creación. | `src/app/api/check-in/route.ts` y pruebas. Necesita prueba real de concurrencia. |
| Historial/identificación calculaban días con zona del servidor. | Reutilizar política Lima para historial, búsqueda de cliente e identificación biométrica. | `check-in/history`, `client-lookup`, `biometric/identify`. |
| Superficies de prueba/seed accesibles en producción. | Guardas admin y 404 cuando NODE_ENV=production; endpoint heredado de cambio de contraseña devuelve 410. | `test-checkin`, `test-checkout`, `test/exercises`, `exercises/seed`, `admin/change-user-password`. |
| Límite de intentos crecía sin cota con identidades distintas. | Cota de 10.000 claves por store, eliminar expiradas y rechazar nuevas al saturarse; contadores activos no se evictan. | `src/server/security/rate-limit.ts`. Sigue siendo local al proceso, B06. |
| Dependencias reportadas como vulnerables. | PostCSS interno de Next fijado a 8.5.28; Vitest/coverage a 4.1.11; lockfile actualizado. | `package.json`, `package-lock.json`; `npm audit` final. |
| Compatibilidad Next 15 y borrados con respuesta 204 inválida. | Params dinámicos esperados como Promise; config de auth fuera del Route Handler; 204 sin cuerpo JSON. | Rutas dinámicas, `src/lib/auth-options.ts`, `media/[mediaId]`, `exercises/[id]`. |
| Venta con Origin ajeno y repetición del mismo intento creaban movimientos. | Guardia de origen en middleware; caja transaccional con intención persistente, hash del contenido, bloqueo de turno/productos y saldos monetarios enteros. | `request-origin.ts`, `cash-service.ts`, `local-cash-security.spec.ts`; ataques iniciales y regresión documentados. |
| Limpieza interna podía saltar sesión; eliminaba deuda e historial sin cobrar. | Retirado bypass de cabecera y borrado destructivo. Limpieza autenticada 409; cobro/anulación explícitos; borrado de clientes con finanzas rechazado. | `debts/cleanup`, `admin/cleanup`, `clients/[id]`, `src/scripts/cleanup-debts.ts`. |
| Catálogo fijo de recepción y edición antigua podían romper stock/ventas. | InventoryItem compartido, productos/servicios/SKU; precio de servidor y edición condicional por item_updated_at. | `products`, caja, recepción; prueba real de editor antiguo tras venta responde 409. |

Se añadió CSP parcial (frame-ancestors/object-src/base-uri/form-action) manteniendo los headers existentes. No incluye script-src estricto. Los archivos privados deben seguir teniendo permisos de almacenamiento correctos; un header no reemplaza autorización ni configuración del bucket.

## Bloqueos y decisiones pendientes

| ID | Prioridad y alcance | Hallazgo y consecuencia | Qué falta antes de habilitar |
|---|---|---|---|
| B01 | P0: compra de membresías; deshabilitada por defecto | Checkout heredado no asigna membresías. Se evita abrirlo por defecto y se informa que se activa el plan en recepción. | Flujo específico de plan con importe/duración de servidor, pago+asignación y pruebas sandbox antes de habilitar NEXT_PUBLIC_ENABLE_ONLINE_MEMBERSHIPS. |
| B02 | P0: pagos online; deshabilitados por defecto | Culqi heredado no tiene intención/conciliación persistente; timeout ambiguo o cargo seguido de fallo DB requiere recuperación. API exige habilitación explícita y local siempre bloquea cobros. | Identidad única de intento, referencias durables y conciliación. Probar timeout/reinicio/doble envío antes de activar WOLF_ENABLE_ONLINE_PAYMENTS y NEXT_PUBLIC_ENABLE_ONLINE_PAYMENTS. |
| B03 | Riesgo técnico corregido; aceptación operacional pendiente | Limpiezas no purgan; borrar clientes con finanzas responde 409. Caja cobra y anula en transacción con trazabilidad. Historial anterior a caja se conserva. | Aprobar conservación y probar restauración del respaldo. Unificar cobro de deudas heredadas requiere su propio flujo, sin marcar deuda impaga como pagada. |
| B04 | P0: coherencia de vigencia e ingresos | Perfil y asignación de membresía son fuentes distintas; creación de workout y pantallas pueden usar comparaciones horarias diferentes. Algunos endpoints de métricas heredados requieren revisar estados de pago y límites mensuales. | Una fuente/regla acordada y comparación de resultados en casos límite Lima; conciliar ingresos con pagos realmente COMPLETED. |
| B05 | P0: alta sin plan | La política permite check-in sin fecha final y el registro público puede crear ese perfil. | Decidir si altas sin compra pueden entrar. Si se exige plan, cambiar regla en servidor y probar alta/login/recepción. No se cambió silenciosamente esta política. |
| B06 | P0 si hay varias instancias; endurecimiento operacional | Rate limit en memoria se reinicia con proceso y no se comparte entre instancias. | Store compartido/controles en proxy para despliegue distribuido; límites de cuerpo/peticiones acordados, observabilidad y pruebas. |
| B07 | P0: biometría real | Servicio C# local se inspeccionó; no se modificó. El binding local debe verificarse en equipo real; no tiene autenticación propia y CORS no la sustituye. Sesión admin en kiosco concentra permisos. | Lector/equipo de pruebas, binding/firewall/proxy real, privacidad/retención y sesión de recepción controlada. Considerar rol dedicado sin permisos financieros. |
| B08 | P1; P0 si produce identificación errónea | Variantes de teléfono/usuario y DNI requieren normalización uniforme y unicidad bajo concurrencia; la unicidad de DNI no está garantizada por índice único de DB. | Probar duplicados/variantes en todas las rutas de alta/edición y migración de datos; diseñar índices sin romper datos existentes. |
| B09 | P1; P0 si recepción distribuida depende de eventos | Streams se basan en memoria/EventEmitter del proceso. | Probar despliegue real: afinidad, pub/sub compartido o recuperación por consultas. No asumir eventos entre procesos. |
| B10 | P0 para habilitar archivos que no están suficientemente controlados | Presign de media de ejercicios sube directamente a S3 sin inspección del contenido ni límite general de 5 MiB; PDF se acepta por cabecera, sin escáner; borrar media no borra objeto S3. | Política de formatos/tamaño, inspección o cuarentena, bucket/descarga seguros, limpieza y retención de objetos. No afirmar que todo archivo está sanitizado. |

Otros aspectos a comprobar manualmente: validación de fechas inválidas/invertidas en todas las altas, errores de proveedores, permisos A/B de workout/nutrición, comportamiento de reintentos de operaciones financieras y accesibilidad de pantallas autenticadas. La lista de pruebas contiene los criterios; un caso fallido debe abrir incidencia.

## Verificación realizada y límites

| Comprobación | Resultado |
|---|---|
| Compilación local protegida | Correcta mediante `node scripts/local-next.mjs build 3000 .next-build-local`: compilación, chequeo de tipos y generación completados sobre el código final. |
| `npm run typecheck` | Sin errores. |
| `npm run lint` | 0 errores; 67 advertencias pendientes (tipos any, variables y dependencias de hooks). Artefactos de compilación/locales excluidos. |
| `npm run test:coverage` | 127 pruebas en 22 archivos, todas correctas. Líneas 98,40%, ramas 91,03%; solo módulos incluidos. |
| `npm run test:e2e` | 69 correctas sin omisiones; tres tamaños de pantalla. Incluye login real y transacciones contra PostgreSQL local. |
| `npm audit --omit=dev --json` | 0 vulnerabilidades en dependencias de producción. |
| `npm audit --json` | 14 avisos high por dependencia transitiva braces de herramientas de desarrollo; un advisory raíz, sin versión corregida publicada al revisar. No aplicar las degradaciones/cambios de versión mayor sugeridos de forma automática. |

No se conectó un lector físico, no se verificó entrega SMTP, no se hicieron cargos Culqi, escrituras de S3 ni restauración de PostgreSQL. Las unitarias de Route Handlers simulan DB/proveedor; las nuevas E2E de caja/auth usan transacciones y sesiones reales locales, con bandeja de correo local.

Las pruebas de perfiles, nutrición y reportes incluyen datos/respuestas simuladas para comprobar interfaz. Las negativas comprueban rechazos HTTP del servidor y redirecciones. Las cuentas locales de auditoría permiten ejecutar login real sin omitir casos; no se publican contraseñas/tokens en informes.

La cobertura configurada mide módulos de dominio/servidor y utilidades seleccionadas; excluye páginas y la mayoría de Route Handlers. Un porcentaje alto aquí **no** significa cobertura completa de la aplicación ni aprobación manual.

## Referencias técnicas consultadas

- [Advisory PostCSS GHSA-6g55-p6wh-862q](https://github.com/advisories/GHSA-6g55-p6wh-862q) y [releases oficiales PostCSS](https://github.com/postcss/postcss/releases).
- [Advisory Vitest GHSA-fxqj-rqcc-2cmp](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp), [advisory relacionado](https://github.com/advisories/GHSA-82fw-gwwq-j7x9) y [release oficial Vitest 4.1.11](https://github.com/vitest-dev/vitest/releases/tag/v4.1.11).
- [PostgreSQL: bloqueos explícitos y advisory locks](https://www.postgresql.org/docs/current/explicit-locking.html): los bloqueos de transacción se liberan al finalizar la transacción.
- [Advisory braces GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), actualizado el 2 de octubre: agotamiento de pila en patrones profundamente anidados; sin versión corregida. En este repositorio las rutas HTTP no entregan patrones del usuario a estas herramientas de desarrollo.

Skills aplicadas: `security-review`, `code-review-and-quality`, `agent-skills:security-and-hardening`, diseño API/backend/frontend y `spreadsheets`. No se encontró una skill específica de pentest instalada: los ataques locales usaron la metodología de seguridad disponible. No se hizo push, despliegue ni escritura de recursos externos.
