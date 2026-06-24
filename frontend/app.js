const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000'
    : 'https://task-manager-ai-bayn.onrender.com';

let tasks = [];
let currentFilter = 'all';
let editingTaskId = null;
let currentSubtasks = [];
let dailyTicketDashboard = null;
let dailyTicketSourceState = 'none';
const FINISHED_GAME_REGEX = /\b(finalizado|finalizados|completed|completion|final)\b/i;

const taskForm = document.getElementById('task-form');
const taskIdInput = document.getElementById('task-id');
const taskTitleInput = document.getElementById('task-title');
const taskDescriptionInput = document.getElementById('task-description');
const taskPrioritySelect = document.getElementById('task-priority');
const submitBtn = document.getElementById('submit-btn');
const submitText = document.getElementById('submit-text');
const cancelBtn = document.getElementById('cancel-btn');
const formTitle = document.getElementById('form-title');
const suggestPriorityBtn = document.getElementById('suggest-priority-btn');
const tasksList = document.getElementById('tasks-list');
const emptyState = document.getElementById('empty-state');
const filterBtns = document.querySelectorAll('.filter-btn');
const loadingSpinner = document.getElementById('loading-spinner');
const subtasksModal = document.getElementById('subtasks-modal');
const modalClose = document.getElementById('modal-close');
const modalCancel = document.getElementById('modal-cancel');
const modalCreateAll = document.getElementById('modal-create-all');

const generateDailyTicketBtn = document.getElementById('generate-daily-ticket-btn');
const viewDailyTicketBtn = document.getElementById('view-daily-ticket-btn');
const retryDailyTicketBtn = document.getElementById('retry-daily-ticket-btn');
const dailyTicketApiStatus = document.getElementById('daily-ticket-api-status');
const dailyTicketFeedback = document.getElementById('daily-ticket-feedback');
const dailyTicketSummary = document.getElementById('daily-ticket-summary');
const dailyTicketFlags = document.getElementById('daily-ticket-ticket-flags');
const dailyTicketCurrent = document.getElementById('daily-ticket-current');
const dailyTicketSideSummary = document.getElementById('daily-ticket-side-summary');
const dailyTicketAvoid = document.getElementById('daily-ticket-avoid');
const dailyTicketGames = document.getElementById('daily-ticket-games');
const dailyTicketHistory = document.getElementById('daily-ticket-history');

document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    loadTasks();
    loadDailyTicketDashboard();
});

function setupEventListeners() {
    taskForm.addEventListener('submit', handleSubmit);
    cancelBtn.addEventListener('click', resetForm);
    suggestPriorityBtn.addEventListener('click', handleSuggestPriority);
    generateDailyTicketBtn.addEventListener('click', handleGenerateDailyTicket);
    viewDailyTicketBtn.addEventListener('click', handleViewSavedTicket);
    retryDailyTicketBtn.addEventListener('click', () => {
        renderDailyTicketFeedback('Intenta de nuevo mas cerca del siguiente juego programado.', 'info');
        loadDailyTicketDashboard(true);
    });

    filterBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
            filterBtns.forEach((item) => item.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            renderTasks();
        });
    });

    modalClose.addEventListener('click', closeModal);
    modalCancel.addEventListener('click', closeModal);
    modalCreateAll.addEventListener('click', createAllSubtasks);
    subtasksModal.addEventListener('click', (event) => {
        if (event.target === subtasksModal) {
            closeModal();
        }
    });
}

async function apiCall(endpoint, options = {}) {
    try {
        const response = await fetch(`${API_URL}${endpoint}`, {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers,
            },
            ...options,
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Request failed' }));
            throw new Error(error.message || error.error || 'Request failed');
        }

        if (response.status === 204) {
            return null;
        }

        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        showToast(error.message || 'Error de conexion', 'error');
        throw error;
    }
}

async function loadTasks() {
    try {
        tasks = await apiCall('/api/tasks');
        renderTasks();
    } catch (error) {
        console.error('Error loading tasks:', error);
    }
}

