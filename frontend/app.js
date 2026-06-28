const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000'
    : 'https://task-manager-ai-bayn.onrender.com';

let tasks = [];
let currentFilter = 'all';
let editingTaskId = null;
let currentSubtasks = [];
let dailyTicketDashboard = null;
let dailyTicketActiveTicket = null;
let dailyTicketPreviewTicket = null;
let dailyTicketSourceState = 'none';
let dailyTicketTodayRequest = null;
let dailyTicketTodayCheckedDateKey = null;
let dailyTicketTodayMissing = false;
let selectedTicketType = 'safe';
let expandedLegDetails = new Set();
let historyFilterState = 'all';
let renderedHistoryItems = [];
let expandedHistoryPreviewId = null;
let expandedGameInsightIds = new Set();
let playerPropsDiagnosticsState = null;
let recentResultsState = null;
let currentScoreboardTab = 'today';
let scoreboardLivePollTimer = null;
const SCOREBOARD_LIVE_REFRESH_MS = 60000;
const FINISHED_GAME_REGEX = /\b(finalizado|finalizados|completed|completion|final)\b/i;
const MAZATLAN_TIME_ZONE = 'America/Mazatlan';
const SCOREBOARD_TAB_CONFIG = {
    live: {
        hash: '#daily-ticket-live-panel',
        panelId: 'daily-ticket-live-panel',
        label: 'En vivo',
    },
    today: {
        hash: '#daily-ticket-today-panel',
        panelId: 'daily-ticket-today-panel',
        label: 'Hoy',
    },
    upcoming: {
        hash: '#daily-ticket-upcoming-panel',
        panelId: 'daily-ticket-upcoming-panel',
        label: 'Próximos',
    },
    recent: {
        hash: '#daily-ticket-recent-results-panel',
        panelId: 'daily-ticket-recent-results-panel',
        label: 'Resultados recientes',
    },
};
const APP_VIEW_CONFIG = {
    dashboard: {
        hash: '#dashboard',
        legacyHashes: ['#daily-ticket-section'],
    },
    'daily-ticket': {
        hash: '#daily-ticket',
        legacyHashes: ['#daily-ticket-current-panel'],
    },
    scoreboard: {
        hash: '#scoreboard',
        legacyHashes: [
            '#daily-ticket-games-panel',
            '#daily-ticket-live-panel',
            '#daily-ticket-today-panel',
            '#daily-ticket-upcoming-panel',
            '#daily-ticket-recent-results-panel',
        ],
    },
    history: {
        hash: '#history',
        legacyHashes: ['#daily-ticket-history-panel'],
    },
    'debug-props': {
        hash: '#debug-props',
        legacyHashes: ['#player-props-diagnostics-panel'],
    },
    tasks: {
        hash: '#tasks',
        legacyHashes: ['#tasks-section'],
    },
};
const APP_VIEW_DEFAULT = 'dashboard';

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
const appShell = document.getElementById('app-shell');
const appSidebar = document.getElementById('app-sidebar');
const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
const navDebugProps = document.getElementById('nav-debug-props');
const sidebarNavLinks = document.querySelectorAll('.nav-link');
const mobileNavLinks = document.querySelectorAll('.mobile-nav-link');
const appViewSections = document.querySelectorAll('[data-app-view]');
const navigationViewLinks = document.querySelectorAll('[data-nav-view]');

const generateDailyTicketBtn = document.getElementById('generate-daily-ticket-btn');
const viewDailyTicketBtn = document.getElementById('view-daily-ticket-btn');
const retryDailyTicketBtn = document.getElementById('retry-daily-ticket-btn');
const dailyTicketApiStatus = document.getElementById('daily-ticket-api-status');
const dailyTicketFeedback = document.getElementById('daily-ticket-feedback');
const dailyTicketSummary = document.getElementById('daily-ticket-summary');
const dailyTicketFlags = document.getElementById('daily-ticket-ticket-flags');
const dailyTicketDashboardGlance = document.getElementById('daily-ticket-dashboard-glance');
const dailyTicketCurrent = document.getElementById('daily-ticket-current');
const dailyTicketSideSummary = document.getElementById('daily-ticket-side-summary');
const dailyTicketTicketMeta = document.getElementById('daily-ticket-ticket-meta');
const dailyTicketAvoid = document.getElementById('daily-ticket-avoid');
const dailyTicketGamesMeta = document.getElementById('daily-ticket-games-meta');
const dailyTicketLiveGames = document.getElementById('daily-ticket-live-games');
const dailyTicketGames = document.getElementById('daily-ticket-games');
const dailyTicketUpcomingGames = document.getElementById('daily-ticket-upcoming-games');
const dailyTicketGamesPanel = document.getElementById('daily-ticket-games-panel');
const dailyTicketGamesLiveRefresh = document.getElementById('daily-ticket-games-live-refresh');
const scoreboardTabButtons = document.querySelectorAll('[data-scoreboard-tab]');
const scoreboardTabSections = document.querySelectorAll('[data-scoreboard-section]');
const dailyTicketRecentResultsMeta = document.getElementById('daily-ticket-recent-results-meta');
const dailyTicketRecentResults = document.getElementById('daily-ticket-recent-results');
const dailyTicketHistory = document.getElementById('daily-ticket-history');
const debugPropsEmptyPanel = document.getElementById('debug-props-empty-panel');
const playerPropsDiagnosticsPanel = document.getElementById('player-props-diagnostics-panel');
const playerPropsDiagnosticsWarning = document.getElementById('player-props-diagnostics-warning');
const playerPropsDiagnosticsPipeline = document.getElementById('player-props-diagnostics-pipeline');
const playerPropsDiagnosticsMarkets = document.getElementById('player-props-diagnostics-markets');
const playerPropsDiagnosticsGames = document.getElementById('player-props-diagnostics-games');
const playerPropsDiagnosticsPlayers = document.getElementById('player-props-diagnostics-players');
const playerPropsDiagnosticsRejections = document.getElementById('player-props-diagnostics-rejections');
const deskScorebarTitle = document.getElementById('desk-scorebar-title');
const deskScorebarDate = document.getElementById('desk-scorebar-date');
const deskScorebarTime = document.getElementById('desk-scorebar-time');
const deskScorebarCache = document.getElementById('desk-scorebar-cache');
const deskScorebarCalls = document.getElementById('desk-scorebar-calls');
const slateDeskKicker = document.querySelector('.slate-desk-head .hero-kicker');
const slateDeskTitle = document.querySelector('.slate-desk-head h2');
const slateDeskDescription = document.querySelector('.slate-desk-head .hero-description');
const dashboardSlateMetrics = document.getElementById('dashboard-slate-metrics');
const dashboardSlateNote = document.getElementById('dashboard-slate-note');
const dashboardFocusKickers = Array.from(document.querySelectorAll('#dashboard .dashboard-focus-card .panel-kicker'));
const dashboardFocusTitles = Array.from(document.querySelectorAll('#dashboard .dashboard-focus-card h3'));
const dashboardQuickLinkCards = Array.from(document.querySelectorAll('#dashboard .quick-link-card'));
const dailyTicketIntroKicker = document.querySelector('#daily-ticket .view-intro-panel .panel-kicker');
const dailyTicketIntroTitle = document.querySelector('#daily-ticket .view-intro-panel h3');
const dailyTicketIntroSubtitle = document.querySelector('#daily-ticket .view-intro-panel .panel-subtitle');
const scoreboardPanelKicker = document.querySelector('#scoreboard .panel-header .panel-kicker');
const scoreboardPanelTitle = document.querySelector('#scoreboard .panel-header h3');
const historyPanelKicker = document.querySelector('#history .panel-header .panel-kicker');
const historyPanelTitle = document.querySelector('#history .panel-header h3');

document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    hydrateSidebarState();
    updateDebugNavVisibility();
    applyDeskStaticCopy();
    syncHashDrivenPanels();
    renderDeskChrome(null, null);
    window.setInterval(() => {
        renderDeskChrome(resolveCurrentDailyTicket(dailyTicketDashboard), dailyTicketDashboard);
    }, 60000);
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

    if (sidebarToggleBtn) {
        sidebarToggleBtn.addEventListener('click', toggleSidebar);
    }

    if (dailyTicketCurrent) {
        dailyTicketCurrent.addEventListener('click', handleDailyTicketInteraction);
    }

    if (dailyTicketHistory) {
        dailyTicketHistory.addEventListener('click', handleHistoryInteraction);
    }

    if (dailyTicketGamesPanel) {
        dailyTicketGamesPanel.addEventListener('click', handleScoreboardInsightInteraction);
    }

    navigationViewLinks.forEach((link) => {
        link.addEventListener('click', (event) => {
            const viewKey = link.dataset.navView;
            if (!viewKey) {
                return;
            }

            event.preventDefault();
            navigateToAppView(viewKey);
        });
    });

    scoreboardTabButtons.forEach((button) => {
        button.addEventListener('click', () => {
            const tabKey = button.dataset.scoreboardTab;
            setActiveScoreboardTab(tabKey, { updateHash: true, scrollIntoView: false });
        });
    });

    window.addEventListener('hashchange', syncHashDrivenPanels);
}

function updateDebugNavVisibility() {
    const debugEnabled = isPlayerPropsDiagnosticsEnabled();

    if (navDebugProps) {
        navDebugProps.hidden = !debugEnabled;
    }

    if (debugPropsEmptyPanel) {
        debugPropsEmptyPanel.hidden = debugEnabled;
    }

    if (!debugEnabled && playerPropsDiagnosticsPanel) {
        playerPropsDiagnosticsPanel.hidden = true;
    }
}

function syncNavigationState(activeView = resolveAppViewFromHash()) {
    navigationViewLinks.forEach((link) => {
        const isActive = link.dataset.navView === activeView;
        link.classList.toggle('is-active', isActive);
    });
}

function syncHashDrivenPanels() {
    const activeView = resolveAppViewFromHash();
    setActiveAppView(activeView);
    syncNavigationState(activeView);
    syncScoreboardTabFromHash();
}

function navigateToAppView(viewKey, options = {}) {
    const { preservePreview = false } = options;
    const resolvedView = APP_VIEW_CONFIG[viewKey] ? viewKey : APP_VIEW_DEFAULT;
    const targetHash = APP_VIEW_CONFIG[resolvedView]?.hash || APP_VIEW_CONFIG[APP_VIEW_DEFAULT].hash;

    if (resolvedView === 'daily-ticket' && !preservePreview) {
        resetDailyTicketTicketViewState();
    }

    if (window.location.hash === targetHash) {
        setActiveAppView(resolvedView);
        syncNavigationState(resolvedView);
        scrollAppViewToTop();
        return;
    }

    window.history.pushState(null, '', targetHash);
    syncHashDrivenPanels();
    scrollAppViewToTop();
}

function resetDailyTicketTicketViewState() {
    dailyTicketPreviewTicket = null;
    selectedTicketType = 'safe';
    expandedLegDetails = new Set();
}

function resolveAppViewFromHash(hashValue = window.location.hash) {
    const normalizedHash = hashValue || APP_VIEW_CONFIG[APP_VIEW_DEFAULT].hash;

    const directEntry = Object.entries(APP_VIEW_CONFIG)
        .find(([, config]) => config.hash === normalizedHash || config.legacyHashes.includes(normalizedHash));
    if (directEntry) {
        return directEntry[0];
    }

    if (normalizedHash.startsWith('#')) {
        const target = document.getElementById(normalizedHash.slice(1));
        const appView = target?.closest?.('[data-app-view]');
        if (appView?.dataset?.appView) {
            return appView.dataset.appView;
        }
    }

    return APP_VIEW_DEFAULT;
}

function setActiveAppView(viewKey) {
    const resolvedView = APP_VIEW_CONFIG[viewKey] ? viewKey : APP_VIEW_DEFAULT;

    appViewSections.forEach((section) => {
        const isActive = section.dataset.appView === resolvedView;
        section.hidden = !isActive;
        section.classList.toggle('is-active', isActive);
        section.setAttribute('aria-hidden', String(!isActive));
    });

    renderDeskChrome(resolveCurrentDailyTicket(dailyTicketDashboard), dailyTicketDashboard);

    if (resolvedView === 'daily-ticket') {
        void loadTodayTicket({ silent: true }).catch(() => {});
    }
}

