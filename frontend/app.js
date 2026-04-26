// Configuration
const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000'
    : 'https://task-manager-ai-bayn.onrender.com';

// State
let tasks = [];
let currentFilter = 'all';
let editingTaskId = null;
let currentSubtasks = [];

// DOM Elements
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

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadTasks();
    setupEventListeners();
});

// Event Listeners
function setupEventListeners() {
    taskForm.addEventListener('submit', handleSubmit);
    cancelBtn.addEventListener('click', resetForm);
    suggestPriorityBtn.addEventListener('click', handleSuggestPriority);

    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentFilter = btn.dataset.filter;
            renderTasks();
        });
    });

    modalClose.addEventListener('click', closeModal);
    modalCancel.addEventListener('click', closeModal);
    modalCreateAll.addEventListener('click', createAllSubtasks);

    // Close modal on outside click
    subtasksModal.addEventListener('click', (e) => {
        if (e.target === subtasksModal) {
            closeModal();
        }
    });
}

// API Calls
async function apiCall(endpoint, options = {}) {
    try {
        const response = await fetch(`${API_URL}${endpoint}`, {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Request failed');
        }

        if (response.status === 204) {
            return null;
        }

        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        showToast(error.message || 'Error de conexión', 'error');
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
        body: JSON.stringify(taskData)
    });
    tasks.push(task);
    renderTasks();
    showToast('Tarea creada exitosamente', 'success');
    return task;
}

async function updateTask(id, taskData) {
    const task = await apiCall(`/api/tasks/${id}`, {
        method: 'PUT',
        body: JSON.stringify(taskData)
    });
    const index = tasks.findIndex(t => t.id === id);
    if (index !== -1) {
        tasks[index] = task;
    }
    renderTasks();
    showToast('Tarea actualizada', 'success');
    return task;
}

async function deleteTask(id) {
    await apiCall(`/api/tasks/${id}`, {
        method: 'DELETE'
    });
    tasks = tasks.filter(t => t.id !== id);
    renderTasks();
    showToast('Tarea eliminada', 'success');
}

async function toggleTaskComplete(id) {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    await updateTask(id, { completed: !task.completed });
}

// Form Handlers
async function handleSubmit(e) {
    e.preventDefault();

    const taskData = {
        title: taskTitleInput.value.trim(),
        description: taskDescriptionInput.value.trim(),
        priority: taskPrioritySelect.value
    };

    if (!taskData.title) {
        showToast('El título es requerido', 'warning');
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
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    editingTaskId = id;
    taskIdInput.value = id;
    taskTitleInput.value = task.title;
    taskDescriptionInput.value = task.description || '';
    taskPrioritySelect.value = task.priority;
    formTitle.textContent = 'Editar Tarea';
    submitText.textContent = 'Actualizar Tarea';
    cancelBtn.style.display = 'inline-block';

    // Scroll to form
    document.querySelector('.task-form-container').scrollIntoView({ behavior: 'smooth' });
}

// AI Features
async function handleSuggestPriority() {
    const title = taskTitleInput.value.trim();
    const description = taskDescriptionInput.value.trim();

    if (!title) {
        showToast('Escribe un título primero', 'warning');
        return;
    }

    suggestPriorityBtn.disabled = true;
    showLoading(true);

    try {
        const result = await apiCall('/api/ai/suggest-priority', {
            method: 'POST',
            body: JSON.stringify({ title, description })
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
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    showLoading(true);

    try {
        const result = await apiCall('/api/ai/break-down-task', {
            method: 'POST',
            body: JSON.stringify({
                title: task.title,
                description: task.description
            })
        });

        currentSubtasks = result.subtasks;
        showSubtasksModal(result);
    } catch (error) {
        console.error('Error breaking down task:', error);
    } finally {
        showLoading(false);
    }
}

// Modal
function showSubtasksModal(result) {
    const reasoningEl = document.getElementById('subtasks-reasoning');
    const subtasksListEl = document.getElementById('subtasks-list');

    reasoningEl.innerHTML = `<strong>Análisis:</strong> ${result.reasoning}`;

    subtasksListEl.innerHTML = result.subtasks.map((subtask, index) => `
        <div class="subtask-item">
            <h4>${index + 1}. ${subtask.title}</h4>
            <p>${subtask.description}</p>
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
    if (currentSubtasks.length === 0) return;

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

// Rendering
function renderTasks() {
    const filteredTasks = getFilteredTasks();

    if (filteredTasks.length === 0) {
        tasksList.innerHTML = '';
        emptyState.style.display = 'block';
        return;
    }

    emptyState.style.display = 'none';

    tasksList.innerHTML = filteredTasks.map(task => `
        <div class="task-card priority-${task.priority} ${task.completed ? 'completed' : ''}">
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
                    <button class="task-btn ai" onclick="handleBreakDownTask(${task.id})" title="Dividir en subtareas">
                        ✂️
                    </button>
                    <button class="task-btn edit" onclick="editTask(${task.id})" title="Editar">
                        ✏️
                    </button>
                    <button class="task-btn delete" onclick="confirmDelete(${task.id})" title="Eliminar">
                        🗑️
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

function getFilteredTasks() {
    switch (currentFilter) {
        case 'pending':
            return tasks.filter(t => !t.completed);
        case 'completed':
            return tasks.filter(t => t.completed);
        default:
            return tasks;
    }
}

// Utility Functions
function getPriorityLabel(priority) {
    const labels = {
        high: 'Alta',
        medium: 'Media',
        low: 'Baja'
    };
    return labels[priority] || priority;
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Hoy';
    if (diffDays === 1) return 'Ayer';
    if (diffDays < 7) return `Hace ${diffDays} días`;

    return date.toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'short'
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function confirmDelete(id) {
    if (confirm('¿Estás seguro de que quieres eliminar esta tarea?')) {
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
    }, 3000);
}

// Add slideOut animation
const style = document.createElement('style');
style.textContent = `
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);