async function createTask(taskData) {
    const task = await apiCall('/api/tasks', {
        method: 'POST',
        body: JSON.stringify(taskData),
    });

    tasks.push(task);
    renderTasks();
    showToast('Tarea creada exitosamente', 'success');
    return task;
}

async function updateTask(id, taskData) {
    const updatedTask = await apiCall(`/api/tasks/${id}`, {
        method: 'PUT',
        body: JSON.stringify(taskData),
    });

    const index = tasks.findIndex((task) => task.id === id);
    if (index !== -1) {
        tasks[index] = updatedTask;
    }

    renderTasks();
    showToast('Tarea actualizada', 'success');
    return updatedTask;
}

async function deleteTask(id) {
    await apiCall(`/api/tasks/${id}`, {
        method: 'DELETE',
    });

    tasks = tasks.filter((task) => task.id !== id);
    renderTasks();
    showToast('Tarea eliminada', 'success');
}

async function toggleTaskComplete(id) {
    const task = tasks.find((item) => item.id === id);
    if (!task) {
        return;
    }

    await updateTask(id, {
        completed: !task.completed,
    });
}

async function handleSubmit(event) {
    event.preventDefault();

    const taskData = {
        title: taskTitleInput.value.trim(),
        description: taskDescriptionInput.value.trim(),
        priority: taskPrioritySelect.value,
    };

    if (!taskData.title) {
        showToast('El titulo es requerido', 'warning');
        return;
    }

    submitBtn.disabled = true;

    try {
        if (editingTaskId) {
            await updateTask(editingTaskId, taskData);
        } else {
            await createTask(taskData);
        }
        resetForm();
    } catch (error) {
        console.error('Error saving task:', error);
    } finally {
        submitBtn.disabled = false;
    }
}

function resetForm() {
    taskForm.reset();
    editingTaskId = null;
    taskIdInput.value = '';
    formTitle.textContent = 'Nueva Tarea';
    submitText.textContent = 'Agregar Tarea';
    cancelBtn.style.display = 'none';
}

function editTask(id) {
    const task = tasks.find((item) => item.id === id);
    if (!task) {
        return;
    }

    editingTaskId = id;
    taskIdInput.value = id;
    taskTitleInput.value = task.title;
    taskDescriptionInput.value = task.description || '';
    taskPrioritySelect.value = task.priority;
    formTitle.textContent = 'Editar Tarea';
    submitText.textContent = 'Actualizar Tarea';
    cancelBtn.style.display = 'inline-block';

    document.querySelector('.task-form-container').scrollIntoView({ behavior: 'smooth' });
}

async function handleSuggestPriority() {
    const title = taskTitleInput.value.trim();
    const description = taskDescriptionInput.value.trim();

    if (!title) {
        showToast('Escribe un titulo primero', 'warning');
        return;
    }

    suggestPriorityBtn.disabled = true;
    showLoading(true);

    try {
        const result = await apiCall('/api/ai/suggest-priority', {
            method: 'POST',
            body: JSON.stringify({ title, description }),
        });

        taskPrioritySelect.value = result.priority;
        showToast(`IA sugiere: ${getPriorityLabel(result.priority)}. ${result.reasoning}`, 'success');
    } catch (error) {
        console.error('Error suggesting priority:', error);
    } finally {
        suggestPriorityBtn.disabled = false;
        showLoading(false);
    }
}

async function handleBreakDownTask(id) {
    const task = tasks.find((item) => item.id === id);
    if (!task) {
        return;
    }

    showLoading(true);

    try {
        const result = await apiCall('/api/ai/break-down-task', {
            method: 'POST',
            body: JSON.stringify({
                title: task.title,
                description: task.description,
            }),
        });

        currentSubtasks = result.subtasks || [];
        showSubtasksModal(result);
    } catch (error) {
        console.error('Error breaking down task:', error);
    } finally {
        showLoading(false);
    }
}

