# Entrega Windows

El paquete contiene Node, servicio biométrico .NET y launcher WebView2. WolfGym.bat abre el mismo launcher. Al cerrar su ventana se detienen los procesos de esa instalación; no se usa taskkill global por nombre.

El servidor web y el servicio biométrico escuchan en loopback. El panel de Windows abre http://127.0.0.1:3000. Los perfiles desde otros dispositivos se usan mediante https://wolf-gym.com. En la entrega, ambos entornos deben apuntar explícitamente al catálogo y base de producción acordados; una copia local de aceptación no sincroniza datos con la web.

## Construcción

Ejecutar setup-launcher/build-package.ps1 desde una copia de trabajo aislada. La construcción normal instala dependencias y genera Prisma en esa copia. No ejecutarla sobre un entorno que está sirviendo la aplicación.

Para empaquetar una compilación ya probada, usar -WebBuildPath con su carpeta de build. El origen debe conservar package-lock.json, next.config.ts y el cliente Prisma correspondiente. -OutputDirectory elige una carpeta dentro del proyecto; se rechazan enlaces/junctions en sus ancestros y destinos con archivos privados .env. -NoShortcut evita reemplazar el acceso directo durante aceptación.

Se convierte next.config.ts en next.config.mjs para conservar la configuración sin instalar TypeScript como dependencia de producción. No se incluye la caché de compilación.

## Configuración privada y distribución

No se copia automáticamente el .env del repositorio. -LocalEnvPath permite una copia privada explícita, realizada después del ZIP. No compartir esa carpeta privada. Para distribuir, usar el ZIP y verificar su SHA-256.

Configurar DATABASE_URL y NEXTAUTH_SECRET fuerte en webapp/.env o en el entorno del proceso. El launcher entrega DATABASE_URL al servicio biométrico. Mantener las credenciales fuera de Git, logs e informes.

Los flags y claves de proveedores se leen del servidor. Culqi usa /api/payments/config, que entrega únicamente su clave pública; habilitar WOLF_ENABLE_ONLINE_PAYMENTS y, si corresponde, WOLF_ENABLE_ONLINE_MEMBERSHIPS después de aprobar el entorno. PK/SK deben pertenecer al mismo modo y comercio.

La configuración de aceptación usa una copia y deshabilita escrituras externas. No distribuir sus flags de fault injection ni credenciales sintéticas como producción.

## Esquema de base de datos antes de activar

Las migraciones de entrega son 20261002000100_add_cash_register, 20261002000200_persistent_session_revocation, 20261006000100_online_payment_attempts, 20261008000100_persistent_rate_limit y 20261008000200_unique_client_document. Las primeras tres estaban pendientes en el esquema remoto inspeccionado; las nuevas incorporan contadores de seguridad compartidos y unicidad de DNI normalizado. Antes de aplicarlas, comprobar la base real de cada entorno, disponer de una copia recuperable y revisar el historial de migraciones. No ejecutar migraciones sobre la base original local de aceptación ni deducir que la conexión de Vercel es idéntica a la del archivo local.

El ensayo de estas tres migraciones usó una base vacía con solo esquema. No acredita restauración de datos de producción. El diff del ensayo propone borrar columnas de nutrición, un índice heredado y sync_outbox: no aplicar ese diff; los elementos heredados requieren una revisión independiente.

La cuarta migración se comprobó en la copia local de aceptación y en la base HTTPS sintética autorizada. Login, recuperación, verificación de correo, alta 2FA y acceso administrativo sensible usan contadores persistentes. Se comparten únicamente entre procesos conectados a la misma base; si falta la migración o la base no responde, se deniega el intento, sin recurrir a memoria vacía. Antes de activar, verificar login real y la migración aplicada. La tabla conserva hashes de claves y ventanas de hasta quince minutos; se eliminan las vencidas al consumir intentos, con un máximo de 10.000 claves activas.

