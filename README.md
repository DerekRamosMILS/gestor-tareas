# Cauce · Gestor de tareas de Afluente Datos

Aplicación web para agregar, editar, completar y eliminar tareas, desarrollada con HTML, CSS y JavaScript (ES6+) para la Actividad 2 del curso **Desarrollo Fullstack** de la Universidad Tecmilenio.

**Sitio publicado:** https://derekramosmils.github.io/gestor-tareas/

## Funciones

- Agregar tareas con validación (no se permiten tareas vacías ni repetidas, máximo 120 caracteres).
- Editar el nombre de una tarea en la misma lista (Enter guarda, Escape cancela).
- Marcar tareas como completas o incompletas.
- Eliminar tareas, con opción de **Deshacer** durante 6 segundos.
- Filtros: todas, pendientes y completadas, más un resumen con barra de avance.
- Persistencia en **LocalStorage** mediante promesas: las tareas siguen ahí después de recargar o cerrar el navegador.
- Diseño responsivo (móvil, tableta y escritorio) y accesible (etiquetas, foco visible y anuncios para lectores de pantalla).

## Estructura

```
gestor-tareas/
├── index.html   Estructura de la página
├── styles.css   Estilos y media queries
└── app.js       Clases Tarea, GestorDeTareas e InterfazTareas
```

## Cómo ejecutarla

Abre `index.html` con la extensión Live Server de Visual Studio Code o entra al sitio publicado.

---
Empresa ficticia creada con fines académicos · Derek Joan Ramos del Ángel · AL07195561