function showSubtasksModal(result) {
    const reasoningEl = document.getElementById('subtasks-reasoning');
    const subtasksListEl = document.getElementById('subtasks-list');

    reasoningEl.innerHTML = `<strong>Analisis:</strong> ${escapeHtml(result.reasoning || 'Sin comentarios.')}`;
    subtasksListEl.innerHTML = (result.subtasks || []).map((subtask, index) => `
        <div class="subtask-item">
            <h4>${index + 1}. ${escapeHtml(subtask.title)}</h4>
            <p>${escapeHtml(subtask.description || '')}</p>
            <span class="task-priority ${subtask.priority}">${getPriorityLabel(subtask.priority)}</span>
        </div>
    `).join('');

    subtasksModal.classList.add('show');
}

function closeModal() {
    subtasksModal.classList.remove('show');
    currentSubtasks = [];
}

async function createAllSubtasks() {
    if (currentSubtasks.length === 0) {
        return;
    }

    modalCreateAll.disabled = true;
    showLoading(true);

    try {
        for (const subtask of currentSubtasks) {
            await createTask(subtask);
        }

        showToast(`${currentSubtasks.length} subtareas creadas`, 'success');
        closeModal();
    } catch (error) {
        console.error('Error creating subtasks:', error);
    } finally {
        modalCreateAll.disabled = false;
        showLoading(false);
    }
}

function renderTasks() {
    const filteredTasks = getFilteredTasks();

    if (filteredTasks.length === 0) {
        tasksList.innerHTML = '';
        emptyState.style.display = 'block';
        return;
    }

    emptyState.style.display = 'none';
    tasksList.innerHTML = filteredTasks.map((task) => `
        <article class="task-card priority-${task.priority} ${task.completed ? 'completed' : ''}">
            <div class="task-header">
                <input
                    type="checkbox"
                    class="task-checkbox"
                    ${task.completed ? 'checked' : ''}
                    onchange="toggleTaskComplete(${task.id})"
                >
                <div class="task-content">
                    <div class="task-title">${escapeHtml(task.title)}</div>
                    ${task.description ? `<div class="task-description">${escapeHtml(task.description)}</div>` : ''}
                    <div class="task-meta">
                        <span class="task-priority ${task.priority}">${getPriorityLabel(task.priority)}</span>
                        <span class="task-date">${formatDate(task.createdAt)}</span>
                    </div>
                </div>
                <div class="task-actions">
                    <button class="task-btn ai" onclick="handleBreakDownTask(${task.id})" title="Dividir en subtareas">AI</button>
                    <button class="task-btn edit" onclick="editTask(${task.id})" title="Editar">Ed</button>
                    <button class="task-btn delete" onclick="confirmDelete(${task.id})" title="Eliminar">X</button>
                </div>
            </div>
        </article>
    `).join('');
}

function getFilteredTasks() {
    if (currentFilter === 'pending') {
        return tasks.filter((task) => !task.completed);
    }

    if (currentFilter === 'completed') {
        return tasks.filter((task) => task.completed);
    }

    return tasks;
}

async function loadDailyTicketDashboard(showToastMessage = false, sourceHint = null) {
    renderDailyTicketSkeleton();
    renderDailyTicketFeedback('Cargando dashboard de Daily Ticket AI...', 'loading');
    showRetryLaterButton(false);

    try {
        dailyTicketDashboard = await apiCall('/api/daily-ticket/dashboard');
        dailyTicketSourceState = sourceHint || (dailyTicketDashboard.ticket ? 'cache' : 'none');
        renderDailyTicketDashboard();

        if (showToastMessage) {
            showToast('Dashboard actualizado', 'success');
        }
    } catch (error) {
        dailyTicketSourceState = 'error';
        renderDailyTicketError('No se pudo cargar el dashboard de Daily Ticket AI.');
    }
}

