# Evita · Plataforma de estudio con Redes de Computadoras

Esta versión incorpora **Redes de Computadoras** como materia nativa y la deja seleccionada por defecto. Incluye:

- 12 bloques temáticos y 34 capacidades.
- 23 transcripciones de OpenFING de 2013, con advertencias de vigencia.
- Diapositivas y 9 prácticos del curso, más cartilla de sockets.
- Evaluaciones 2024–2026 con preguntas y soluciones en el banco.
- Archivo histórico 2011–2026 enlazado por año.
- Checklist, tarjetas, errores frecuentes y plan de estudio.

Para ejecutar:

```bash
python -m http.server 8000
```

Luego abrir `http://localhost:8000`. No abrir `index.html` directamente porque los JSON se cargan por HTTP.

---

# Plataforma de estudio

Aplicación web estática para centralizar materias, bancos de ejercicios, materiales, checklist, dominio por tema, flashcards, errores personales y un plan combinado editable.

La interfaz parte de la última página de Arquitectura de Computadoras, pero el roadmap fue eliminado del núcleo. Arquitectura quedó migrada a un JSON para servir como prueba real de la plataforma.

## Ejecutar localmente

El navegador debe cargar los JSON por HTTP; no abras `index.html` directamente como archivo.

```bash
cd plataforma-estudio
python -m http.server 8000
```

Abrí `http://localhost:8000`.

Para publicar en Netlify, subí la carpeta completa usando su raíz como directorio de publicación. No requiere compilación ni dependencias.

## Estructura

```text
index.html
styles.css
app.js
data/
  index.json
  arqui.json
  materia-plantilla.json
  subject.schema.json
scripts/
  validate-data.mjs
PROMPT_GENERAR_JSON.md
```

## Agregar una materia

1. Copiá `data/materia-plantilla.json` con un nombre estable, por ejemplo `data/metodos_numericos.json`.
2. Generá o completá el contenido respetando `data/subject.schema.json`. El prompt preparado está en `PROMPT_GENERAR_JSON.md`.
3. Agregá una entrada a `data/index.json` con el mismo `id` de `subject.id` y la ruta del nuevo archivo.
4. Ejecutá el validador:

```bash
node scripts/validate-data.mjs
```

5. Recargá la página. El selector y el plan reconocerán la materia sin cambiar `app.js`.

## Progreso y plan

El progreso se guarda en `localStorage`, separado de los JSON de contenido. Puede exportarse e importarse desde la barra lateral.

El plan se genera o redistribuye únicamente al pulsar **Actualizar plan**. Marcar una tarea como completada no mueve las demás. Las tareas del calendario pueden editarse, cambiarse de fecha, agregarse o borrarse manualmente.

Para construir un plan combinado, seleccioná **Plan combinado**, elegí las materias, indicá sus fechas y la disponibilidad semanal, y actualizá el plan.


## Estado actual

El calendario y el plan combinado permanecen fuera de la navegación. La organización principal se realiza mediante checklists por materia. FBD incluye las 21 clases teóricas de OpenFING y un grupo separado de prácticos opcionales.
