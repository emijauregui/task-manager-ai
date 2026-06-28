/**
 * TasksView.jsx
 * Phase: React Migration v1 — Foundation (placeholder)
 * The original Task Manager feature — CRUD + AI priority suggestion.
 */
export default function TasksView() {
  return (
    <section
      className="tasks-section app-view"
      id="tasks"
      data-app-view="tasks"
      hidden
    >
      <div className="tasks-header glass-card">
        <div>
          <p className="panel-kicker">Task Manager</p>
          <h2>Workspace de tareas</h2>
          <p className="tasks-description">
            La app original sigue intacta: CRUD, sugerencia de prioridad y breakdown con IA.
          </p>
        </div>
      </div>

      <div className="tasks-grid">
        <div className="task-form-container glass-card">
          <h2 id="form-title">Nueva Tarea</h2>
          <form id="task-form">
            <input type="hidden" id="task-id" />
            <div className="form-group">
              <label htmlFor="task-title">Titulo *</label>
              <input
                type="text"
                id="task-title"
                placeholder="Ej: Completar informe mensual"
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="task-description">Descripcion</label>
              <textarea
                id="task-description"
                rows={4}
                placeholder="Detalles adicionales sobre la tarea..."
              />
            </div>
            <div className="form-group">
              <label htmlFor="task-priority">Prioridad</label>
              <select id="task-priority">
                <option value="low">Baja</option>
                <option value="medium" defaultValue>Media</option>
                <option value="high">Alta</option>
              </select>
            </div>
            <div className="form-actions">
              <button type="submit" className="btn btn-primary" id="submit-btn">
                <span id="submit-text">Agregar Tarea</span>
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                id="cancel-btn"
                style={{ display: 'none' }}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                id="suggest-priority-btn"
                title="Sugerir prioridad con IA"
              >
                Sugerir Prioridad
              </button>
            </div>
          </form>
        </div>

        <div className="tasks-board">
          <div className="filters glass-card">
            <button className="filter-btn active" data-filter="all">Todas</button>
            <button className="filter-btn" data-filter="pending">Pendientes</button>
            <button className="filter-btn" data-filter="completed">Completadas</button>
          </div>
          <div className="tasks-container glass-card">
            <div id="tasks-list" />
            <div id="empty-state" className="empty-state">
              <p>No hay tareas todavia.</p>
              <p className="empty-subtitle">Crea tu primera tarea para comenzar.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
