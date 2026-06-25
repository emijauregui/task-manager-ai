---
title: Task Manager AI
type: proyecto
status: activo
tags:
  - proyecto
  - task-manager
  - ia
  - nodejs
  - javascript
created: 2026-04-27
updated: 2026-04-27
repo: task-manager-ai
stack:
  - HTML
  - CSS
  - JavaScript
  - Node.js
  - Express
  - AWS Bedrock
---

# Task Manager AI

## Resumen
Proyecto full stack para gestionar tareas con apoyo de IA. Permite crear, editar, eliminar, completar y filtrar tareas, además de sugerir prioridad y dividir tareas complejas en subtareas usando AWS Bedrock con Claude.

## Objetivo
Construir un gestor de tareas sencillo pero útil, con una base clara para seguir agregando automatizaciones, persistencia y nuevas funciones inteligentes.

## Estado actual
- Frontend en `frontend/` con HTML, CSS y JavaScript vanilla.
- Backend en `backend/` con Node.js + Express.
- IA conectada por medio de AWS Bedrock.
- Persistencia actual en memoria.
- Despliegue pensado para Netlify (frontend) y Render (backend).

## Arquitectura rápida
```text
Usuario -> Frontend -> API REST -> Lógica backend -> AWS Bedrock
                        |
                        -> CRUD de tareas en memoria
```

## Funcionalidades clave
- Crear, editar y eliminar tareas
- Marcar tareas como completadas
- Filtrar por estado
- Sugerir prioridad con IA
- Dividir tareas en subtareas con IA
- Interfaz responsiva

## Stack
- Frontend: HTML5, CSS3, JavaScript
- Backend: Node.js, Express
- IA: AWS Bedrock + Claude Sonnet
- Deploy: Netlify + Render

## Archivos importantes
- [[README]]
- [[ARCHITECTURE]]
- [[QUICKSTART]]
- [[DEPLOYMENT]]
- [[CHECKLIST]]
- `frontend/app.js`
- `backend/server.js`

## Decisiones técnicas
- Se usó JavaScript vanilla para mantener el proyecto simple y sin build step.
- El backend expone endpoints CRUD y endpoints de IA separados.
- Las tareas viven en memoria, así que se pierden al reiniciar el servidor.
- La IA responde con JSON para poder integrarla de forma directa en la UI.

## Riesgos y límites actuales
- No hay base de datos
- No hay autenticación
- No hay rate limiting
- No hay sanitización avanzada de inputs
- No es multiusuario todavía

## Próximos pasos recomendados
- [[Agregar base de datos]]
- [[Autenticación de usuarios]]
- [[Persistencia de tareas]]
- [[Mejorar prompts de IA]]
- [[Historial de actividad]]
- [[Deploy productivo]]
- [[Integración con Obsidian]]

## Ideas de conexión en Obsidian
- Relacionar esta nota con [[Portafolio de proyectos]]
- Conectarla con [[Aprendizajes de Node.js]]
- Enlazarla a [[AWS Bedrock]]
- Vincular decisiones a [[Arquitectura de software]]
- Asociarla con [[Ideas SaaS]] o [[Automatización personal]]

## Aprendizajes
- Separación clara entre frontend y backend
- Consumo de APIs REST desde JavaScript vanilla
- Integración de modelos de IA en flujos concretos de producto
- Uso de prompts estructurados para obtener JSON útil

## Checklist de evolución
- [x] CRUD de tareas
- [x] Sugerencia de prioridad con IA
- [x] Desglose de tareas en subtareas
- [ ] Base de datos
- [ ] Autenticación
- [ ] Multiusuario
- [ ] Búsqueda y ordenamiento
- [ ] Exportación de tareas

## Nota personal
Este proyecto puede funcionar como base para un sistema más grande de productividad asistida por IA. También sirve como referencia para futuros trabajos donde necesite combinar UI ligera, API propia y automatización inteligente.

## Enlaces externos
- Repositorio local: `task-manager-ai`
- Backend principal: `backend/server.js`
- Frontend principal: `frontend/app.js`
