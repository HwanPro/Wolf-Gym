# Instalacion de Wolf Gym en Windows

## Primera vez

1. Descarga o copia el repositorio en la PC anfitriona.
2. Ejecuta `setup-wolfgym-command.cmd` con doble clic.
3. Se abrira una consola nueva con el comando disponible.
4. Ejecuta:

```powershell
wolfgym download
```

El comando descarga el ultimo paquete estable desde GitHub Releases, verifica
su SHA-256, instala Wolf Gym en `%LOCALAPPDATA%\Programs\WolfGym` y crea accesos
directos en el Escritorio y el menu Inicio.

Durante la primera instalacion toma `.env` y
`biometric-service\appsettings.Production.json` de la copia local del
repositorio. Esos archivos quedan restringidos al usuario de Windows y se
conservan cuando llega una actualizacion; nunca se publican dentro del ZIP.

El comando solo se instala una vez. Para instalar una version nueva de forma
manual se usa:

```powershell
wolfgym update
```

## Actualizaciones automaticas

`WolfGymLauncher.exe` consulta el ultimo GitHub Release estable cada vez que se
abre. Si existe una version superior:

1. descarga el ZIP oficial;
2. verifica su checksum SHA-256;
3. conserva `.env`, `appsettings.json` y logs locales;
4. crea un respaldo temporal;
5. instala la version nueva;
6. vuelve a abrir Wolf Gym;
7. restaura la version anterior si la actualizacion falla.

Una PC cliente no necesita Git ni acceso al repositorio. Solo requiere conexion
a GitHub para instalar o actualizar y el driver del huellero ZKTeco.

La aplicacion solo instala releases que incluyan el ZIP y su archivo
`.sha256`. Un release incompleto se ignora para no reemplazar una instalacion
funcional con una descarga no verificada.

## Firma de Windows

El ejecutable conserva el icono de Wolf Gym. En equipos con Smart App Control o
WDAC estricto, el release tambien debe llevar firma Authenticode de una entidad
confiable. Una vez disponible el certificado PFX:

```powershell
$password = Read-Host "Password del certificado" -AsSecureString
.\tools\sign-windows-release.ps1 `
  -CertificatePath C:\seguro\wolfgym-code-signing.pfx `
  -CertificatePassword $password `
  -Version v0.2.0
```

La utilidad firma el launcher, el servicio y las DLLs del lector; luego vuelve
a crear el ZIP y su checksum. El certificado y su password no se guardan en el
repositorio.

## Otros comandos

```powershell
wolfgym status
wolfgym start
wolfgym help
wolfgym download --dry-run
```

`--dry-run` permite comprobar que existe un release descargable sin instalarlo.