async function handleGenerateDailyTicket() {
    generateDailyTicketBtn.disabled = true;
    renderDailyTicketSkeleton('generate');
    renderDailyTicketFeedback('Generando ticket con Odds API + Bedrock...', 'loading');
    showRetryLaterButton(false);

    try {
        const result = await apiCall('/api/daily-ticket/generate', {
            method: 'POST',
            body: JSON.stringify({}),
        });

        if (result.source === 'no_candidates') {
            dailyTicketSourceState = 'no_candidates';
            if (!dailyTicketDashboard) {
                dailyTicketDashboard = {
                    status: null,
                    history: [],
                    games: null,
                    todayTicket: null,
                    upcomingTicket: null,
                    ticket: null,
                };
            }

            dailyTicketDashboard.ticket = null;
            dailyTicketDashboard.todayTicket = null;
            dailyTicketDashboard.upcomingTicket = null;
            renderDailyTicketDashboard();
            renderDailyTicketFeedback('No hay juegos pendientes con momios validos en este momento.', 'info');
            showRetryLaterButton(true);
            showToast('No hay candidatos apostables por ahora', 'warning');
            return;
        }

        await loadDailyTicketDashboard(false, result.source);

        const generatedForTomorrow = isFutureDateKey(result.targetDate)
            && result.sourceDateReason === 'today_had_no_bettable_candidates';

        if (result.source === 'cache') {
            renderDailyTicketFeedback(
                generatedForTomorrow
                    ? 'Hoy no habia juegos pendientes con momios validos, asi que se mostro el ticket preparado para manana desde cache.'
                    : 'Ticket mostrado desde cache sin volver a llamar Bedrock.',
                'success'
            );
            showToast(generatedForTomorrow ? 'Ticket para manana recuperado desde cache' : 'Ticket mostrado desde cache', 'success');
        } else {
            renderDailyTicketFeedback(
                generatedForTomorrow
                    ? 'Hoy no habia juegos pendientes con momios validos, asi que se preparo un ticket para manana.'
                    : 'Ticket del dia generado con IA y guardado en cache.',
                'success'
            );
            showToast(generatedForTomorrow ? 'Ticket para manana generado' : 'Ticket del dia generado', 'success');
        }
    } catch (error) {
        dailyTicketSourceState = 'error';
        renderDailyTicketError(error.message || 'No se pudo generar el ticket del dia.');
        showRetryLaterButton(false);
    } finally {
        generateDailyTicketBtn.disabled = false;
    }
}

async function handleViewSavedTicket() {
    renderDailyTicketFeedback('Buscando ticket guardado...', 'loading');

    try {
        const upcoming = await apiCall('/api/daily-ticket/upcoming');

        if (!dailyTicketDashboard) {
            dailyTicketDashboard = {
                status: null,
                history: [],
                games: null,
            };
        }

        dailyTicketDashboard.upcomingTicket = upcoming.ticket || null;
        dailyTicketDashboard.ticket = upcoming.ticket || null;
        dailyTicketSourceState = upcoming.ticket ? 'cache' : 'none';
        renderDailyTicketDashboard();
        renderDailyTicketFeedback(
            upcoming.ticket
                ? 'Ticket guardado cargado desde cache.'
                : 'No hay ticket guardado disponible por ahora.',
            upcoming.ticket ? 'success' : 'info'
        );
    } catch (error) {
        dailyTicketSourceState = 'error';
        renderDailyTicketError('No se pudo consultar el ticket guardado.');
    }
}

function renderDailyTicketDashboard() {
    const dashboard = dailyTicketDashboard || {};
    const currentTicket = sanitizeTicketForDisplay(
        dashboard.todayTicket || dashboard.upcomingTicket || dashboard.ticket || null
    );

    renderApiStatus(dashboard.status || {});
    renderTicketFlags(currentTicket);
    renderCurrentTicket(currentTicket);
    renderSideSummary(currentTicket);
    renderAvoidMarkets(currentTicket);
    renderHistory((dashboard.history || []).map((ticket) => sanitizeTicketForDisplay(ticket)));
    renderGames(dashboard.games || null);

    if (dailyTicketSourceState === 'no_candidates') {
        renderDailyTicketFeedback('No hay juegos pendientes con momios validos en este momento.', 'info');
        return;
    }

    if (currentTicket) {
        renderDailyTicketFeedback(
            dailyTicketSourceState === 'generated'
                ? 'Dashboard listo. Se muestran picks generados con IA.'
                : 'Dashboard listo. Esta vista no ejecuta Bedrock ni The Odds API.',
            'success'
        );
    } else {
        renderDailyTicketFeedback('Dashboard listo. Aun no hay ticket guardado.', 'info');
    }
}

