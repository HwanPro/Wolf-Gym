# Wolf Gym

Aplicacion web de gestion para Wolf Gym (Next.js + Prisma + NextAuth) con panel admin, check-in, reportes e integracion biometrica.

## Stack
- Next.js 15 (App Router)
- TypeScript
- Prisma + PostgreSQL
- NextAuth (credenciales)
- Tailwind CSS

## Requisitos
- Node.js compatible con el stack y herramientas instaladas (revisión realizada con Node.js 24.16)
- npm
- Base de datos PostgreSQL

## Variables de entorno
Configura `.env` con al menos:

```env
DATABASE_URL=postgresql://...
NEXTAUTH_SECRET=...
NEXTAUTH_URL=http://localhost:3000

AWS_REGION=...
AWS_BUCKET_NAME=...
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...

NEXT_PUBLIC_CULQI_PUBLIC_KEY=...
EMAIL_USER=...
EMAIL_PASS=...
```

## Desarrollo
```bash
npm install
npm run dev
```

Si aparece error de cache de Next (`routes-manifest.json`, `ENOENT` en `.next`):

```bash
npm run dev:clean
```

## Build de produccion
```bash
npm run build
npm run start
```

Nota en Windows: si Prisma falla con `EPERM ... query_engine-windows.dll.node`, cierra procesos `node` en segundo plano y vuelve a ejecutar `npm run build`.

## Panel Admin
Rutas principales:
- `/admin/dashboard`
- `/admin/profile`
- `/admin/reportes`
- `/admin/clients`
- `/admin/products`

Incluye:
- metricas de negocio
- gestion de clientes/productos
- perfil de administrador
- reportes con inconsistencias de datos

## Reportes
`/admin/reportes` consume `GET /api/admin/reports` y muestra:
- overview de ingresos, asistencia y membresias
- tendencias de ingresos y asistencia
- estado de inventario
- deudas
- inconsistencias (planes faltantes, fechas invalidas, stock negativo, precios invalidos, telefonos duplicados, etc.)

## Perfil Admin
`/admin/profile` permite visualizar y editar datos del administrador usando `ProfileModal`.
Endpoint usado:
- `GET /api/admin/me` (retorna solo campos seguros)

## Integracion biometrica (resumen)
La aplicacion se integra con un servicio biometrico local en `biometric-service/`.
Flujo esperado:
1. levantar servicio biometrico local
2. app consulta endpoints biometria (`/api/biometric/*`)
3. registrar/verificar huella por usuario

## Scripts utiles
```bash
npm run dev
npm run dev:clean
npm run build
npm run typecheck
npm test
npm run test:coverage
npm run test:e2e
npm run db:migrate:deploy
npm run start
npm run lint
npm run cleanup:daily
npm run cleanup:weekly
npm run cleanup:both
npm run seed:complete
```

`npm run build` no aplica migraciones ni modifica la base de datos. El despliegue
de migraciones es una operación explícita mediante `npm run db:migrate:deploy`.

## Reglas verificadas

- Las políticas de asistencia y caja usan `America/Lima`; comparar también los endpoints heredados y límites mensuales según la guía de aceptación.
- Horario: lunes a viernes 06:00-21:00, sábados 06:00-20:00 y domingos cerrado.
- La fecha final de membresía permanece válida hasta terminar ese día en Lima.
- Máximo de dos entradas diarias y antirrebote de 60 segundos.
- Ventas y compras agrupan productos repetidos, validan stock y evitan stock negativo con una actualización transaccional condicional.
- Las mutaciones administrativas comprueban sesión y rol dentro de cada Route Handler; el middleware no es la única barrera.
- Las cargas validan autenticación, MIME, extensión, tamaño y claves seguras de almacenamiento.

Las reglas detalladas y sus criterios de respuesta están en `docs/business-rules.md`.

## Revisión y pruebas antes de operar

- [Guía manual: 200 casos, pasos y comportamiento esperado](docs/manual-acceptance-tests.md).
- [Excel de aceptación con filtros, estados y resumen](outputs/01a0fedc-6cce-77e1-ade8-e0610d80bbd8/pruebas-manuales-wolf-gym.xlsx).
- [Caja completa, entorno local, cuentas de prueba y ataques comprobados](docs/cash-register-and-local-security.md).
- [Revisión de seguridad, correcciones y bloqueos pendientes](docs/security-review-2026-10-02.md).
- [Inventario de rutas API y métodos revisados](docs/api-review-inventory.md).

Los casos manuales están pendientes. No habilitar compras de membresías ni cobros online sin resolver los bloqueos de asignación/conciliación. Las limpiezas destructivas están deshabilitadas; los cobros y anulaciones de la nueva caja conservan trazabilidad.

Las APIs ahora revocan JWT tras cambios de contraseña, 2FA, rol o borrado. El despliegue de estas correcciones exige que las sesiones anteriores vuelvan a iniciar sesión. Recepción y endpoints biométricos requieren administrador.

## Solucion rapida de fallas comunes
- Pantalla en blanco o 500 en admin durante desarrollo: `npm run dev:clean`.
- Botones sin respuesta por recarga de pagina: revisar sesion y evitar `window.location.reload`; usar refresco de datos via fetch.
- Endpoint admin devuelve 401: verificar sesion y rol `admin`.

## Licencia
Uso interno de Wolf Gym.
