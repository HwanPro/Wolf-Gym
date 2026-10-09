# Identificación biométrica: diagnóstico y corrección

Fecha: 3 de octubre de 2026. Entorno comprobado: PostgreSQL local `wolfgym`, `127.0.0.1:5432`. No se conectó a producción ni se cambiaron las huellas registradas.

## Causa comprobada

El ejecutable de desarrollo del servicio C# estaba escuchando en el puerto 8001 con `DefaultConnection` vacío. `/health` respondía correctamente aunque no verificaba PostgreSQL. Cada identificación fallaba al cargar las huellas: `The ConnectionString property has not been initialized.`

La API web convertía cualquier fallo del servicio en una respuesta exitosa sin coincidencia, con el texto «Huella no registrada en ningún perfil». La pantalla también descartaba los errores de identificación y ofrecía registro por DNI/teléfono. Así aparecían incorrectas incluso las huellas existentes.

Además, abrir la aplicación local mediante `localhost:3000` provocaba un rechazo de origen: la configuración canónica usaba `127.0.0.1:3000`.

## Cambios

- Si falta la conexión explícita, el servicio carga exclusivamente la configuración `.env.local` del proyecto y construye la conexión con Npgsql. Rechaza destinos remotos, redirecciones y bases de sistema. Nunca usa `.env` como alternativa.
- En modo `WOLF_LOCAL_ONLY=1`, también rechaza conexiones explícitas a servidores remotos. Antes de escuchar HTTP comprueba conexión, dirección real, base y acceso a `fingerprints`. Un fallo de arranque termina con código distinto de cero.
- `/health` comprueba acceso a la tabla en cada consulta; devuelve 503 si la base deja de estar disponible.
- El lanzador local descarta conexiones heredadas del terminal y utiliza la misma configuración local. Se recompilaron el ejecutable de desarrollo y la distribución local.
- La API conserva la diferencia entre comparación sin coincidencia (200), lectura ambigua (409), propietario ausente en la base web (409), respuesta incompleta (502) y fallo del servicio (503). No expone detalles internos ni credenciales. Valida formato base64 y límite de 2048 bytes antes de invocar la comparación nativa.
- Entrada, salida y deuda muestran errores del servicio sin convertirlos en «no te reconocimos». El registro manual sigue disponible para una comparación válida sin coincidencia.
- Los alias de loopback se permiten únicamente en modo local verificado, con el mismo protocolo y puerto. Orígenes externos, otros puertos y solicitudes marcadas `cross-site` continúan rechazados.

No se redujo el umbral del lector: permanece en 30, como en el servicio que estaba en ejecución.

## Evidencia

- Las 10 plantillas locales tienen tamaño coherente. Comparadas contra el catálogo con el SDK real, las 10 identifican al propietario esperado, puntuación 100.
- Las mismas 10 pruebas pasan por la API web con una sesión real de administrador y origen `localhost:3000`. Un origen externo devuelve 403.
- El usuario confirmó que una lectura nueva del dedo registrado ya reconoce su huella.
- 141 pruebas unitarias pasan, incluidas 13 regresiones de identificación y la comprobación de alias locales.
- 8 comprobaciones ejecutables de configuración C# pasan sin abrir conexiones ni cargar el SDK: `npm run test:biometric-config`.
- 4 pruebas de navegador pasan: fallo del servicio en entrada/salida/deuda sin escrituras posteriores y alternativa manual tras una comparación válida sin coincidencia.
- Compilación de C#, publicación local, build de Next.js, comprobación de tipos y lint de los archivos del cambio pasan. El servicio C# conserva avisos previos de interoperabilidad/compatibilidad Windows.

Los resultados con plantillas guardadas comprueban conexión, catálogo, comparación e identidad; no miden por sí solos falsas aceptaciones o rechazos de lecturas nuevas.

## Pruebas manuales para futuras entregas

1. Arrancar mediante `npm run biometric:local` cuando no haya otro servicio usando 8001. Confirmar disponibilidad y registrar entrada/salida con el mismo dedo previamente inscrito.
2. Probar varios clientes registrados, variando la colocación del dedo: devolver siempre la identidad correcta. Una lectura ajena no debe registrar asistencia de otra persona.
3. Detener el servicio en el entorno de pruebas e intentar entrada, salida y deuda. Mostrar indisponibilidad, cerrar el indicador de carga y no crear asistencia/deuda ni afirmar que la huella no está registrada.
4. Reiniciar el servicio sin pasar credenciales por argumentos: debe recuperar la configuración local. Una configuración vacía o remota no debe permitir que el servicio anuncie disponibilidad.
5. Comprobar la aplicación mediante `localhost` y `127.0.0.1`, cerrando e iniciando sesión en cada host si es necesario. Ambos deben permitir acciones autenticadas; un origen externo debe continuar rechazado.

La revisión completa de huellas continúa en los casos BIO01–BIO10 de [pruebas manuales](manual-acceptance-tests.md).
