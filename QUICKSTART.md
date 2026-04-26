# Quick Start Guide

## 🚀 Inicio Rápido (5 minutos)

### 1. Configurar AWS Bedrock

1. Ve a [console.aws.amazon.com](https://console.aws.amazon.com)
2. Crea una cuenta (si no tienes) o inicia sesión
3. Ve a IAM → Users → Create user
4. Habilita "Programmatic access"
5. Asigna la política "AmazonBedrockFullAccess"
6. Ve a Bedrock y habilita el modelo Claude en tu región
7. Guarda las credenciales de forma segura

### 2. Instalar Backend

```bash
cd backend
npm install
```

### 3. Configurar Variables de Entorno

Crea el archivo `backend/.env`:

```bash
# En Windows (PowerShell)
cd backend
echo AWS_ACCESS_KEY_ID=tu_access_key > .env
echo AWS_SECRET_ACCESS_KEY=tu_secret_key >> .env
echo AWS_REGION=us-east-1 >> .env
echo PORT=3000 >> .env
echo NODE_ENV=development >> .env

# En Mac/Linux
cd backend
cat > .env << EOF
AWS_ACCESS_KEY_ID=tu_access_key
AWS_SECRET_ACCESS_KEY=tu_secret_key
AWS_REGION=us-east-1
PORT=3000
NODE_ENV=development
EOF
```

O simplemente copia `backend/.env.example` a `backend/.env` y edítalo.

### 4. Iniciar Backend

```bash
# Desde la carpeta backend
npm run dev
```

Deberías ver:
```
🚀 Server running on port 3000
📝 API available at http://localhost:3000/api
🤖 AI features enabled
```

### 5. Abrir Frontend

**Opción A - Navegador directo:**
- Abre `frontend/index.html` directamente en tu navegador

**Opción B - Servidor local (recomendado):**
```bash
# Desde la raíz del proyecto
npx serve frontend
```

Luego abre `http://localhost:3000` (o el puerto que indique)

### 6. Probar la Aplicación

1. **Crear tarea simple:**
   - Título: "Comprar leche"
   - Descripción: "Ir al supermercado"
   - Click en "Agregar Tarea"

2. **Probar IA - Sugerir Prioridad:**
   - Título: "Presentación para CEO mañana"
   - Click en "🤖 Sugerir Prioridad"
   - La IA debería sugerir "Alta" prioridad

3. **Probar IA - Dividir Tarea:**
   - Crea una tarea compleja como: "Desarrollar sistema de login con OAuth"
   - Después de crearla, click en el botón "✂️"
   - La IA generará subtareas automáticamente

## ✅ Verificación

Si todo funciona correctamente:
- ✅ Backend muestra "AI features enabled"
- ✅ Puedes crear/editar/eliminar tareas
- ✅ Puedes filtrar tareas (Todas/Pendientes/Completadas)
- ✅ El botón "Sugerir Prioridad" funciona
- ✅ El botón "Dividir Tarea" (✂️) funciona

## ❌ Problemas Comunes

### "AI features disabled (no API key)"
- Verifica que el archivo `backend/.env` exista
- Verifica que `ANTHROPIC_API_KEY` esté configurada correctamente
- Reinicia el servidor backend

### "Cannot connect to server" en el frontend
- Verifica que el backend esté corriendo en http://localhost:3000
- Abre la consola del navegador (F12) para ver errores
- Verifica que `frontend/app.js` línea 2-3 tenga la URL correcta

### "Failed to suggest priority"
- Verifica que tu API key sea válida
- Revisa que tengas créditos en tu cuenta de Anthropic
- Mira los logs del backend para más detalles

### Puerto 3000 ya en uso
- Cambia el puerto en `backend/.env`: `PORT=3001`
- Actualiza `frontend/app.js` línea 3: `http://localhost:3001`

## 📚 Siguiente Paso

Lee `README.md` para más información sobre el proyecto y `DEPLOYMENT.md` para instrucciones de deployment en producción.

## 💡 Tips

- **Desarrollo del backend:** Usa `npm run dev` para auto-reload al hacer cambios
- **Testing:** Usa herramientas como Postman para probar los endpoints directamente
- **Debug:** Mira la consola del backend y del navegador para errores
- **API Usage:** Revisa tu uso de API en [console.anthropic.com](https://console.anthropic.com)
