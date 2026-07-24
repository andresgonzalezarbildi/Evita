# Prompt para generar el JSON de una materia

Generá el archivo JSON completo de una materia para una plataforma de estudio universitaria. El archivo será cargado directamente por una aplicación web, por lo que debe respetar estrictamente el esquema indicado.

## Archivos de referencia

Usá como contrato obligatorio:

- `data/subject.schema.json`
- `data/materia-plantilla.json`

La versión del esquema es `schemaVersion: 1`.

## Material que te proporcionaré

Procesá exclusivamente los archivos, enlaces y datos que te entregue, que pueden incluir programa del curso, cronograma, bibliografía, clases, prácticos, talleres, parciales, exámenes y soluciones.

Datos de la materia:

- Nombre: [COMPLETAR]
- Nombre corto: [COMPLETAR]
- Identificador: [COMPLETAR]
- Color hexadecimal: [COMPLETAR]
- Fecha de examen o evaluación final, si existe: [COMPLETAR]
- URL oficial del curso, si existe: [COMPLETAR]

## Reglas obligatorias de salida

1. Devolvé únicamente un objeto JSON válido en UTF-8.
2. No uses bloques Markdown, comentarios, texto introductorio ni explicaciones fuera del JSON.
3. No omitas secciones del esquema. Cuando no haya datos, usá un arreglo vacío o `null`, según corresponda.
4. No trunques contenido. El resultado debe incluir todos los materiales y ejercicios procesados.
5. No inventes enunciados, soluciones, fechas, enlaces, frecuencias, fuentes ni contenidos.
6. Conservá íntegros los enunciados de ejercicios y preguntas. No los resumas.
7. Conservá íntegra cada solución disponible. No la sustituyas por una explicación más breve.
8. Usá español salvo que la fuente original esté en otro idioma y traducirla pueda alterar el contenido técnico.
9. Todos los identificadores deben ser estables, únicos, en minúsculas y cumplir `^[a-z0-9][a-z0-9_-]*$`. No uses espacios, tildes ni caracteres especiales.
10. Validá el objeto final contra `data/subject.schema.json` antes de entregarlo.

## Criterios para cada sección

### `subject`

- `id` debe coincidir exactamente con el identificador que luego se registrará en `data/index.json`.
- `name` es el nombre completo y `shortName` el texto breve del selector.
- `examDate` y `sourceUrl` deben ser `null` cuando no estén confirmados.
- `archived` será `false` para una materia que se está cursando y `true` para una materia histórica.

### `topics`

- Creá un tema por unidad conceptual real del curso, sin fragmentar excesivamente.
- `order` debe representar el orden razonable del curso.
- `frequency` debe derivarse de apariciones reales en parciales o exámenes. Si no hay evidencia, usá `0`.
- `estimatedMinutes` debe estimar el tiempo total para aprender y practicar el tema, no la duración de una única clase.
- Usá colores hexadecimales legibles y consistentes.

### `skills`

- Registrá capacidades concretas que el estudiante debe poder ejecutar o explicar.
- Cada `topicId` debe existir en `topics`, o ser `null` cuando realmente sea transversal.
- `frequency` debe basarse en evidencia de evaluaciones, no en importancia subjetiva.

### `materials`

- Incluí cada documento o recurso identificable: programa, apunte, práctico, taller, parcial, examen, solución, clase o guía.
- `content` debe contener el texto útil extraído del material cuando esté disponible.
- `topicIds` debe contener solo identificadores existentes.
- `official` será `true` únicamente cuando la fuente pertenezca oficialmente al curso o a la institución.
- `hasOfficialSolution` será `true` únicamente cuando exista una solución oficial explícita.
- `solutionMaterialId` debe apuntar al material de solución correspondiente o ser `null`.
- Usá `url: null` cuando el enlace no exista, esté roto o no pueda verificarse. Nunca fabriques URLs.

### `bank`

- Incluí todas las preguntas teóricas y todos los ejercicios separadamente.
- `kind` solo puede ser `exercise` o `theory`.
- `statement` debe contener el enunciado completo, con incisos, datos, restricciones y aclaraciones.
- `solution` debe contener la solución completa solo cuando exista.
- `hasSolution` debe reflejar si hay una solución realmente disponible.
- `officialSolution` será `true` solo si la solución está identificada como oficial. No marques como oficiales soluciones inferidas, reconstruidas o creadas.
- Los prácticos y talleres no deben considerarse resueltos oficialmente salvo que se haya proporcionado una solución oficial concreta.
- `sourceMaterialId` debe apuntar al documento del que se extrajo la pregunta cuando corresponda.
- `url` y `solutionUrl` deben ser `null` si no hay un enlace verificable.
- `frequency` debe representar cuántas veces aparece esa habilidad o tipo de problema en el corpus de evaluaciones. No dupliques artificialmente el conteo por palabras repetidas dentro del mismo ejercicio.
- `difficulty` puede ser un entero, una etiqueta textual o `null`, pero debe aplicarse de manera consistente.
- `estimatedMinutes` debe representar el tiempo razonable para resolver esa pregunta en condiciones de estudio.
- Eliminá únicamente duplicados verdaderos. Si dos ejercicios son parecidos pero cambian datos, restricciones o incisos, mantenelos separados.

### `checklist`

- Redactá acciones verificables, no títulos vagos.
- Incluí comprensión, práctica y comprobaciones relevantes.
- No marques ningún estado de progreso: los estados los guarda la aplicación en el navegador.
- `topicId` debe existir o ser `null` para acciones generales.

### `flashcards`

- Cada tarjeta debe tener una pregunta precisa y una respuesta autosuficiente.
- Priorizá definiciones, fórmulas, criterios, diferencias, pasos breves y errores frecuentes.
- No conviertas ejercicios largos en flashcards.
- `topicId` debe existir o ser `null`.

### `commonErrors`

- Incluí errores respaldados por soluciones, devoluciones docentes o dificultades evidentes del material.
- `why` explica por qué el error ocurre o por qué lleva a una respuesta incorrecta.
- `correct` indica el criterio o procedimiento correcto.
- No inventes supuestas equivocaciones de estudiantes cuando no haya evidencia; en ese caso dejá el arreglo vacío.

### `plan.tasks`

- Las tareas son bloques reutilizables de estudio, no eventos con fecha fija. La plataforma les asignará fecha según las materias seleccionadas y sus exámenes.
- Creá tareas para aprender, practicar, repasar, corregir y simular cuando el material lo permita.
- `estimatedMinutes` debe estar entre 5 y 600.
- `priority` debe estar entre 1 y 5 y reflejar evaluación, prerrequisitos y dificultad.
- `frequency` debe basarse en la presencia real en evaluaciones.
- `phase` debe ordenar el aprendizaje: fundamentos antes que aplicaciones, simulacros al final.
- `dependsOn` solo puede contener identificadores de otras tareas del mismo plan.
- `materialIds` y `bankItemIds` solo pueden contener identificadores existentes.
- No incluyas fechas dentro de las tareas.

## Comprobaciones antes de responder

Verificá internamente todo lo siguiente:

- El JSON se puede parsear sin errores.
- No hay propiedades adicionales prohibidas por el esquema.
- No hay identificadores duplicados dentro de ninguna colección.
- Todas las referencias a temas, habilidades, materiales, ejercicios y tareas existen.
- `subject.id` coincide con el identificador solicitado.
- `hasSolution` y `officialSolution` concuerdan con el contenido y la fuente.
- Ningún enlace fue inventado.
- Ninguna frecuencia fue presentada como dato sin evidencia.
- Todos los enunciados y soluciones están completos.
- La salida contiene únicamente el JSON final.