function scrollAppViewToTop() {
    window.scrollTo({
        top: 0,
        left: 0,
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
}

function getScoreboardTabFromHash(hashValue = window.location.hash) {
    const entry = Object.entries(SCOREBOARD_TAB_CONFIG)
        .find(([, config]) => config.hash === hashValue);
    return entry ? entry[0] : null;
}

function getScoreboardCounts() {
    const scoreboard = dailyTicketDashboard?.games;
    const todayGames = Array.isArray(scoreboard?.today?.games)
        ? scoreboard.today.games
        : Array.isArray(scoreboard?.games) ? scoreboard.games : [];
    const liveGames = todayGames.filter((game) => game?.isLive);
    const todayNonLiveGames = todayGames.filter((game) => !game?.isLive);
    const tomorrowGames = Array.isArray(scoreboard?.tomorrow?.games) ? scoreboard.tomorrow.games : [];
    const recentGames = Array.isArray(recentResultsState?.games) ? recentResultsState.games : [];

    return {
        live: liveGames.length,
        today: todayNonLiveGames.length,
        upcoming: tomorrowGames.length,
        recent: recentGames.length,
    };
}

function getPreferredScoreboardTab(counts = getScoreboardCounts()) {
    if (counts.live > 0) {
        return 'live';
    }

    if (counts.today > 0) {
        return 'today';
    }

    if (counts.upcoming > 0) {
        return 'upcoming';
    }

    if (counts.recent > 0) {
        return 'recent';
    }

    return 'today';
}

function updateScoreboardTabs() {
    const counts = getScoreboardCounts();

    scoreboardTabButtons.forEach((button) => {
        const key = button.dataset.scoreboardTab;
        const countNode = button.querySelector('.scoreboard-tab-count');
        const labelNode = button.querySelector('.scoreboard-tab-label');
        const config = SCOREBOARD_TAB_CONFIG[key];

        if (labelNode && config?.label) {
            labelNode.textContent = config.label;
        }

        if (countNode) {
            countNode.textContent = String(counts[key] || 0);
        }

        button.classList.toggle('is-empty', (counts[key] || 0) === 0);
    });

    const hashTab = getScoreboardTabFromHash();
    const nextTab = hashTab || ((counts[currentScoreboardTab] || 0) > 0 ? currentScoreboardTab : getPreferredScoreboardTab(counts));
    setActiveScoreboardTab(nextTab, { updateHash: false, scrollIntoView: false });
}

function setActiveScoreboardTab(tabKey, options = {}) {
    const { updateHash = false, scrollIntoView = false } = options;
    const resolvedKey = SCOREBOARD_TAB_CONFIG[tabKey] ? tabKey : getPreferredScoreboardTab();
    const panelId = SCOREBOARD_TAB_CONFIG[resolvedKey]?.panelId;
    const hash = SCOREBOARD_TAB_CONFIG[resolvedKey]?.hash;

    currentScoreboardTab = resolvedKey;

    scoreboardTabButtons.forEach((button) => {
        const isActive = button.dataset.scoreboardTab === resolvedKey;
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-selected', String(isActive));
    });

    scoreboardTabSections.forEach((section) => {
        const isActive = section.dataset.scoreboardSection === resolvedKey;
        section.hidden = !isActive;
        section.classList.toggle('is-active', isActive);
    });

    if (updateHash && hash) {
        window.history.replaceState(null, '', hash);
        syncNavigationState();
    }

    if (scrollIntoView && panelId) {
        const target = document.getElementById(panelId);
        if (target) {
            window.requestAnimationFrame(() => {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        }
    }
}

function syncScoreboardTabFromHash() {
    const hashTab = getScoreboardTabFromHash();
    if (!hashTab) {
        updateScoreboardTabs();
        return;
    }

    setActiveScoreboardTab(hashTab, { updateHash: false, scrollIntoView: true });
}

function applySidebarState(collapsed) {
    if (!appShell || !appSidebar || !sidebarToggleBtn) {
        return;
    }
    syncSidebarState(collapsed);

}

function syncSidebarState(collapsed) {
    appShell.classList.toggle('sidebar-collapsed', collapsed);
    appSidebar.classList.toggle('is-collapsed', collapsed);
    sidebarToggleBtn.textContent = collapsed ? '>' : '<';
    sidebarToggleBtn.setAttribute('aria-expanded', String(!collapsed));
    sidebarToggleBtn.setAttribute('aria-label', collapsed ? 'Expandir sidebar' : 'Colapsar sidebar');
}

function hydrateSidebarState() {
    if (window.innerWidth <= 900) {
        applySidebarState(false);
        return;
    }

    const collapsed = window.localStorage.getItem('dailyTicketSidebarCollapsed') === 'true';
    applySidebarState(collapsed);
}

function toggleSidebar() {
    const nextCollapsed = !(appShell?.classList.contains('sidebar-collapsed'));
    window.localStorage.setItem('dailyTicketSidebarCollapsed', String(nextCollapsed));
    applySidebarState(nextCollapsed);
}

function isPlayerPropsDiagnosticsEnabled() {
    const params = new URLSearchParams(window.location.search);
    return window.location.hostname === 'localhost'
        || window.location.hostname === '127.0.0.1'
        || params.get('debug') === 'props';
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

function normalizeTodayTicketResponse(data) {
    if (!data || typeof data !== 'object') {
        return null;
    }

    let ticket = null;

    if (data.hasTicketToday === true && data.ticket) {
        ticket = data.ticket;
    } else if (data.todayTicket) {
        ticket = data.todayTicket;
    } else if (data.ticket?.ticket) {
        ticket = data.ticket.ticket;
    } else if (data.ticket) {
        ticket = data.ticket;
    }

    if (!ticket || typeof ticket !== 'object') {
        return null;
    }

    if (!Array.isArray(ticket.tickets) && ticket.ticket && typeof ticket.ticket === 'object') {
        ticket = ticket.ticket;
    }

    return ticket && typeof ticket === 'object' ? ticket : null;
}

function hasRenderableTicket(ticket) {
    return Boolean(ticket && Array.isArray(ticket.tickets) && ticket.tickets.length > 0);
}

function resolveCurrentDailyTicket(dashboard) {
    const candidates = [
        dailyTicketPreviewTicket || null,
        dashboard?.todayTicket || null,
        dashboard?.upcomingTicket || null,
        dashboard?.ticket || null,
    ];

    return candidates.find((ticket) => hasRenderableTicket(ticket))
        || candidates.find((ticket) => ticket && typeof ticket === 'object')
        || null;
}

async function loadTodayTicket(options = {}) {
    const { force = false, silent = false } = options;
    const todayDateKey = getLocalDateKey();
    const existingTodayTicket = dailyTicketDashboard?.todayTicket || null;

    if (!force && hasRenderableTicket(existingTodayTicket)) {
        return existingTodayTicket;
    }

    if (!force && dailyTicketTodayMissing && dailyTicketTodayCheckedDateKey === todayDateKey) {
        return null;
    }

    if (!force && dailyTicketTodayRequest) {
        return dailyTicketTodayRequest;
    }

    dailyTicketTodayRequest = (async () => {
        try {
            const data = await apiCall('/api/daily-ticket/today');
            const todayTicket = normalizeTodayTicketResponse(data);

            if (!dailyTicketDashboard) {
                dailyTicketDashboard = {
                    status: null,
                    history: [],
                    games: null,
                    ticket: null,
                    upcomingTicket: null,
                    todayTicket: null,
                };
            }

            dailyTicketDashboard.todayTicket = todayTicket;
            dailyTicketTodayCheckedDateKey = todayDateKey;
            dailyTicketTodayMissing = !hasRenderableTicket(todayTicket);

            if (hasRenderableTicket(todayTicket) && !['generated', 'fallback_generated'].includes(dailyTicketSourceState)) {
                dailyTicketSourceState = 'cache';
            } else if (!hasRenderableTicket(todayTicket) && dailyTicketSourceState === 'error') {
                dailyTicketSourceState = 'none';
            }

            renderDailyTicketDashboard();
            return todayTicket;
        } catch (error) {
            if (!silent && !hasRenderableTicket(dailyTicketDashboard?.todayTicket)) {
                dailyTicketSourceState = 'error';
                renderDailyTicketError('No se pudo consultar el ticket de hoy.');
            }
            throw error;
        } finally {
            dailyTicketTodayRequest = null;
        }
    })();

    return dailyTicketTodayRequest;
}

async function loadDailyTicketDashboard(showToastMessage = false, sourceHint = null) {
    renderDailyTicketSkeleton();
    renderDailyTicketFeedback('Cargando dashboard de Daily Ticket AI...', 'loading');
    showRetryLaterButton(false);

    try {
        const existingTodayTicket = dailyTicketDashboard?.todayTicket || null;
        const dashboardData = await apiCall('/api/daily-ticket/dashboard');
        dailyTicketDashboard = {
            ...dashboardData,
            todayTicket: dashboardData?.todayTicket || existingTodayTicket || null,
        };
        dailyTicketSourceState = sourceHint || (hasRenderableTicket(dailyTicketDashboard.todayTicket) || dailyTicketDashboard.ticket ? 'cache' : 'none');
        renderDailyTicketDashboard();
        updateScoreboardLivePolling(dailyTicketDashboard.games);
        void loadRecentResults({ force: showToastMessage });
        void loadPlayerPropsDiagnostics();

        if (showToastMessage) {
            showToast('Dashboard actualizado', 'success');
        }
    } catch (error) {
        dailyTicketSourceState = 'error';
        stopScoreboardLivePolling();
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

        resetDailyTicketTicketViewState();
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
            navigateToAppView('daily-ticket');
        } else if (result.source === 'fallback_generated') {
            renderDailyTicketFeedback(
                'La salida de IA se truncó y se generó un ticket fallback desde odds filtrados.',
                'success'
            );
            showToast('Ticket fallback generado', 'warning');
            navigateToAppView('daily-ticket');
        } else {
            renderDailyTicketFeedback(
                generatedForTomorrow
                    ? 'Hoy no habia juegos pendientes con momios validos, asi que se preparo un ticket para manana.'
                    : 'Ticket del dia generado con IA y guardado en cache.',
                'success'
            );
            showToast(generatedForTomorrow ? 'Ticket para manana generado' : 'Ticket del dia generado', 'success');
            navigateToAppView('daily-ticket');
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
        resetDailyTicketTicketViewState();
        renderDailyTicketDashboard();
        updateScoreboardLivePolling(dailyTicketDashboard.games);
        void loadPlayerPropsDiagnostics();
        renderDailyTicketFeedback(
            upcoming.ticket
                ? 'Ticket guardado cargado desde cache.'
                : 'No hay ticket guardado disponible por ahora.',
            upcoming.ticket ? 'success' : 'info'
        );
        if (upcoming.ticket) {
            navigateToAppView('daily-ticket');
        }
    } catch (error) {
        dailyTicketSourceState = 'error';
        renderDailyTicketError('No se pudo consultar el ticket guardado.');
    }
}

function renderDailyTicketDashboard() {
    const dashboard = dailyTicketDashboard || {};
    const currentTicket = sanitizeTicketForDisplay(resolveCurrentDailyTicket(dashboard));
    dailyTicketActiveTicket = currentTicket;

    renderDeskChrome(currentTicket, dashboard);
    renderApiStatus(dashboard.status || {});
    renderTicketFlags(currentTicket);
    renderDashboardGlance(currentTicket);
    renderCurrentTicket(currentTicket);
    renderSideSummary(currentTicket);
    renderTicketMeta(currentTicket);
    renderAvoidMarkets(currentTicket);
    renderHistory(buildHistoryDisplayItems(dashboard.history || [], currentTicket));
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

function renderDeskChrome(ticket, dashboard) {
    renderDeskScorebar(ticket, dashboard);
    renderDashboardSlateHero(ticket, dashboard);
}

function applyDeskStaticCopy() {
    const headerCopy = [
        { kicker: 'Cache listo', title: 'Ticket board' },
        { kicker: 'Slate read', title: 'Pulso rapido' },
        { kicker: 'Desk routes', title: 'Ir al tablero' },
    ];

    headerCopy.forEach((copy, index) => {
        if (dashboardFocusKickers[index]) {
            dashboardFocusKickers[index].textContent = copy.kicker;
        }
        if (dashboardFocusTitles[index]) {
            dashboardFocusTitles[index].textContent = copy.title;
        }
    });

    dashboardQuickLinkCards.forEach((card) => {
        const strong = card.querySelector('strong');
        const span = card.querySelector('span');
        const targetView = card.dataset.navView;

        if (!strong || !span) {
            return;
        }

        if (targetView === 'daily-ticket') {
            strong.textContent = 'Ticket board';
            span.textContent = 'Abrir los 3 slips activos.';
        } else if (targetView === 'scoreboard') {
            strong.textContent = 'Score desk';
            span.textContent = 'Ir al marcador, tabs y linescore.';
        } else if (targetView === 'history') {
            strong.textContent = 'Archive';
            span.textContent = 'Revisar slips recientes guardados.';
        }
    });

    if (dailyTicketIntroKicker) {
        dailyTicketIntroKicker.textContent = 'Cache listo';
    }
    if (dailyTicketIntroTitle) {
        dailyTicketIntroTitle.textContent = 'Bet slip completa';
    }
    if (dailyTicketIntroSubtitle) {
        dailyTicketIntroSubtitle.textContent = 'Vista dedicada para revisar picks, warnings compactos y el contexto real del slate activo.';
    }
    if (scoreboardPanelKicker) {
        scoreboardPanelKicker.textContent = 'Score desk';
    }
    if (scoreboardPanelTitle) {
        scoreboardPanelTitle.textContent = 'MLB Scoreboard';
    }
    if (historyPanelKicker) {
        historyPanelKicker.textContent = 'Ticket archive';
    }
    if (historyPanelTitle) {
        historyPanelTitle.textContent = 'Archivo reciente';
    }
}

function renderDeskScorebar(ticket, dashboard) {
    if (!deskScorebarTitle || !deskScorebarDate || !deskScorebarTime || !deskScorebarCache || !deskScorebarCalls) {
        return;
    }

    const activeView = resolveAppViewFromHash();
    const status = dashboard?.status || {};
    const targetDateKey = ticket?.date || getLocalDateKey();
    const liveCallsLabel = getDeskLiveCallsLabel(activeView, ticket);

    deskScorebarTitle.textContent = getDeskTitleForView(activeView, ticket);
    deskScorebarDate.textContent = formatDateKeyLabel(targetDateKey);
    deskScorebarTime.textContent = formatMazatlanDeskTime();
    deskScorebarCache.textContent = getDeskCacheStatusLabel(ticket, dashboard, status);
    deskScorebarCalls.textContent = liveCallsLabel;
}

function renderDashboardSlateHero(ticket, dashboard) {
    if (slateDeskKicker) {
        slateDeskKicker.textContent = 'MLB Ticket Board | Mazatlan Time';
    }

    if (slateDeskTitle) {
        slateDeskTitle.textContent = 'DAILY SLATE DESK';
    }

    if (slateDeskDescription) {
        slateDeskDescription.textContent = buildDashboardSlateDescription(ticket, dashboard);
    }

    if (dashboardSlateMetrics) {
        dashboardSlateMetrics.innerHTML = buildDashboardSlateMetricsMarkup(ticket, dashboard);
    }

    if (dashboardSlateNote) {
        dashboardSlateNote.textContent = buildDashboardSlateNote(ticket, dashboard);
    }
}

function buildDashboardSlateDescription(ticket, dashboard) {
    const stats = ticket ? getTicketCompositionStats(ticket) : null;
    const gameCount = getTodaySlateGamesCount(dashboard?.games);

    if (ticket && stats) {
        return `${stats.availableTickets} slips activos, ${stats.totalLegs} picks verificados y ${gameCount} juegos listos para revisar sin live calls al abrir.`;
    }

    if (gameCount > 0) {
        return `Mesa operativa con ${gameCount} juegos en cache, scoreboard ligero y generacion manual solo cuando quieras abrir slate.`;
    }

    return 'Mesa operativa para revisar cache, abrir scoreboard e ir al ticket cuando el slate ya este listo.';
}

function buildDashboardSlateMetricsMarkup(ticket, dashboard) {
    const status = dashboard?.status || {};
    const stats = ticket ? getTicketCompositionStats(ticket) : null;
    const gamesToday = getTodaySlateGamesCount(dashboard?.games);
    const metrics = [
        {
            label: 'Ticket listo',
            value: stats ? `${stats.availableTickets}/${Math.max(stats.totalTickets, 1)}` : 'Standby',
            note: stats ? 'slips activos' : 'sin ticket',
            tone: stats?.availableTickets ? 'success' : 'neutral',
        },
        {
            label: 'Juegos hoy',
            value: String(gamesToday),
            note: gamesToday ? 'en slate' : 'sin slate',
            tone: gamesToday ? 'neutral' : 'muted',
        },
        {
            label: 'Odds cache',
            value: getDeskCacheStatusLabel(ticket, dashboard, status),
            note: status.oddsConfigured ? 'Modo protegido' : 'odds off',
            tone: status.oddsConfigured ? 'neutral' : 'warning',
        },
        {
            label: 'AI Lean activo',
            value: stats ? `${stats.totalLegs} picks` : '0 picks',
            note: stats?.propLegs ? `${stats.propLegs} props` : 'game markets',
            tone: stats?.propLegs ? 'accent' : 'neutral',
        },
    ];

    return metrics.map((metric) => `
        <article class="slate-desk-metric ${escapeHtml(metric.tone || 'neutral')}">
            <span>${escapeHtml(metric.label)}</span>
            <strong>${escapeHtml(metric.value)}</strong>
            <small>${escapeHtml(metric.note)}</small>
        </article>
    `).join('');
}

function buildDashboardSlateNote(ticket, dashboard) {
    const gameCount = getTodaySlateGamesCount(dashboard?.games);
    const ticketSerial = buildTicketSerial(ticket?.date || getLocalDateKey(), 'desk');

    if (ticket?.sourceDateReason === 'today_had_no_bettable_candidates') {
        return `${ticketSerial} | Hoy no hubo slate apostable; cache preparado para manana.`;
    }

    if (ticket) {
        const sourceLabel = getSourceLabel(dailyTicketSourceState);
        return `${ticketSerial} | ${sourceLabel}. Scoreboard, historial y ticket se abren en modo cache-first.`;
    }

    if (gameCount > 0) {
        return `${ticketSerial} | Slate disponible en cache. Genera solo cuando quieras fijar el board.`;
    }

    return `${ticketSerial} | Desk en espera. Sin live calls al abrir y listo para cuando llegue el siguiente slate.`;
}

function getDeskTitleForView(activeView, ticket) {
    switch (activeView) {
        case 'daily-ticket':
            return ticket?.date ? `Bet Slip | ${buildTicketSerial(ticket.date, 'slate')}` : 'Bet Slip Board';
        case 'scoreboard':
            return 'MLB Score Desk';
        case 'history':
            return 'Ticket Archive';
        case 'debug-props':
            return 'Props Pipeline';
        case 'tasks':
            return 'Task Workspace';
        case 'dashboard':
        default:
            return 'Daily Slate Desk';
    }
}

function getDeskCacheStatusLabel(ticket, dashboard, status) {
    if (dailyTicketSourceState === 'generated') {
        return 'AI refreshed';
    }

    if (dailyTicketSourceState === 'fallback_generated') {
        return 'Fallback saved';
    }

    if (hasRenderableTicket(ticket)) {
        return 'Cache listo';
    }

    if (dashboard?.games) {
        return status?.oddsConfigured ? 'Cache read' : 'Cache only';
    }

    return 'Standby';
}

function getDeskLiveCallsLabel(activeView, ticket) {
    if (activeView === 'scoreboard') {
        return 'ESPN cache only';
    }

    if (dailyTicketSourceState === 'generated') {
        return 'Manual AI run only';
    }

    if (ticket) {
        return 'Sin live calls al abrir';
    }

    return 'Cache-first mode';
}

function getTodaySlateGamesCount(scoreboard) {
    const todayGames = Array.isArray(scoreboard?.today?.games)
        ? scoreboard.today.games
        : Array.isArray(scoreboard?.games) ? scoreboard.games : [];

    return Number(scoreboard?.todayGamesTotal ?? todayGames.length ?? 0);
}

function buildTicketSerial(dateKey, suffix = 'desk') {
    const normalizedDate = String(dateKey || getLocalDateKey()).replace(/[^0-9]/g, '') || getLocalDateKey().replace(/-/g, '');
    const normalizedSuffix = String(suffix || 'desk').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    return `DT-${normalizedDate}-${normalizedSuffix}`;
}

function formatMazatlanDeskTime(referenceDate = new Date()) {
    try {
        return new Intl.DateTimeFormat('es-MX', {
            timeZone: MAZATLAN_TIME_ZONE,
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
        }).format(referenceDate);
    } catch (error) {
        return '--';
    }
}

async function loadPlayerPropsDiagnostics() {
    if (!isPlayerPropsDiagnosticsEnabled() || !playerPropsDiagnosticsPanel) {
        return;
    }

    if (debugPropsEmptyPanel) {
        debugPropsEmptyPanel.hidden = true;
    }
    playerPropsDiagnosticsPanel.hidden = false;
    playerPropsDiagnosticsWarning.className = 'panel-message info compact';
    playerPropsDiagnosticsWarning.textContent = 'Cargando diagnostico cache-first de player props...';
    playerPropsDiagnosticsPipeline.innerHTML = buildPropsDiagnosticsSkeleton();
    playerPropsDiagnosticsMarkets.innerHTML = '<div class="empty-inline rich">Cargando...</div>';
    playerPropsDiagnosticsGames.innerHTML = '<div class="empty-inline rich">Cargando...</div>';
    playerPropsDiagnosticsPlayers.innerHTML = '<div class="empty-inline rich">Cargando...</div>';
    playerPropsDiagnosticsRejections.innerHTML = '<div class="empty-inline rich">Cargando...</div>';

    try {
        playerPropsDiagnosticsState = await apiCall('/api/odds/mlb/player-props/diagnostics');
        renderPlayerPropsDiagnostics(playerPropsDiagnosticsState);
    } catch (error) {
        renderPlayerPropsDiagnosticsError(error.message || 'No se pudo cargar el diagnostico de player props.');
    }
}

function buildPropsDiagnosticsSkeleton() {
    return ['Feed', 'Roster', 'Status', 'Time', 'Odds', 'Prompt', 'Final Ticket']
        .map((label) => `
            <article class="props-pipeline-step">
                <span>${escapeHtml(label)}</span>
                <strong>...</strong>
            </article>
        `)
        .join('');
}

function renderPlayerPropsDiagnosticsError(message) {
    if (!playerPropsDiagnosticsPanel) {
        return;
    }

    if (debugPropsEmptyPanel) {
        debugPropsEmptyPanel.hidden = true;
    }
    playerPropsDiagnosticsPanel.hidden = false;
    playerPropsDiagnosticsWarning.className = 'panel-message error compact';
    playerPropsDiagnosticsWarning.textContent = message;
    playerPropsDiagnosticsPipeline.innerHTML = '<div class="empty-inline rich">Sin diagnostico disponible.</div>';
    playerPropsDiagnosticsMarkets.innerHTML = '<div class="empty-inline rich">Sin datos.</div>';
    playerPropsDiagnosticsGames.innerHTML = '<div class="empty-inline rich">Sin datos.</div>';
    playerPropsDiagnosticsPlayers.innerHTML = '<div class="empty-inline rich">Sin datos.</div>';
    playerPropsDiagnosticsRejections.innerHTML = '<div class="empty-inline rich">Sin datos.</div>';
}

function renderPlayerPropsDiagnostics(diagnostics) {
    if (!playerPropsDiagnosticsPanel) {
        return;
    }

    if (debugPropsEmptyPanel) {
        debugPropsEmptyPanel.hidden = true;
    }
    const pipeline = diagnostics?.pipeline || {};
    const warning = diagnostics?.warning || 'Diagnostico listo. Esta vista usa cache por default.';
    const humanSummary = diagnostics?.humanSummary || {};
    const availabilityDetails = diagnostics?.propsAvailabilityDetails || null;
    const steps = [
        { label: 'Feed', value: diagnostics?.feed?.totalPropsFetched ?? 0 },
        { label: 'Roster', value: pipeline.afterRosterValidation ?? 0 },
        { label: 'Status', value: pipeline.afterStatusFilter ?? 0 },
        { label: 'Time', value: pipeline.afterTimeFilter ?? 0 },
        { label: 'Odds', value: pipeline.afterOddsFilter ?? 0 },
        { label: 'Prompt', value: pipeline.promptCandidates ?? 0 },
        { label: 'Final Ticket', value: pipeline.finalTicketProps ?? 0 },
    ];

    playerPropsDiagnosticsPanel.hidden = false;
    playerPropsDiagnosticsWarning.className = `panel-message compact ${diagnostics?.quotaReached ? 'error' : 'info'}`;
    if (diagnostics?.propsAvailabilityStatus === 'blocked_by_time' && availabilityDetails) {
        playerPropsDiagnosticsWarning.innerHTML = `
            <strong>Props bloqueadas por horario</strong><br>
            ${escapeHtml(humanSummary.message || diagnostics.propsAvailabilityMessage || warning)}<br>
            <span>Props encontradas: ${escapeHtml(String(availabilityDetails.fetchedProps || 0))} | Props validadas por roster: ${escapeHtml(String(availabilityDetails.rosterValidatedProps || 0))} | Props bloqueadas por tiempo: ${escapeHtml(String(availabilityDetails.blockedByTime || 0))} | Limite de bloqueo: ${escapeHtml(String(availabilityDetails.lockMinutesBeforeStart || 0))} min</span>
        `;
    } else {
        playerPropsDiagnosticsWarning.textContent = humanSummary.message || warning;
    }
    playerPropsDiagnosticsPipeline.innerHTML = steps.map((step) => `
        <article class="props-pipeline-step">
            <span>${escapeHtml(step.label)}</span>
            <strong>${escapeHtml(String(step.value))}</strong>
        </article>
    `).join('');

    playerPropsDiagnosticsMarkets.innerHTML = renderPropsDiagnosticsList(
        diagnostics?.topMarkets,
        (item) => item?.market || 'Mercado',
        (item) => `${item?.fetched || 0} feed | ${item?.afterOddsFilter || 0} odds | ${item?.used || 0} final`
    );
    playerPropsDiagnosticsGames.innerHTML = renderPropsDiagnosticsList(
        diagnostics?.topGames,
        (item) => item?.game || 'Juego',
        (item) => `${item?.props || 0} props`
    );
    playerPropsDiagnosticsPlayers.innerHTML = renderPropsDiagnosticsList(
        diagnostics?.topPlayers,
        (item) => item?.player || 'Jugador',
        (item) => `${item?.props || 0} props`
    );
    playerPropsDiagnosticsRejections.innerHTML = renderPropsDiagnosticsList(
        Object.entries(diagnostics?.primaryRejectedReasons || diagnostics?.rejectedReasons || {}).map(([reason, count]) => ({ reason, count })),
        (item) => formatPropsRejectedReasonLabel(item?.reason || 'unknown'),
        (item) => `${item?.count || 0}`
    );
}

function formatPropsRejectedReasonLabel(reason) {
    switch (reason) {
        case 'player_not_on_roster':
            return 'Jugador fuera del roster';
        case 'team_unresolved':
            return 'Equipo no resuelto';
        case 'lineup_required':
            return 'Lineup pendiente';
        case 'game_started':
            return 'Juego iniciado / time lock';
        case 'odds_filter':
            return 'Filtro de momios';
        case 'duplicate_player':
            return 'Prop correlacionada';
        case 'market_rules':
            return 'Reglas de mercado';
        default:
            return reason || 'unknown';
    }
}

function renderPropsDiagnosticsList(items, labelGetter, valueGetter) {
    const list = Array.isArray(items) ? items : [];

    if (!list.length) {
        return '<div class="empty-inline rich">Sin datos por ahora.</div>';
    }

    return `
        <div class="props-mini-list">
            ${list.slice(0, 6).map((item) => `
                <div class="props-mini-item">
                    <span>${escapeHtml(labelGetter(item))}</span>
                    <strong>${escapeHtml(valueGetter(item))}</strong>
                </div>
            `).join('')}
        </div>
    `;
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
    } else if (dailyTicketSourceState === 'fallback_generated') {
        badges.push('<span class="ui-badge advisory">Fallback sin IA</span>');
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

function renderDashboardGlance(ticket) {
    if (!dailyTicketDashboardGlance) {
        return;
    }

    if (!ticket) {
        dailyTicketDashboardGlance.innerHTML = `
            <div class="empty-inline rich">
                <strong>Sin cache activo por ahora.</strong>
                <p>Abre el cache guardado o genera manualmente cuando quieras fijar el slate del dia.</p>
            </div>
        `;
        return;
    }

    const stats = getTicketCompositionStats(ticket);
    const targetBadge = isFutureDateKey(ticket.date) ? 'Ticket para manana' : 'Ticket de hoy';

    dailyTicketDashboardGlance.innerHTML = `
        <div class="dashboard-glance">
            <div class="dashboard-glance-top">
                <div>
                    <strong>${escapeHtml(ticket.title || 'Cache listo')}</strong>
                    <p>${escapeHtml(ticket.summary || 'Lectura de slate disponible.')}</p>
                </div>
                <span class="ui-badge ${isFutureDateKey(ticket.date) ? 'future' : 'today'}">${escapeHtml(targetBadge)}</span>
            </div>
            <div class="mini-metric-grid">
                <div class="mini-metric-card">
                    <span>Slips activos</span>
                    <strong>${escapeHtml(`${stats.availableTickets}/${stats.totalTickets}`)}</strong>
                </div>
                <div class="mini-metric-card">
                    <span>Picks en board</span>
                    <strong>${escapeHtml(String(stats.totalLegs))}</strong>
                </div>
                <div class="mini-metric-card">
                    <span>Props en board</span>
                    <strong>${escapeHtml(String(stats.propLegs))}</strong>
                </div>
            </div>
            <div class="ticket-type-pills">
                ${stats.ticketNames.length
                    ? stats.ticketNames.map((name) => `<span class="ui-badge subtle">${escapeHtml(name)}</span>`).join('')
                    : '<span class="ui-badge subtle">Sin tickets disponibles</span>'}
            </div>
        </div>
    `;
}

function renderCurrentTicket(ticket) {
    if (!ticket) {
        dailyTicketSummary.textContent = dailyTicketSourceState === 'no_candidates'
            ? 'Sin candidatos apostables disponibles.'
            : 'Sin cache guardado.';
        dailyTicketCurrent.innerHTML = `
            <div class="empty-state-card">
                <div class="empty-state-icon">...</div>
                <h4>${dailyTicketSourceState === 'no_candidates' ? 'No hay juegos pendientes con momios validos en este momento.' : 'Todavia no hay bet slip generada.'}</h4>
                <p>${dailyTicketSourceState === 'no_candidates'
                    ? 'Intenta mas tarde. El backend no llamo Bedrock porque no encontro candidatos reales.'
                    : 'Usa el boton principal para fijar el slate solo cuando realmente quieras generar picks.'}</p>
            </div>
        `;
        return;
    }

    const tickets = Array.isArray(ticket.tickets) ? ticket.tickets : [];
    const selectedIndex = resolveSelectedTicketIndex(tickets);
    const selectedTicket = selectedIndex >= 0 ? tickets[selectedIndex] : null;
    const note = ticket.sourceDateReason === 'today_had_no_bettable_candidates'
        ? '<div class="hero-inline-note">Hoy no habia juegos pendientes con momios validos, asi que se preparo un ticket para manana.</div>'
        : '';
    const selectorCards = tickets.length
        ? tickets.map((item, index) => renderTicketSelectorCard(item, index, index === selectedIndex)).join('')
        : '<div class="empty-inline rich">No hay tickets listos para mostrar.</div>';
    const selectedSlip = selectedTicket
        ? renderSelectedBetSlip(ticket, selectedTicket, selectedIndex)
        : '<div class="empty-inline rich">No hay un ticket seleccionable por ahora.</div>';
    const contextStrip = buildTicketContextStrip(ticket);
    const avoidBand = buildAvoidMarketsBand(ticket);

    dailyTicketSummary.textContent = `${ticket.date || 'Sin fecha'} - ${formatDateTime(ticket.generatedAt)}`;
    dailyTicketCurrent.innerHTML = `
        <section class="ticket-hero-summary">
            <div>
                <h3>${escapeHtml(ticket.title || 'Cache listo')}</h3>
                <p>${escapeHtml(ticket.summary || 'Analisis disponible para el slate actual.')}</p>
            </div>
            ${note}
        </section>
        ${contextStrip}
        <div class="ticket-selector-grid">${selectorCards}</div>
        ${selectedSlip}
        ${avoidBand}
        <p class="ticket-disclaimer ticket-disclaimer-bottom">${escapeHtml(ticket.disclaimer || '')}</p>
    `;
}

function resolveSelectedTicketIndex(tickets) {
    const list = Array.isArray(tickets) ? tickets : [];
    if (!list.length) {
        return -1;
    }

    const selectedIndex = list.findIndex((item) => item?.type === selectedTicketType);
    if (selectedIndex >= 0) {
        return selectedIndex;
    }

    const safeIndex = list.findIndex((item) => item?.type === 'safe');
    return safeIndex >= 0 ? safeIndex : 0;
}

function renderTicketSelectorCard(ticket, index, isActive) {
    const legs = Array.isArray(ticket?.legs) ? ticket.legs : [];
    const riskLabel = ticket?.risk || ticket?.riskLevel || 'Sin riesgo';
    const oddsLabel = ticket?.odds || ticket?.targetOdds || 'Sin rango';
    const stakeLabel = ticket?.stake || ticket?.stakeSuggestion || 'Stake libre';
    const isUnavailable = ticket?.available === false;
    const serial = buildTicketSerial(dailyTicketActiveTicket?.date || getLocalDateKey(), ticket?.type || `slip${index + 1}`);

    return `
        <button
            type="button"
            class="ticket-selector-card mini-ticket-card ${escapeHtml(ticket?.type || 'safe')} ${isActive ? 'active' : ''} ${isUnavailable ? 'is-unavailable' : ''}"
            data-ticket-select="${escapeHtml(ticket?.type || String(index))}"
            aria-pressed="${isActive ? 'true' : 'false'}"
        >
            <div class="ticket-selector-top">
                <span class="ticket-card-chip">${escapeHtml(oddsLabel)}</span>
                <span class="risk-pill ${escapeHtml(getRiskTone(ticket))}">${escapeHtml(riskLabel)}</span>
            </div>
            <strong>${escapeHtml(ticket?.name || `Ticket ${index + 1}`)}</strong>
            <div class="ticket-selector-meta">
                <span>${escapeHtml(stakeLabel)}</span>
                <span>${escapeHtml(`${legs.length} legs`)}</span>
            </div>
            <div class="ticket-selector-serial-row">
                <span class="ticket-card-copy">Cache listo</span>
                <span class="ticket-card-serial">${escapeHtml(serial)}</span>
            </div>
        </button>
    `;
}

function renderSelectedBetSlip(parentTicket, selectedTicket, selectedIndex) {
    const legs = Array.isArray(selectedTicket?.legs) ? selectedTicket.legs : [];
    const isUnavailable = selectedTicket?.available === false;
    const warnings = buildTicketWarningChips(parentTicket, selectedTicket);
    const receiptScope = isFutureDateKey(parentTicket?.date) ? 'Cache listo | manana' : 'Cache listo | hoy';
    const receiptType = String(selectedTicket?.type || 'ticket').replace(/_/g, ' ');
    const receiptSerial = buildTicketSerial(parentTicket?.date, selectedTicket?.type || `ticket${selectedIndex + 1}`);
    const metrics = [
        { label: 'Stake', value: selectedTicket?.stake || selectedTicket?.stakeSuggestion || 'Libre' },
        { label: 'Momio', value: selectedTicket?.odds || selectedTicket?.targetOdds || 'Sin rango' },
        { label: 'Riesgo', value: selectedTicket?.risk || selectedTicket?.riskLevel || 'Sin riesgo' },
        { label: 'Legs', value: String(legs.length) },
    ];

    return `
        <section class="bet-slip-card slip-card subtle-grain-overlay ${escapeHtml(selectedTicket?.type || 'safe')} ${isUnavailable ? 'is-unavailable' : ''}">
            <div class="bet-slip-receipt-line">
                <span>${escapeHtml(receiptScope)}</span>
                <span class="bet-slip-serial">${escapeHtml(receiptSerial)}</span>
                <span>${escapeHtml(parentTicket?.date || 'Sin fecha')}</span>
            </div>
            <div class="bet-slip-header">
                <div>
                    <p class="panel-kicker">Cache listo</p>
                    <h4>${escapeHtml(selectedTicket?.name || 'Ticket')}</h4>
                    <p>${escapeHtml(isUnavailable
                        ? (selectedTicket?.reason || 'No hay suficientes picks validos para este ticket.')
                        : (parentTicket?.summary || 'Ticket compacto listo para revisar.'))}</p>
                </div>
                <div class="bet-slip-status-stack">
                    <span class="status-pill pending stamp-badge">Pending</span>
                    <span class="ui-badge subtle">${escapeHtml(`Ticket ${selectedIndex + 1}`)}</span>
                </div>
            </div>
            <div class="bet-slip-metrics">
                ${metrics.map((item) => `
                    <div class="bet-slip-metric">
                        <span>${escapeHtml(item.label)}</span>
                        <strong>${escapeHtml(item.value)}</strong>
                    </div>
                `).join('')}
            </div>
            <div class="compact-divider ticket-perforation" aria-hidden="true"></div>
            ${warnings.length ? `
                <div class="warning-chip-row">
                    ${warnings.map((warning) => `<span class="warning-chip">${escapeHtml(summarizeWarningChip(warning))}</span>`).join('')}
                </div>
            ` : ''}
            ${isUnavailable
                ? `
                    <div class="ticket-unavailable">
                        <span class="ui-badge subtle">No disponible</span>
                        <p>${escapeHtml(selectedTicket?.reason || 'No hay suficientes picks validos para este ticket.')}</p>
                    </div>
                `
                : `
                    <div class="bet-slip-body">
                        ${legs.map((leg, index) => renderLegRow(leg, index, selectedTicket)).join('')}
                    </div>
                `
            }
            <div class="compact-divider" aria-hidden="true"></div>
            <div class="receipt-footer">
                <span>${escapeHtml(receiptScope)}</span>
                <span>${escapeHtml(`${legs.length} legs`)}</span>
                <span>${escapeHtml(receiptType)}</span>
            </div>
        </section>
    `;
}

function renderLegRow(leg, index, ticket) {
    const legId = buildLegDetailsId(ticket?.type || 'ticket', index);
    const isExpanded = expandedLegDetails.has(legId);
    const details = buildLegDetailBlocks(leg);
    const visual = getLegVisual(leg, getAllScoreboardGames(dailyTicketDashboard?.games));

    return `
        <article class="bet-leg-row ${isExpanded ? 'is-expanded' : ''}">
            <div class="bet-leg-top">
                <div class="bet-leg-visual-stack">
                    ${renderLegVisualAvatar(visual, leg)}
                    <div class="bet-leg-index">${index + 1}</div>
                </div>
                <div class="bet-leg-main">
                    <strong>${escapeHtml(leg?.pick || 'Pick sin nombre')}</strong>
                    <span>${escapeHtml(leg?.game || 'Juego sin nombre')}</span>
                    <div class="bet-leg-chip-row">
                        <span class="confidence-pill ${escapeHtml(getConfidenceTone(leg?.confidence))}">${escapeHtml(formatConfidence(leg?.confidence))}</span>
                        <span class="market-pill ${escapeHtml(getMarketTone(leg))}">${escapeHtml(getMarketLabel(leg))}</span>
                        ${leg?.protected ? '<span class="market-pill protected">Protegido</span>' : ''}
                        ${leg?.voidRisk ? `<span class="market-pill void-risk">${escapeHtml(`Void ${leg.voidRisk}`)}</span>` : ''}
                    </div>
                </div>
                <div class="bet-leg-meta">
                    <strong class="bet-leg-odds">${escapeHtml(leg?.odds || '-')}</strong>
                    <button type="button" class="bet-leg-toggle" data-leg-toggle="${escapeHtml(legId)}">
                        ${isExpanded ? 'Ocultar detalles' : 'Ver analisis'}
                    </button>
                </div>
            </div>
            <div class="bet-leg-preview">
                <p>${escapeHtml(getLegPreviewText(leg))}</p>
            </div>
            ${details && isExpanded ? `<div class="bet-leg-details">${details}</div>` : ''}
        </article>
    `;
}

function buildLegDetailsId(ticketType, index) {
    return `${ticketType}-${index}`;
}

function buildLegDetailBlocks(leg) {
    const blocks = [];
    const whyText = String(leg?.why || leg?.reason || '').trim();
    const ruleWarnings = Array.isArray(leg?.ruleWarnings) ? leg.ruleWarnings.filter(Boolean) : [];
    const historicalNotes = [];

    if (leg?.historicalInfluenceReason) {
        historicalNotes.push(leg.historicalInfluenceReason);
    }
    if (leg?.historicalPenaltyApplied) {
        historicalNotes.push('Ajuste historico negativo aplicado.');
    }
    if (leg?.historicalBoostApplied) {
        historicalNotes.push('Ajuste historico positivo aplicado.');
    }

    if (whyText) {
        blocks.push(`
            <div class="bet-leg-detail-block">
                <span>Analisis</span>
                <p>${escapeHtml(whyText)}</p>
            </div>
        `);
    }

    if (ruleWarnings.length) {
        blocks.push(`
            <div class="bet-leg-detail-block">
                <span>Reglas</span>
                <div class="warning-chip-row">
                    ${ruleWarnings.map((warning) => `<span class="warning-chip">${escapeHtml(summarizeWarningChip(warning))}</span>`).join('')}
                </div>
            </div>
        `);
    }

    if (leg?.voidRisk) {
        blocks.push(`
            <div class="bet-leg-detail-block">
                <span>Void risk</span>
                <p>${escapeHtml(String(leg.voidRisk))}</p>
            </div>
        `);
    }

    if (historicalNotes.length) {
        blocks.push(`
            <div class="bet-leg-detail-block">
                <span>Historial</span>
                <p>${escapeHtml(historicalNotes.join(' '))}</p>
            </div>
        `);
    }

    return blocks.join('');
}

function buildTicketWarningChips(parentTicket, selectedTicket) {
    const warningValues = [
        ...(Array.isArray(parentTicket?.warnings) ? parentTicket.warnings : []),
        ...(Array.isArray(selectedTicket?.warnings) ? selectedTicket.warnings : []),
    ].filter(Boolean);

    return Array.from(new Set(warningValues));
}

function buildTicketContextStrip(ticket) {
    const stats = getTicketCompositionStats(ticket);
    const originLabel = getSourceLabel(dailyTicketSourceState);
    const originTone = normalizeSourceStateFromLabel(originLabel, 'cache');
    const contextItems = [
        { label: 'Origen', value: originLabel, badge: originLabel, tone: originTone },
        { label: 'Fecha objetivo', value: ticket?.date || 'Sin fecha', badge: isFutureDateKey(ticket?.date) ? 'Manana' : 'Hoy', tone: isFutureDateKey(ticket?.date) ? 'future' : 'today' },
        { label: 'Actualizado', value: formatDateTime(ticket?.generatedAt), badge: 'Sync', tone: 'subtle' },
        { label: 'Composicion', value: `${stats.totalLegs} legs | ${stats.propLegs} props`, badge: `${stats.availableTickets}/${stats.totalTickets || stats.availableTickets} activos`, tone: 'subtle' },
        { label: 'Estado', value: 'Pendiente', badge: 'Pendiente', tone: 'pending' },
    ];

    return `
        <section class="ticket-context-strip">
            ${contextItems.map((item) => `
                <article class="ticket-context-chip">
                    <span>${escapeHtml(item.label)}</span>
                    <strong>${escapeHtml(item.value)}</strong>
                    <em class="ui-badge ${escapeHtml(item.tone)}">${escapeHtml(item.badge)}</em>
                </article>
            `).join('')}
        </section>
    `;
}

function buildAvoidMarketsBand(ticket) {
    const avoidItems = Array.isArray(ticket?.avoid)
        ? ticket.avoid.filter(Boolean).slice(0, 6)
        : [];

    return `
        <section class="risk-control-band">
            <div class="risk-control-head">
                <div>
                    <p class="panel-kicker">Riesgo controlado</p>
                    <h4>Mercados a evitar</h4>
                </div>
                <span class="ui-badge advisory">${avoidItems.length ? 'Filtro activo' : 'Analisis limpio'}</span>
            </div>
            <div class="risk-control-chip-row">
                ${avoidItems.length
                    ? avoidItems.map((item) => `<span class="risk-control-chip">${escapeHtml(item)}</span>`).join('')
                    : '<span class="risk-control-copy">Sin mercados evitados por ahora. Analisis limpio.</span>'}
            </div>
        </section>
    `;
}

function summarizeWarningChip(text) {
    const value = String(text || '').trim();
    if (!value) {
        return '';
    }

    return value.length > 38 ? `${value.slice(0, 35).trim()}...` : value;
}

function getLegPreviewText(leg) {
    const whyText = String(leg?.why || leg?.reason || '').trim();
    if (!whyText) {
        return 'Analisis compacto disponible para esta jugada.';
    }

    return whyText.length > 92 ? `${whyText.slice(0, 89).trim()}...` : whyText;
}

function getMarketLabel(leg) {
    const market = String(leg?.market || '').toLowerCase();

    if (market === 'h2h') {
        return 'ML';
    }
    if (market === 'spreads') {
        return 'Spread';
    }
    if (market === 'totals') {
        return 'Total';
    }
    if (market.includes('pitcher_strikeouts')) {
        return 'K Prop';
    }
    if (market.includes('batter_hits')) {
        return 'Hit Prop';
    }
    if (market.includes('total_bases')) {
        return 'TB Prop';
    }
    if (market.includes('home_runs') || market.includes('hrr')) {
        return 'HR Prop';
    }
    if (market.includes('rbis')) {
        return 'RBI Prop';
    }
    if (market.includes('runs')) {
        return 'Runs Prop';
    }

    return market ? market.replace(/_/g, ' ') : 'Mercado';
}

function getMarketTone(leg) {
    const market = String(leg?.market || '').toLowerCase();

    if (market === 'h2h') {
        return 'moneyline';
    }
    if (market === 'spreads') {
        return 'spread';
    }
    if (market === 'totals') {
        return 'total';
    }
    if (market.includes('pitcher_strikeouts') || market.includes('batter_') || market.includes('player')) {
        return 'prop';
    }

    return 'generic';
}

function formatConfidence(confidence) {
    const numeric = Number(confidence);
    if (!Number.isFinite(numeric)) {
        return 'Conf. n/d';
    }

    return `Conf. ${Math.round(numeric)}`;
}

function getConfidenceTone(confidence) {
    const numeric = Number(confidence);
    if (!Number.isFinite(numeric)) {
        return 'medium';
    }
    if (numeric >= 75) {
        return 'high';
    }
    if (numeric >= 55) {
        return 'medium';
    }
    return 'low';
}

function getRiskTone(ticket) {
    const risk = String(ticket?.risk || ticket?.riskLevel || '').toLowerCase();
    if (risk.includes('low') || risk.includes('bajo')) {
        return 'low';
    }
    if (risk.includes('high') || risk.includes('alto')) {
        return 'high';
    }
    return 'medium';
}

function getAllScoreboardGames(scoreboard) {
    if (!scoreboard || typeof scoreboard !== 'object') {
        return [];
    }

    const todayGames = Array.isArray(scoreboard?.today?.games)
        ? scoreboard.today.games
        : Array.isArray(scoreboard?.games) ? scoreboard.games : [];
    const tomorrowGames = Array.isArray(scoreboard?.tomorrow?.games) ? scoreboard.tomorrow.games : [];

    return [...todayGames, ...tomorrowGames].filter(Boolean);
}

function buildScoreboardInsightContext(scoreboard) {
    const dashboard = dailyTicketDashboard || {};
    const ticketEntries = collectScoreboardInsightTickets(dashboard);
    const legReferences = ticketEntries.flatMap((entry) => collectTicketLegReferences(entry));

    return {
        ticketEntries,
        legReferences,
        scoreboardGames: getAllScoreboardGames(scoreboard || dashboard.games),
        sourceLabel: getSourceLabel(dailyTicketSourceState),
    };
}

function collectScoreboardInsightTickets(dashboard) {
    const entries = [
        dashboard?.todayTicket || null,
        dashboard?.upcomingTicket || null,
        dashboard?.ticket || null,
    ];

    if (!entries.some((ticket) => hasRenderableTicket(ticket)) && hasRenderableTicket(dailyTicketActiveTicket)) {
        entries.push(dailyTicketActiveTicket);
    }

    const ticketMap = new Map();

    entries
        .filter((ticket) => hasRenderableTicket(ticket))
        .map((ticket) => sanitizeTicketForDisplay(ticket))
        .forEach((ticket) => {
            const ticketKey = buildScoreboardInsightTicketKey(ticket);
            if (!ticketMap.has(ticketKey)) {
                ticketMap.set(ticketKey, {
                    ticket,
                    ticketKey,
                    sourceLabel: getSourceLabel(dailyTicketSourceState),
                });
            }
        });

    return Array.from(ticketMap.values());
}

function buildScoreboardInsightTicketKey(ticket) {
    return [
        ticket?.date || 'no-date',
        ticket?.generatedAt || 'no-generated-at',
        ticket?.title || 'ticket',
        Array.isArray(ticket?.tickets) ? ticket.tickets.length : 0,
        String(ticket?.summary || '').slice(0, 72),
    ].join('|');
}

function collectTicketLegReferences(entry) {
    const ticket = entry?.ticket;
    const sourceLabel = entry?.sourceLabel || getSourceLabel(dailyTicketSourceState);

    if (!hasRenderableTicket(ticket)) {
        return [];
    }

    return ticket.tickets.flatMap((ticketItem, ticketIndex) => {
        if (ticketItem?.available === false) {
            return [];
        }

        const legs = Array.isArray(ticketItem?.legs) ? ticketItem.legs.filter(Boolean) : [];
        if (!legs.length) {
            return [];
        }

        return legs.map((leg, legIndex) => ({
            leg,
            ticket,
            ticketDate: ticket?.date || '',
            ticketType: ticketItem?.type || 'safe',
            ticketName: ticketItem?.name || `Ticket ${ticketIndex + 1}`,
            ticketIndex,
            legIndex,
            sourceLabel,
        }));
    });
}

function buildGameInsightId(game) {
    const eventId = String(game?.id || game?.eventId || '').trim();
    if (eventId) {
        return `game-insight-${eventId}`;
    }

    return `game-insight-${normalizeEntityKey(game?.awayTeam)}-${normalizeEntityKey(game?.homeTeam)}-${getGameDateKey(game)}`;
}

function getGameDateKey(game) {
    const startTime = game?.startTime;
    if (!startTime) {
        return '';
    }

    const parsed = new Date(startTime);
    if (Number.isNaN(parsed.getTime())) {
        return '';
    }

    return getTimeZoneDateKey(parsed, MAZATLAN_TIME_ZONE);
}

function handleScoreboardInsightInteraction(event) {
    const toggleButton = event.target.closest('[data-game-insight-toggle]');
    if (!toggleButton) {
        return;
    }

    const insightId = toggleButton.dataset.gameInsightToggle || '';
    if (!insightId) {
        return;
    }

    if (expandedGameInsightIds.has(insightId)) {
        expandedGameInsightIds.delete(insightId);
    } else {
        expandedGameInsightIds.add(insightId);
    }

    renderGames(dailyTicketDashboard?.games || null);
}

function findRelatedLegsForGame(game, context) {
    const references = Array.isArray(context?.legReferences) ? context.legReferences : [];
    return references.filter((reference) => isLegReferenceForGame(reference, game));
}

function isLegReferenceForGame(reference, game) {
    const leg = reference?.leg;
    if (!leg || !game) {
        return false;
    }

    const legEventId = String(leg?.eventId || leg?.gameId || '').trim();
    const gameEventId = String(game?.id || game?.eventId || '').trim();
    if (legEventId && gameEventId) {
        return legEventId === gameEventId;
    }

    const ticketDate = String(reference?.ticketDate || '').trim();
    const gameDateKey = getGameDateKey(game);
    if (ticketDate && gameDateKey && ticketDate !== gameDateKey) {
        return false;
    }

    return Boolean(findScoreboardGameForLeg(leg, [game]));
}

function getGameInsight(game, context) {
    const relatedLegs = findRelatedLegsForGame(game, context);

    if (!relatedLegs.length) {
        return {
            hasInsight: false,
            headline: 'AI Lean',
            lean: 'Sin tendencia fuerte',
            market: '',
            risk: '',
            confidence: null,
            chips: [],
            details: {
                sourceState: 'Sin tendencia fuerte',
                reason: 'No hay pick relacionado en ticket o cache para este juego.',
                warnings: [],
                ticketName: '',
                market: '',
                odds: '',
            },
        };
    }

    const primaryReference = selectPrimaryInsightReference(relatedLegs);
    const leg = primaryReference?.leg || {};
    const confidence = Number.isFinite(Number(leg?.confidence)) ? Number(leg.confidence) : null;
    const risk = resolveInsightRiskLabel(leg, confidence);
    const marketLabel = getMarketLabel(leg);
    const warnings = buildGameInsightWarnings(leg);
    const chips = buildGameInsightChips(primaryReference, relatedLegs, confidence);

    return {
        hasInsight: true,
        headline: confidence !== null && confidence >= 74
            ? 'Tendencia fuerte'
            : (leg?.protected ? 'Lean protegido' : 'AI Lean'),
        lean: formatInsightLean(leg),
        market: marketLabel,
        risk,
        confidence,
        chips,
        details: {
            sourceState: `Basado en ${primaryReference.ticketName} · ${primaryReference.sourceLabel}`,
            reason: getInsightReasonText(leg),
            warnings,
            ticketName: primaryReference.ticketName,
            market: marketLabel,
            odds: formatInsightOdds(leg),
            confidence,
            risk,
        },
    };
}

function selectPrimaryInsightReference(references) {
    return [...references].sort((left, right) => scoreInsightReference(right) - scoreInsightReference(left))[0] || references[0] || null;
}

function scoreInsightReference(reference) {
    const leg = reference?.leg || {};
    const confidence = Number.isFinite(Number(leg?.confidence)) ? Number(leg.confidence) : 50;
    const ticketTypeBoost = reference?.ticketType === selectedTicketType
        ? 18
        : ({ safe: 10, emi: 7, free_bet: 4 }[reference?.ticketType] || 0);
    const protectionBoost = leg?.protected ? 6 : 0;
    const propBoost = leg?.candidateType === 'player_prop' ? 3 : 0;
    return confidence + ticketTypeBoost + protectionBoost + propBoost;
}

function buildGameInsightChips(reference, relatedLegs, confidence) {
    const chips = [];
    const leg = reference?.leg || {};
    const marketTone = getMarketTone(leg);

    if (reference?.ticketName) {
        chips.push({ label: reference.ticketName, tone: 'subtle' });
    }

    chips.push({ label: getMarketLabel(leg), tone: marketTone === 'prop' ? 'accent' : 'subtle' });

    if (leg?.protected) {
        chips.push({ label: 'Protegido', tone: 'success' });
    }

    if (Number.isFinite(confidence)) {
        chips.push({ label: formatConfidence(confidence), tone: getConfidenceTone(confidence) });
    }

    if (Array.isArray(relatedLegs) && relatedLegs.length > 1) {
        chips.push({ label: `${relatedLegs.length} lecturas`, tone: 'subtle' });
    }

    return chips.slice(0, 4);
}

function formatInsightLean(leg) {
    const pick = String(leg?.pick || 'Lean disponible').trim();
    const market = String(leg?.market || '').toLowerCase();
    if (leg?.protected && market === 'spreads' && !/\bproteg/i.test(pick)) {
        return `${pick} protegido`;
    }

    return pick;
}

function resolveInsightRiskLabel(leg, confidence) {
    const explicitRisk = String(leg?.risk || leg?.riskLevel || '').trim();
    if (explicitRisk) {
        return explicitRisk;
    }

    const voidRisk = String(leg?.voidRisk || '').toLowerCase();
    if (voidRisk === 'low') {
        return 'Riesgo bajo';
    }
    if (voidRisk === 'high') {
        return 'Riesgo alto';
    }
    if (voidRisk === 'medium') {
        return 'Riesgo medio';
    }

    if (!Number.isFinite(confidence)) {
        return 'Riesgo medio';
    }
    if (confidence >= 72) {
        return 'Riesgo bajo';
    }
    if (confidence >= 58) {
        return 'Riesgo medio';
    }
    return 'Riesgo alto';
}

function buildGameInsightWarnings(leg) {
    const warnings = new Set();

    if (leg?.protectionReason) {
        warnings.add(leg.protectionReason);
    } else if (leg?.marketProtectionApplied === true || leg?.protected === true) {
        warnings.add('Mercado protegido aplicado para juego cerrado.');
    }

    if (leg?.lineupRequired) {
        warnings.add('Depende de confirmar lineup o pitcher abridor.');
    }

    if (leg?.voidRisk && String(leg.voidRisk).toLowerCase() !== 'low') {
        warnings.add(`Void risk ${String(leg.voidRisk).toLowerCase()}.`);
    }

    if (leg?.historicalInfluenceApplied && leg?.historicalInfluenceReason) {
        warnings.add(leg.historicalInfluenceReason);
    }

    const ruleWarnings = Array.isArray(leg?.ruleWarnings) ? leg.ruleWarnings.filter(Boolean) : [];
    ruleWarnings.forEach((warning) => warnings.add(warning));

    return Array.from(warnings).slice(0, 4);
}

function getInsightReasonText(leg) {
    const whyText = String(leg?.why || leg?.reason || '').trim();
    if (whyText) {
        return whyText.length > 150 ? `${whyText.slice(0, 147).trim()}...` : whyText;
    }

    if (leg?.protectionReason) {
        return leg.protectionReason;
    }

    return 'Lectura basada en ticket, mercado verificado y cache local.';
}

function formatInsightOdds(leg) {
    const odds = leg?.odds ?? leg?.oddsDecimal ?? '';
    if (odds === '' || odds === null || odds === undefined) {
        return 'n/d';
    }

    return String(odds);
}

function renderGameInsightMini(game, insight) {
    const insightId = buildGameInsightId(game);
    const isExpanded = expandedGameInsightIds.has(insightId);
    const chips = Array.isArray(insight?.chips) ? insight.chips : [];
    const metaParts = [];

    if (typeof insight?.confidence === 'number' && Number.isFinite(insight.confidence)) {
        metaParts.push(`Confianza ${Math.round(insight.confidence)}`);
    }

    if (insight?.risk) {
        metaParts.push(insight.risk);
    }

    const metaText = metaParts.join(' · ');

    return `
        <section class="game-insight-mini ${insight?.hasInsight ? 'has-insight' : 'is-empty'}">
            <div class="game-insight-head">
                <span class="game-insight-label">${escapeHtml(insight?.headline || 'AI Lean')}</span>
                ${insight?.hasInsight
                    ? '<span class="game-insight-badge">Lectura activa</span>'
                    : '<span class="game-insight-badge is-muted">Sin señal</span>'}
            </div>
            <strong class="game-insight-lean">${escapeHtml(insight?.lean || 'Sin tendencia fuerte')}</strong>
            <div class="game-insight-copy ${insight?.hasInsight ? '' : 'game-insight-empty'}">
                ${escapeHtml(metaText || 'Sin pick relacionado en ticket/cache.')}
            </div>
            ${chips.length ? `
                <div class="game-insight-chip-row">
                    ${chips.map((chip) => `<span class="game-insight-chip scorebug-chip ${escapeHtml(chip?.tone || 'subtle')}">${escapeHtml(chip?.label || '')}</span>`).join('')}
                </div>
            ` : ''}
            <button
                type="button"
                class="game-insight-toggle"
                data-game-insight-toggle="${escapeHtml(insightId)}"
                aria-expanded="${isExpanded ? 'true' : 'false'}"
            >
                ${isExpanded ? 'Ocultar tendencias' : 'Ver tendencias'}
            </button>
            ${isExpanded ? renderGameInsightDetails(insight) : ''}
        </section>
    `;
}

function renderGameInsightDetails(insight) {
    const details = insight?.details || {};
    const warnings = Array.isArray(details.warnings) ? details.warnings : [];

    return `
        <div class="game-insight-details">
            <div class="game-insight-details-grid">
                <div>
                    <span>Pick relacionado</span>
                    <strong>${escapeHtml(insight?.hasInsight ? (insight?.lean || 'Sin tendencia fuerte') : 'Sin tendencia fuerte')}</strong>
                </div>
                <div>
                    <span>Mercado</span>
                    <strong>${escapeHtml(details.market || (insight?.hasInsight ? 'Mercado verificado' : 'Sin mercado'))}</strong>
                </div>
                <div>
                    <span>Momio</span>
                    <strong>${escapeHtml(details.odds || 'n/d')}</strong>
                </div>
                <div>
                    <span>Estado</span>
                    <strong>${escapeHtml(details.sourceState || 'Sin tendencia fuerte')}</strong>
                </div>
            </div>
            <p class="game-insight-details-copy">${escapeHtml(details.reason || 'Sin tendencia fuerte')}</p>
            ${warnings.length ? `
                <div class="game-insight-warning-row">
                    ${warnings.map((warning) => `<span class="game-insight-chip scorebug-chip warning">${escapeHtml(summarizeWarningChip(warning))}</span>`).join('')}
                </div>
            ` : ''}
        </div>
    `;
}

function getLegVisual(leg, scoreboardGames) {
    const matchedGame = findScoreboardGameForLeg(leg, scoreboardGames);
    const explicitPlayerPhoto = leg?.headshot || leg?.photo || leg?.playerPhoto || leg?.imageUrl || '';
    const playerName = String(leg?.playerName || extractPlayerNameFromLeg(leg) || '').trim();
    const candidateTeam = resolveLegCandidateTeam(leg, matchedGame);
    const market = String(leg?.market || '').toLowerCase();

    if (explicitPlayerPhoto) {
        return {
            kind: 'player',
            imageUrl: explicitPlayerPhoto,
            label: playerName || candidateTeam || leg?.pick || 'Jugador',
            fallback: getTeamInitials(playerName || candidateTeam || leg?.pick || 'Jugador'),
        };
    }

    if (candidateTeam) {
        const teamSide = resolveScoreboardGameSideByTeam(matchedGame, candidateTeam);
        const teamLogo = teamSide ? matchedGame?.[`${teamSide}Logo`] || '' : '';

        return {
            kind: 'team',
            imageUrl: teamLogo,
            label: candidateTeam,
            fallback: getTeamInitials(candidateTeam),
        };
    }

    if (matchedGame && (market === 'totals' || !playerName)) {
        return {
            kind: 'matchup',
            awayTeam: matchedGame.awayTeam || 'Visitante',
            homeTeam: matchedGame.homeTeam || 'Local',
            awayLogo: matchedGame.awayLogo || '',
            homeLogo: matchedGame.homeLogo || '',
        };
    }

    if (playerName) {
        return {
            kind: 'player',
            imageUrl: '',
            label: playerName,
            fallback: getTeamInitials(playerName),
        };
    }

    return {
        kind: 'team',
        imageUrl: '',
        label: leg?.pick || 'Pick',
        fallback: getTeamInitials(leg?.pick || 'Pick'),
    };
}

function renderLegVisualAvatar(visual, leg) {
    const tone = getMarketTone(leg);
    const protectionDot = leg?.protected ? '<span class="leg-protection-dot" aria-hidden="true"></span>' : '';

    if (visual?.kind === 'matchup') {
        return `
            <div class="leg-avatar-shell matchup ${escapeHtml(tone)} ${leg?.protected ? 'is-protected' : ''}">
                <span class="leg-avatar-mini away">
                    ${renderAvatarMedia(visual.awayLogo, visual.awayTeam, getTeamInitials(visual.awayTeam), 'leg-avatar-media')}
                </span>
                <span class="leg-avatar-mini home">
                    ${renderAvatarMedia(visual.homeLogo, visual.homeTeam, getTeamInitials(visual.homeTeam), 'leg-avatar-media')}
                </span>
                ${protectionDot}
            </div>
        `;
    }

    return `
        <div class="leg-avatar-shell ${escapeHtml(tone)} ${leg?.protected ? 'is-protected' : ''}">
            ${renderAvatarMedia(visual?.imageUrl || '', visual?.label || 'Leg', visual?.fallback || 'LG', 'leg-avatar-media')}
            ${protectionDot}
        </div>
    `;
}

function renderAvatarMedia(imageUrl, label, fallback, className = '') {
    const safeClassName = className ? ` ${className}` : '';

    if (imageUrl) {
        return `<span class="leg-avatar${safeClassName}"><img src="${imageUrl}" alt="${escapeHtml(label)}" loading="lazy" data-fallback="${escapeHtml(fallback)}" onerror="const host=this.parentElement; host.classList.add('is-fallback'); host.textContent=this.dataset.fallback || 'NA';"></span>`;
    }

    return `<span class="leg-avatar is-fallback${safeClassName}">${escapeHtml(fallback)}</span>`;
}

function findScoreboardGameForLeg(leg, scoreboardGames) {
    const games = Array.isArray(scoreboardGames) ? scoreboardGames : [];
    if (!games.length) {
        return null;
    }

    const legEventId = String(leg?.eventId || leg?.gameId || '').trim();
    if (legEventId) {
        const byEventId = games.find((game) => String(game?.id || game?.eventId || '').trim() === legEventId);
        if (byEventId) {
            return byEventId;
        }
    }

    const matchupTeams = extractMatchupTeams(leg?.game);
    if (matchupTeams.length === 2) {
        const byMatchup = games.find((game) => {
            const gameTeams = [game?.awayTeam, game?.homeTeam].filter(Boolean);
            return matchupTeams.every((team) => gameTeams.some((gameTeam) => namesLooselyMatch(team, gameTeam)));
        });
        if (byMatchup) {
            return byMatchup;
        }
    }

    const candidateTeam = resolveLegCandidateTeam(leg);
    if (candidateTeam) {
        return games.find((game) => resolveScoreboardGameSideByTeam(game, candidateTeam));
    }

    return null;
}

function resolveLegCandidateTeam(leg, matchedGame = null) {
    const explicitTeam = String(leg?.candidateTeam || leg?.team || '').trim();
    if (explicitTeam) {
        return explicitTeam;
    }

    const pickTeam = extractTeamNameFromPick(leg);
    if (pickTeam) {
        return pickTeam;
    }

    const matchupTeams = extractMatchupTeams(leg?.game);
    if (matchedGame && matchupTeams.length === 1) {
        return matchupTeams[0];
    }

    return '';
}

function extractTeamNameFromPick(leg) {
    const market = String(leg?.market || '').toLowerCase();
    if (!leg?.pick || market === 'totals' || market.includes('pitcher_') || market.includes('batter_') || market.includes('player')) {
        return '';
    }

    return String(leg.pick)
        .replace(/\s+moneyline$/i, '')
        .replace(/\s+ml$/i, '')
        .replace(/\s+[+-]\d+(\.\d+)?$/i, '')
        .trim();
}

function extractPlayerNameFromLeg(leg) {
    const explicitName = String(leg?.playerName || '').trim();
    if (explicitName) {
        return explicitName;
    }

    const market = String(leg?.market || '').toLowerCase();
    if (!(market.includes('pitcher_') || market.includes('batter_') || market.includes('player') || market.includes('runs') || market.includes('rbis') || market.includes('hits'))) {
        return '';
    }

    const pick = String(leg?.pick || '').trim();
    const overUnderMatch = pick.match(/^(.*?)\s+(Over|Under)\s+/i);
    return overUnderMatch ? overUnderMatch[1].trim() : '';
}

function extractMatchupTeams(matchupText) {
    const raw = String(matchupText || '').trim();
    if (!raw) {
        return [];
    }

    return raw
        .split(/\s+vs\.?\s+|\s+@\s+|\s+at\s+/i)
        .map((team) => team.trim())
        .filter(Boolean)
        .slice(0, 2);
}

function resolveScoreboardGameSideByTeam(game, teamName) {
    if (!game || !teamName) {
        return '';
    }

    if (namesLooselyMatch(teamName, game?.awayTeam)) {
        return 'away';
    }
    if (namesLooselyMatch(teamName, game?.homeTeam)) {
        return 'home';
    }

    return '';
}

function namesLooselyMatch(left, right) {
    const normalizedLeft = normalizeEntityKey(left);
    const normalizedRight = normalizeEntityKey(right);

    if (!normalizedLeft || !normalizedRight) {
        return false;
    }

    return normalizedLeft === normalizedRight
        || normalizedLeft.includes(normalizedRight)
        || normalizedRight.includes(normalizedLeft);
}

function normalizeEntityKey(value) {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function handleDailyTicketInteraction(event) {
    const ticketSelectButton = event.target.closest('[data-ticket-select]');
    if (ticketSelectButton) {
        selectedTicketType = ticketSelectButton.dataset.ticketSelect || 'safe';
        expandedLegDetails = new Set();
        renderCurrentTicket(dailyTicketActiveTicket);
        return;
    }

    const legToggleButton = event.target.closest('[data-leg-toggle]');
    if (legToggleButton) {
        toggleLegDetails(legToggleButton.dataset.legToggle);
    }
}

function toggleLegDetails(legId) {
    if (!legId) {
        return;
    }

    if (expandedLegDetails.has(legId)) {
        expandedLegDetails.delete(legId);
    } else {
        expandedLegDetails.add(legId);
    }

    renderCurrentTicket(dailyTicketActiveTicket);
}

function renderTicketMeta(ticket) {
    if (!dailyTicketTicketMeta) {
        return;
    }

    if (!ticket) {
        dailyTicketTicketMeta.innerHTML = `
            <div class="empty-inline rich">
                <strong>Esperando ticket activo.</strong>
                <p>Cuando exista cache o una generacion nueva, aqui veras origen, fecha objetivo y notas del slate.</p>
            </div>
        `;
        return;
    }

    const stats = getTicketCompositionStats(ticket);
    const sourceNote = ticket.sourceDateReason === 'today_had_no_bettable_candidates'
        ? 'Hoy no habia slate apostable y se preparo ticket para manana.'
        : 'Ticket asociado al slate actual disponible.';
    const metaWarnings = Array.isArray(ticket.warnings) ? ticket.warnings.slice(0, 3) : [];

    dailyTicketTicketMeta.innerHTML = `
        <div class="metric-list">
            <div class="metric-row">
                <span>Origen</span>
                <strong>${escapeHtml(getSourceLabel(dailyTicketSourceState))}</strong>
            </div>
            <div class="metric-row">
                <span>Fecha objetivo</span>
                <strong>${escapeHtml(ticket.date || 'Sin fecha')}</strong>
            </div>
            <div class="metric-row">
                <span>Actualizado</span>
                <strong>${escapeHtml(formatDateTime(ticket.generatedAt))}</strong>
            </div>
            <div class="metric-row">
                <span>Composicion</span>
                <strong>${escapeHtml(`${stats.totalLegs} legs | ${stats.propLegs} props`)}</strong>
            </div>
        </div>
        <div class="ticket-meta-note">
            <p>${escapeHtml(sourceNote)}</p>
        </div>
        ${metaWarnings.length ? `
            <div class="ticket-meta-warnings">
                ${metaWarnings.map((warning) => `<span class="ticket-card-warning">${escapeHtml(warning)}</span>`).join('')}
            </div>
        ` : ''}
    `;
}

function renderSideSummary(ticket) {
    if (!ticket) {
        dailyTicketSideSummary.innerHTML = `
            <div class="empty-inline rich">
                <strong>Sin resumen ejecutivo todavia.</strong>
                <p>El ultimo ticket aparecera aqui cuando exista cache o una generacion nueva.</p>
            </div>
        `;
        return;
    }

    const stats = getTicketCompositionStats(ticket);
    const futureLabel = ticket.sourceDateReason === 'today_had_no_bettable_candidates'
        ? 'Se preparo ticket para manana por falta de candidatos hoy.'
        : 'Slate activo con picks listos para revisar.';

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
            <div class="metric-row">
                <span>Lectura rapida</span>
                <strong>${escapeHtml(`${stats.availableTickets} tickets | ${stats.totalLegs} legs`)}</strong>
            </div>
        </div>
        <div class="side-summary-copy">
            <p>${escapeHtml(ticket.summary || 'Sin resumen disponible.')}</p>
            <small>${escapeHtml(futureLabel)}</small>
        </div>
    `;
}

function getTicketCompositionStats(ticket) {
    const tickets = Array.isArray(ticket?.tickets) ? ticket.tickets : [];
    const availableTickets = tickets.filter((item) => item?.available !== false && Array.isArray(item?.legs) && item.legs.length > 0);
    const totalLegs = availableTickets.reduce((sum, item) => sum + item.legs.length, 0);
    const propLegs = availableTickets.reduce((sum, item) => {
        const legs = Array.isArray(item.legs) ? item.legs : [];
        return sum + legs.filter((leg) => leg?.candidateType === 'player_prop').length;
    }, 0);

    return {
        totalTickets: tickets.length,
        availableTickets: availableTickets.length,
        totalLegs,
        propLegs,
        ticketNames: availableTickets.map((item) => item?.name || item?.type || 'Ticket').slice(0, 3),
    };
}

function buildHistoryDisplayItems(history, currentTicket) {
    const normalizedHistory = Array.isArray(history)
        ? history
            .map((ticket, index) => normalizeHistoryItem(sanitizeTicketForDisplay(ticket), index))
            .filter(Boolean)
        : [];

    if (normalizedHistory.length) {
        return normalizedHistory;
    }

    if (!hasRenderableTicket(currentTicket)) {
        return [];
    }

    return [normalizeHistoryItem(currentTicket, 0, {
        forcePending: true,
        sourceLabel: getSourceLabel(dailyTicketSourceState),
    })];
}

function normalizeHistoryItem(ticket, index, options = {}) {
    if (!ticket || typeof ticket !== 'object') {
        return null;
    }

    const stats = getTicketCompositionStats(ticket);
    const status = normalizeHistoryStatus(ticket, options.forcePending === true);
    const previewPicks = extractHistoryPreviewPicks(ticket);
    const sourceLabel = options.sourceLabel || getHistorySourceLabel(ticket);
    const summary = String(ticket.summary || '').trim()
        || `${stats.availableTickets || stats.totalTickets} tickets | ${stats.totalLegs} legs`;

    return {
        id: `${ticket.date || 'no-date'}-${ticket.title || 'ticket'}-${index}`,
        historyIndex: index,
        rawTicket: ticket,
        date: ticket.date || getLocalDateKey(),
        title: ticket.title || 'Ticket del Dia',
        summary,
        statusKey: status.key,
        statusLabel: status.label,
        statusTone: status.tone,
        sourceLabel,
        sourceTone: getHistorySourceTone(sourceLabel),
        ticketsCount: stats.availableTickets || stats.totalTickets,
        legsCount: stats.totalLegs,
        previewPicks,
        netProfit: getNumericValue(ticket.netProfit),
        payout: getNumericValue(ticket.payout),
        stake: getNumericValue(ticket.stake),
        isPendingEntry: status.key === 'pending',
    };
}

function normalizeHistoryStatus(ticket, forcePending = false) {
    if (forcePending) {
        return { key: 'pending', label: 'Pendiente', tone: 'pending' };
    }

    const rawStatus = String(
        ticket?.computedResult
        || ticket?.result
        || ticket?.status
        || ticket?.settlementType
        || ''
    ).toLowerCase();

    if (rawStatus.includes('won')) {
        return { key: 'won', label: 'Ganado', tone: 'won' };
    }
    if (rawStatus.includes('lost')) {
        return { key: 'lost', label: 'Perdido', tone: 'lost' };
    }
    if (
        rawStatus.includes('void')
        || rawStatus.includes('push')
        || rawStatus.includes('refund')
        || rawStatus.includes('cancel')
        || rawStatus.includes('postponed')
    ) {
        return { key: 'void', label: 'Void / Push', tone: 'void' };
    }

    return { key: 'pending', label: 'Pendiente', tone: 'pending' };
}

function getHistorySourceLabel(ticket) {
    const source = String(ticket?.source || ticket?.sourceLabel || '').toLowerCase();

    if (source.includes('generated')) {
        return 'Generado';
    }
    if (source.includes('fallback')) {
        return 'Fallback';
    }
    if (source.includes('cache')) {
        return 'Cache';
    }

    return 'Pendiente';
}

function getHistorySourceTone(sourceLabel) {
    const source = String(sourceLabel || '').toLowerCase();
    if (source.includes('generado')) {
        return 'generated';
    }
    if (source.includes('fallback')) {
        return 'advisory';
    }
    if (source.includes('cache')) {
        return 'cache';
    }
    return 'subtle';
}

function extractHistoryPreviewPicks(ticket) {
    const ticketGroups = Array.isArray(ticket?.tickets) ? ticket.tickets : [];

    return ticketGroups
        .flatMap((item) => Array.isArray(item?.legs) ? item.legs : [])
        .filter((leg) => leg?.pick)
        .slice(0, 3)
        .map((leg) => leg.pick);
}

function buildHistoryStats(items) {
    const list = Array.isArray(items) ? items : [];
    const totals = {
        total: list.length,
        pending: 0,
        won: 0,
        lost: 0,
        void: 0,
        totalStake: 0,
        totalPayout: 0,
        totalNetProfit: 0,
        stakeSamples: 0,
        payoutSamples: 0,
        profitSamples: 0,
    };

    list.forEach((item) => {
        if (item?.statusKey && totals[item.statusKey] !== undefined) {
            totals[item.statusKey] += 1;
        }

        if (Number.isFinite(item?.stake)) {
            totals.totalStake += item.stake;
            totals.stakeSamples += 1;
        }
        if (Number.isFinite(item?.payout)) {
            totals.totalPayout += item.payout;
            totals.payoutSamples += 1;
        }
        if (Number.isFinite(item?.netProfit)) {
            totals.totalNetProfit += item.netProfit;
            totals.profitSamples += 1;
        }
    });

    const roi = totals.totalStake > 0 && totals.profitSamples > 0
        ? ((totals.totalNetProfit / totals.totalStake) * 100)
        : null;

    return {
        totalTickets: totals.total,
        pending: totals.pending,
        won: totals.won,
        lost: totals.lost,
        void: totals.void,
        totalStake: totals.stakeSamples ? totals.totalStake : null,
        totalPayout: totals.payoutSamples ? totals.totalPayout : null,
        netProfit: totals.profitSamples ? totals.totalNetProfit : null,
        roi,
    };
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
    renderedHistoryItems = Array.isArray(history) ? history : [];

    if (!renderedHistoryItems.length) {
        dailyTicketHistory.innerHTML = '<div class="empty-inline rich">No hay historial de tickets todavia.</div>';
        return;
    }

    const stats = buildHistoryStats(renderedHistoryItems);
    const filteredItems = getFilteredHistoryItems(renderedHistoryItems, historyFilterState);

    dailyTicketHistory.innerHTML = `
        <div class="history-stats-grid">
            ${renderHistoryStatCard('Tickets registrados', String(stats.totalTickets), 'Vista local')}
            ${renderHistoryStatCard('Pendientes', String(stats.pending), 'Sin liquidar')}
            ${renderHistoryStatCard('Ganados', String(stats.won), 'Settled')}
            ${renderHistoryStatCard('Perdidos', String(stats.lost), 'Settled')}
            ${renderHistoryStatCard('ROI', formatHistoryMetric(stats.roi, '%'), stats.roi === null ? 'Sin liquidar' : 'Real')}
            ${renderHistoryStatCard('Net profit', formatHistoryMetric(stats.netProfit), stats.netProfit === null ? 'Pendiente' : 'Acumulado')}
        </div>
        <div class="history-filter-row">
            ${renderHistoryFilterButton('all', 'Todos', stats.totalTickets)}
            ${renderHistoryFilterButton('pending', 'Pendientes', stats.pending)}
            ${renderHistoryFilterButton('won', 'Ganados', stats.won)}
            ${renderHistoryFilterButton('lost', 'Perdidos', stats.lost)}
            ${renderHistoryFilterButton('void', 'Void / Push', stats.void)}
        </div>
        <div class="history-list">
            ${filteredItems.length
                ? filteredItems.map((ticket, index) => renderHistoryTicketCard(ticket, index)).join('')
                : '<div class="empty-inline rich">No hay tickets para este filtro.</div>'}
        </div>
    `;
}

function renderHistoryStatCard(label, value, caption) {
    return `
        <article class="history-stat-card">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(value)}</strong>
            <small>${escapeHtml(caption)}</small>
        </article>
    `;
}

function renderHistoryFilterButton(filterKey, label, count) {
    return `
        <button
            type="button"
            class="history-filter-chip ${historyFilterState === filterKey ? 'active' : ''}"
            data-history-filter="${escapeHtml(filterKey)}"
        >
            ${escapeHtml(label)} (${escapeHtml(String(count || 0))})
        </button>
    `;
}

function renderHistoryTicketCard(ticket, index) {
    const hasPreview = hasRenderableTicket(ticket.rawTicket);
    const isExpanded = expandedHistoryPreviewId === ticket.id;
    const archiveSerial = buildTicketSerial(ticket.date || getLocalDateKey(), `arc${index + 1}`);

    return `
        <article class="history-ticket-card archive-slip-card ${escapeHtml(ticket.statusTone)}">
            <div class="history-ticket-top">
                <div>
                    <span class="history-ticket-serial">${escapeHtml(archiveSerial)}</span>
                    <strong>${escapeHtml(ticket.date || '')}</strong>
                    <h4>${escapeHtml(ticket.title || 'Ticket del Dia')}</h4>
                </div>
                <div class="history-ticket-badges">
                    <span class="ui-badge ${escapeHtml(ticket.statusTone)}">${escapeHtml(ticket.statusLabel)}</span>
                    <span class="ui-badge ${escapeHtml(ticket.sourceTone)}">${escapeHtml(ticket.sourceLabel)}</span>
                </div>
            </div>
            <div class="history-ticket-metrics">
                <span>${escapeHtml(`${ticket.ticketsCount || 0} tickets`)}</span>
                <span>${escapeHtml(`${ticket.legsCount || 0} legs`)}</span>
                <span>${escapeHtml(ticket.netProfit === null ? 'Sin liquidar' : formatHistoryMetric(ticket.netProfit))}</span>
            </div>
            <p>${escapeHtml(ticket.summary || 'Sin resumen.')}</p>
            ${ticket.previewPicks.length ? `
                <div class="history-preview-row">
                    ${ticket.previewPicks.map((pick) => `<span class="history-preview-pill">${escapeHtml(pick)}</span>`).join('')}
                </div>
            ` : ''}
            <div class="history-ticket-actions">
                <button
                    type="button"
                    class="btn btn-ghost history-view-btn"
                    data-history-preview="${escapeHtml(ticket.id)}"
                    ${hasPreview ? '' : 'disabled'}
                >
                    ${isExpanded ? 'Ocultar preview' : 'Ver ticket'}
                </button>
                ${hasPreview ? `
                    <button
                        type="button"
                        class="btn btn-secondary history-open-btn"
                        data-history-open="${escapeHtml(String(ticket.historyIndex ?? index))}"
                    >
                        Abrir vista completa
                    </button>
                ` : ''}
            </div>
            ${isExpanded ? renderHistoryPreviewSlip(ticket.rawTicket) : ''}
        </article>
    `;
}

function renderHistoryPreviewSlip(rawTicket) {
    const ticket = sanitizeTicketForDisplay(rawTicket);
    const previewTicket = resolveHistoryPreviewTicketGroup(ticket);
    if (!previewTicket) {
        return '<div class="empty-inline rich">No hay legs disponibles para este ticket.</div>';
    }

    const legs = Array.isArray(previewTicket?.legs) ? previewTicket.legs : [];

    return `
        <div class="history-ticket-preview">
            <div class="history-preview-slip-head">
                <div>
                    <p class="panel-kicker">Preview rapido</p>
                    <h5>${escapeHtml(previewTicket?.name || 'Ticket')}</h5>
                </div>
                <div class="history-preview-badges">
                    <span class="ui-badge subtle">${escapeHtml(previewTicket?.odds || previewTicket?.targetOdds || 'Sin rango')}</span>
                    <span class="risk-pill ${escapeHtml(getRiskTone(previewTicket))}">${escapeHtml(previewTicket?.risk || previewTicket?.riskLevel || 'Sin riesgo')}</span>
                </div>
            </div>
            <div class="history-preview-legs">
                ${legs.map((leg, index) => renderHistoryPreviewLeg(leg, index)).join('')}
            </div>
        </div>
    `;
}

function resolveHistoryPreviewTicketGroup(ticket) {
    const ticketGroups = Array.isArray(ticket?.tickets) ? ticket.tickets : [];
    const availableGroups = ticketGroups.filter((item) => item?.available !== false && Array.isArray(item?.legs) && item.legs.length);

    if (!availableGroups.length) {
        return null;
    }

    return availableGroups.find((item) => item?.type === 'safe')
        || availableGroups.find((item) => item?.type === 'emi')
        || availableGroups[0];
}

function renderHistoryPreviewLeg(leg, index) {
    const visual = getLegVisual(leg, getAllScoreboardGames(dailyTicketDashboard?.games));

    return `
        <article class="history-preview-leg">
            <div class="history-preview-leg-visual">
                ${renderLegVisualAvatar(visual, leg)}
                <span class="history-preview-leg-index">${index + 1}</span>
            </div>
            <div class="history-preview-leg-copy">
                <strong>${escapeHtml(leg?.pick || 'Pick sin nombre')}</strong>
                <span>${escapeHtml(leg?.game || 'Juego sin nombre')}</span>
            </div>
            <div class="history-preview-leg-meta">
                <span class="market-pill ${escapeHtml(getMarketTone(leg))}">${escapeHtml(getMarketLabel(leg))}</span>
                <strong>${escapeHtml(leg?.odds || '-')}</strong>
            </div>
        </article>
    `;
}

function getFilteredHistoryItems(items, filterKey) {
    const list = Array.isArray(items) ? items : [];
    if (filterKey === 'all') {
        return list;
    }

    return list.filter((item) => item?.statusKey === filterKey);
}

function formatHistoryMetric(value, suffix = '') {
    if (!Number.isFinite(value)) {
        return suffix ? `Sin dato${suffix}` : 'Sin dato';
    }

    const formatted = Number(value).toLocaleString('es-MX', {
        maximumFractionDigits: 1,
        minimumFractionDigits: Math.abs(value) < 10 && !Number.isInteger(value) ? 1 : 0,
    });

    return suffix ? `${formatted}${suffix}` : `${formatted}`;
}

function getNumericValue(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
}

function handleHistoryInteraction(event) {
    const filterButton = event.target.closest('[data-history-filter]');
    if (filterButton) {
        historyFilterState = filterButton.dataset.historyFilter || 'all';
        renderHistory(renderedHistoryItems);
        return;
    }

    const previewButton = event.target.closest('[data-history-preview]');
    if (previewButton) {
        const previewId = previewButton.dataset.historyPreview || '';
        expandedHistoryPreviewId = expandedHistoryPreviewId === previewId ? null : previewId;
        renderHistory(renderedHistoryItems);
        return;
    }

    const viewButton = event.target.closest('[data-history-open]');
    if (!viewButton) {
        return;
    }

    const itemIndex = Number(viewButton.dataset.historyOpen);
    const historyItem = renderedHistoryItems[itemIndex];

    if (!historyItem?.rawTicket || !hasRenderableTicket(historyItem.rawTicket)) {
        return;
    }

    dailyTicketPreviewTicket = sanitizeTicketForDisplay(historyItem.rawTicket);
    selectedTicketType = 'safe';
    expandedLegDetails = new Set();
    if (historyItem.sourceLabel) {
        dailyTicketSourceState = normalizeSourceStateFromLabel(historyItem.sourceLabel, dailyTicketSourceState);
    }
    renderDailyTicketDashboard();
    navigateToAppView('daily-ticket', { preservePreview: true });
}

async function loadRecentResults(options = {}) {
    if (!dailyTicketRecentResults || !dailyTicketRecentResultsMeta) {
        return;
    }

    const referenceDateKey = getLocalDateKey();
    const shouldReload = options.force
        || !recentResultsState
        || recentResultsState.referenceDateKey !== referenceDateKey;

    if (!shouldReload) {
        renderRecentResults(recentResultsState);
        return;
    }

    recentResultsState = {
        loading: true,
        referenceDateKey,
        dateKey: null,
        games: [],
        source: 'loading',
        message: '',
    };
    renderRecentResults(recentResultsState);

    const candidateDates = buildRecentResultsDateCandidates();
    let fallbackState = null;

    for (const dateKey of candidateDates) {
        try {
            const scoreboard = await apiCallQuiet(`/api/mlb/scoreboard?date=${encodeURIComponent(dateKey)}`);
            const games = getRecentResultGames(scoreboard);
            const state = {
                loading: false,
                referenceDateKey,
                dateKey,
                games,
                source: scoreboard?.scoreboardSource || scoreboard?.source || 'cache',
                message: scoreboard?.message || '',
            };

            if (games.length) {
                recentResultsState = state;
                renderRecentResults(recentResultsState);
                return;
            }

            fallbackState = state;
        } catch (error) {
            fallbackState = {
                loading: false,
                referenceDateKey,
                dateKey,
                games: [],
                source: 'error',
                message: error.message || 'No se pudieron cargar los resultados recientes.',
            };
        }
    }

    recentResultsState = fallbackState || {
        loading: false,
        referenceDateKey,
        dateKey: candidateDates[0] || null,
        games: [],
        source: 'empty',
        message: 'Sin resultados recientes disponibles.',
    };
    renderRecentResults(recentResultsState);
}

function buildRecentResultsDateCandidates() {
    return [-1, -2, -3].map((offset) => getDateKeyWithOffset(offset));
}

function getRecentResultGames(scoreboard) {
    const baseGames = Array.isArray(scoreboard?.today?.games)
        ? scoreboard.today.games
        : Array.isArray(scoreboard?.games) ? scoreboard.games : [];
    const completedGames = baseGames.filter((game) => game?.isFinal || game?.isPostponed);

    if (completedGames.length) {
        return completedGames;
    }

    return baseGames.filter((game) => !game?.isLive && !game?.isScheduled);
}

function renderRecentResults(state) {
    if (!dailyTicketRecentResults || !dailyTicketRecentResultsMeta) {
        return;
    }

    if (!state || state.loading) {
        dailyTicketRecentResultsMeta.innerHTML = '<div class="recent-results-meta"><span>Buscando ultimo slate cerrado...</span></div>';
        dailyTicketRecentResults.innerHTML = '<div class="skeleton-block side"></div>';
        updateScoreboardTabs();
        return;
    }

    const games = Array.isArray(state.games) ? state.games : [];
    const label = state.dateKey ? formatDateKeyLabel(state.dateKey) : 'Sin fecha';
    const sourceLabel = state.source === 'live' ? 'ESPN live' : 'ESPN cache';

    dailyTicketRecentResultsMeta.innerHTML = `
        <div class="recent-results-meta">
            <span>${escapeHtml(label)}</span>
            <span>${escapeHtml(`${games.length} resultados`)}</span>
            <span>${escapeHtml(sourceLabel)}</span>
        </div>
    `;

    if (!games.length) {
        dailyTicketRecentResults.innerHTML = `
            <div class="empty-inline rich">
                <strong>Sin resultados recientes disponibles.</strong>
                <p>${escapeHtml(state.message || 'No se encontro una fecha reciente con juegos finalizados.')}</p>
            </div>
        `;
        updateScoreboardTabs();
        return;
    }

    dailyTicketRecentResults.innerHTML = `
        <div class="recent-results-list">
            ${games.slice(0, 6).map((game) => renderRecentResultCard(game)).join('')}
        </div>
    `;
    updateScoreboardTabs();
}

function renderRecentResultCard(game) {
    const statusLabel = game?.isPostponed ? 'Pospuesto' : 'Final';
    const rheMarkup = renderRecentResultRhe(game);

    return `
        <article class="recent-result-card">
            <div class="recent-result-top">
                <span>${escapeHtml(formatGameTime(game.startTime))}</span>
                <span class="ui-badge ${game?.isPostponed ? 'advisory' : 'cache'}">${escapeHtml(statusLabel)}</span>
            </div>
            <div class="recent-result-matchup">
                <div class="recent-result-team">
                    <div class="recent-result-team-meta">
                        ${renderTeamAvatar(game.awayTeam, game.awayLogo)}
                        <div class="game-team-copy">
                            <strong>${escapeHtml(game.awayTeam || 'Visitante')}</strong>
                            <small>Visitante</small>
                        </div>
                    </div>
                    <span class="recent-result-team-score">${escapeHtml(formatScoreValue(game.awayScore))}</span>
                </div>
                <div class="recent-result-team">
                    <div class="recent-result-team-meta">
                        ${renderTeamAvatar(game.homeTeam, game.homeLogo)}
                        <div class="game-team-copy">
                            <strong>${escapeHtml(game.homeTeam || 'Local')}</strong>
                            <small>Local</small>
                        </div>
                    </div>
                    <span class="recent-result-team-score">${escapeHtml(formatScoreValue(game.homeScore))}</span>
                </div>
            </div>
            ${rheMarkup}
        </article>
    `;
}

function renderRecentResultRhe(game) {
    const innings = getRenderableLinescoreInnings(game?.linescore);

    if (innings.length) {
        return renderGameLinescore(game, { variant: 'compact' });
    }

    const rhe = getCompactRheData(game);

    if (!rhe) {
        const fallbackSummary = getGameBoxscoreSummary(game);
        return fallbackSummary
            ? `
                <div class="recent-result-rhe-note">
                    <strong>Linescore no disponible.</strong>
                    <span>${escapeHtml(fallbackSummary)}</span>
                </div>
            `
            : '';
    }

    return `
        <div class="recent-result-rhe">
            <div class="recent-result-rhe-head">
                <span>Equipo</span>
                <span>R</span>
                <span>H</span>
                <span>E</span>
            </div>
            <div class="recent-result-rhe-row">
                <span>${escapeHtml(rhe.awayLabel)}</span>
                <strong>${escapeHtml(rhe.awayRuns)}</strong>
                <strong>${escapeHtml(rhe.awayHits)}</strong>
                <strong>${escapeHtml(rhe.awayErrors)}</strong>
            </div>
            <div class="recent-result-rhe-row">
                <span>${escapeHtml(rhe.homeLabel)}</span>
                <strong>${escapeHtml(rhe.homeRuns)}</strong>
                <strong>${escapeHtml(rhe.homeHits)}</strong>
                <strong>${escapeHtml(rhe.homeErrors)}</strong>
            </div>
        </div>
    `;
}

function renderGames(scoreboard) {
    if (!scoreboard) {
        if (dailyTicketGamesLiveRefresh) {
            dailyTicketGamesLiveRefresh.hidden = true;
        }
        dailyTicketGamesMeta.innerHTML = '<div class="empty-inline rich">Sin datos de ESPN por ahora.</div>';
        dailyTicketLiveGames.innerHTML = '<div class="empty-inline rich scoreboard-empty">Sin datos en vivo por ahora.</div>';
        dailyTicketGames.innerHTML = '<div class="empty-inline rich scoreboard-empty">Sin datos de juegos de hoy.</div>';
        dailyTicketUpcomingGames.innerHTML = '<div class="empty-inline rich scoreboard-empty">Sin datos de juegos proximos.</div>';
        updateScoreboardTabs();
        return;
    }

    const todayGames = Array.isArray(scoreboard?.today?.games)
        ? scoreboard.today.games
        : Array.isArray(scoreboard?.games) ? scoreboard.games : [];
    const liveGames = todayGames.filter((game) => game?.isLive);
    const todayNonLiveGames = todayGames.filter((game) => !game?.isLive);
    const tomorrowGames = Array.isArray(scoreboard?.tomorrow?.games) ? scoreboard.tomorrow.games : [];
    const totalToday = Number(scoreboard?.todayGamesTotal ?? todayGames.length);
    const liveTotal = Number(scoreboard?.liveGamesTotal ?? liveGames.length);
    const finalTotal = Number(scoreboard?.finalGamesTotal ?? todayGames.filter((game) => game?.isFinal).length);
    const scheduledTotal = Number(scoreboard?.scheduledGamesTotal ?? todayGames.filter((game) => game?.isScheduled).length);
    const postponedTotal = Number(scoreboard?.postponedGamesTotal ?? todayGames.filter((game) => game?.isPostponed).length);
    const tomorrowTotal = Number(scoreboard?.tomorrowGamesTotal ?? tomorrowGames.length);
    const renderedTotal = Number(scoreboard?.renderedGamesTotal ?? (todayGames.length + tomorrowGames.length));
    const liveRefreshEnabled = liveTotal > 0;
    const insightContext = buildScoreboardInsightContext(scoreboard);

    if (dailyTicketGamesLiveRefresh) {
        dailyTicketGamesLiveRefresh.hidden = !liveRefreshEnabled;
    }

    dailyTicketGamesMeta.innerHTML = `
        <div class="scoreboard-meta">
            <div class="scoreboard-meta-top">
                <div>
                    <div class="scoreboard-total">${escapeHtml(`${totalToday} juegos encontrados hoy`)}</div>
                    <div class="scoreboard-breakdown">${escapeHtml(`${finalTotal} finalizados | ${scheduledTotal} programados | ${liveTotal} en vivo | ${postponedTotal} pospuestos`)}</div>
                </div>
                <div class="scoreboard-breakdown">${escapeHtml(`${renderedTotal} juegos visibles entre hoy y manana`)}</div>
            </div>
            <div class="scoreboard-breakdown">Horarios mostrados en America/Mazatlan.</div>
            <div class="scoreboard-breakdown">${escapeHtml(tomorrowTotal > 0 ? `${tomorrowTotal} juegos para manana en cache` : 'Sin juegos programados para manana en cache.')}</div>
            ${isPlayerPropsDiagnosticsEnabled() ? `<div class="scoreboard-debug">Fuente: ${escapeHtml(scoreboard?.scoreboardSource || scoreboard?.source || 'unavailable')} | Last updated: ${escapeHtml(formatDateTime(scoreboard?.lastUpdated))}${liveRefreshEnabled ? ' | Actualizando en vivo cada 60s' : ''}</div>` : ''}
            ${scoreboard?.message ? `<div class="scoreboard-debug">${escapeHtml(scoreboard.message)}</div>` : ''}
        </div>
    `;

    dailyTicketLiveGames.innerHTML = renderScoreboardSection(
        liveGames,
        'No hay juegos en vivo ahora.',
        'Los juegos live se refrescan cada 60 segundos.',
        insightContext
    );
    dailyTicketGames.innerHTML = renderScoreboardSection(
        todayNonLiveGames,
        todayGames.length
            ? 'Todos los juegos de hoy estan en vivo.'
            : (scoreboard?.message || 'No hay juegos disponibles en el cache actual.'),
        'Se muestran todos los juegos del slate disponible.',
        insightContext
    );
    dailyTicketUpcomingGames.innerHTML = renderScoreboardSection(
        tomorrowGames,
        'Sin juegos programados para manana en cache.',
        'Proximos juegos desde ESPN cacheado.',
        insightContext
    );
    updateScoreboardTabs();
}

function renderScoreboardSection(games, emptyMessage, helperText = '', insightContext = null) {
    const list = Array.isArray(games) ? games : [];

    if (!list.length) {
        return `
            <div class="empty-inline rich scoreboard-empty">
                <strong>${escapeHtml(emptyMessage)}</strong>
                ${helperText ? `<p>${escapeHtml(helperText)}</p>` : ''}
            </div>
        `;
    }

    return `
        <div class="games-stack">
            ${list.map((game) => renderGameCard(game, insightContext)).join('')}
        </div>
    `;
}

function renderGameCard(game, insightContext = null) {
    const badgeClass = getGameBadgeClass(game);
    const badgeLabel = getGameBadgeLabel(game);
    const inningLabel = formatInningLabel(game);
    const probablePitchers = renderProbablePitchers(game);
    const linescore = renderGameLinescore(game);
    const insight = getGameInsight(game, insightContext);
    const recordText = Array.isArray(game?.records) && game.records.length
        ? game.records.join(' | ')
        : 'Sin records';

    return `
        <article class="game-card scorebug-card">
            <div class="game-card-top">
                <div class="game-status-block">
                    <strong>${escapeHtml(formatGameTime(game.startTime))}</strong>
                    <small>${escapeHtml(game.statusDescription || game.status || 'Programado')}</small>
                </div>
                <span class="game-badge ${escapeHtml(badgeClass)}">${escapeHtml(badgeLabel)}</span>
            </div>
            <div class="game-card-layout">
                <div class="game-core">
                    <div class="game-team-row">
                        <div class="game-team-meta">
                            ${renderTeamAvatar(game.awayTeam, game.awayLogo)}
                            <div class="game-team-copy">
                                <strong>${escapeHtml(game.awayTeam || 'Visitante')}</strong>
                                <small>Visitante</small>
                            </div>
                        </div>
                        <span class="game-score">${escapeHtml(formatScoreValue(game.awayScore))}</span>
                    </div>
                    <div class="game-team-row">
                        <div class="game-team-meta">
                            ${renderTeamAvatar(game.homeTeam, game.homeLogo)}
                            <div class="game-team-copy">
                                <strong>${escapeHtml(game.homeTeam || 'Local')}</strong>
                                <small>Local</small>
                            </div>
                        </div>
                        <span class="game-score">${escapeHtml(formatScoreValue(game.homeScore))}</span>
                    </div>
                </div>
                <div class="game-detail-list">
                    ${inningLabel ? `<div class="game-detail-item"><strong>Inning:</strong> ${escapeHtml(inningLabel)}</div>` : ''}
                    <div class="game-detail-item"><strong>Venue:</strong> ${escapeHtml(game.venue || 'Sin venue')}</div>
                    <div class="game-detail-item"><strong>Records:</strong> ${escapeHtml(recordText)}</div>
                    ${probablePitchers}
                </div>
                ${renderGameInsightMini(game, insight)}
                ${linescore}
            </div>
        </article>
    `;
}

function getGameBadgeClass(game) {
    if (game?.isLive) {
        return 'live';
    }

    if (game?.isFinal) {
        return 'final';
    }

    if (game?.isPostponed) {
        return 'postponed';
    }

    return 'scheduled';
}

function getGameBadgeLabel(game) {
    if (game?.isLive) {
        return 'Live';
    }

    if (game?.isFinal) {
        return 'Final';
    }

    if (game?.isPostponed) {
        return 'Pospuesto';
    }

    return 'Programado';
}

function formatScoreValue(value) {
    return Number.isFinite(Number(value)) ? String(value) : '--';
}

function formatInningLabel(game) {
    if (game?.isLive !== true) {
        return '';
    }

    const half = String(game?.inningHalf || '').trim();
    const inning = String(game?.inning || '').trim();

    if (half && inning) {
        return `${half} ${inning}`;
    }

    if (inning) {
        return inning;
    }

    return '';
}

function renderProbablePitchers(game) {
    const probables = Array.isArray(game?.probablePitchers) ? game.probablePitchers : [];

    if (!probables.length) {
        return '<div class="game-detail-item"><strong>Probables:</strong> Sin probables cargados.</div>';
    }

    return `
        <div class="game-detail-item">
            <strong>Probables:</strong>
            ${probables.map((item) => `${item.team}: ${item.athlete || 'Pendiente'}${item.record ? ` (${item.record})` : ''}`).join(' | ')}
        </div>
    `;
}

function renderGameLinescore(game, options = {}) {
    const variant = options?.variant === 'compact' ? 'compact' : 'default';
    const linescore = game?.linescore;
    const innings = getRenderableLinescoreInnings(linescore);
    const hasInnings = innings.length > 0;
    const isScheduledGame = game?.isScheduled === true || String(game?.statusType || '').toUpperCase() === 'STATUS_SCHEDULED';

    if (!hasInnings) {
        if (isScheduledGame) {
            return '<div class="game-detail-item">Sin linescore disponible antes del primer lanzamiento.</div>';
        }

        const compactRhe = renderCompactRheFallback(game);
        if (compactRhe) {
            return compactRhe;
        }

        const boxscoreSummary = getGameBoxscoreSummary(game);
        if (boxscoreSummary) {
            return `
                <div class="linescore-fallback">
                    <div class="linescore-fallback-note">Linescore no disponible.</div>
                    <div class="game-detail-item">${escapeHtml(boxscoreSummary)}</div>
                </div>
            `;
        }

        return `
            <div class="linescore-fallback">
                <div class="linescore-fallback-note">Linescore no disponible.</div>
                <div class="game-detail-item">Score final disponible sin detalle completo por entradas en cache.</div>
            </div>
        `;
    }

    return `
        <div class="linescore-wrap ${variant === 'compact' ? 'linescore-wrap-compact' : ''}">
            <table class="linescore-table">
                <thead>
                    <tr>
                        <th>Equipo</th>
                        ${innings.map((inning) => `<th>${escapeHtml(inning)}</th>`).join('')}
                        <th>R</th>
                        <th>H</th>
                        <th>E</th>
                    </tr>
                </thead>
                <tbody>
                    ${renderLinescoreRow({ game, team: linescore.away, side: 'away', innings })}
                    ${renderLinescoreRow({ game, team: linescore.home, side: 'home', innings })}
                </tbody>
            </table>
        </div>
    `;
}

function getRenderableLinescoreInnings(linescore) {
    const sourceInnings = Array.isArray(linescore?.innings) ? linescore.innings.filter(Boolean).map((value) => String(value)) : [];
    const awayCount = Array.isArray(linescore?.away?.inningRuns) ? linescore.away.inningRuns.length : 0;
    const homeCount = Array.isArray(linescore?.home?.inningRuns) ? linescore.home.inningRuns.length : 0;
    const maxCount = Math.max(sourceInnings.length, awayCount, homeCount);

    if (!maxCount) {
        return [];
    }

    return Array.from({ length: maxCount }, (_, index) => sourceInnings[index] || String(index + 1));
}

function renderLinescoreRow({ game, team, side, innings }) {
    const inningRuns = Array.isArray(team?.inningRuns) ? team.inningRuns : [];
    const shortLabel = getLinescoreTeamLabel({ game, side, team });
    const inningCells = innings.map((_, index) => {
        const value = getLinescoreInningCellValue({
            game,
            side,
            inningIndex: index,
            totalInnings: innings.length,
            inningRuns,
        });

        return `<td>${escapeHtml(value)}</td>`;
    }).join('');

    return `
        <tr>
            <td class="linescore-team-cell">${escapeHtml(shortLabel)}</td>
            ${inningCells}
            <td class="linescore-rhe">${escapeHtml(formatLinescoreValue(team?.runs))}</td>
            <td class="linescore-rhe">${escapeHtml(formatLinescoreValue(team?.hits))}</td>
            <td class="linescore-rhe">${escapeHtml(formatLinescoreValue(team?.errors))}</td>
        </tr>
    `;
}

function getLinescoreInningCellValue({ game, side, inningIndex, totalInnings, inningRuns }) {
    const rawValue = inningRuns[inningIndex];
    if (rawValue !== undefined && rawValue !== null && String(rawValue).trim() !== '') {
        return String(rawValue);
    }

    if (
        side === 'home'
        && game?.isFinal === true
        && inningIndex === totalInnings - 1
        && inningRuns.length === totalInnings - 1
    ) {
        return 'X';
    }

    return '-';
}

function getLinescoreTeamLabel({ game, side, team }) {
    const fallbackTeamName = side === 'away' ? (game?.awayTeam || team?.team) : (game?.homeTeam || team?.team);
    const fallbackLogo = side === 'away' ? game?.awayLogo : game?.homeLogo;

    const directAbbreviation = sanitizeTeamAbbreviation(
        team?.abbreviation
        || team?.abbr
        || team?.shortName
        || game?.[`${side}Abbreviation`]
    );

    if (directAbbreviation) {
        return directAbbreviation;
    }

    const logoAbbreviation = getLogoTeamAbbreviation(fallbackLogo);
    if (logoAbbreviation) {
        return logoAbbreviation;
    }

    return getShortTeamNameFallback(fallbackTeamName);
}

function sanitizeTeamAbbreviation(value) {
    const clean = String(value || '').trim().replace(/[^A-Za-z0-9]/g, '');
    if (!clean) {
        return '';
    }

    if (clean.length <= 4) {
        return clean.toUpperCase();
    }

    return '';
}

function getLogoTeamAbbreviation(logoUrl) {
    const match = String(logoUrl || '').match(/\/scoreboard\/([a-z0-9]+)\.(png|svg|jpg|jpeg|webp)/i);
    return match ? match[1].toUpperCase() : '';
}

function getShortTeamNameFallback(teamName) {
    const parts = String(teamName || '')
        .replace(/\./g, '')
        .split(/\s+/)
        .filter(Boolean);

    if (!parts.length) {
        return '---';
    }

    if (parts.length === 1) {
        return parts[0].slice(0, 3).toUpperCase();
    }

    const lastPart = parts[parts.length - 1];
    return lastPart.slice(0, 3).toUpperCase();
}

function renderCompactRheFallback(game) {
    const rhe = getCompactRheData(game);
    if (!rhe) {
        return '';
    }

    return `
        <div class="linescore-fallback">
            <div class="linescore-fallback-head">
                <span>Equipo</span>
                <span>R</span>
                <span>H</span>
                <span>E</span>
            </div>
            <div class="linescore-fallback-grid">
                <div class="linescore-fallback-row">
                    <span>${escapeHtml(rhe.awayName)}</span>
                    <strong>${escapeHtml(rhe.awayRuns)}</strong>
                    <strong>${escapeHtml(rhe.awayHits)}</strong>
                    <strong>${escapeHtml(rhe.awayErrors)}</strong>
                </div>
                <div class="linescore-fallback-row">
                    <span>${escapeHtml(rhe.homeName)}</span>
                    <strong>${escapeHtml(rhe.homeRuns)}</strong>
                    <strong>${escapeHtml(rhe.homeHits)}</strong>
                    <strong>${escapeHtml(rhe.homeErrors)}</strong>
                </div>
            </div>
            <div class="linescore-fallback-note">Linescore no disponible. Se muestra R/H/E compacto.</div>
        </div>
    `;
}

function getCompactRheData(game) {
    const linescore = game?.linescore;
    const away = linescore?.away;
    const home = linescore?.home;

    if (!away || !home) {
        return null;
    }

    const hasAnyRhe = [away?.runs, away?.hits, away?.errors, home?.runs, home?.hits, home?.errors]
        .some((value) => value !== undefined && value !== null && value !== '');

    if (!hasAnyRhe) {
        return null;
    }

    const awayRuns = formatLinescoreValue(away?.runs ?? game?.awayScore);
    const homeRuns = formatLinescoreValue(home?.runs ?? game?.homeScore);
    const awayHits = formatLinescoreValue(away?.hits);
    const homeHits = formatLinescoreValue(home?.hits);
    const awayErrors = formatLinescoreValue(away?.errors);
    const homeErrors = formatLinescoreValue(home?.errors);

    return {
        awayName: away?.team || game?.awayTeam || 'Visitante',
        homeName: home?.team || game?.homeTeam || 'Local',
        awayLabel: getLinescoreTeamLabel({ game, side: 'away', team: away }),
        homeLabel: getLinescoreTeamLabel({ game, side: 'home', team: home }),
        awayRuns,
        awayHits,
        awayErrors,
        homeRuns,
        homeHits,
        homeErrors,
        awayValues: `${awayRuns} / ${awayHits} / ${awayErrors}`,
        homeValues: `${homeRuns} / ${homeHits} / ${homeErrors}`,
    };
}

function getGameBoxscoreSummary(game) {
    const boxscoreSummary = game?.boxscoreSummary;

    if (boxscoreSummary?.away && boxscoreSummary?.home) {
        return `${boxscoreSummary.away} | ${boxscoreSummary.home}`;
    }

    return '';
}

async function apiCallQuiet(endpoint, options = {}) {
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
}

function formatLinescoreValue(value) {
    return Number.isFinite(Number(value)) ? String(value) : '-';
}

function stopScoreboardLivePolling() {
    if (scoreboardLivePollTimer) {
        window.clearInterval(scoreboardLivePollTimer);
        scoreboardLivePollTimer = null;
    }

    if (dailyTicketGamesLiveRefresh) {
        dailyTicketGamesLiveRefresh.hidden = true;
    }
}

function updateScoreboardLivePolling(scoreboard) {
    const hasLiveGames = Number(scoreboard?.liveGamesTotal ?? scoreboard?.today?.live ?? 0) > 0;

    if (!hasLiveGames) {
        stopScoreboardLivePolling();
        return;
    }

    if (dailyTicketGamesLiveRefresh) {
        dailyTicketGamesLiveRefresh.hidden = false;
    }

    if (scoreboardLivePollTimer) {
        return;
    }

    scoreboardLivePollTimer = window.setInterval(() => {
        void refreshLiveScoreboard();
    }, SCOREBOARD_LIVE_REFRESH_MS);
}

async function refreshLiveScoreboard() {
    try {
        const refreshed = await apiCall('/api/mlb/scoreboard?includeTomorrow=true&refreshLive=true');
        if (!dailyTicketDashboard) {
            return;
        }

        dailyTicketDashboard.games = refreshed;
        dailyTicketDashboard.todayGamesTotal = refreshed.todayGamesTotal;
        dailyTicketDashboard.renderedGamesTotal = refreshed.renderedGamesTotal;
        dailyTicketDashboard.liveGamesTotal = refreshed.liveGamesTotal;
        dailyTicketDashboard.finalGamesTotal = refreshed.finalGamesTotal;
        dailyTicketDashboard.scheduledGamesTotal = refreshed.scheduledGamesTotal;
        dailyTicketDashboard.postponedGamesTotal = refreshed.postponedGamesTotal;
        dailyTicketDashboard.tomorrowGamesTotal = refreshed.tomorrowGamesTotal;
        dailyTicketDashboard.scoreboardSource = refreshed.scoreboardSource;
        renderGames(refreshed);
        updateScoreboardLivePolling(refreshed);
    } catch (error) {
        console.error('Live scoreboard refresh failed:', error);
    }
}

function renderDailyTicketSkeleton(mode = 'dashboard') {
    dailyTicketFlags.innerHTML = `<span class="ui-badge subtle">${mode === 'generate' ? 'Preparando analisis...' : 'Cargando dashboard...'}</span>`;
    dailyTicketSummary.textContent = mode === 'generate' ? 'Generando ticket...' : 'Cargando datos...';
    if (dailyTicketDashboardGlance) {
        dailyTicketDashboardGlance.innerHTML = '<div class="skeleton-block side"></div>';
    }
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
    if (dailyTicketTicketMeta) {
        dailyTicketTicketMeta.innerHTML = '<div class="skeleton-block side"></div>';
    }
    dailyTicketAvoid.innerHTML = '<div class="skeleton-block side"></div>';
    if (dailyTicketGamesLiveRefresh) {
        dailyTicketGamesLiveRefresh.hidden = true;
    }
    dailyTicketGamesMeta.innerHTML = '<div class="skeleton-block side"></div>';
    dailyTicketLiveGames.innerHTML = '<div class="skeleton-block tall"></div>';
    dailyTicketGames.innerHTML = '<div class="skeleton-block tall"></div>';
    dailyTicketUpcomingGames.innerHTML = '<div class="skeleton-block tall"></div>';
    if (dailyTicketRecentResultsMeta) {
        dailyTicketRecentResultsMeta.innerHTML = '<div class="skeleton-block side"></div>';
    }
    if (dailyTicketRecentResults) {
        dailyTicketRecentResults.innerHTML = '<div class="skeleton-block side"></div>';
    }
    updateScoreboardTabs();
}

function renderDailyTicketError(message) {
    stopScoreboardLivePolling();
    dailyTicketFlags.innerHTML = '<span class="ui-badge error">Error</span>';
    dailyTicketSummary.textContent = 'No fue posible cargar la vista.';
    if (dailyTicketDashboardGlance) {
        dailyTicketDashboardGlance.innerHTML = '<div class="empty-inline rich">No fue posible cargar el resumen rapido del ticket.</div>';
    }
    dailyTicketCurrent.innerHTML = `
        <div class="empty-state-card error">
            <div class="empty-state-icon">!</div>
            <h4>Error de Daily Ticket AI</h4>
            <p>${escapeHtml(message)}</p>
        </div>
    `;
    dailyTicketSideSummary.innerHTML = '<div class="empty-inline rich">Revisa el backend y vuelve a intentar.</div>';
    if (dailyTicketTicketMeta) {
        dailyTicketTicketMeta.innerHTML = '<div class="empty-inline rich">Sin metadata del ticket por error de carga.</div>';
    }
    dailyTicketAvoid.innerHTML = '<div class="empty-inline rich">Sin datos por error de carga.</div>';
    dailyTicketGamesMeta.innerHTML = '<div class="empty-inline rich">No fue posible cargar el scoreboard MLB.</div>';
    dailyTicketLiveGames.innerHTML = '<div class="empty-inline rich scoreboard-empty">Sin juegos en vivo por error de carga.</div>';
    dailyTicketGames.innerHTML = '<div class="empty-inline rich scoreboard-empty">Sin juegos de hoy por error de carga.</div>';
    dailyTicketUpcomingGames.innerHTML = '<div class="empty-inline rich scoreboard-empty">Sin juegos proximos por error de carga.</div>';
    if (dailyTicketRecentResultsMeta && !recentResultsState) {
        dailyTicketRecentResultsMeta.innerHTML = '';
    }
    if (dailyTicketRecentResults && !recentResultsState) {
        dailyTicketRecentResults.innerHTML = '<div class="empty-inline rich">Sin resultados recientes disponibles.</div>';
    }
    updateScoreboardTabs();
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

    if (source === 'fallback_generated') {
        return 'Fallback sin IA';
    }

    if (source === 'cache') {
        return 'Mostrado desde cache';
    }

    if (source === 'no_candidates') {
        return 'Sin candidatos';
    }

    return 'Dashboard';
}

function normalizeSourceStateFromLabel(sourceLabel, fallback = 'cache') {
    const source = String(sourceLabel || '').toLowerCase();

    if (source.includes('generado')) {
        return 'generated';
    }
    if (source.includes('fallback')) {
        return 'fallback_generated';
    }
    if (source.includes('cache')) {
        return 'cache';
    }
    if (source.includes('candidato')) {
        return 'no_candidates';
    }

    return fallback;
}

function prefersReducedMotion() {
    return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
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
        return 'Fecha por confirmar';
    }

    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) {
        return 'Fecha por confirmar';
    }

    const dayLabel = date.toLocaleDateString('es-MX', {
        timeZone: MAZATLAN_TIME_ZONE,
        day: 'numeric',
        month: 'short',
    }).replace(/\.$/, '');
    const rawTime = date.toLocaleTimeString('es-MX', {
        timeZone: MAZATLAN_TIME_ZONE,
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    });

    return `${dayLabel} \u00b7 ${normalizeMeridiem(rawTime)} MZT`;
}

function normalizeMeridiem(value) {
    return String(value || '')
        .replace(/\s*a\.\s*m\./gi, ' a.m.')
        .replace(/\s*p\.\s*m\./gi, ' p.m.')
        .replace(/\s+/g, ' ')
        .trim();
}

function getLocalDateKey() {
    return getTimeZoneDateKey(new Date(), MAZATLAN_TIME_ZONE);
}

function getDateKeyWithOffset(offsetDays = 0) {
    return getTimeZoneDateKey(new Date(Date.now() + (offsetDays * 86400000)), MAZATLAN_TIME_ZONE);
}

function getTimeZoneDateKey(date, timeZone) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });
    const parts = formatter.formatToParts(date).reduce((accumulator, part) => {
        if (part.type !== 'literal') {
            accumulator[part.type] = part.value;
        }
        return accumulator;
    }, {});

    return `${parts.year}-${parts.month}-${parts.day}`;
}

function dateFromDateKey(dateKey) {
    const [year, month, day] = String(dateKey || '').split('-').map(Number);
    if (!year || !month || !day) {
        return null;
    }

    return new Date(Date.UTC(year, month - 1, day, 18, 0, 0));
}

function formatDateKeyLabel(dateKey) {
    const date = dateFromDateKey(dateKey);
    if (!date) {
        return 'Sin fecha';
    }

    return date.toLocaleDateString('es-MX', {
        timeZone: MAZATLAN_TIME_ZONE,
        weekday: 'short',
        day: 'numeric',
        month: 'short',
    });
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
    const contrastClass = needsHighContrastLogo(teamName) ? ' needs-contrast' : '';
    if (logoUrl) {
        return `<span class="game-avatar team-avatar-frame${contrastClass}"><img src="${logoUrl}" alt="${escapeHtml(teamName)}" loading="lazy" data-fallback="${escapeHtml(getTeamInitials(teamName))}" onerror="const host=this.parentElement; host.classList.add('is-fallback'); host.textContent=this.dataset.fallback || 'NA';"></span>`;
    }

    return `<span class="game-avatar team-avatar-frame is-fallback${contrastClass}">${escapeHtml(getTeamInitials(teamName))}</span>`;
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

function needsHighContrastLogo(teamName) {
    const normalized = String(teamName || '').toLowerCase();
    return normalized.includes('yankees') || normalized.includes('padres');
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

