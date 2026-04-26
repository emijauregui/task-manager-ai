# Examples & Use Cases

## Example 1: Simple Task

**Input:**
- Title: "Comprar leche"
- Description: "Ir al supermercado antes de las 6pm"
- Priority: Low

**Result:**
✅ Task created and displayed in the list with low priority badge (green)

---

## Example 2: AI Priority Suggestion

**Scenario:** You're not sure what priority to assign to a task.

**Input:**
- Title: "Presentación para CEO mañana a las 9am"
- Description: "Preparar slides sobre resultados del Q1 y proyecciones Q2"

**Action:** Click "🤖 Sugerir Prioridad"

**AI Response:**
```json
{
  "priority": "high",
  "reasoning": "Esta tarea es urgente (mañana) e importante (presentación para CEO). Requiere atención inmediata."
}
```

**Result:** Priority automatically set to "Alta" (red badge)

---

## Example 3: Breaking Down Complex Task

**Input (Complex Task):**
- Title: "Implementar sistema de autenticación de usuarios"
- Description: "Crear un sistema completo de login con OAuth, JWT tokens, recuperación de contraseña y verificación de email"

**Action:** After creating the task, click "✂️" button

**AI Generated Subtasks:**

1. **Configurar dependencias y middleware de autenticación**
   - Description: Instalar y configurar Passport.js, JWT, bcrypt y middleware de autenticación
   - Priority: high

2. **Implementar registro de usuarios con validación**
   - Description: Crear endpoint de registro con validación de email, contraseña fuerte y hash de contraseña
   - Priority: high

3. **Desarrollar login con JWT tokens**
   - Description: Crear endpoint de login que genere JWT tokens y maneje sesiones
   - Priority: high

4. **Integrar OAuth con Google y GitHub**
   - Description: Configurar estrategias de OAuth para login social con proveedores externos
   - Priority: medium

5. **Implementar recuperación de contraseña**
   - Description: Crear flujo de reset de contraseña con tokens temporales enviados por email
   - Priority: medium

6. **Agregar verificación de email**
   - Description: Implementar envío de email de confirmación con link de activación de cuenta
   - Priority: low

**Result:** Modal shows all subtasks with option to "Crear Todas" or close

---

## Example 4: Editing a Task

**Original Task:**
- Title: "Revisar código"
- Priority: Low

**Action:** Click edit button (✏️)

**Updated Task:**
- Title: "Revisar código del módulo de pagos"
- Description: "Revisar PR #142 antes del merge, verificar manejo de errores"
- Priority: High

**Result:** Task updated in place, priority badge changes from green to red

---

## Example 5: Filtering Tasks

**Current Tasks:**
1. ✅ Comprar leche (completed)
2. ⬜ Preparar presentación (pending, high)
3. ⬜ Revisar código (pending, medium)
4. ✅ Llamar al cliente (completed)

**Filter Actions:**

- Click "Todas" → Shows all 4 tasks
- Click "Pendientes" → Shows only tasks 2 and 3
- Click "Completadas" → Shows only tasks 1 and 4

---

## Example 6: Real-World Workflow

### Morning Planning Session

1. **Create Daily Tasks:**
   ```
   - "Responder emails urgentes" (Priority: High)
   - "Reunión de equipo 10am" (Priority: High)
   - "Actualizar documentación" (Priority: Low)
   ```

2. **Use AI for Complex Task:**
   - Title: "Migrar base de datos a nueva versión"
   - Click "✂️" to break it down
   - AI generates 5 subtasks covering backup, migration script, testing, rollback plan, and monitoring

3. **During the Day:**
   - Check off completed tasks
   - Filter to "Pendientes" to focus on remaining work
   - Edit tasks as priorities change

4. **End of Day:**
   - Filter to "Completadas" to review progress
   - Uncompleted tasks carry over to tomorrow

---

## API Usage Examples

### Create Task (cURL)

```bash
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Write documentation",
    "description": "Document all API endpoints",
    "priority": "medium"
  }'
```

**Response:**
```json
{
  "id": 1,
  "title": "Write documentation",
  "description": "Document all API endpoints",
  "priority": "medium",
  "completed": false,
  "createdAt": "2026-04-26T08:00:00.000Z",
  "updatedAt": "2026-04-26T08:00:00.000Z"
}
```

### Suggest Priority (cURL)

```bash
curl -X POST http://localhost:3000/api/ai/suggest-priority \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Fix critical security vulnerability",
    "description": "SQL injection found in user login endpoint"
  }'
```

**Response:**
```json
{
  "priority": "high",
  "reasoning": "Se trata de una vulnerabilidad crítica de seguridad que podría comprometer datos de usuarios. Requiere atención inmediata."
}
```

### Break Down Task (cURL)

```bash
curl -X POST http://localhost:3000/api/ai/break-down-task \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Launch new product",
    "description": "Complete product launch including marketing, sales enablement, and customer support preparation"
  }'
```

**Response:**
```json
{
  "subtasks": [
    {
      "title": "Finalizar materiales de marketing",
      "description": "Crear landing page, emails de campaña y contenido para redes sociales",
      "priority": "high"
    },
    {
      "title": "Entrenar equipo de ventas",
      "description": "Preparar demos, guías de venta y scripts de llamadas",
      "priority": "high"
    },
    {
      "title": "Configurar soporte al cliente",
      "description": "Crear FAQs, entrenar agentes y configurar sistema de tickets",
      "priority": "medium"
    },
    {
      "title": "Preparar anuncio de prensa",
      "description": "Redactar comunicado de prensa y contactar medios especializados",
      "priority": "medium"
    }
  ],
  "reasoning": "El lanzamiento de producto requiere coordinación entre marketing, ventas y soporte. Priorizo las tareas críticas para el día de lanzamiento."
}
```

---

## Edge Cases & Error Handling

### Empty Title
**Input:** Title: "" (empty)
**Result:** Toast notification: "El título es requerido"

### API Key Missing
**Scenario:** Backend started without ANTHROPIC_API_KEY
**Result:** 
- Console: "AI features disabled (no API key)"
- AI buttons work but return error: "ANTHROPIC_API_KEY not configured"

### Network Error
**Scenario:** Backend is down
**Result:** Toast notification: "Error de conexión"

### Invalid Priority Suggestion
**Scenario:** AI returns malformed JSON
**Result:** Error caught and toast shows: "Failed to suggest priority"

---

## Performance Tips

1. **Batch Operations:** Create multiple tasks before using AI features to avoid rate limiting
2. **Local Storage:** Tasks are in-memory. For production, implement database persistence
3. **Render Sleep:** First request after 15 min inactivity may take 30-60 seconds
4. **API Costs:** Each AI call costs ~$0.01-0.03. Use wisely for complex tasks

---

## Best Practices

### When to Use AI Priority Suggestion
✅ Good:
- New tasks you're unsure about
- Tasks with time constraints
- Tasks involving multiple stakeholders

❌ Avoid:
- Obvious priorities (e.g., "Make coffee" is clearly low)
- Batch processing many simple tasks

### When to Break Down Tasks
✅ Good:
- Multi-step projects (e.g., "Build feature X")
- Tasks that take >2 hours
- Tasks with unclear scope

❌ Avoid:
- Simple, single-action tasks
- Already specific tasks (e.g., "Send email to John")

### Task Writing Tips
✅ Good titles:
- "Implement user authentication system"
- "Design database schema for orders"
- "Fix login bug in production"

❌ Vague titles:
- "Do stuff"
- "Work on project"
- "Fix things"

Better descriptions lead to better AI suggestions!
