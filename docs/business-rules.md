# Wolf Gym: reglas de negocio verificadas

Este documento describe el comportamiento observable de la web. Las políticas
puras viven en `src/domain`; los Route Handlers adaptan HTTP y Prisma, y los
servicios de infraestructura encapsulan base de datos y proveedores externos.

## Autenticación y autorización

- Roles válidos: `admin` y `client`.
- Una ruta de administrador responde `401` sin sesión y `403` con sesión de otro rol.
- La autorización se valida en el Route Handler además del middleware.
- El login devuelve un error genérico para usuario inexistente o contraseña incorrecta.
- Si el usuario tiene 2FA habilitado, el login requiere un TOTP válido de seis dígitos.
- El alta y la verificación de 2FA solo pueden afectar al usuario autenticado.

## Asistencia y membresías

- Zona horaria de negocio: `America/Lima` (UTC-5, sin horario de verano).
- Horario de acceso: lunes a viernes 06:00-21:00 y sábado 06:00-20:00. Domingo cerrado.
- Un check-in fuera de horario responde `400`, `reason: "gym_closed"`.
- Una membresía vence después de terminar su fecha final en Lima; durante esa fecha `daysLeft` es `0` y aún está activa.
- Sin fecha final configurada, el acceso no se bloquea por vencimiento.
- Antirrebote: 60 segundos. Límite: dos entradas por día de Lima.
- El checkout exige una entrada abierta y puede realizarse aunque haya terminado el horario.
- Las sesiones abiertas por 180 minutos se cierran automáticamente.

## Productos, ventas y deudas

- Precio, descuento, cantidad y stock deben ser finitos y no negativos; la cantidad es un entero mayor que cero.
- Descuento permitido: 0-100%.
- Los productos repetidos se agrupan antes de validar stock.
- El total se redondea a dos decimales.
- El descuento y el total se calculan en el servidor; nunca se confía en un total enviado por el navegador.
- La reducción de stock y la creación de la compra ocurren en una transacción.
- Una actualización condicional impide stock negativo ante ventas concurrentes; el conflicto responde `409`.
- Una compra pública autenticada siempre se asigna al usuario de la sesión, no a un `customerId` del body.
- Las deudas personalizadas requieren nombre y monto; todas las mutaciones de deuda requieren administrador.

## Archivos y contenido

- Planes, historias, galería y productos son públicos para lectura.
- Crear, editar o eliminar esos recursos requiere administrador.
- `GET /api/plans` no escribe en la base de datos; usa fallbacks en memoria si no hay planes persistidos.
- Las cargas aceptan únicamente los MIME y extensiones permitidos, hasta 5 MiB.
- Los nombres y carpetas se normalizan antes de formar una clave S3.

## Respuestas y errores

- `400`: entrada inválida o regla de negocio incumplida.
- `401`: falta sesión.
- `403`: rol insuficiente.
- `404`: recurso inexistente o no disponible.
- `409`: conflicto de concurrencia, por ejemplo cambio de stock.
- `502/503`: proveedor externo falló o no está configurado.
- `500`: error interno genérico; no se exponen stack traces, secretos ni respuestas privadas de proveedores.

## Responsive y accesibilidad

- Desktop validado a 1440×900.
- Mobile vertical validado a 390×844.
- Mobile horizontal validado a 844×390.
- Las rutas inicio, login, registro, tienda y check-in no deben producir scroll horizontal.
- No se admiten violaciones Axe de impacto `critical` o `serious` en esas rutas.
