# Módulo de planificación nutricional

Fecha de investigación: 2026-09-27

## Alcance seguro

El módulo organiza planes alimentarios para adultos y permite que un profesional los cree,
publique, asigne y supervise. No diagnostica enfermedades ni sustituye la valoración de un
nutricionista. Los casos terapéuticos, menores de edad, embarazo/lactancia, trastornos de la
conducta alimentaria y enfermedades que alteran requerimientos deben escalarse a un profesional.

La estructura sigue las cuatro etapas del Nutrition Care Process: evaluación, diagnóstico
profesional, intervención y seguimiento. La aplicación implementa evaluación, intervención y
seguimiento; no genera automáticamente diagnósticos clínicos.

Fuente: [Academy of Nutrition and Dietetics - Nutrition Care Process](https://www.eatrightpro.org/practice/nutrition-care-process).

## Modalidades del plan

1. `QUANTIFIED`: cantidades exactas en gramos, mililitros o unidades. Útil cuando se necesita
   controlar energía y macronutrientes.
2. `PORTIONS`: medidas caseras, como taza, cucharada, unidad o porción. Cada porción puede tener
   una equivalencia opcional en gramos.
3. `QUALITATIVE`: indicaciones visuales sin pesar, como medio plato de verduras. Métodos de plato
   permiten construir comidas sin contar ni pesar alimentos.
4. `HYBRID`: mezcla cantidades exactas y referencias visuales, normalmente la opción más práctica.

Fuente: [American Diabetes Association - Diabetes Plate](https://diabetesfoodhub.org/blog/what-diabetes-plate) y
[USDA MyPlate](https://www.myplate.gov/web/eat-healthy/vegetables).

## Peso opcional y energía

El peso no debe ser obligatorio para crear o asignar un plan. Se usa solo cuando el profesional
elige una estimación basada en antropometría. Sin peso se admiten objetivos manuales, planes por
porciones y planes cualitativos. Nunca se debe inventar un peso por defecto.

Las estimaciones energéticas deben guardar método, entradas y fecha como una instantánea. Las
ecuaciones de EER dependen de edad, sexo, talla, peso y actividad, y siguen siendo estimaciones.
El sistema permite `CALCULATED`, `MANUAL` y `NOT_TRACKED`.

Fuentes: [National Academies - Dietary Reference Intakes for Energy](https://www.nationalacademies.org/read/26818/chapter/7) y
[NIDDK Body Weight Planner](https://www.niddk.nih.gov/health-information/weight-management/body-weight-planner).

## Objetivos

Los objetivos soportados son pérdida de grasa, mantenimiento, ganancia muscular, rendimiento,
hábitos saludables y objetivo personalizado. El objetivo no determina por sí solo las calorías:
medicación, condiciones médicas, historial, sueño y actividad pueden cambiar la intervención.
Una pérdida gradual suele ser más sostenible; la aplicación no fija déficits automáticos.

Fuente: [CDC - Steps for Losing Weight](https://www.cdc.gov/healthy-weight-growth/losing-weight/index.html).

## Alimentos y nutrientes

Cada alimento conserva fuente, código, estado de preparación, base de referencia y nutrientes.
Los valores del plan se copian como instantánea para que una actualización del catálogo no cambie
planes ya asignados. Para alimentos locales se prioriza la tabla del INS; USDA FoodData Central
puede complementar alimentos no disponibles, registrando siempre procedencia y versión.

Fuentes: [INS - Tablas Peruanas de Alimentos](https://tablasperuanas.ins.gob.pe/) y
[USDA FoodData Central API](https://fdc.nal.usda.gov/api-guide/).

## Criterios generales

Los planes deben favorecer adecuación, equilibrio, moderación y diversidad, con alimentos
naturales disponibles localmente. La interfaz no convierte estas referencias poblacionales en
prescripciones universales; muestra alertas para revisión profesional.

Fuentes: [OMS - Healthy diet](https://www.who.int/news-room/fact-sheets/detail/healthy-diet) y
[MINSA - Guías alimentarias para la población peruana](https://www.gob.pe/institucion/minsa/informes-publicaciones/314037-guias-alimentarias-para-la-poblacion-peruana).

## Privacidad y trazabilidad

Peso, talla, alergias, restricciones y cualquier condición asociada a la salud se tratan como datos
sensibles. Se exige consentimiento explícito antes de almacenarlos, se aplican permisos por rol y
no se incluyen esos datos en URLs ni registros de consola. Una asignación apunta a una versión
inmutable del plan para conservar el historial clínico-operativo.

Fuentes: [Ley peruana 29733](https://www.gob.pe/institucion/devida/normas-legales/5623200-29733-ley-de-proteccion-de-datos-personales) y
[Reglamento DS 016-2024-JUS](https://www.gob.pe/institucion/smv/normas-legales/6426760-016-2024-jus).

## Modelo implementado

- `NutritionProfile`: evaluación y consentimiento del cliente.
- `NutritionMeasurement`: historial antropométrico opcional.
- `NutritionFood` y `NutritionFoodPortion`: catálogo y medidas caseras.
- `NutritionPlan` y `NutritionPlanVersion`: identidad y versiones inmutables.
- `NutritionPlanDay`, `NutritionMeal` y `NutritionMealItem`: semana estructurada.
- `NutritionPlanAssignment`: asignación de una versión a un cliente.
- `NutritionCheckIn`: seguimiento posterior de adherencia y evolución.

## Patrones observados en aplicaciones de nutrición

Las aplicaciones profesionales separan claramente lo que entrega el nutricionista de lo que
registra el cliente. Nutrium permite consultar el plan, recomendaciones, mediciones, recetas,
objetivos y listas de compra, mientras que el diario, el peso y otras funciones pueden habilitarse
por cliente. Trainerize combina planes estructurados con seguimiento mediante fotos, hábitos y
metas. Cronometer pone el énfasis en el diario cronológico y en comparar consumo real contra
objetivos. Eat This Much incorpora preferencias, presupuesto, horarios y generación de compras.

Fuentes: [Nutrium - app para clientes](https://help.nutrium.com/es/articles/3372169-cuales-son-las-funciones-disponibles-en-la-aplicacion-movil-para-mis-clientes),
[ABC Trainerize - funciones](https://www.trainerize.com/features/),
[Cronometer Pro - diario del cliente](https://support.cronometer.com/hc/en-us/articles/30300888050580-Pro-Client-tab-Diary) y
[Eat This Much](https://www.eatthismuch.com/).

De estos patrones se deriva el orden recomendado de evolución:

1. Plan profesional versionado y asignación, implementado en esta fase.
2. Sustituciones equivalentes y recetas reutilizables.
3. Lista de compras generada desde la semana.
4. Registro voluntario de cumplimiento, agua, hambre y energía.
5. Seguimiento con promedios por periodo, sin castigar días incompletos.
6. Recordatorios configurables y no invasivos.
7. Diario fotográfico opcional, separado del plan prescrito.

## Decisiones pendientes para una fase clínica

- Crear un rol separado de nutricionista y verificar colegiatura.
- Registrar acceso administrativo a datos sensibles en una bitácora inmutable.
- Incorporar diagnósticos y terminología clínica solo con supervisión profesional.
- Validar reglas específicas para enfermedad renal, diabetes, embarazo y menores.
- Revisar legalmente el consentimiento y la inscripción del banco de datos personales.