function renderApiStatus(status) {
    const items = [
        buildStatusItem('Bedrock', status.bedrockConfigured, 'Solo se usa al generar'),
        buildStatusItem('Odds API', status.oddsConfigured, 'No se consulta al abrir'),
        buildStatusItem('API-Football', status.footballConfigured, 'Base lista para expansion'),
        buildStatusItem('ESPN Cache', status.espnAvailable !== false, 'Scoreboard ligero en cache'),
    ];

    dailyTicketApiStatus.innerHTML = items.join('');
    generateDailyTicketBtn.disabled = !Boolean(status.bedrockConfigured && status.oddsConfigured);
}

function buildStatusItem(label, enabled, description) {
    return `
        <article class="status-card ${enabled ? 'enabled' : 'disabled'}">
            <span class="status-pill">${enabled ? 'OK' : 'OFF'}</span>
            <div>
                <strong>${escapeHtml(label)}</strong>
                <p>${escapeHtml(description)}</p>
            </div>
        </article>
    `;
}

function renderTicketFlags(ticket) {
    const badges = [];

    if (dailyTicketSourceState === 'generated') {
        badges.push('<span class="ui-badge generated">Generado con IA</span>');
    } else if (dailyTicketSourceState === 'cache') {
        badges.push('<span class="ui-badge cache">Mostrado desde cache</span>');
    }

    if (ticket?.date) {
        badges.push(`<span class="ui-badge ${isFutureDateKey(ticket.date) ? 'future' : 'today'}">${isFutureDateKey(ticket.date) ? 'Ticket para manana' : 'Ticket de hoy'}</span>`);
    }

    if (ticket?.sourceDateReason === 'today_had_no_bettable_candidates') {
        badges.push('<span class="ui-badge advisory">Fallback inteligente</span>');
    }

    dailyTicketFlags.innerHTML = badges.length ? badges.join('') : '<span class="ui-badge subtle">Dashboard ligero</span>';
}

function renderCurrentTicket(ticket) {
    if (!ticket) {
        dailyTicketSummary.textContent = dailyTicketSourceState === 'no_candidates'
            ? 'Sin candidatos apostables disponibles.'
            : 'Sin ticket guardado.';
        dailyTicketCurrent.innerHTML = `
            <div class="empty-state-card">
                <div class="empty-state-icon">...</div>
                <h4>${dailyTicketSourceState === 'no_candidates' ? 'No hay juegos pendientes con momios validos en este momento.' : 'Todavia no hay ticket generado.'}</h4>
                <p>${dailyTicketSourceState === 'no_candidates'
                    ? 'Intenta mas tarde. El backend no llamo Bedrock porque no encontro candidatos reales.'
                    : 'Usa el boton principal para generar el ticket solo cuando lo necesites.'}</p>
            </div>
        `;
        return;
    }

    const tickets = Array.isArray(ticket.tickets) ? ticket.tickets : [];
    const note = ticket.sourceDateReason === 'today_had_no_bettable_candidates'
        ? '<div class="hero-inline-note">Hoy no habia juegos pendientes con momios validos, asi que se preparo un ticket para manana.</div>'
        : '';
    const warnings = Array.isArray(ticket.warnings) ? ticket.warnings : [];
    const cards = tickets.length ? tickets.map(renderTicketCard).join('') : '<div class="empty-inline rich">No hay tickets listos para mostrar.</div>';

    dailyTicketSummary.textContent = `${ticket.date || 'Sin fecha'} - ${formatDateTime(ticket.generatedAt)}`;
    dailyTicketCurrent.innerHTML = `
        <section class="ticket-hero-summary">
            <div>
                <h3>${escapeHtml(ticket.title || 'Daily Ticket AI')}</h3>
                <p>${escapeHtml(ticket.summary || 'Analisis disponible.')}</p>
            </div>
            ${note}
            ${warnings.length ? `<div class="ticket-warning">${warnings.map((warning) => `<span>${escapeHtml(warning)}</span>`).join('')}</div>` : ''}
            <p class="ticket-disclaimer">${escapeHtml(ticket.disclaimer || '')}</p>
        </section>
        <div class="ticket-cards">${cards}</div>
    `;
}

