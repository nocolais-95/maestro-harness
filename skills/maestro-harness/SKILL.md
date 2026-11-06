---
name: maestro-harness
description: Prueba E2E en un celular real con Maestro, bajo pedido. Usar cuando el usuario pide probar algo en el celu/Maestro, armar un test E2E, correr un flow/suite, o al cierre de un plan si el usuario confirma. Nunca correr por iniciativa propia.
---

# maestro-harness

Agnóstico de proyecto, SO (mac/win/linux), dispositivo y red. Todo pasa por la CLI `mh` (Node, sin deps). **Opt-in:** solo corre si el usuario lo pidió o confirmó ("¿lo pruebo en Maestro?").

## Contrato con el proyecto
`maestro-harness.json` en la raíz (appId, devClientScheme, metro.command/port, testsDir, env, contextHints). Tests en `<testsDir>/{flows/<feature>,flows/shared,suites,tasks,reports}`. Si falta: `mh init`.
Los flows usan variables inyectadas: `${APP_ID}`, `${METRO_URL}`, `${DEV_CLIENT_URL}` (abrir con `openLink: ${DEV_CLIENT_URL}`). Nunca IPs ni SSID.

## Comandos
- `mh doctor` — dispositivo (USB→wifi→mDNS→escaneo de subred, identidad por serial), perfil OEM, driver, app instalada, Metro + `adb reverse`. Salida ≤8 líneas.
- `mh run <flow|dir|suite:x|task:archivo|common:x> [-e K=V] [--device ID]` — doctor + ejecución + reporte corto.
- `mh devices` · `mh profiles` · `mh report <dir>`.
- Comunes de mobile (no de la app): `common:cold-start-loop|background-resume|rapid-taps-stress|scroll-stress|wifi-off-recovery|airplane-mode|rotate`. Los de red/rotación usan `# chaos: accion@Ns,...` y requieren USB; el harness restaura wifi/avión/rotación siempre (incluso con Ctrl-C).

## Roles (delegar a subagentes baratos cuando se pueda)
1. **Test Author** (`agents/test-author.md`): prueba en lenguaje natural → flow YAML. Busca contexto antes de preguntar: specs/docs/código del proyecto (textos y testID reales) y lo que liste `contextHints`. Si falta un dato (credenciales, DNI, rama del flujo), preguntar al usuario. Reusar `flows/shared/`. Si el flow crea/modifica datos reales, cabecera `# ATENCIÓN: crea datos: <qué>`; nunca confirmar acciones destructivas ni POST/PUT/DELETE reales sin sí explícito.
2. **Executor** (`agents/test-executor.md`): solo `mh run …` y devolver la salida. No lee código.
3. **Reporter/Fixer** (`agents/test-reporter.md`): ante FAIL lee solo el paso y el screenshot y clasifica: bug de app / test frágil / entorno / quirk de dispositivo. Test frágil → corregir el YAML y re-correr una vez. Bug de app → informar, no tocar código fuera de alcance. Quirk nuevo de un dispositivo → agregarlo a `profiles/<oem>.json` (el conocimiento vive ahí, no en memorias sueltas).

## Instructivo de cierre
Al terminar un plan/tarea, si el usuario acepta probar: escribir `<testsDir>/tasks/<fecha>-<slug>.md` (≤30 líneas):
```
# <qué cambió en una línea>
flow: coverages/dni-seven-digits.yaml
flow: common:background-resume
env: WORKER_DNI=41000555
datos: <cuenta/sesión requerida, qué muta>
```
y pasar **solo la ruta** al Executor: `mh run task:<ruta>`. Mínimo contexto = mínimo token.

## Reglas de dispositivo/red
- Si `doctor` falla por red: no improvisar; leer su diagnóstico (una línea) y pedir USB una vez.
- Aviso "Instalar vía USB"/permisos: el harness ya evita reinstalar el driver. Nunca tocar restricciones del teléfono; avisar al usuario.
- Windows/Linux no están verificados aún; si algo falla en `platform.mjs`, arreglarlo ahí.
