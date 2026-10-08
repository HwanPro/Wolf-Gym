# Inventario de puntos de entrada HTTP

Revisado el 2 de octubre de 2026 desde src/app/api. Los métodos se identifican por exports; las referencias de guardia son pistas de lectura y no certifican permisos. Los re-exports delegan el control. Cada método debe comprobarse con anónimo, administrador y clientes A/B cuando maneje datos propios.

| Ruta | Métodos exportados | Referencias de autorización detectadas |
|---|---|---|
| `/api/admin/auto-close` | POST | requireAdmin |
| `/api/admin/cash/[action]` | POST | requireAdmin, getSensitiveAdminAccess |
| `/api/admin/cash/actions` | GET | requireAdmin |
| `/api/admin/cash` | GET | requireAdmin |
| `/api/admin/change-user-password` | POST | requireAdmin |
| `/api/admin/cleanup` | POST | Delegado: revisar origen del export |
| `/api/admin/clients/dashboard` | GET | getServerSession |
| `/api/admin/clients` | GET | requestToken |
| `/api/admin/local-environment` | GET | requireAdmin |
| `/api/admin/me` | GET | requestToken |
| `/api/admin/metrics` | GET | requestToken |
| `/api/admin/nutrition/assignments` | GET, POST | requireAdmin |
| `/api/admin/nutrition/plans` | GET, POST | requireAdmin |
| `/api/admin/reports` | GET | requestToken |
| `/api/admin/s3-images` | DELETE, GET | getSensitiveAdminAccess |
| `/api/admin/s3-permissions` | GET, POST | getSensitiveAdminAccess |
| `/api/admin/s3-signed-url` | GET | getSensitiveAdminAccess |
| `/api/admin/sales/daily` | GET, POST | Delegado: revisar origen del export |
| `/api/admin/sensitive-access` | DELETE, GET, POST | requestToken, getSensitiveAdminAccess |
| `/api/admin/summary` | GET | requestToken |
| `/api/admin/update-user` | PATCH | requestToken |
| `/api/assign/program` | POST | getServerSession |
| `/api/assign/routine` | POST | getServerSession |
| `/api/attendance/[id]` | DELETE, PATCH | requireAdmin |
| `/api/attendance` | GET, POST | requireAdmin |
| `/api/auth/2FA` | POST, PUT | authorizeRequest |
| `/api/auth/[...nextauth]` | GET, POST | Delegado: revisar origen del export |
| `/api/auth/change-password` | POST | getServerSession |
| `/api/auth/register` | POST | Revisar control del método / lectura pública |
| `/api/auth/reset-password` | POST | Revisar control del método / lectura pública |
| `/api/auth/set-new-password` | POST | Revisar control del método / lectura pública |
| `/api/auth/update-session` | POST | getServerSession |
| `/api/auth/verify-email` | POST, PUT | authorizeRequest |
| `/api/biometric/active-target` | DELETE, GET, POST | requireAdmin |
| `/api/biometric/capture` | POST | requireAdmin |
| `/api/biometric/delete/[id]` | DELETE | requireAdmin |
| `/api/biometric/identify` | POST | requireAdmin |
| `/api/biometric/ping` | GET | requireAdmin |
| `/api/biometric/register/[id]` | POST | requireAdmin |
| `/api/biometric/status/[id]` | GET | requireAdmin |
| `/api/biometric/verify/[id]` | POST | requireAdmin |
| `/api/check-in/client-lookup` | POST | requestToken |
| `/api/check-in/history` | GET | requireAdmin |
| `/api/check-in` | POST | requireAdmin |
| `/api/check-in/stream` | GET | requireAdmin |
| `/api/check-in/verify-phone` | POST | requireAdmin |
| `/api/clients/[id]` | DELETE, POST, PUT | requireAdmin |
| `/api/clients/manual` | GET | requestToken |
| `/api/clients` | GET, POST | requestToken |
| `/api/commands` | GET, OPTIONS, POST | requireAdmin |
| `/api/dashboard` | GET | requestToken |
| `/api/debts/cleanup` | DELETE, POST | requireAdmin |
| `/api/debts` | DELETE, GET, POST | requireAdmin |
| `/api/exercises/[id]/media/presign` | POST | getServerSession |
| `/api/exercises/[id]/media` | GET, POST | getServerSession |
| `/api/exercises/[id]` | DELETE, GET, PUT | getServerSession |
| `/api/exercises` | GET, POST | getServerSession |
| `/api/exercises/seed` | POST | requireAdmin |
| `/api/gallery/[id]` | DELETE, PUT | requireAdmin |
| `/api/gallery` | GET, POST | requireAdmin |
| `/api/media/[mediaId]` | DELETE, PUT | getServerSession |
| `/api/nutrition/current` | GET | authorizeRequest |
| `/api/payaments/culqui` | POST | authorizeRequest |
| `/api/payments/culqi` | POST | Delegado: revisar origen del export |
| `/api/plans/[id]` | PUT | requireAdmin |
| `/api/plans` | GET, POST | requireAdmin |
| `/api/products/[id]` | DELETE, PUT | requireAdmin |
| `/api/products/gym` | GET | requireAdmin |
| `/api/products/public` | GET, POST | requireAdmin |
| `/api/products` | GET, POST | requestToken |
| `/api/profile/update` | PATCH | getServerSession |
| `/api/profile/upload-image` | POST | getServerSession |
| `/api/programs` | GET, POST | getServerSession |
| `/api/routines/[id]/items` | GET, POST | getServerSession |
| `/api/routines` | GET, POST | getServerSession |
| `/api/stories/[id]` | DELETE | requireAdmin |
| `/api/stories` | DELETE, GET, POST, PUT | requireAdmin |
| `/api/stream` | GET | requireAdmin |
| `/api/suggestions/next` | GET | getServerSession |
| `/api/test-checkin` | POST | requireAdmin |
| `/api/test-checkout` | POST | requireAdmin |
| `/api/test/exercises` | GET | requireAdmin |
| `/api/uploads` | POST | requireAdmin |
| `/api/user/me` | GET | requestToken |
| `/api/user/update` | PATCH | requestToken |
| `/api/user/username` | PUT | requestToken |
| `/api/workouts/[id]/complete` | PUT | getServerSession |
| `/api/workouts/[id]/exercises/[wid]/sets` | GET, POST | getServerSession |
| `/api/workouts/[id]/exercises` | GET, POST | getServerSession |
| `/api/workouts/[id]` | PATCH | getServerSession |
| `/api/workouts/exercises/[id]/sets` | POST | getServerSession |
| `/api/workouts/recent` | GET | getServerSession |
| `/api/workouts` | GET, POST | getServerSession |

Total: 93 archivos de ruta y 135 métodos identificados.

[Correcciones y límites](security-review-2026-10-02.md) · [Pruebas por acción](manual-acceptance-tests.md) · [Caja y pruebas reales locales](cash-register-and-local-security.md).
