/**
 * TasksView.jsx
 * Phase: React Migration v1 - Foundation
 */
export default function TasksView() {
  return (
    <section
      className="tasks-section app-view foundation-view is-active"
      id="tasks"
      data-app-view="tasks"
    >
      <div className="tasks-header glass-card">
        <div>
          <p className="panel-kicker">Task Manager</p>
          <h2>Workspace de tareas</h2>
          <p className="tasks-description">
            Placeholder compacto para tareas. La logica legacy no se migra en esta fase.
          </p>
        </div>
      </div>

      <div className="tasks-grid foundation-task-grid">
        <section className="task-form-container glass-card">
          <h2>Nueva tarea</h2>
          <div className="empty-inline rich">
            <strong>Formulario reservado.</strong>
            <p>La foundation solo valida navegacion y layout. No llama IA ni crea tareas.</p>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-primary" disabled>Agregar despues</button>
            <button type="button" className="btn btn-ghost" disabled>Sugerir prioridad</button>
          </div>
        </section>

        <section className="tasks-container glass-card">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Tareas</p>
              <h3>Board placeholder</h3>
            </div>
          </div>
          <div className="foundation-list">
            <span>Todas: 0</span>
            <span>Pendientes: 0</span>
            <span>Completadas: 0</span>
          </div>
        </section>
      </div>
    </section>
  );
}
