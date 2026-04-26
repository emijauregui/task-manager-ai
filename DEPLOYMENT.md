# Guía de Deployment

## Requisitos Previos

1. Cuenta en [GitHub](https://github.com)
2. Cuenta en [Netlify](https://netlify.com)
3. Cuenta en [Render](https://render.com)
4. API Key de [Anthropic](https://console.anthropic.com)

## Paso 1: Subir a GitHub

```bash
# Inicializar repositorio Git
git init

# Agregar todos los archivos
git add .

# Hacer commit
git commit -m "Initial commit: Task Manager AI"

# Crear repositorio en GitHub y conectarlo
git remote add origin https://github.com/tu-usuario/task-manager-ai.git

# Subir código
git branch -M main
git push -u origin main
```

## Paso 2: Deploy del Backend en Render

1. Ve a [Render Dashboard](https://dashboard.render.com/)
2. Haz clic en "New +" → "Web Service"
3. Conecta tu repositorio de GitHub
4. Configura el servicio:
   - **Name**: `task-manager-ai-backend`
   - **Region**: Selecciona la más cercana
   - **Branch**: `main`
   - **Root Directory**: (dejar vacío)
   - **Runtime**: `Node`
   - **Build Command**: `cd backend && npm install`
   - **Start Command**: `cd backend && npm start`
   - **Plan**: Free

5. Añade las variables de entorno:
   - Clic en "Environment" → "Add Environment Variable"
   - `ANTHROPIC_API_KEY`: tu API key de Anthropic
   - `NODE_ENV`: `production`

6. Haz clic en "Create Web Service"

7. Espera a que termine el deploy y copia la URL (será algo como: `https://task-manager-ai-backend.onrender.com`)

## Paso 3: Configurar Frontend para usar Backend en Producción

1. Edita `frontend/app.js` línea 3:
   ```javascript
   const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
       ? 'http://localhost:3000'
       : 'https://task-manager-ai-backend.onrender.com'; // ← Cambia esta URL
   ```

2. Guarda y haz commit:
   ```bash
   git add frontend/app.js
   git commit -m "Update backend URL for production"
   git push
   ```

## Paso 4: Deploy del Frontend en Netlify

### Opción A: Deploy automático desde GitHub

1. Ve a [Netlify Dashboard](https://app.netlify.com/)
2. Haz clic en "Add new site" → "Import an existing project"
3. Selecciona "GitHub" y autoriza
4. Selecciona tu repositorio `task-manager-ai`
5. Configura el build:
   - **Branch to deploy**: `main`
   - **Build command**: (dejar vacío)
   - **Publish directory**: `frontend`
6. Haz clic en "Deploy site"
7. Una vez desplegado, puedes cambiar el nombre del sitio en "Site settings"

### Opción B: Deploy manual con Netlify CLI

```bash
# Instalar Netlify CLI
npm install -g netlify-cli

# Login en Netlify
netlify login

# Deploy
cd frontend
netlify deploy --prod
```

## Paso 5: Verificar

1. Visita tu sitio en Netlify (ej: `https://tu-sitio.netlify.app`)
2. Prueba crear una tarea
3. Prueba las funciones de IA:
   - Sugerir prioridad
   - Dividir tarea compleja

## Troubleshooting

### Backend no responde
- Verifica que la variable `ANTHROPIC_API_KEY` esté configurada en Render
- Revisa los logs en Render Dashboard → tu servicio → "Logs"
- Verifica que el servicio esté "Running"

### Frontend no conecta con Backend
- Verifica que la URL en `frontend/app.js` sea correcta
- Abre la consola del navegador (F12) para ver errores
- Verifica que el backend esté activo visitando `https://tu-backend.onrender.com/health`

### CORS errors
- El backend ya está configurado con CORS habilitado
- Si persiste, verifica que la URL del backend sea correcta

### API de Anthropic falla
- Verifica que tu API key sea válida en [console.anthropic.com](https://console.anthropic.com)
- Revisa que tengas créditos disponibles
- Verifica los logs del backend en Render

## Mantenimiento

### Actualizar código

```bash
# Hacer cambios en el código
git add .
git commit -m "Descripción de los cambios"
git push

# Netlify y Render se actualizarán automáticamente
```

### Monitoreo
- **Backend**: Render Dashboard → Logs
- **Frontend**: Netlify Dashboard → Deploys → Deploy log

## Costos

- **Netlify**: Plan gratuito (100GB bandwidth/mes)
- **Render**: Plan gratuito (servicio duerme después de 15 min de inactividad)
- **Anthropic**: Pay-as-you-go (primeras consultas pueden ser gratis según promociones)

## Nota sobre Render Free Tier

El plan gratuito de Render pone el servicio en "sleep" después de 15 minutos de inactividad. La primera petición después de dormir puede tomar 30-60 segundos. Para evitar esto, considera:
1. Upgrade a plan de pago ($7/mes)
2. Usar un servicio de "keep-alive" como UptimeRobot
3. Aceptar el delay inicial
