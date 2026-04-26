# Task Manager AI

Un gestor de tareas inteligente que utiliza IA (Claude de Anthropic) para sugerir prioridades y dividir tareas complejas en subtareas manejables.

## Características

- ✅ Crear, editar, eliminar y filtrar tareas
- 🤖 Sugerencias de prioridad impulsadas por IA
- 📋 División automática de tareas complejas en subtareas
- 🎨 Interfaz moderna y responsiva
- 🔄 Frontend en HTML, CSS y JS vanilla
- ⚡ Backend en Node.js + Express

## Estructura del Proyecto

```
task-manager-ai/
├── frontend/           # Aplicación frontend (HTML, CSS, JS)
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── backend/           # API REST (Node.js + Express)
│   ├── server.js
│   ├── routes/
│   └── package.json
└── README.md
```

## Configuración Local

### Backend

1. Navega a la carpeta backend:
   ```bash
   cd backend
   ```

2. Instala las dependencias:
   ```bash
   npm install
   ```

3. Crea un archivo `.env` con tus credenciales de AWS:
   ```
   AWS_ACCESS_KEY_ID=tu_access_key_aquí
   AWS_SECRET_ACCESS_KEY=tu_secret_key_aquí
   AWS_REGION=us-east-1
   PORT=3000
   ```

4. Inicia el servidor:
   ```bash
   npm start
   ```

   Para desarrollo con auto-reload:
   ```bash
   npm run dev
   ```

### Frontend

1. Navega a la carpeta frontend:
   ```bash
   cd frontend
   ```

2. Abre `index.html` directamente en tu navegador, o usa un servidor local:
   ```bash
   npx serve
   ```

## Deployment

### Frontend en Netlify

**IMPORTANTE:** Antes de desplegar, actualiza la URL del backend en `frontend/app.js` línea 3 con tu URL de Render.

1. Conecta tu repositorio de GitHub a Netlify
2. Configura el build:
   - Build command: (dejar vacío)
   - Publish directory: `frontend`

### Backend en Render

1. Conecta tu repositorio de GitHub a Render
2. Crea un nuevo Web Service
3. Configura:
   - Build command: `cd backend && npm install`
   - Start command: `cd backend && npm start`
4. Añade las variables de entorno:
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`
   - `AWS_REGION`

## Configurar AWS Bedrock

1. Visita [console.aws.amazon.com](https://console.aws.amazon.com/)
2. Crea una cuenta o inicia sesión
3. Ve a IAM y crea un nuevo usuario con acceso programático
4. Asigna la política `AmazonBedrockFullAccess`
5. Habilita el modelo Claude en Bedrock (región us-east-1)
6. Copia las credenciales y agrégalas a tu archivo `.env`

## Uso

1. **Crear tarea**: Escribe el título y descripción, luego haz clic en "Agregar Tarea"
2. **Sugerir prioridad**: Haz clic en "🤖 Sugerir Prioridad" para que la IA analice y sugiera un nivel de prioridad
3. **Dividir tarea**: Para tareas complejas, haz clic en "✂️ Dividir Tarea" para obtener subtareas sugeridas
4. **Filtrar**: Usa los botones de filtro para ver todas, pendientes o completadas
5. **Editar**: Haz clic en el ícono de edición para modificar una tarea
6. **Eliminar**: Haz clic en el ícono de basura para eliminar una tarea

## Tecnologías

- **Frontend**: HTML5, CSS3, JavaScript (Vanilla)
- **Backend**: Node.js, Express.js
- **IA**: Anthropic Claude API
- **Deployment**: Netlify (frontend), Render (backend)

## Licencia

MIT