La quinta migración conserva los documentos existentes y añade un índice único sobre los dígitos del DNI no vacío. Si ya hay documentos equivalentes duplicados, la migración debe fallar: revisar esas filas expresamente; no borrarlas ni normalizarlas en masa. Una consulta agregada de solo lectura no encontró grupos duplicados en la base local original ni en la remota del archivo .env el 8 de octubre; la conexión efectiva de Vercel sigue sin confirmarse. El índice de expresión se mantiene mediante esta migración SQL y no se representa con @unique en Prisma; no aplicar un diff que proponga retirarlo.

La recepción y su display deben utilizar la misma instancia Windows. Los eventos SSE no se difunden entre procesos; el display también recupera historial por consulta periódica. No presentar una difusión entre instancias como comprobada.

La construcción debe incluir postcss.config.cjs. Comprobar que el CSS servido contiene las utilidades Tailwind compiladas y no las directivas @tailwind sin procesar. Si cambia la configuración de PostCSS, reconstruir sin reutilizar una caché incompatible.

## Prueba de distribución y actualización

La rama codex/windows-update-test se reserva para los paquetes Windows. vercel.json deshabilita el despliegue automático únicamente para esa rama. No subir estas pruebas a main ni activar producción como parte de esta prueba.

El workflow release-wolfgym.yml construye y publica al subir un tag vX.Y.Z. Un push sin tag no publica un paquete nuevo. El launcher consulta GitHub Releases al arrancar y solo instala una versión estable cuyo número sea mayor que el de version.json; omite borradores y prereleases. Por ello los paquetes de esta prueba usan números de versión estables y sus notas indican el alcance de aceptación.

Para la primera instalación descargar y extraer el ZIP completo, conservar juntas webapp, biometric, runtime y WolfGymLauncher.exe, y configurar privadamente la copia de aceptación. Descargar solo el exe no instala sus dependencias. El paquete no incluye .env ni aplica migraciones. Para comprobar una segunda entrega, cerrar la aplicación, publicar un paquete con un número superior y volver a abrir el mismo launcher instalado. La configuración local debe conservarse. Si no hay conexión o la descarga/verificación falla, continúa la versión instalada.

### Primera instalación en otra laptop

La opción directa es descargar el ZIP de la última release estable, extraerlo completo y configurar `webapp/.env` de forma privada. Crear el acceso directo a `WolfGymLauncher.exe`. La laptop necesita WebView2 y el controlador del lector cuando se use el huellero; Node y .NET se incluyen en el paquete.

Si se prefiere construir desde Git, la copia debe estar en `codex/windows-update-test`; un `git pull` en `main` no obtiene esta entrega. Con Node y el SDK .NET 8 instalados, ejecutar desde una copia aislada:

```powershell
git fetch origin
git switch codex/windows-update-test
git pull --ff-only
powershell -NoProfile -ExecutionPolicy Bypass -File .\setup-launcher\build-package.ps1 -Version v0.2.3
```

El constructor instala las dependencias y genera `dist/WolfGym`. Configurar privadamente `dist/WolfGym/webapp/.env` antes del primer arranque. La activación contra producción requiere completar los pasos de esquema y configuración anteriores; construir el paquete no los realiza.

Después de esa instalación inicial, abrir siempre el launcher o su acceso directo: consulta las releases estables y actualiza el paquete al arrancar. No requiere volver a ejecutar Git ni compilar por cada actualización. Los cambios publicados solo como commits no se instalan hasta que se publica su release Windows.

La base funcional aprobada se publica completa antes de probar cambios pequeños: no separar correcciones de seguridad, sus llamadas y las migraciones que requieren. Cada siguiente release debe describir el cambio concreto y sus comprobaciones.

## Verificación funcional final

Comprobar arranque de la ventana, login real, panel, estado del lector, captura física y cierre con la X. Confirmar que los dos puertos se cierran y un proceso Node ajeno permanece activo. Un build correcto por sí solo no acredita estos pasos.