function renderTicketCard(ticket) {
    const legs = Array.isArray(ticket.legs) ? ticket.legs : [];
    const visualOdds = ticket.odds || ticket.targetOdds || '';
    const visualRisk = ticket.risk || ticket.riskLevel || '';
    const visualStake = ticket.stake || ticket.stakeSuggestion || '';
    const unavailable = ticket.available === false;

    return `
        <article class="daily-ticket-card ${escapeHtml(ticket.type || 'safe')} ${unavailable ? 'is-unavailable' : ''}">
            <div class="ticket-card-top">
                <div>
                    <span class="ticket-card-chip">${escapeHtml(visualOdds || 'Sin rango')}</span>
                    <h4>${escapeHtml(ticket.name || 'Ticket')}</h4>
                </div>
                <div class="ticket-card-meta">
                    <strong>${escapeHtml(visualRisk || 'Sin riesgo')}</strong>
                    <span>${escapeHtml(visualStake || 'Sin stake')}</span>
                </div>
            </div>
            ${unavailable
                ? `
                    <div class="ticket-unavailable">
                        <span class="ui-badge subtle">No disponible</span>
                        <p>${escapeHtml(ticket.reason || 'No hay suficientes picks validos para este ticket.')}</p>
                    </div>
                `
                : `
                    <div class="ticket-legs">
                        ${legs.map((leg, index) => `
                            <div class="ticket-leg">
                                <div class="ticket-leg-index">${index + 1}</div>
                                <div class="ticket-leg-body">
                                    <strong>${escapeHtml(leg.pick)}</strong>
                                    <span>${escapeHtml(leg.game)}</span>
                                    <small>${escapeHtml(leg.market)} · ${escapeHtml(leg.odds)}</small>
                                    <p>${escapeHtml(leg.why || leg.reason || '')}</p>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `
            }
        </article>
    `;
}

function renderSideSummary(ticket) {
    if (!ticket) {
        dailyTicketSideSummary.innerHTML = `
            <div class="empty-inline rich">
                <p>El ultimo ticket aparecera aqui cuando exista cache o una generacion nueva.</p>
            </div>
        `;
        return;
    }

    dailyTicketSideSummary.innerHTML = `
        <div class="metric-list">
            <div class="metric-row">
                <span>Fecha objetivo</span>
                <strong>${escapeHtml(ticket.date || 'Sin fecha')}</strong>
            </div>
            <div class="metric-row">
                <span>Origen</span>
                <strong>${escapeHtml(getSourceLabel(dailyTicketSourceState))}</strong>
            </div>
            <div class="metric-row">
                <span>Actualizado</span>
                <strong>${escapeHtml(formatDateTime(ticket.generatedAt))}</strong>
            </div>
        </div>
        <div class="side-summary-copy">
            <p>${escapeHtml(ticket.summary || 'Sin resumen disponible.')}</p>
        </div>
    `;
}

function renderAvoidMarkets(ticket) {
    const avoidItems = Array.isArray(ticket?.avoid) ? ticket.avoid : [];

    if (!avoidItems.length) {
        dailyTicketAvoid.innerHTML = `
            <div class="empty-inline rich">
                <strong>Sin mercados evitados por ahora.</strong>
                <p>Analisis limpio.</p>
            </div>
        `;
        return;
    }

    dailyTicketAvoid.innerHTML = `
        <div class="avoid-list">
            ${avoidItems.map((item) => `
                <div class="avoid-item">
                    <span class="avoid-dot"></span>
                    <p>${escapeHtml(item)}</p>
                </div>
            `).join('')}
        </div>
    `;
}

function renderHistory(history) {
    if (!history.length) {
        dailyTicketHistory.innerHTML = '<div class="empty-inline rich">No hay historial de tickets todavia.</div>';
        return;
    }

    dailyTicketHistory.innerHTML = `
        <div class="history-list">
            ${history.map((ticket) => `
                <article class="history-item">
                    <div class="history-item-top">
                        <strong>${escapeHtml(ticket.date || '')}</strong>
                        <span class="ui-badge subtle">${escapeHtml(ticket.title || 'Ticket del Dia')}</span>
                    </div>
                    <p>${escapeHtml(ticket.summary || 'Sin resumen.')}</p>
                </article>
            `).join('')}
        </div>
    `;
}

function renderGames(scoreboard) {
    if (!scoreboard) {
        dailyTicketGames.innerHTML = '<div class="empty-inline rich">Sin datos de ESPN por ahora.</div>';
        return;
    }

    const games = Array.isArray(scoreboard.games) ? scoreboard.games : [];

    if (!games.length) {
        dailyTicketGames.innerHTML = `
            <div class="empty-inline rich">
                ${escapeHtml(scoreboard.message || 'No hay juegos disponibles en el cache actual.')}
            </div>
        `;
        return;
    }

    dailyTicketGames.innerHTML = `
        <div class="games-list">
            ${games.slice(0, 8).map((game) => `
                <article class="game-row">
                    <div class="game-time">
                        <span>${escapeHtml(formatGameTime(game.startTime))}</span>
                        <small>${escapeHtml(game.status || 'Programado')}</small>
                    </div>
                    <div class="game-matchup">
                        <div class="game-team">
                            ${renderTeamAvatar(game.awayTeam, game.awayLogo)}
                            <div>
                                <strong>${escapeHtml(game.awayTeam)}</strong>
                                <small>Visitante</small>
                            </div>
                        </div>
                        <div class="game-team">
                            ${renderTeamAvatar(game.homeTeam, game.homeLogo)}
                            <div>
                                <strong>${escapeHtml(game.homeTeam)}</strong>
                                <small>Local</small>
                            </div>
                        </div>
                    </div>
                    <div class="game-side">
                        ${game.score ? `<strong>${escapeHtml(game.score)}</strong>` : '<strong>--</strong>'}
                        <small>${escapeHtml(game.venue || 'Sin venue')}</small>
                    </div>
                </article>
            `).join('')}
        </div>
    `;
}

function renderDailyTicketSkeleton(mode = 'dashboard') {
    dailyTicketFlags.innerHTML = `<span class="ui-badge subtle">${mode === 'generate' ? 'Preparando analisis...' : 'Cargando dashboard...'}</span>`;
    dailyTicketSummary.textContent = mode === 'generate' ? 'Generando ticket...' : 'Cargando datos...';
    dailyTicketCurrent.innerHTML = `
        <div class="ticket-skeleton-grid">
            <div class="skeleton-block tall"></div>
            <div class="ticket-skeleton-cards">
                <div class="skeleton-block card"></div>
                <div class="skeleton-block card"></div>
                <div class="skeleton-block card"></div>
            </div>
        </div>
    `;
    dailyTicketSideSummary.innerHTML = '<div class="skeleton-block side"></div>';
    dailyTicketAvoid.innerHTML = '<div class="skeleton-block side"></div>';
}

function renderDailyTicketError(message) {
    dailyTicketFlags.innerHTML = '<span class="ui-badge error">Error</span>';
    dailyTicketSummary.textContent = 'No fue posible cargar la vista.';
    dailyTicketCurrent.innerHTML = `
        <div class="empty-state-card error">
            <div class="empty-state-icon">!</div>
            <h4>Error de Daily Ticket AI</h4>
            <p>${escapeHtml(message)}</p>
        </div>
    `;
    dailyTicketSideSummary.innerHTML = '<div class="empty-inline rich">Revisa el backend y vuelve a intentar.</div>';
    dailyTicketAvoid.innerHTML = '<div class="empty-inline rich">Sin datos por error de carga.</div>';
    renderDailyTicketFeedback(message, 'error');
}

function renderDailyTicketFeedback(message, type = 'info') {
    dailyTicketFeedback.className = `panel-message ${type}`;
    dailyTicketFeedback.textContent = message;
}

function showRetryLaterButton(show) {
    retryDailyTicketBtn.style.display = show ? 'inline-flex' : 'none';
}

function getSourceLabel(source) {
    if (source === 'generated') {
        return 'Generado con IA';
    }

    if (source === 'cache') {
        return 'Mostrado desde cache';
    }

    if (source === 'no_candidates') {
        return 'Sin candidatos';
    }

    return 'Dashboard';
}

function getPriorityLabel(priority) {
    const labels = {
        high: 'Alta',
        medium: 'Media',
        low: 'Baja',
    };

    return labels[priority] || priority;
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
        return 'Hoy';
    }

    if (diffDays === 1) {
        return 'Ayer';
    }

    if (diffDays < 7) {
        return `Hace ${diffDays} dias`;
    }

    return date.toLocaleDateString('es-MX', {
        day: 'numeric',
        month: 'short',
    });
}

function formatDateTime(dateString) {
    if (!dateString) {
        return 'Sin fecha';
    }

    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) {
        return dateString;
    }

    return date.toLocaleString('es-MX', {
        dateStyle: 'medium',
        timeStyle: 'short',
    });
}

function formatGameTime(dateString) {
    if (!dateString) {
        return '--:--';
    }

    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) {
        return dateString;
    }

    return date.toLocaleTimeString('es-MX', {
        hour: '2-digit',
        minute: '2-digit',
    });
}

function getLocalDateKey() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function isFutureDateKey(dateKey) {
    return Boolean(dateKey) && dateKey > getLocalDateKey();
}

function sanitizeTicketForDisplay(ticket) {
    if (!ticket || typeof ticket !== 'object') {
        return ticket;
    }

    return {
        ...ticket,
        summary: sanitizeTicketSummary(ticket.summary),
        avoid: sanitizeAvoidItems(ticket.avoid),
    };
}

function sanitizeTicketSummary(summary) {
    const text = String(summary || '').trim();
    if (!text) {
        return '';
    }

    return containsFinishedGameText(text)
        ? 'Opciones limitadas disponibles.'
        : text;
}

function sanitizeAvoidItems(avoid) {
    if (!Array.isArray(avoid)) {
        return [];
    }

    return avoid.filter((item) => !containsFinishedGameText(item));
}

function containsFinishedGameText(value) {
    return FINISHED_GAME_REGEX.test(String(value || ''));
}

function renderTeamAvatar(teamName, logoUrl) {
    if (logoUrl) {
        return `<span class="game-avatar"><img src="${logoUrl}" alt="${escapeHtml(teamName)}"></span>`;
    }

    return `<span class="game-avatar">${escapeHtml(getTeamInitials(teamName))}</span>`;
}

function getTeamInitials(teamName) {
    return String(teamName || 'NA')
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join('')
        .toUpperCase();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
}

function confirmDelete(id) {
    if (window.confirm('Estas seguro de que quieres eliminar esta tarea?')) {
        deleteTask(id);
    }
}

function showLoading(show) {
    loadingSpinner.style.display = show ? 'block' : 'none';
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    const container = document.getElementById('toast-container');
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => toast.remove(), 300);
    }, 3200);
}

const style = document.createElement('style');
style.textContent = `
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(18px);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

window.toggleTaskComplete = toggleTaskComplete;
window.editTask = editTask;
window.handleBreakDownTask = handleBreakDownTask;
window.confirmDelete = confirmDelete;
