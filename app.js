/**
 * app.js - Main Application Logic, State Controller & Dashboard Renderer
 * Implements full Task CRUD, Category Management, Drag & Drop attachments,
 * local alerts, and interactive SVG analytics.
 * Version 1.0.5 - Mobile Responsive Optimization - 2026-05-22
 */

// ====================================================
// 1. CONSTANTS & SYSTEM CONFIGURATION
// ====================================================
const DEFAULT_CATEGORIES = [
    { id: 'cat-daily', name: 'บัญชีประจำวัน ส่วนการเงิน', color: '#737c68', isDefault: true },
    { id: 'cat-bsk60', name: 'บสค.60 ส่วนการเงิน', color: '#a39580', isDefault: true },
    { id: 'cat-invoice', name: 'ใบแจ้งหนี้ ส่วนการเงิน', color: '#788896', isDefault: true },
    { id: 'cat-monthly', name: 'บัญชีประจำเดือน ส่วนการเงิน', color: '#b58970', isDefault: true },
    { id: 'cat-whtax', name: 'ภาษีเงินได้หัก ณ ที่จ่าย ส่วนการเงิน', color: '#bd7878', isDefault: true }
];

const PRESETS_COLORS = [
    '#737c68', // Sage Green
    '#b58970', // Warm Clay
    '#a39580', // Soft Taupe
    '#788896', // Slate Blue
    '#bd7878', // Dusty Rose
    '#c5a059', // Warm Amber
    '#d4b28c', // Muted Ochre
    '#5c6353', // Earthy Olive
    '#c4bdae', // Sand
    '#a26b5c'  // Terracotta
];

const STATUS_DATA = {
    'รับงาน': { label: 'รับงาน', color: '#788896', bg: 'rgba(120, 136, 150, 0.15)', border: 'rgba(120, 136, 150, 0.3)' },
    'กำลังทำ': { label: 'กำลังทำ', color: '#b58970', bg: 'rgba(181, 137, 112, 0.15)', border: 'rgba(181, 137, 112, 0.3)' },
    'เสร็จแล้ว': { label: 'เสร็จแล้ว', color: '#737c68', bg: 'rgba(115, 124, 104, 0.15)', border: 'rgba(115, 124, 104, 0.3)' },
    'ยกเลิก': { label: 'ยกเลิก', color: '#bd7878', bg: 'rgba(189, 120, 120, 0.15)', border: 'rgba(189, 120, 120, 0.3)' }
};

// ====================================================
// 2. STATE MANAGER
// ====================================================
const AppState = {
    tasks: [],
    categories: [],
    currentView: 'dashboard', // dashboard | tasks | categories
    
    // Temporaries for Modals / Editing
    pendingFiles: [], // Attached files in creation modal
    selectedCategoryColor: PRESETS_COLORS[0],
    
    // My Tasks filter toggle
    filterMyTasks: false,
    
    // Auto-update timer
    countdownInterval: null
};

// ====================================================
// 2b. TOAST NOTIFICATION SYSTEM
// ====================================================

/**
 * Show a non-blocking cozy toast notification
 * @param {string} message — The message to display
 * @param {'success'|'error'|'info'|'warning'} type — Toast type
 * @param {number} duration — Duration in ms (default 4500)
 */
function showToast(message, type = 'success', duration = 4500) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const icons = {
        success: '✅',
        error: '❌',
        info: 'ℹ️',
        warning: '⚠️'
    };
    
    const borderColors = {
        success: 'var(--status-done)',
        error: 'var(--status-canc)',
        info: 'var(--accent-indigo)',
        warning: 'var(--warning-orange)'
    };
    
    const toast = document.createElement('div');
    toast.className = 'cozy-toast';
    toast.style.borderLeftColor = borderColors[type] || borderColors.info;
    toast.innerHTML = `
        <span style="font-size: 1.1rem; flex-shrink: 0;">${icons[type] || icons.info}</span>
        <span style="flex-grow: 1; line-height: 1.45;">${message}</span>
        <button onclick="this.parentElement.remove()" style="background: none; border: none; cursor: pointer; color: var(--text-muted); font-size: 1rem; flex-shrink: 0; padding: 0 0 0 0.25rem;">✕</button>
    `;
    
    container.appendChild(toast);
    
    // Auto-remove after duration
    setTimeout(() => {
        if (toast.parentElement) {
            toast.style.animation = 'toastFadeOut 0.3s ease forwards';
            setTimeout(() => toast.remove(), 300);
        }
    }, duration);
}

/**
 * Show a cozy confirmation dialog (replaces browser confirm())
 * Returns a Promise<boolean>
 * @param {string} message
 * @param {string} confirmLabel
 * @param {'danger'|'normal'} mode
 */
function showConfirm(message, confirmLabel = 'ยืนยัน', mode = 'normal') {
    return new Promise((resolve) => {
        // Remove existing dialogs
        const existingDialog = document.getElementById('cozy-confirm-dialog');
        if (existingDialog) existingDialog.remove();
        
        const btnColor = mode === 'danger'
            ? 'background: rgba(189,120,120,0.9); border: none; color: #fff;'
            : 'background: var(--primary-grad); border: none; color: #fff;';
        
        const dialog = document.createElement('div');
        dialog.id = 'cozy-confirm-dialog';
        dialog.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(43, 41, 39, 0.45);
            backdrop-filter: blur(8px);
            z-index: 99999;
            display: flex; align-items: center; justify-content: center;
            padding: 1.5rem;
            animation: fadeIn 0.2s ease;
        `;
        dialog.innerHTML = `
            <div style="
                background: #faf9f6;
                border: 1px solid var(--glass-border);
                border-radius: 16px;
                padding: 2rem;
                max-width: 400px;
                width: 100%;
                box-shadow: 0 20px 50px rgba(163,154,137,0.2);
                text-align: center;
            ">
                <div style="font-size: 2rem; margin-bottom: 0.75rem;">🤔</div>
                <p style="font-size: 0.95rem; color: var(--text-primary); line-height: 1.55; margin-bottom: 1.5rem;">${message}</p>
                <div style="display: flex; gap: 0.75rem; justify-content: center;">
                    <button id="cozy-confirm-cancel" style="
                        padding: 0.65rem 1.5rem;
                        border-radius: 8px;
                        border: 1px solid var(--glass-border);
                        background: #fff;
                        color: var(--text-primary);
                        font-weight: 600;
                        cursor: pointer;
                        font-size: 0.9rem;
                    ">ยกเลิก</button>
                    <button id="cozy-confirm-ok" style="
                        padding: 0.65rem 1.5rem;
                        border-radius: 8px;
                        ${btnColor}
                        font-weight: 600;
                        cursor: pointer;
                        font-size: 0.9rem;
                    ">${confirmLabel}</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(dialog);
        
        dialog.querySelector('#cozy-confirm-ok').addEventListener('click', () => {
            dialog.remove();
            resolve(true);
        });
        
        dialog.querySelector('#cozy-confirm-cancel').addEventListener('click', () => {
            dialog.remove();
            resolve(false);
        });
        
        // Click outside to dismiss
        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) {
                dialog.remove();
                resolve(false);
            }
        });
    });
}

// ====================================================
// 3. INITIALIZATION & DATA LOADING
// ====================================================
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Initialize Database Router (Firebase or IndexedDB)
        await window.TaskDB.init();
        
        // Update DB mode indicator in UI
        updateDbModeUI();
        
        // Load or initialize categories
        await loadCategories();
        
        // Load tasks
        await loadTasks();
        
        // Render UI
        setupNavigation();
        setupCategoryForm();
        setupTaskForm();
        setupSyncSettings(); // Initialize Cloud Sync settings page listeners
        setupAuthObserver();
        setupProfileView();
        setupCommentsInputListeners();
        renderView();
        
        // Start live countdown updater (updates every minute)
        AppState.countdownInterval = setInterval(() => {
            if (AppState.currentView === 'dashboard') {
                renderDashboardAlerts();
            } else if (AppState.currentView === 'tasks') {
                renderTasksList();
            }
        }, 60000);
        
        console.log("Application started successfully");
    } catch (err) {
        console.error("Critical start failure", err);
        showToast("ไม่สามารถเปิดระบบฐานข้อมูลในเครื่องได้ กรุณารีเฟรชหรือสลับเบราว์เซอร์", 'error', 8000);
    }
});

// Load categories from database or set defaults
async function loadCategories() {
    let dbCategories = await window.TaskDB.getAllCategories();
    if (dbCategories.length === 0) {
        // Seed default categories
        for (const cat of DEFAULT_CATEGORIES) {
            await window.TaskDB.saveCategory(cat);
        }
        dbCategories = await window.TaskDB.getAllCategories();
    } else {
        // Migration: automatically align old default category colors with our cozy earth tone theme
        let modified = false;
        for (const dbCat of dbCategories) {
            const match = DEFAULT_CATEGORIES.find(c => c.id === dbCat.id);
            if (match && dbCat.color !== match.color) {
                dbCat.color = match.color;
                await window.TaskDB.saveCategory(dbCat);
                modified = true;
            }
        }
        if (modified) {
            dbCategories = await window.TaskDB.getAllCategories();
        }
    }
    AppState.categories = dbCategories;
    populateCategoryFilters();
}

// Load tasks from database
async function loadTasks() {
    AppState.tasks = await window.TaskDB.getAllTasks();
}

// Populate categories in all select dropdowns
function populateCategoryFilters() {
    const filterSelect = document.getElementById('filter-category-select');
    const formSelect = document.getElementById('task-category-select');
    
    // Clear old options (keep 'all' in filter)
    filterSelect.innerHTML = '<option value="all">ทุกหมวดหมู่</option>';
    formSelect.innerHTML = '';
    
    AppState.categories.forEach(cat => {
        // Add to filter dropdown
        const filterOpt = document.createElement('option');
        filterOpt.value = cat.id;
        filterOpt.textContent = cat.name;
        filterSelect.appendChild(filterOpt);
        
        // Add to form dropdown
        const formOpt = document.createElement('option');
        formOpt.value = cat.id;
        formOpt.textContent = cat.name;
        formSelect.appendChild(formOpt);
    });
}

// ====================================================
// 4. ROUTING & VIEW CONTROLLER
// ====================================================
function setupNavigation() {
    const navDashboard = document.getElementById('btn-nav-dashboard');
    const navTasks = document.getElementById('btn-nav-tasks');
    const navCategories = document.getElementById('btn-nav-categories');
    const navSync = document.getElementById('btn-nav-sync');
    const navProfile = document.getElementById('btn-nav-profile');
    
    const menuDashboardLi = document.getElementById('menu-dashboard-li');
    const menuTasksLi = document.getElementById('menu-tasks-li');
    const menuCategoriesLi = document.getElementById('menu-categories-li');
    const menuSyncLi = document.getElementById('menu-sync-li');
    const menuProfileLi = document.getElementById('menu-profile-li');
    
    const btnCreateTaskMain = document.getElementById('btn-create-task-main');
    const btnCreateTaskFab = document.getElementById('btn-create-task-fab');
    
    navDashboard.addEventListener('click', () => switchView('dashboard'));
    navTasks.addEventListener('click', () => switchView('tasks'));
    navCategories.addEventListener('click', () => switchView('categories'));
    navSync.addEventListener('click', () => switchView('sync'));
    if (navProfile) navProfile.addEventListener('click', () => switchView('profile'));
    
    btnCreateTaskMain.addEventListener('click', () => {
        openTaskModal();
    });
    
    if (btnCreateTaskFab) {
        btnCreateTaskFab.addEventListener('click', () => {
            openTaskModal();
        });
    }
    
    function switchView(viewName) {
        AppState.currentView = viewName;
        
        // Remove active class from all menu items
        menuDashboardLi.classList.remove('active');
        menuTasksLi.classList.remove('active');
        menuCategoriesLi.classList.remove('active');
        menuSyncLi.classList.remove('active');
        if (menuProfileLi) menuProfileLi.classList.remove('active');
        
        // Hide all views
        document.getElementById('view-dashboard').classList.add('hidden');
        document.getElementById('view-tasks').classList.add('hidden');
        document.getElementById('view-categories').classList.add('hidden');
        document.getElementById('view-sync').classList.add('hidden');
        const viewProfile = document.getElementById('view-profile');
        if (viewProfile) viewProfile.classList.add('hidden');
        
        // Handle Mobile FAB visibility
        if (btnCreateTaskFab) {
            if (viewName === 'dashboard' || viewName === 'tasks') {
                btnCreateTaskFab.classList.remove('hidden-fab');
            } else {
                btnCreateTaskFab.classList.add('hidden-fab');
            }
        }
        
        // Show active view & menu item
        if (viewName === 'dashboard') {
            menuDashboardLi.classList.add('active');
            document.getElementById('view-dashboard').classList.remove('hidden');
            document.getElementById('page-title-text').textContent = 'ภาพรวมของงาน (Dashboard)';
            document.getElementById('page-subtitle-text').textContent = 'วิเคราะห์สถานะงานการเงิน ดำเนินการ และสถิติต่างๆ ในปัจจุบัน';
        } else if (viewName === 'tasks') {
            menuTasksLi.classList.add('active');
            document.getElementById('view-tasks').classList.remove('hidden');
            document.getElementById('page-title-text').textContent = 'รายการตรวจตามงานทั้งหมด';
            document.getElementById('page-subtitle-text').textContent = 'จัดการ ค้นหา กรองงานการเงิน และดาวน์โหลดเอกสารไฟล์แนบ';
        } else if (viewName === 'categories') {
            menuCategoriesLi.classList.add('active');
            document.getElementById('view-categories').classList.remove('hidden');
            document.getElementById('page-title-text').textContent = 'จัดการหมวดหมู่/ประเภทงาน';
            document.getElementById('page-subtitle-text').textContent = 'เพิ่ม หมวดหมู่เฉพาะ เพื่อความยืดหยุ่นในการจัดหมวดหมู่เอกสารและงานบัญชี';
        } else if (viewName === 'sync') {
            menuSyncLi.classList.add('active');
            document.getElementById('view-sync').classList.remove('hidden');
            document.getElementById('page-title-text').textContent = 'ระบบเชื่อมต่อคลาวด์และแบ่งปัน (Cloud Sync)';
            document.getElementById('page-subtitle-text').textContent = 'เชื่อมโยงฐานข้อมูลส่วนกลางผ่าน Google Firebase และย้ายข้อมูลของคุณขึ้น Cloud';
            renderSyncSettings();
        } else if (viewName === 'profile') {
            if (menuProfileLi) menuProfileLi.classList.add('active');
            if (viewProfile) viewProfile.classList.remove('hidden');
            document.getElementById('page-title-text').textContent = 'โปรไฟล์ทีมงานและแดชบอร์ดส่วนบุคคล';
            document.getElementById('page-subtitle-text').textContent = 'ดูสถานะภารกิจงานที่ได้รับมอบหมาย สรุปผลความสำเร็จ และจดบันทึกด่วนส่วนตัว';
            renderProfilePage();
        }
        
        renderView();
    }
}

function renderView() {
    lucide.createIcons();
    if (AppState.currentView === 'dashboard') {
        renderDashboard();
    } else if (AppState.currentView === 'tasks') {
        renderTasksList();
    } else if (AppState.currentView === 'categories') {
        renderCategoriesList();
    } else if (AppState.currentView === 'sync') {
        renderSyncSettings();
    }
}

// ====================================================
// 5. DATE & ALERT ENGINE
// ====================================================

/**
 * Calculates due status and outputs elegant visual descriptors
 * @param {string} dueDateISO 
 * @param {string} status 
 * @returns {object} status details
 */
function calculateDueDetails(dueDateISO, status) {
    if (status === 'เสร็จแล้ว' || status === 'ยกเลิก') {
        return {
            class: 'on-track',
            text: 'เสร็จสิ้นภารกิจ',
            icon: 'check',
            urgency: 0
        };
    }
    
    if (!dueDateISO) {
        return {
            class: 'on-track',
            text: 'ไม่ได้ระบุกำหนดส่ง',
            icon: 'calendar',
            urgency: 0
        };
    }

    const now = new Date();
    const due = new Date(dueDateISO);
    const diffMs = due - now;
    
    if (diffMs < 0) {
        // Overdue (เลยกำหนด)
        const absDiff = Math.abs(diffMs);
        const days = Math.floor(absDiff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((absDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        let timeStr = 'เลยกำหนดส่งแล้ว';
        if (days > 0) {
            timeStr = `เลยกำหนดส่งไปแล้ว ${days} วัน ${hours} ชม.`;
        } else if (hours > 0) {
            timeStr = `เลยกำหนดส่งไปแล้ว ${hours} ชม.`;
        } else {
            timeStr = `เลยกำหนดส่งไปแล้วไม่กี่นาที`;
        }
        
        return {
            class: 'overdue',
            text: timeStr,
            icon: 'alert-octagon',
            urgency: 3
        };
    }
    
    // Remaining time
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    let timeText = '';
    if (days > 0) {
        timeText = `เหลือเวลา ${days} วัน ${hours} ชม.`;
    } else if (hours > 0) {
        timeText = `เหลือเวลาอีก ${hours} ชม.`;
    } else {
        timeText = `เหลือเวลาน้อยกว่า 1 ชม. !`;
    }

    // Urgency ranking: 2 = urgent (<=24h), 1 = warning (<=3 days), 0 = normal (>3 days)
    if (diffMs <= 1000 * 60 * 60 * 24) {
        return {
            class: 'urgent',
            text: `⚠️ ด่วนที่สุด! ${timeText}`,
            icon: 'alert-triangle',
            urgency: 2
        };
    } else if (diffMs <= 1000 * 60 * 60 * 24 * 3) {
        return {
            class: 'urgent',
            text: timeText,
            icon: 'clock',
            urgency: 1
        };
    } else {
        return {
            class: 'on-track',
            text: timeText,
            icon: 'calendar',
            urgency: 0
        };
    }
}

// Utility to format date nicely
function formatDateString(isoString) {
    if (!isoString) return '-';
    const date = new Date(isoString);
    return date.toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }) + ' น.';
}

// ====================================================
// 6. DASHBOARD CONTROLLER (INTERACTIVE GRAPHS)
// ====================================================
function renderDashboard() {
    const totalCount = AppState.tasks.length;
    
    let completedCount = 0;
    let pendingCount = 0;
    let overdueCount = 0;
    
    AppState.tasks.forEach(task => {
        if (task.status === 'เสร็จแล้ว') {
            completedCount++;
        } else if (task.status === 'กำลังทำ' || task.status === 'รับงาน') {
            pendingCount++;
            
            // Check if overdue
            if (task.dueDate && new Date(task.dueDate) < new Date()) {
                overdueCount++;
            }
        }
    });

    // Write numerical metrics
    document.getElementById('stat-total-tasks').textContent = totalCount;
    document.getElementById('stat-pending-tasks').textContent = pendingCount;
    document.getElementById('stat-completed-tasks').textContent = completedCount;
    document.getElementById('stat-overdue-tasks').textContent = overdueCount;
    
    // Render dynamic visualizations
    renderStatusDonutChart();
    renderWorkloadBreakdown();
    renderDashboardAlerts();
    
    // Team Workload — only show in Firebase Cloud mode
    renderTeamWorkloadDashboard();
}

/**
 * Renders per-person workload breakdown on dashboard (Firebase mode only)
 */
async function renderTeamWorkloadDashboard() {
    const card = document.getElementById('dashboard-team-analytics-card');
    const list = document.getElementById('team-workload-list');
    if (!card || !list) return;
    
    // Only show this section when in Firebase cloud mode
    if (window.TaskDB.mode !== 'firebase') {
        card.style.display = 'none';
        return;
    }
    
    card.style.display = '';
    list.innerHTML = '';
    
    // Group tasks by assignee
    const assigneeMap = {};
    AppState.tasks.forEach(task => {
        if (!task.assignedTo || !task.assignedTo.uid) return;
        const uid = task.assignedTo.uid;
        if (!assigneeMap[uid]) {
            assigneeMap[uid] = {
                displayName: task.assignedTo.displayName,
                photoURL: task.assignedTo.photoURL || '',
                total: 0,
                completed: 0
            };
        }
        assigneeMap[uid].total++;
        if (task.status === 'เสร็จแล้ว') {
            assigneeMap[uid].completed++;
        }
    });
    
    const uids = Object.keys(assigneeMap);
    
    if (uids.length === 0) {
        list.innerHTML = `<div style="text-align:center; color:var(--text-muted); font-size:0.85rem; padding:1rem 0;">ยังไม่มีการมอบหมายงานให้ทีมงาน</div>`;
        return;
    }
    
    uids.forEach(uid => {
        const member = assigneeMap[uid];
        const pct = member.total > 0 ? Math.round((member.completed / member.total) * 100) : 0;
        
        const item = document.createElement('div');
        item.className = 'workload-item';
        item.innerHTML = `
            <div class="workload-info">
                <div style="display:flex; align-items:center; gap:0.5rem;">
                    <img src="${member.photoURL}" alt="Avatar"
                         style="width:22px; height:22px; border-radius:50%; border:1.5px solid var(--glass-border); background:#eee;"
                         onerror="this.style.display='none'">
                    <span class="workload-name">${member.displayName}</span>
                </div>
                <span class="workload-count"><span>${member.completed}</span> / ${member.total} งาน</span>
            </div>
            <div class="progress-track">
                <div class="progress-fill" style="width:${pct}%; background:var(--accent-earth);"></div>
            </div>
        `;
        list.appendChild(item);
    });
}

// Render dynamic interactive SVG Donut chart
function renderStatusDonutChart() {
    const svg = document.getElementById('status-donut-svg');
    const legend = document.getElementById('status-chart-legend');
    
    svg.innerHTML = '';
    legend.innerHTML = '';
    
    const statusCounts = {
        'รับงาน': 0,
        'กำลังทำ': 0,
        'เสร็จแล้ว': 0,
        'ยกเลิก': 0
    };
    
    AppState.tasks.forEach(t => {
        if (statusCounts[t.status] !== undefined) {
            statusCounts[t.status]++;
        }
    });

    const total = AppState.tasks.length;
    document.getElementById('donut-total-count').textContent = total;

    if (total === 0) {
        // Draw empty indicator state
        svg.innerHTML = `
            <circle class="donut-segment" cx="100" cy="100" r="70" 
                    stroke="var(--glass-border)" stroke-dasharray="439.82" stroke-dashoffset="0" />
        `;
        legend.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 0.9rem;">ไม่มีงานที่จะแสดงกราฟ</div>`;
        return;
    }

    // Geometry parameters for SVG circles with radius 70
    const radius = 70;
    const circ = 2 * Math.PI * radius; // 439.82
    let accumulatedOffset = 0;
    
    Object.keys(STATUS_DATA).forEach((statusKey) => {
        const count = statusCounts[statusKey];
        const config = STATUS_DATA[statusKey];
        
        if (count === 0) return;
        
        const percentage = (count / total) * 100;
        const segmentLength = (count / total) * circ;
        const offset = circ - segmentLength + accumulatedOffset;
        
        // Render glowing visual segment path
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('class', 'donut-segment');
        circle.setAttribute('cx', '100');
        circle.setAttribute('cy', '100');
        circle.setAttribute('r', radius.toString());
        circle.setAttribute('stroke', config.color);
        circle.setAttribute('stroke-dasharray', `${segmentLength} ${circ - segmentLength}`);
        circle.setAttribute('stroke-dashoffset', accumulatedOffset.toString());
        circle.setAttribute('style', `--glow-color: ${config.color}`);
        
        // Hover effects in donut center
        circle.addEventListener('mouseover', () => {
            document.getElementById('donut-total-count').textContent = count;
            document.getElementById('donut-total-count').style.color = config.color;
            const labelEl = document.querySelector('.donut-center-lbl');
            labelEl.textContent = `${statusKey} (${percentage.toFixed(0)}%)`;
        });
        
        circle.addEventListener('mouseout', () => {
            document.getElementById('donut-total-count').textContent = total;
            document.getElementById('donut-total-count').style.color = 'var(--text-primary)';
            const labelEl = document.querySelector('.donut-center-lbl');
            labelEl.textContent = 'งานทั้งหมด';
        });
        
        svg.appendChild(circle);
        accumulatedOffset -= segmentLength;
        
        // Add legend elements dynamically
        const legItem = document.createElement('div');
        legItem.className = 'legend-item';
        legItem.setAttribute('style', `--color: ${config.color}`);
        legItem.innerHTML = `
            <div class="legend-left">
                <div class="legend-color"></div>
                <span>${config.label}</span>
            </div>
            <div class="legend-right">
                <span class="legend-val">${count}</span>
                <span class="legend-pct">(${percentage.toFixed(0)}%)</span>
            </div>
        `;
        
        // Connect legend items with filtering directly
        legItem.addEventListener('click', () => {
            document.getElementById('filter-status-select').value = statusKey;
            document.getElementById('btn-nav-tasks').click();
        });
        
        legend.appendChild(legItem);
    });
}

// Workload representation
function renderWorkloadBreakdown() {
    const list = document.getElementById('workload-breakdown-list');
    list.innerHTML = '';
    
    if (AppState.tasks.length === 0) {
        list.innerHTML = `<div style="text-align: center; padding: 2rem; color: var(--text-muted); font-size: 0.9rem;">ไม่มีงานจัดกลุ่มตามหมวดหมู่</div>`;
        return;
    }
    
    // Group tasks by category
    const catWorkload = {};
    AppState.categories.forEach(cat => {
        catWorkload[cat.id] = {
            name: cat.name,
            color: cat.color,
            total: 0,
            completed: 0
        };
    });
    
    AppState.tasks.forEach(t => {
        // Safeguard if category was deleted or unmapped
        if (!catWorkload[t.categoryId]) {
            catWorkload[t.categoryId] = {
                name: 'หมวดหมู่ทั่วไป / อื่นๆ',
                color: '#6b7280',
                total: 0,
                completed: 0
            };
        }
        catWorkload[t.categoryId].total++;
        if (t.status === 'เสร็จแล้ว') {
            catWorkload[t.categoryId].completed++;
        }
    });

    // Render progress rows
    Object.keys(catWorkload).forEach(catId => {
        const item = catWorkload[catId];
        if (item.total === 0) return; // Skip empty workloads for clean visual interface

        const percent = (item.completed / item.total) * 100;
        
        const workItem = document.createElement('div');
        workItem.className = 'workload-item';
        workItem.innerHTML = `
            <div class="workload-info">
                <span class="workload-name">${item.name}</span>
                <span class="workload-count">
                    <span>${item.completed}</span> / ${item.total} งาน
                </span>
            </div>
            <div class="progress-track">
                <div class="progress-fill" style="width: ${percent}%; background: ${item.color}; --primary-glow: rgba(${hexToRgb(item.color)}, 0.45);"></div>
            </div>
        `;
        
        workItem.style.cursor = 'pointer';
        workItem.addEventListener('click', () => {
            document.getElementById('filter-category-select').value = catId;
            document.getElementById('btn-nav-tasks').click();
        });
        
        list.appendChild(workItem);
    });
}

// Convert Hex colors safely to RGB strings for shadows
function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? 
        `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` 
        : '99, 102, 241';
}

// System Alerts for urgent and overdue tasks
function renderDashboardAlerts() {
    const list = document.getElementById('alert-notifications-list');
    list.innerHTML = '';
    
    // Filter active warning tasks (excluding complete and cancelled)
    const alertTasks = AppState.tasks.filter(t => t.status !== 'เสร็จแล้ว' && t.status !== 'ยกเลิก' && t.dueDate)
        .map(t => {
            const details = calculateDueDetails(t.dueDate, t.status);
            return { task: t, details };
        })
        .filter(item => item.details.urgency > 0) // Urgency 1 (Warning <= 3 days), 2 (Urgent <= 24h), 3 (Overdue)
        .sort((a, b) => b.details.urgency - a.details.urgency); // Most urgent first

    if (alertTasks.length === 0) {
        list.innerHTML = `
            <div class="empty-alerts">
                <i data-lucide="check-circle" style="color: var(--status-done); margin-bottom: 0.25rem;"></i>
                <div style="font-weight: 600;">ยอดเยี่ยม! ไม่มีงานใกล้กำหนดส่ง หรือเกินกำหนดส่งเลย</div>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    // Render alert cards
    alertTasks.forEach(item => {
        const card = document.createElement('div');
        const isOverdue = item.details.urgency === 3;
        card.className = `alert-card ${isOverdue ? 'overdue' : 'warning-near'}`;
        
        card.innerHTML = `
            <div class="alert-icon">${isOverdue ? '🔴' : '🟠'}</div>
            <div class="alert-content">
                <div class="alert-task-title">${item.task.title}</div>
                <div class="alert-task-due">${item.details.text}</div>
                <span class="alert-task-status" style="background: ${STATUS_DATA[item.task.status].bg}; color: ${STATUS_DATA[item.task.status].color}; border: 1px solid ${STATUS_DATA[item.task.status].border};">
                    ${item.task.status}
                </span>
            </div>
        `;
        
        card.style.cursor = 'pointer';
        card.addEventListener('click', () => {
            openTaskDetailsModal(item.task.id);
        });
        
        list.appendChild(card);
    });
}

// ====================================================
// 7. TASK MANAGEMENT VIEWS & FORM SUBMISSION
// ====================================================
function renderTasksList() {
    const container = document.getElementById('tasks-cards-container');
    container.innerHTML = '';
    
    // Retrieve values from filters
    const searchVal = document.getElementById('filter-search-input').value.toLowerCase().trim();
    const statusVal = document.getElementById('filter-status-select').value;
    const categoryVal = document.getElementById('filter-category-select').value;
    const sortVal = document.getElementById('filter-sort-select').value;
    
    // Filter tasks array
    let filtered = AppState.tasks.filter(task => {
        const matchesSearch = task.title.toLowerCase().includes(searchVal) || 
                              (task.description && task.description.toLowerCase().includes(searchVal));
        const matchesStatus = statusVal === 'all' || task.status === statusVal;
        const matchesCategory = categoryVal === 'all' || task.categoryId === categoryVal;
        
        // "งานของฉัน" filter — only show tasks assigned to the current logged-in user
        const matchesMyTasks = !AppState.filterMyTasks || 
            (currentLoggedUser && task.assignedTo && task.assignedTo.uid === currentLoggedUser.uid);
        
        return matchesSearch && matchesStatus && matchesCategory && matchesMyTasks;
    });

    // Sort tasks array
    filtered.sort((a, b) => {
        if (sortVal === 'due-asc') {
            if (!a.dueDate) return 1;
            if (!b.dueDate) return -1;
            return new Date(a.dueDate) - new Date(b.dueDate);
        } else if (sortVal === 'due-desc') {
            if (!a.dueDate) return 1;
            if (!b.dueDate) return -1;
            return new Date(b.dueDate) - new Date(a.dueDate);
        } else if (sortVal === 'title-asc') {
            return a.title.localeCompare(b.title, 'th');
        } else if (sortVal === 'created-desc') {
            return new Date(b.createdAt) - new Date(a.createdAt);
        }
        return 0;
    });

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon"><i data-lucide="inbox"></i></div>
                <h3>ไม่พบรายการตรวจสอบงาน</h3>
                <p>ไม่มีงานที่ตรงตามตัวกรองที่เลือกไว้ในปัจจุบัน ลองเพิ่มงานใหม่หรือค้นหาคำค้นอื่น</p>
                <button class="btn-primary" onclick="openTaskModal()" style="margin: 0 auto;">
                    <i data-lucide="plus"></i>
                    <span>เริ่มลงบันทึกงานใหม่</span>
                </button>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    // Render task cards
    filtered.forEach(task => {
        const card = document.createElement('div');
        card.className = 'glass-card task-card';
        
        // Find category color & name
        const cat = AppState.categories.find(c => c.id === task.categoryId) || { name: 'อื่นๆ', color: '#6b7280' };
        
        // Calculate due warning
        const dueDetails = calculateDueDetails(task.dueDate, task.status);
        const hasAttachments = task.hasAttachments;
        
        // Check if current user has edit permission for this task.
        // Rule: Can edit if (not firebase mode) OR (task is unassigned) OR (current user is the assignee or creator).
        const isMyTask = !task.assignedTo || (currentLoggedUser && task.assignedTo.uid === currentLoggedUser.uid);
        const isOffline = window.TaskDB.mode !== 'firebase';
        const hasModifyPermission = isOffline || isMyTask;

        card.innerHTML = `
            <div class="task-card-header">
                <span class="category-tag" style="--cat-bg: rgba(${hexToRgb(cat.color)}, 0.12); --cat-color: ${cat.color}; --cat-border: rgba(${hexToRgb(cat.color)}, 0.25);">
                    ${cat.name}
                </span>
                <div class="task-card-actions" style="${hasModifyPermission ? '' : 'display: none;'}">
                    <button class="icon-btn edit-task-btn" title="แก้ไขข้อมูลงาน"><i data-lucide="edit-2"></i></button>
                    <button class="icon-btn delete-btn delete-task-btn" title="ลบงานนี้"><i data-lucide="trash-2"></i></button>
                </div>
            </div>
            
            <h3 class="task-title" style="cursor: pointer;" title="คลิกเพื่อดูรายละเอียด">${task.title}</h3>
            <p class="task-desc">${task.description || '<span style="color: var(--text-muted); font-style: italic;">ไม่มีคำอธิบายเพิ่มเติม</span>'}</p>
            
            <div class="task-meta">
                <div class="due-indicator ${dueDetails.class}">
                    <i data-lucide="${dueDetails.icon}"></i>
                    <span>${dueDetails.text}</span>
                </div>
                
                <span class="status-badge ${getStatusClass(task.status)}" style="${hasModifyPermission ? 'cursor: pointer;' : 'cursor: default; pointer-events: none; opacity: 0.85;'}">
                    ${task.status}
                </span>
            </div>
            
            ${task.assignedTo ? `
                <div class="card-assignee" style="display: flex; align-items: center; gap: 0.4rem; margin-top: 0.4rem; font-size: 0.78rem; color: var(--text-secondary);">
                    <img src="${task.assignedTo.photoURL}" alt="Avatar" style="width: 20px; height: 20px; border-radius: 50%; border: 1px solid var(--glass-border);">
                    <span>ผู้รับผิดชอบ: <strong>${task.assignedTo.displayName}</strong></span>
                </div>
            ` : ''}
            
            ${hasAttachments ? `
                <div class="card-attachment-count" style="margin-top: -0.4rem; font-size: 0.75rem;">
                    <i data-lucide="paperclip" style="width: 12px; height: 12px;"></i>
                    <span>มีไฟล์เอกสารแนบเรียบร้อย</span>
                </div>
            ` : ''}
        `;

        // Event listener for opening details
        card.querySelector('.task-title').addEventListener('click', () => {
            openTaskDetailsModal(task.id);
        });
        
        // Quick edits and deletes if permission allowed
        if (hasModifyPermission) {
            card.querySelector('.edit-task-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                openTaskModal(task.id);
            });
            
            card.querySelector('.delete-task-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                confirmDeleteTask(task.id, task.title);
            });
            
            card.querySelector('.status-badge').addEventListener('click', (e) => {
                e.stopPropagation();
                toggleTaskStatus(task.id);
            });
        }

        container.appendChild(card);
    });

    lucide.createIcons();
}

function getStatusClass(status) {
    if (status === 'รับงาน') return 'recv';
    if (status === 'กำลังทำ') return 'prog';
    if (status === 'เสร็จแล้ว') return 'done';
    if (status === 'ยกเลิก') return 'canc';
    return '';
}

// Toggle status quickly on badge click
async function toggleTaskStatus(taskId) {
    const task = AppState.tasks.find(t => t.id === taskId);
    if (!task) return;
    
    const statusCycle = ['รับงาน', 'กำลังทำ', 'เสร็จแล้ว', 'ยกเลิก'];
    const currentIndex = statusCycle.indexOf(task.status);
    const nextIndex = (currentIndex + 1) % statusCycle.length;
    
    task.status = statusCycle[nextIndex];
    task.updatedAt = new Date().toISOString();
    
    await window.TaskDB.saveTask(task);
    await loadTasks();
    renderTasksList();
}

// Setup Event listeners for search filter inputs
function setupTaskForm() {
    const searchInput = document.getElementById('filter-search-input');
    const statusSelect = document.getElementById('filter-status-select');
    const categorySelect = document.getElementById('filter-category-select');
    const sortSelect = document.getElementById('filter-sort-select');

    searchInput.addEventListener('input', renderTasksList);
    statusSelect.addEventListener('change', renderTasksList);
    categorySelect.addEventListener('change', renderTasksList);
    sortSelect.addEventListener('change', renderTasksList);
    
    // "งานของฉัน" filter button toggle
    const myTasksBtn = document.getElementById('btn-filter-my-tasks');
    if (myTasksBtn) {
        myTasksBtn.addEventListener('click', () => {
            AppState.filterMyTasks = !AppState.filterMyTasks;
            if (AppState.filterMyTasks) {
                myTasksBtn.classList.add('active-filter');
                if (!currentLoggedUser) {
                    showToast('กรุณาลงชื่อเข้าใช้ก่อนเพื่อกรองงานของตัวเอง', 'warning');
                    AppState.filterMyTasks = false;
                    myTasksBtn.classList.remove('active-filter');
                    return;
                }
            } else {
                myTasksBtn.classList.remove('active-filter');
            }
            renderTasksList();
        });
    }
    
    // Add/Edit Modal controls
    const btnCloseTaskModal = document.getElementById('btn-close-task-modal');
    const btnCancelTaskModal = document.getElementById('btn-cancel-task-modal');
    const form = document.getElementById('task-form');
    
    btnCloseTaskModal.addEventListener('click', closeTaskModal);
    btnCancelTaskModal.addEventListener('click', closeTaskModal);
    
    // File inputs & Drag and drop
    const dropZone = document.getElementById('task-drag-drop-zone');
    const fileInput = document.getElementById('task-file-input');
    
    dropZone.addEventListener('click', () => fileInput.click());
    
    fileInput.addEventListener('change', (e) => {
        handleSelectedFiles(e.target.files);
    });
    
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    
    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });
    
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            handleSelectedFiles(e.dataTransfer.files);
        }
    });

    // Form Submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveTaskSubmit();
    });
}

// Handles files temporarily held in AppState.pendingFiles
function handleSelectedFiles(filesList) {
    for (let i = 0; i < filesList.length; i++) {
        const file = filesList[i];
        
        // Prevent duplicate file names inside pending zone
        if (AppState.pendingFiles.some(f => f.name === file.name)) {
            continue;
        }
        
        AppState.pendingFiles.push({
            id: 'temp-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
            name: file.name,
            size: file.size,
            type: file.type,
            fileObject: file // Actual File object to save later
        });
    }
    
    renderModalAttachments();
}

function renderModalAttachments() {
    const list = document.getElementById('modal-attachments-list');
    list.innerHTML = '';
    
    if (AppState.pendingFiles.length === 0) return;
    
    AppState.pendingFiles.forEach(file => {
        const item = document.createElement('div');
        item.className = 'attachment-item';
        
        // Format size
        const sizeFormatted = formatFileSize(file.size);
        
        item.innerHTML = `
            <div class="file-info">
                <i data-lucide="file-text" class="file-icon"></i>
                <span class="file-name" title="${file.name}">${file.name}</span>
                <span class="file-size">(${sizeFormatted})</span>
            </div>
            <div class="attachment-actions">
                <button type="button" class="icon-btn delete-btn" onclick="removePendingFile('${file.id}')" title="ลบไฟล์">
                    <i data-lucide="trash-2"></i>
                </button>
            </div>
        `;
        list.appendChild(item);
    });
    
    lucide.createIcons();
}

// Remove pending file from memory state
window.removePendingFile = function(tempId) {
    AppState.pendingFiles = AppState.pendingFiles.filter(f => f.id !== tempId);
    renderModalAttachments();
};

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Opens the Task editor modal (handles both Add and Edit)
async function openTaskModal(taskId = null) {
    const overlay = document.getElementById('task-modal-overlay');
    const modalTitle = document.getElementById('task-modal-title');
    const form = document.getElementById('task-form');
    
    form.reset();
    AppState.pendingFiles = [];
    document.getElementById('modal-attachments-list').innerHTML = '';
    
    // Set default due datetime value to tomorrow same time
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setMinutes(tomorrow.getMinutes() - tomorrow.getTimezoneOffset());
    document.getElementById('task-due-input').value = tomorrow.toISOString().slice(0, 16);
    
    // Reload categories options
    populateCategoryFilters();
    await populateAssigneesList();
    
    if (taskId) {
        // Edit mode
        const task = AppState.tasks.find(t => t.id === taskId);
        if (!task) return;
        
        modalTitle.textContent = 'แก้ไขข้อมูลภารกิจ';
        document.getElementById('task-edit-id').value = task.id;
        document.getElementById('task-title-input').value = task.title;
        document.getElementById('task-category-select').value = task.categoryId;
        document.getElementById('task-status-select').value = task.status;
        document.getElementById('task-due-input').value = task.dueDate.slice(0, 16);
        document.getElementById('task-desc-input').value = task.description || '';
        
        if (task.assignedTo) {
            document.getElementById('task-assignee-select').value = task.assignedTo.uid;
        } else {
            document.getElementById('task-assignee-select').value = '';
        }
        
        // Fetch saved attachments to show in pending for reference
        const attachments = await window.TaskDB.getAttachmentsForTask(taskId);
        attachments.forEach(att => {
            AppState.pendingFiles.push({
                id: att.id,
                name: att.fileName,
                size: att.fileSize,
                type: att.fileType,
                isSaved: true
            });
        });
        
        renderModalAttachments();
    } else {
        // Create mode
        modalTitle.textContent = 'ลงบันทึกงานใหม่';
        document.getElementById('task-edit-id').value = '';
    }
    
    overlay.classList.add('open');
    lucide.createIcons();
}

function closeTaskModal() {
    document.getElementById('task-modal-overlay').classList.remove('open');
    AppState.pendingFiles = [];
}

// Handles submitting the form to IndexedDB
async function saveTaskSubmit() {
    const id = document.getElementById('task-edit-id').value || 'task-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    const title = document.getElementById('task-title-input').value.trim();
    const categoryId = document.getElementById('task-category-select').value;
    const status = document.getElementById('task-status-select').value;
    const dueDate = new Date(document.getElementById('task-due-input').value).toISOString();
    const description = document.getElementById('task-desc-input').value.trim();
    const isEdit = !!document.getElementById('task-edit-id').value;
    
    const originalTask = isEdit ? AppState.tasks.find(t => t.id === id) : null;
    const createdAt = originalTask ? originalTask.createdAt : new Date().toISOString();
    const updatedAt = new Date().toISOString();
    
    // Check if there are attachments
    const hasAttachments = AppState.pendingFiles.length > 0;
    
    const assigneeSelect = document.getElementById('task-assignee-select');
    let assignedTo = null;
    if (assigneeSelect && assigneeSelect.value && window.TaskDB.mode === 'firebase') {
        const users = await window.TaskDB.getAllUsers();
        const selectedUser = users.find(u => u.uid === assigneeSelect.value);
        if (selectedUser) {
            assignedTo = {
                uid: selectedUser.uid,
                displayName: selectedUser.displayName,
                email: selectedUser.email,
                photoURL: selectedUser.photoURL
            };
        }
    }
    
    const taskData = {
        id,
        title,
        categoryId,
        status,
        dueDate,
        description,
        createdAt,
        updatedAt,
        hasAttachments,
        assignedTo
    };
    
    // 1. Save Task to IndexedDB
    await window.TaskDB.saveTask(taskData);
    
    // 2. Manage attachments
    // Find attachments to delete (if in edit mode and user removed some from UI)
    if (isEdit) {
        const savedAttachments = await window.TaskDB.getAttachmentsForTask(id);
        for (const savedAtt of savedAttachments) {
            // If saved attachment is no longer in pendingFiles list, delete it
            if (!AppState.pendingFiles.some(f => f.id === savedAtt.id)) {
                await window.TaskDB.deleteAttachment(savedAtt.id);
            }
        }
    }
    
    // Upload newly added files
    for (const pendingFile of AppState.pendingFiles) {
        if (pendingFile.isSaved) continue; // Skip already saved ones in database
        
        const attachmentData = {
            id: 'att-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
            taskId: id,
            fileName: pendingFile.name,
            fileSize: pendingFile.size,
            fileType: pendingFile.type,
            blob: pendingFile.fileObject // Store directly as a raw Blob/File
        };
        await window.TaskDB.saveAttachment(attachmentData);
    }
    
    // Update local state and close
    await loadTasks();
    closeTaskModal();
    
    if (AppState.currentView === 'dashboard') {
        renderDashboard();
    } else {
        renderTasksList();
    }
}

// Remove task completely
async function confirmDeleteTask(taskId, title) {
    const confirmed = await showConfirm(
        `คุณต้องการลบงาน "${title}" และเอกสารแนบทั้งหมดใช่หรือไม่? การกระทำนี้ไม่สามารถย้อนคืนได้`,
        'ลบงานออก',
        'danger'
    );
    if (confirmed) {
        await window.TaskDB.deleteTask(taskId);
        await loadTasks();
        showToast(`ลบงาน "${title}" เรียบร้อยแล้ว`, 'info');
        
        if (AppState.currentView === 'dashboard') {
            renderDashboard();
        } else {
            renderTasksList();
        }
    }
}

// ====================================================
// 8. TASK DETAILS CONTROLLER & WORKFLOWS
// ====================================================
async function openTaskDetailsModal(taskId) {
    const task = AppState.tasks.find(t => t.id === taskId);
    if (!task) return;
    
    const cat = AppState.categories.find(c => c.id === task.categoryId) || { name: 'ทั่วไป', color: '#6b7280' };
    const dueDetails = calculateDueDetails(task.dueDate, task.status);
    
    // Set static fields
    document.getElementById('detail-task-title').textContent = task.title;
    
    const categoryTag = document.getElementById('detail-category-tag');
    categoryTag.textContent = cat.name;
    categoryTag.setAttribute('style', `--cat-bg: rgba(${hexToRgb(cat.color)}, 0.12); --cat-color: ${cat.color}; --cat-border: rgba(${hexToRgb(cat.color)}, 0.25);`);
    
    const statusBadge = document.getElementById('detail-status-badge');
    statusBadge.textContent = task.status;
    statusBadge.className = `status-badge ${getStatusClass(task.status)}`;
    
    document.getElementById('detail-due-value').textContent = formatDateString(task.dueDate);
    
    const countdownVal = document.getElementById('detail-countdown-value');
    countdownVal.textContent = dueDetails.text;
    countdownVal.className = `detail-meta-val ${dueDetails.class}`;
    
    document.getElementById('detail-created-value').textContent = formatDateString(task.createdAt);
    document.getElementById('detail-updated-value').textContent = formatDateString(task.updatedAt);
    document.getElementById('detail-desc-value').innerHTML = task.description ? task.description.replace(/\n/g, '<br>') : '<span style="color: var(--text-muted); font-style: italic;">ไม่มีคำอธิบายเพิ่มเติม</span>';
    
    const assigneeVal = document.getElementById('detail-assignee-value');
    if (assigneeVal) {
        if (task.assignedTo) {
            assigneeVal.innerHTML = `
                <div style="display: flex; align-items: center; gap: 0.4rem;">
                    <img src="${task.assignedTo.photoURL}" alt="Avatar" style="width: 22px; height: 22px; border-radius: 50%; border: 1.5px solid var(--accent-earth);">
                    <span>${task.assignedTo.displayName}</span>
                </div>
            `;
        } else {
            assigneeVal.textContent = 'ไม่ระบุ';
        }
    }
    
    // Load Attachments list with download capabilities
    const attachments = await window.TaskDB.getAttachmentsForTask(taskId);
    document.getElementById('detail-attachment-count-text').textContent = attachments.length + ' ไฟล์';
    
    const attachmentsContainer = document.getElementById('detail-attachments-container');
    attachmentsContainer.innerHTML = '';
    
    let gdrivePdfId = null;
    
    if (attachments.length === 0) {
        attachmentsContainer.innerHTML = `<div style="color: var(--text-muted); font-size: 0.85rem; font-style: italic; padding: 0.5rem 0;">ไม่มีเอกสารแนบในงานชิ้นนี้</div>`;
    } else {
        attachments.forEach(att => {
            const item = document.createElement('div');
            item.className = 'attachment-item';
            
            const sizeFormatted = formatFileSize(att.fileSize);
            
            // Detect Google Drive attachments
            const isGDrive = att.storageType === 'google_drive' || !!att.googleDriveFileId;
            const isPdf = att.fileType === 'application/pdf' || att.fileName.toLowerCase().endsWith('.pdf');
            if (isGDrive && isPdf && !gdrivePdfId) {
                gdrivePdfId = att.googleDriveFileId;
            }
            
            item.innerHTML = `
                <div class="file-info">
                    <i data-lucide="${isGDrive ? 'cloud-lightning' : 'file-check'}" class="file-icon" style="color: ${isGDrive ? 'var(--accent-earth)' : 'var(--status-done)'};"></i>
                    <span class="file-name" title="${att.fileName}">${att.fileName}</span>
                    <span class="file-size">(${sizeFormatted})</span>
                </div>
                <div class="attachment-actions">
                    ${isGDrive ? `
                        <a href="${att.googleDriveLink || `https://drive.google.com/file/d/${att.googleDriveFileId}/view`}" target="_blank" class="icon-btn download-btn" title="เปิดดูใน Google Drive"><i data-lucide="external-link"></i></a>
                    ` : `
                        <button class="icon-btn download-btn" title="ดาวน์โหลดเอกสาร"><i data-lucide="download"></i></button>
                    `}
                </div>
            `;
            
            if (!isGDrive) {
                // Register download function for local base64/IndexedDB binary files
                item.querySelector('.download-btn').addEventListener('click', async () => {
                    await downloadAttachmentFile(att.id);
                });
            }
            
            attachmentsContainer.appendChild(item);
        });
    }
    
    // Embed Google Drive PDF Viewer iframe if a PDF file is present!
    const previewWrapperId = 'gdrive-pdf-preview-wrapper';
    let previewWrapper = document.getElementById(previewWrapperId);
    if (previewWrapper) previewWrapper.remove(); // Clear old instances
    
    if (gdrivePdfId) {
        previewWrapper = document.createElement('div');
        previewWrapper.id = previewWrapperId;
        previewWrapper.style.marginTop = '1.5rem';
        previewWrapper.innerHTML = `
            <div class="detail-desc-title" style="display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.5rem;">
                <i data-lucide="eye" style="width: 16px; height: 16px; color: var(--accent-earth);"></i>
                <span>พรีวิวตัวอย่างเอกสาร PDF (Google Drive)</span>
            </div>
            <iframe src="https://drive.google.com/file/d/${gdrivePdfId}/preview" class="gdrive-preview-iframe" allow="autoplay" style="border: 1px solid var(--glass-border); border-radius: 12px; width: 100%; height: 400px; background: #ffffff;"></iframe>
        `;
        attachmentsContainer.parentNode.appendChild(previewWrapper);
    }
    
    // Wire modal buttons based on modify permission
    const overlay = document.getElementById('detail-modal-overlay');
    const editBtn = document.getElementById('btn-detail-edit');
    const deleteBtn = document.getElementById('btn-detail-delete');

    // Rule: Can edit if (not firebase mode) OR (task is unassigned) OR (current user is the assignee)
    const isMyTask = !task.assignedTo || (currentLoggedUser && task.assignedTo.uid === currentLoggedUser.uid);
    const isOffline = window.TaskDB.mode !== 'firebase';
    const hasModifyPermission = isOffline || isMyTask;

    if (hasModifyPermission) {
        if (editBtn) editBtn.style.display = 'inline-flex';
        if (deleteBtn) deleteBtn.style.display = 'inline-flex';
        
        editBtn.onclick = () => {
            overlay.classList.remove('open');
            openTaskModal(task.id);
        };
        
        deleteBtn.onclick = () => {
            overlay.classList.remove('open');
            confirmDeleteTask(task.id, task.title);
        };
    } else {
        if (editBtn) editBtn.style.display = 'none';
        if (deleteBtn) deleteBtn.style.display = 'none';
    }
    
    document.getElementById('btn-close-detail-modal').onclick = () => overlay.classList.remove('open');
    document.getElementById('btn-close-detail-footer').onclick = () => overlay.classList.remove('open');
    
    // Subscribe to comments feed
    setupCommentsSection(task.id);
    
    overlay.classList.add('open');
    lucide.createIcons();
}

// Download binary attachment from IndexedDB / Cloud Storage
async function downloadAttachmentFile(attachmentId) {
    const att = await window.TaskDB.getAttachment(attachmentId);
    if (!att) {
        showToast('ไม่พบไฟล์เอกสารแนบ หรือไฟล์เกิดข้อผิดพลาด', 'error');
        return;
    }
    
    // In Firebase mode, if fetching the blob directly failed (CORS block),
    // getAttachment will return isDirectUrl: true. We can open the link in a new tab!
    if (att.isDirectUrl && att.downloadURL) {
        // Open downloadURL in a new tab as fallback
        const win = window.open(att.downloadURL, '_blank');
        if (win) {
            win.focus();
        } else {
            // Fallback to window navigation
            window.location.href = att.downloadURL;
        }
        return;
    }

    if (!att.blob) {
        showToast('ไม่สามารถเข้าถึงไฟล์เอกสารแนบชิ้นนี้ได้', 'error');
        return;
    }
    
    // Create an object URL from the Blob and trigger browser download
    const url = URL.createObjectURL(att.blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = att.fileName;
    document.body.appendChild(link);
    link.click();
    
    // Cleanup URL immediately after download click
    setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, 100);
}

// ====================================================
// 9. CATEGORY MANAGEMENT SYSTEM
// ====================================================
function setupCategoryForm() {
    const picker = document.getElementById('category-color-picker');
    picker.innerHTML = '';
    
    // Injects color presets circles
    PRESETS_COLORS.forEach((color, idx) => {
        const option = document.createElement('div');
        option.className = `color-option ${idx === 0 ? 'selected' : ''}`;
        option.style.backgroundColor = color;
        option.setAttribute('style', `background-color: ${color}; --color-glow: ${color};`);
        
        option.addEventListener('click', () => {
            // Remove selection of others
            document.querySelectorAll('.color-option').forEach(el => el.classList.remove('selected'));
            option.classList.add('selected');
            AppState.selectedCategoryColor = color;
        });
        
        picker.appendChild(option);
    });
    
    AppState.selectedCategoryColor = PRESETS_COLORS[0];
    
    // Save button event handler
    document.getElementById('btn-save-category').addEventListener('click', saveCategorySubmit);
    
    // Cancel editing
    document.getElementById('btn-cancel-category-edit').addEventListener('click', cancelCategoryEditing);
}

function renderCategoriesList() {
    const container = document.getElementById('categories-rows-container');
    container.innerHTML = '';
    
    if (AppState.categories.length === 0) {
        container.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 0.95rem; padding: 2rem;">ไม่มีหมวดหมู่งานที่แสดงข้อมูล</div>`;
        return;
    }

    // Render list rows of categories
    AppState.categories.forEach(cat => {
        const row = document.createElement('div');
        row.className = 'category-row';
        
        // Count tasks belonging to this category
        const count = AppState.tasks.filter(t => t.categoryId === cat.id).length;
        
        row.innerHTML = `
            <div class="cat-row-info">
                <div class="cat-color-dot" style="background-color: ${cat.color}; box-shadow: 0 0 8px ${cat.color};"></div>
                <div>
                    <div class="cat-row-name">${cat.name}</div>
                    <div class="cat-row-meta">
                        ${cat.isDefault ? 'หมวดหมู่การเงินเริ่มต้น' : 'หมวดหมู่สร้างเอง'} | <span>${count} งาน</span>
                    </div>
                </div>
            </div>
            <div class="attachment-actions">
                <button class="icon-btn edit-cat-btn" title="แก้ไขชื่อ/สีหมวดหมู่"><i data-lucide="edit-2"></i></button>
                ${!cat.isDefault ? `
                    <button class="icon-btn delete-btn delete-cat-btn" title="ลบหมวดหมู่"><i data-lucide="trash-2"></i></button>
                ` : ''}
            </div>
        `;
        
        // Edit category click handler
        row.querySelector('.edit-cat-btn').addEventListener('click', () => {
            startCategoryEdit(cat);
        });
        
        // Delete category click handler (only custom ones allowed to delete)
        const delBtn = row.querySelector('.delete-cat-btn');
        if (delBtn) {
            delBtn.addEventListener('click', () => {
                confirmDeleteCategory(cat.id, cat.name, count);
            });
        }
        
        container.appendChild(row);
    });
    
    lucide.createIcons();
}

function startCategoryEdit(cat) {
    document.getElementById('cat-form-title').textContent = 'แก้ไขข้อมูลหมวดหมู่';
    document.getElementById('category-edit-id').value = cat.id;
    document.getElementById('category-name-input').value = cat.name;
    
    // Highlight correct color picker
    document.querySelectorAll('.color-option').forEach(el => {
        el.classList.remove('selected');
        // Check if rgb matches hex or close representation
        const bgCol = el.style.backgroundColor;
        if (bgCol && (rgbToHex(bgCol) === cat.color || bgCol === cat.color)) {
            el.classList.add('selected');
        }
    });
    
    AppState.selectedCategoryColor = cat.color;
    document.getElementById('btn-cancel-category-edit').classList.remove('hidden');
}

// Convert style color RGB string back to Hex
function rgbToHex(rgb) {
    const result = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
    if (!result) return rgb;
    return "#" +
        ("0" + parseInt(result[1],10).toString(16)).slice(-2) +
        ("0" + parseInt(result[2],10).toString(16)).slice(-2) +
        ("0" + parseInt(result[3],10).toString(16)).slice(-2);
}

function cancelCategoryEditing() {
    document.getElementById('cat-form-title').textContent = 'สร้างหมวดหมู่ใหม่';
    document.getElementById('category-edit-id').value = '';
    document.getElementById('category-name-input').value = '';
    document.getElementById('btn-cancel-category-edit').classList.add('hidden');
    
    // Select first preset color
    document.querySelectorAll('.color-option').forEach(el => el.classList.remove('selected'));
    const firstOption = document.querySelector('.color-option');
    if (firstOption) firstOption.classList.add('selected');
    AppState.selectedCategoryColor = PRESETS_COLORS[0];
}

async function saveCategorySubmit() {
    const name = document.getElementById('category-name-input').value.trim();
    if (!name) {
        showToast('กรุณาระบุชื่อหมวดหมู่งาน', 'warning');
        return;
    }
    
    const editId = document.getElementById('category-edit-id').value;
    const id = editId || 'cat-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    
    const isEdit = !!editId;
    const catData = {
        id,
        name,
        color: AppState.selectedCategoryColor,
        isDefault: isEdit ? (AppState.categories.find(c => c.id === id)?.isDefault || false) : false
    };
    
    await window.TaskDB.saveCategory(catData);
    await loadCategories();
    cancelCategoryEditing();
    renderCategoriesList();
    showToast(isEdit ? `อัปเดตหมวดหมู่ "${name}" เรียบร้อยแล้ว` : `สร้างหมวดหมู่ "${name}" เรียบร้อยแล้ว`, 'success');
}

async function confirmDeleteCategory(catId, name, taskCount) {
    if (taskCount > 0) {
        showToast(`ไม่สามารถลบหมวดหมู่ "${name}" ได้ เนื่องจากยังมีงาน ${taskCount} งานอยู่ในหมวดหมู่นี้`, 'warning', 6000);
        return;
    }
    
    const confirmed = await showConfirm(`คุณต้องการลบหมวดหมู่ "${name}" ใช่หรือไม่?`, 'ลบหมวดหมู่', 'danger');
    if (confirmed) {
        await window.TaskDB.deleteCategory(catId);
        await loadCategories();
        renderCategoriesList();
        showToast(`ลบหมวดหมู่ "${name}" เรียบร้อยแล้ว`, 'info');
    }
}

// ====================================================
// 10. FIREBASE CLOUD SYNC CONTROLLER
// ====================================================

// Update dynamic database mode indicators in the sidebar and other regions
function updateDbModeUI() {
    const dbModeEl = document.getElementById('sidebar-db-mode');
    const dbDescEl = document.getElementById('sidebar-db-desc');
    const mobileDbBadgeEl = document.getElementById('mobile-db-badge');
    const mobileDbTextEl = document.getElementById('mobile-db-text');
    
    if (window.TaskDB.mode === 'firebase') {
        if (dbModeEl) {
            dbModeEl.textContent = 'Cloud Sync';
            dbModeEl.style.background = 'rgba(115, 124, 104, 0.15)';
            dbModeEl.style.color = 'var(--status-done)';
        }
        if (dbDescEl) {
            dbDescEl.textContent = `คลาวด์เรียลไทม์ (Namespace: ${window.TaskDB.prefix})`;
        }
        if (mobileDbBadgeEl && mobileDbTextEl) {
            mobileDbTextEl.textContent = 'Cloud Sync';
            mobileDbBadgeEl.style.background = 'rgba(115, 124, 104, 0.15)';
            mobileDbBadgeEl.style.color = 'var(--status-done)';
            mobileDbBadgeEl.style.borderColor = 'rgba(115, 124, 104, 0.3)';
        }
    } else {
        if (dbModeEl) {
            dbModeEl.textContent = 'Local DB';
            dbModeEl.style.background = 'rgba(181, 137, 112, 0.15)';
            dbModeEl.style.color = 'var(--accent-earth)';
        }
        if (dbDescEl) {
            dbDescEl.textContent = 'Local Storage & IndexedDB';
        }
        if (mobileDbBadgeEl && mobileDbTextEl) {
            mobileDbTextEl.textContent = 'Local DB';
            mobileDbBadgeEl.style.background = 'rgba(181, 137, 112, 0.15)';
            mobileDbBadgeEl.style.color = 'var(--accent-earth)';
            mobileDbBadgeEl.style.borderColor = 'rgba(181, 137, 112, 0.3)';
        }
    }
}

// Render Firebase Settings View state
function renderSyncSettings() {
    const apiKeyInput = document.getElementById('sync-apiKey');
    const authDomainInput = document.getElementById('sync-authDomain');
    const projectIdInput = document.getElementById('sync-projectId');
    const storageBucketInput = document.getElementById('sync-storageBucket');
    const messagingSenderIdInput = document.getElementById('sync-messagingSenderId');
    const appIdInput = document.getElementById('sync-appId');
    const prefixInput = document.getElementById('sync-prefix');
    const configJsonInput = document.getElementById('sync-config-json');
    
    const saveBtn = document.getElementById('btn-save-sync');
    const disconnectBtn = document.getElementById('btn-disconnect-sync');
    const statusCard = document.getElementById('sync-status-card');
    const statusTitle = document.getElementById('sync-status-title');
    const statusDesc = document.getElementById('sync-status-desc');

    // Populate current values from localStorage or active Firebase config
    const savedConfigStr = localStorage.getItem('finance_checklist_firebase_config');
    const isLocalOverride = localStorage.getItem('finance_checklist_local_override') === 'true';
    const savedPrefix = localStorage.getItem('finance_checklist_firebase_prefix') || 'finance_';
    
    prefixInput.value = savedPrefix;
    configJsonInput.value = '';

    let config = null;
    if (savedConfigStr) {
        try {
            config = JSON.parse(savedConfigStr);
        } catch (e) {
            console.error(e);
        }
    } else if (!isLocalOverride && window.TaskDB.mode === 'firebase' && window.TaskDB.firebaseApp) {
        config = window.TaskDB.firebaseApp.options;
    }

    if (config) {
        apiKeyInput.value = config.apiKey || '';
        authDomainInput.value = config.authDomain || '';
        projectIdInput.value = config.projectId || '';
        storageBucketInput.value = config.storageBucket || '';
        messagingSenderIdInput.value = config.messagingSenderId || '';
        appIdInput.value = config.appId || '';
        
        // Set dynamic button visibility
        disconnectBtn.classList.remove('hidden');
    } else {
        apiKeyInput.value = '';
        authDomainInput.value = '';
        projectIdInput.value = '';
        storageBucketInput.value = '';
        messagingSenderIdInput.value = '';
        appIdInput.value = '';
        disconnectBtn.classList.add('hidden');
    }

    // Render status card
    if (window.TaskDB.mode === 'firebase') {
        statusCard.className = 'sync-status-card status-online';
        statusTitle.textContent = 'สถานะ: 🟢 เชื่อมต่อ Cloud สำเร็จ';
        statusDesc.textContent = `แอปพลิเคชันกำลังเชื่อมโยงและแบ่งปันข้อมูลแบบเรียลไทม์กับทีมงานผ่านบัญชี Firebase คอนฟิกโครงการ "${window.TaskDB.firestore.app.options.projectId}" (ตารางนำหน้า: ${window.TaskDB.prefix})`;
        
        // Show migration option ONLY if there is data in IndexedDB
        checkAndShowMigration();
    } else {
        statusCard.className = 'sync-status-card status-offline';
        statusTitle.textContent = 'สถานะ: 🟡 โหมดใช้งานในเครื่อง (Offline Mode)';
        statusDesc.textContent = 'ข้อมูลทั้งหมดจะถูกเซฟไว้อย่างปลอดภัยในหน่วยความจำบราวเซอร์บนคอมพิวเตอร์เครื่องนี้เท่านั้น ไม่สามารถเปิดดูจากเครื่องอื่นได้';
        document.getElementById('sync-migration-box').classList.add('hidden');
    }

    // Render Google Drive Settings dynamically!
    renderGDriveSettings();
}

// Check if IndexedDB has any data, if yes, show migration card in Cloud Sync view
async function checkAndShowMigration() {
    const migrationBox = document.getElementById('sync-migration-box');
    try {
        const taskCount = await window.TaskDB._transaction('tasks', 'readonly', store => store.count());
        const catCount = await window.TaskDB._transaction('categories', 'readonly', store => store.count());
        const attCount = await window.TaskDB._transaction('attachments', 'readonly', store => store.count());
        
        // Show migration card if there are tasks, attachments, or custom categories
        if (taskCount > 0 || attCount > 0 || catCount > DEFAULT_CATEGORIES.length) {
            migrationBox.classList.remove('hidden');
        } else {
            migrationBox.classList.add('hidden');
        }
    } catch (e) {
        console.error("Error checking local data for migration", e);
        migrationBox.classList.add('hidden');
    }
}

// Setup Firebase settings forms and event listeners
function setupSyncSettings() {
    const configJsonInput = document.getElementById('sync-config-json');
    const saveBtn = document.getElementById('btn-save-sync');
    const disconnectBtn = document.getElementById('btn-disconnect-sync');
    const migrateBtn = document.getElementById('btn-migrate-data');
    const prefixInput = document.getElementById('sync-prefix');

    // Auto-parse Firebase Config JSON if pasted
    configJsonInput.addEventListener('input', (e) => {
        const value = e.target.value;
        if (!value.trim()) return;

        try {
            // Find JSON-like structure within paste
            let jsonString = value;
            const openBrace = value.indexOf('{');
            const closeBrace = value.lastIndexOf('}');
            
            if (openBrace !== -1 && closeBrace !== -1) {
                jsonString = value.substring(openBrace, closeBrace + 1);
            }

            // Clean up standard JS object notation to make it valid JSON
            let cleaned = jsonString
                .replace(/([a-zA-Z0-9_]+)\s*:/g, '"$1":') // keys
                .replace(/'([^']*)'/g, '"$1"') // values in single quotes
                .replace(/,\s*([}\]])/g, '$1'); // trailing commas

            const config = JSON.parse(cleaned);
            
            if (config.apiKey && config.projectId) {
                document.getElementById('sync-apiKey').value = config.apiKey || '';
                document.getElementById('sync-authDomain').value = config.authDomain || '';
                document.getElementById('sync-projectId').value = config.projectId || '';
                document.getElementById('sync-storageBucket').value = config.storageBucket || '';
                document.getElementById('sync-messagingSenderId').value = config.messagingSenderId || '';
                document.getElementById('sync-appId').value = config.appId || '';
                
                // Show success feedback
                configJsonInput.style.borderColor = 'var(--status-done)';
                setTimeout(() => {
                    configJsonInput.style.borderColor = 'var(--glass-border)';
                }, 2000);
            }
        } catch (err) {
            console.warn("Failed to auto-parse config JSON", err);
        }
    });

    // Save Sync Connection
    saveBtn.addEventListener('click', async () => {
        const apiKey = document.getElementById('sync-apiKey').value.trim();
        const authDomain = document.getElementById('sync-authDomain').value.trim();
        const projectId = document.getElementById('sync-projectId').value.trim();
        const storageBucket = document.getElementById('sync-storageBucket').value.trim();
        const messagingSenderId = document.getElementById('sync-messagingSenderId').value.trim();
        const appId = document.getElementById('sync-appId').value.trim();
        const prefix = prefixInput.value.trim() || 'finance_';

        if (!apiKey || !projectId) {
            showToast('กรุณากรอกข้อมูล apiKey และ projectId เป็นอย่างน้อย', 'warning');
            return;
        }

        const config = {
            apiKey,
            authDomain,
            projectId,
            storageBucket,
            messagingSenderId,
            appId
        };

        // Show loading state
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span>กำลังเชื่อมต่อ...</span>';

        try {
            // Save config to localStorage temporarily
            localStorage.setItem('finance_checklist_firebase_config', JSON.stringify(config));
            localStorage.setItem('finance_checklist_firebase_prefix', prefix);
            localStorage.removeItem('finance_checklist_local_override'); // Clear local override

            // Re-initialize database
            const initMode = await window.TaskDB.init();

            if (initMode === 'firebase') {
                showToast('เชื่อมต่อ Google Firebase Cloud สำเร็จแล้ว! 🎉', 'success');
                // Reload state with new database
                await loadCategories();
                await loadTasks();
                updateDbModeUI();
                renderSyncSettings();
            } else {
                throw new Error('เชื่อมต่อไม่สำเร็จ');
            }
        } catch (e) {
            console.error("Firebase connection error:", e);
            showToast('ไม่สามารถเชื่อมต่อ Firebase ได้ กรุณาตรวจสอบคีย์หรือสิทธิ์การเข้าถึงอีกครั้ง', 'error', 7000);
            // Clean up invalid keys
            localStorage.removeItem('finance_checklist_firebase_config');
            window.TaskDB.mode = 'local';
            await window.TaskDB.init();
            updateDbModeUI();
            renderSyncSettings();
        } finally {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i data-lucide="save"></i><span>บันทึกและเชื่อมต่อ Cloud</span>';
            lucide.createIcons();
        }
    });

    // Disconnect Sync Connection
    disconnectBtn.addEventListener('click', async () => {
        const confirmed = await showConfirm(
            'คุณต้องการตัดการเชื่อมต่อกับ Cloud และสลับกลับไปใช้ข้อมูลในเครื่องใช่หรือไม่?',
            'ตัดการเชื่อมต่อ',
            'danger'
        );
        if (!confirmed) return;

        localStorage.removeItem('finance_checklist_firebase_config');
        localStorage.setItem('finance_checklist_local_override', 'true'); // Persist local override
        window.TaskDB.mode = 'local';
        await window.TaskDB.init();

        showToast('ตัดการเชื่อมต่อคลาวด์แล้ว ระบบสลับกลับใช้ IndexedDB ในเครื่อง', 'info');
        
        await loadCategories();
        await loadTasks();
        updateDbModeUI();
        renderSyncSettings();
    });

    // Migrate Local Data to Cloud
    migrateBtn.addEventListener('click', async () => {
        const confirmed = await showConfirm(
            'คำเตือน: คุณแน่ใจหรือไม่ว่าต้องการนำส่งข้อมูลงานทั้งหมดย้ายขึ้น Firebase Cloud?',
            'ยืนยันซิงค์ขึ้น Cloud'
        );
        if (!confirmed) return;

        const progressContainer = document.getElementById('migration-progress-container');
        const progressBar = document.getElementById('migration-progress-bar');
        const progressText = document.getElementById('migration-progress-text');

        migrateBtn.disabled = true;
        progressContainer.classList.remove('hidden');
        progressBar.style.width = '0%';
        progressText.textContent = 'กำลังเริ่มซิงค์...';

        try {
            await window.TaskDB.migrateLocalToCloud((percent, message) => {
                progressBar.style.width = `${percent}%`;
                progressText.textContent = `${message} (${percent}%)`;
            });

            // Reload data after migration
            await loadCategories();
            await loadTasks();
            
            // Reload views
            renderSyncSettings();
            
            showToast('นำส่งและย้ายข้อมูลขึ้น Cloud สมบูรณ์แล้ว! 🚀', 'success');
            
            // Auto hide progress bar after 3 seconds
            setTimeout(() => {
                progressContainer.classList.add('hidden');
                migrateBtn.disabled = false;
            }, 3000);

        } catch (e) {
            console.error("Migration failed:", e);
            showToast('เกิดข้อผิดพลาดระหว่างซิงค์ข้อมูล: ' + e.message, 'error', 7000);
            migrateBtn.disabled = false;
            progressContainer.classList.add('hidden');
        }
    });

    // Register Google Drive form controllers
    setupGDriveSettings();
}

/**
 * ====================================================
 * Google Drive Storage Settings Controllers (Option A)
 * ====================================================
 */

// Render Google Drive settings values and live authorization states
function renderGDriveSettings() {
    const clientIdInput = document.getElementById('gdrive-client-id');
    const apiKeyInput = document.getElementById('gdrive-api-key');
    const folderIdInput = document.getElementById('gdrive-folder-id');

    const saveBtn = document.getElementById('btn-save-gdrive-config');
    const connectBtn = document.getElementById('btn-connect-gdrive');
    const connectText = document.getElementById('txt-connect-gdrive');
    
    const statusCard = document.getElementById('gdrive-status-card');
    const statusDot = document.getElementById('gdrive-status-dot');
    const statusTitle = document.getElementById('gdrive-status-title');
    const statusDesc = document.getElementById('gdrive-status-desc');

    if (!clientIdInput || !apiKeyInput || !folderIdInput) return;

    // Load configurations from global TaskDB
    const config = window.TaskDB.gdriveConfig;
    clientIdInput.value = config.clientId || '';
    apiKeyInput.value = config.apiKey || '';
    folderIdInput.value = config.folderId || '';

    // Check if Google Drive access token is validated and loaded
    const isReady = window.TaskDB.isGDriveReady();

    if (isReady) {
        if (statusCard) statusCard.className = 'sync-status-card status-online';
        if (statusDot) statusDot.style.background = '#7a9a84'; // Cozy Sage Green
        if (statusTitle) statusTitle.textContent = 'สถานะ: 🟢 เชื่อมต่อ Google Drive สำเร็จ';
        if (statusDesc) statusDesc.textContent = 'บัญชีคลาวด์ของคุณเชื่อมต่อและพร้อมสำหรับรับอัปโหลดไฟล์เอกสารหน้างานขนาดใหญ่ (PDF) แล้ว! ไม่จำกัดโควต้า Firestore';
        
        if (connectText) connectText.textContent = 'เชื่อมต่อบัญชีใหม่ / สลับบัญชี';
        if (connectBtn) {
            connectBtn.style.background = 'rgba(122, 154, 132, 0.1)';
            connectBtn.style.color = 'var(--accent-sage)';
            connectBtn.style.borderColor = 'rgba(122, 154, 132, 0.3)';
        }
    } else {
        if (statusCard) statusCard.className = 'sync-status-card status-offline';
        if (statusDot) statusDot.style.background = '#e0a96d'; // Cozy Warm Sand
        
        if (config.clientId && config.apiKey) {
            if (statusTitle) statusTitle.textContent = 'สถานะ: 🟡 บันทึกการตั้งค่าแล้ว (รอเชื่อมบัญชี)';
            if (statusDesc) statusDesc.textContent = 'ข้อมูลคีย์จัดเก็บในบราวเซอร์แล้ว กรุณากดปุ่ม "ลงชื่อเข้าใช้งาน Google Drive" ด้านล่างเพื่อมอบสิทธิ์ความปลอดภัย';
        } else {
            if (statusTitle) statusTitle.textContent = 'สถานะ: ⚪ ยังไม่ได้ตั้งค่า Google Drive';
            if (statusDesc) statusDesc.textContent = 'กรุณากรอก OAuth Client ID และ API Key จาก Google Cloud Console เพื่อเริ่มต้นติดตั้งระบบเก็บไฟล์ส่วนตัว';
        }
        
        if (connectText) connectText.textContent = 'ลงชื่อเข้าใช้งาน Google Drive';
        if (connectBtn) {
            connectBtn.style.background = 'rgba(181, 137, 112, 0.1)';
            connectBtn.style.color = 'var(--accent-earth)';
            connectBtn.style.borderColor = 'rgba(181, 137, 112, 0.3)';
        }
    }
}

// Setup Google Drive click listener rules
function setupGDriveSettings() {
    const saveBtn = document.getElementById('btn-save-gdrive-config');
    const connectBtn = document.getElementById('btn-connect-gdrive');

    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            const clientId = document.getElementById('gdrive-client-id').value.trim();
            const apiKey = document.getElementById('gdrive-api-key').value.trim();
            const folderId = document.getElementById('gdrive-folder-id').value.trim();

            if (!clientId || !apiKey) {
                showToast('กรุณากรอก Google Client ID และ Developer API Key ก่อนทำการบันทึก', 'warning');
                return;
            }

            window.TaskDB.saveGDriveConfig(clientId, apiKey, folderId);
            showToast('บันทึกคอนฟิก Google Drive สำเร็จ! 💾 กรุณากดปุ่มลงชื่อเข้าใช้ OAuth ด้านขวา', 'success', 6000);
            renderGDriveSettings();
        });
    }

    if (connectBtn) {
        connectBtn.addEventListener('click', async () => {
            const config = window.TaskDB.gdriveConfig;
            if (!config.clientId) {
                showToast('กรุณากรอก Google Client ID และกดบันทึกก่อนเชื่อมต่อ', 'warning');
                return;
            }

            connectBtn.disabled = true;
            const originalHTML = connectBtn.innerHTML;
            connectBtn.innerHTML = '<span>กำลังเชื่อมต่อบัญชี Google Cloud...</span>';

            try {
                const token = await window.TaskDB.signInGDrive();
                if (token) {
                    showToast('เชื่อมต่อ Google Drive เรียบร้อยแล้ว! 🎉 ระบบพร้อมใช้จัดเก็บไฟล์แนบ', 'success');
                }
                renderGDriveSettings();
            } catch (err) {
                console.error("Google Drive implicit connection failure:", err);
                showToast('การเชื่อมต่อ Google Drive ล้มเหลว: ' + err.message, 'error', 7000);
            } finally {
                connectBtn.disabled = false;
                connectBtn.innerHTML = originalHTML;
                lucide.createIcons();
            }
        });
    }
}

/**
 * ====================================================
 * 11. GOOGLE AUTH, PROFILE & COMMENTS FEED CONTROLLERS
 * ====================================================
 */
let currentLoggedUser = null;
let viewingUserProfileUid = null; // Stored user ID currently active in Profile page (null = viewing own profile)
let activeCommentsUnsubscribe = null;
let currentChatPhotoFile = null;

function setupAuthObserver() {
    if (window.TaskDB.mode !== 'firebase' || typeof firebase === 'undefined') {
        currentLoggedUser = null;
        updateUserUI();
        return;
    }
    
    firebase.auth().onAuthStateChanged(async (user) => {
        if (user) {
            currentLoggedUser = user;
            await window.TaskDB.saveUserProfile(user);
            console.log("Logged in user:", user.displayName);
            
            // Load Google Drive shared config and token dynamically from Firestore when user auth shifts
            window.TaskDB.loadGDriveConfig().then(() => {
                renderGDriveSettings();
            }).catch(e => console.warn(e));
        } else {
            currentLoggedUser = null;
            console.log("No user logged in.");
        }
        updateUserUI();
        await populateAssigneesList();
        
        if (AppState.currentView === 'profile') {
            renderProfilePage();
        }
    });
}

function updateUserUI() {
    const sidebarCard = document.getElementById('sidebar-user-card');
    const sidebarAvatar = document.getElementById('sidebar-user-avatar');
    const sidebarName = document.getElementById('sidebar-user-name');
    const sidebarEmail = document.getElementById('sidebar-user-email');
    const lockOverlay = document.getElementById('login-lock-overlay');
    
    if (currentLoggedUser) {
        if (sidebarCard) sidebarCard.classList.remove('hidden');
        if (sidebarAvatar) sidebarAvatar.src = currentLoggedUser.photoURL || '';
        if (sidebarName) sidebarName.textContent = currentLoggedUser.displayName || 'พนักงาน';
        if (sidebarEmail) sidebarEmail.textContent = currentLoggedUser.email || '';
        if (lockOverlay) lockOverlay.style.display = 'none'; // Unlock the app
    } else {
        if (sidebarCard) sidebarCard.classList.add('hidden');
        if (lockOverlay) lockOverlay.style.display = 'flex'; // Lock the app
    }
}

function setupProfileView() {
    const loginBtn = document.getElementById('btn-google-login');
    const lockLoginBtn = document.getElementById('btn-lock-login');
    const logoutBtn = document.getElementById('btn-google-logout');
    const saveNotesBtn = document.getElementById('btn-save-quick-notes');
    
    const triggerLogin = async (buttonEl) => {
        try {
            buttonEl.disabled = true;
            const originalHTML = buttonEl.innerHTML;
            buttonEl.textContent = 'กำลังลงชื่อเข้าใช้...';
            await window.TaskDB.signInWithGoogle();
            showToast('ลงชื่อเข้าใช้ด้วย Google สำเร็จ! 🎉', 'success');
        } catch (err) {
            console.error(err);
            showToast('ไม่สามารถเข้าสู่ระบบได้: ' + err.message, 'error', 6000);
        } finally {
            buttonEl.disabled = false;
            const googleSvgSmall = `<svg viewBox="0 0 24 24" width="18" height="18" fill="white" style="margin-right:4px;"><path d="M12.24 10.285V13.4h6.887c-.275 1.565-1.88 4.604-6.887 4.604-4.33 0-7.866-3.577-7.866-8s3.536-8 7.866-8c2.46 0 4.105 1.025 5.047 1.926l2.427-2.334C17.955 2.192 15.34 1 12.24 1 6.033 1 1 6.033 1 12.24s5.033 11.24 11.24 11.24c5.895 0 9.815-4.14 9.815-10 0-.673-.072-1.185-.16-1.695H12.24z"/></svg>`;
            buttonEl.innerHTML = `${googleSvgSmall}<span>เข้าสู่ระบบด้วย Google Account</span>`;
        }
    };

    if (loginBtn) {
        loginBtn.addEventListener('click', () => triggerLogin(loginBtn));
    }
    
    if (lockLoginBtn) {
        lockLoginBtn.addEventListener('click', () => triggerLogin(lockLoginBtn));
    }
    
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            const confirmed = await showConfirm('คุณแน่ใจว่าต้องการออกจากระบบ Google หรือไม่?', 'ออกจากระบบ', 'danger');
            if (confirmed) {
                await window.TaskDB.signOut();
                showToast('ออกจากระบบเรียบร้อยแล้ว', 'info');
            }
        });
    }
    
    if (saveNotesBtn) {
        saveNotesBtn.addEventListener('click', () => {
            const notesText = document.getElementById('profile-quick-notes').value.trim();
            if (currentLoggedUser) {
                localStorage.setItem(`finance_checklist_quicknotes_${currentLoggedUser.uid}`, notesText);
                showToast('บันทึกโน้ตย่อยส่วนตัวเรียบร้อยแล้ว! 💾', 'success');
            }
        });
    }

    const backBtn = document.getElementById('btn-back-to-my-profile');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            viewingUserProfileUid = null; // Clear view override
            renderProfilePage();
        });
    }
}

function renderProfilePage() {
    const loggedOutSection = document.getElementById('profile-logged-out');
    const loggedInSection = document.getElementById('profile-logged-in');
    
    if (!currentLoggedUser) {
        if (loggedOutSection) loggedOutSection.classList.remove('hidden');
        if (loggedInSection) loggedInSection.classList.add('hidden');
        return;
    }
    
    if (loggedOutSection) loggedOutSection.classList.add('hidden');
    if (loggedInSection) loggedInSection.classList.remove('hidden');
    
    const profileAvatar = document.getElementById('profile-user-avatar');
    const profileName = document.getElementById('profile-user-name');
    const profileEmail = document.getElementById('profile-user-email');
    
    const banner = document.getElementById('viewing-other-profile-banner');
    const logoutBtn = document.getElementById('btn-google-logout');
    const saveNotesBtn = document.getElementById('btn-save-quick-notes');
    const quickNotesArea = document.getElementById('profile-quick-notes');
    
    let targetUser = currentLoggedUser;
    
    if (viewingUserProfileUid && viewingUserProfileUid !== currentLoggedUser.uid) {
        // Fetch teammate details from AppState (or loaded users list if available)
        // We can search through task assignments or load from users list in team directory
        // To be safe, we fetch from our cached team directory list or local caches.
        // Let's check AppState.teamUsers if we populated it, or search inside tasks for users info
        let foundTeammate = null;
        for (const t of AppState.tasks) {
            if (t.assignedTo && t.assignedTo.uid === viewingUserProfileUid) {
                foundTeammate = t.assignedTo;
                break;
            }
        }
        
        if (foundTeammate) {
            targetUser = foundTeammate;
        } else {
            // Fallback: search locally stored users
            targetUser = {
                uid: viewingUserProfileUid,
                displayName: 'เพื่อนร่วมงาน',
                email: 'ข้อมูลไม่ได้เปิดเผยต่อภายนอก',
                photoURL: ''
            };
        }
        
        // Show banner and hide custom notes editing
        if (banner) banner.classList.remove('hidden');
        if (logoutBtn) logoutBtn.classList.add('hidden');
        if (saveNotesBtn) saveNotesBtn.disabled = true;
        if (quickNotesArea) {
            quickNotesArea.value = 'ไม่สามารถอ่านหรือเข้าถึงสมุดบันทึกส่วนตัวของบุคคลอื่นได้เพื่อความเป็นส่วนตัวสูงสุด 🔒';
            quickNotesArea.disabled = true;
        }
    } else {
        // Own profile view
        if (banner) banner.classList.add('hidden');
        if (logoutBtn) logoutBtn.classList.remove('hidden');
        if (saveNotesBtn) saveNotesBtn.disabled = false;
        if (quickNotesArea) {
            quickNotesArea.value = localStorage.getItem(`finance_checklist_quicknotes_${currentLoggedUser.uid}`) || '';
            quickNotesArea.disabled = false;
        }
    }
    
    if (profileAvatar) profileAvatar.src = targetUser.photoURL || '';
    if (profileName) profileName.textContent = targetUser.displayName || 'พนักงาน';
    if (profileEmail) profileEmail.textContent = targetUser.email || '';
    
    // Calculate tasks metrics based on targetUser instead of current user
    const personalTasks = AppState.tasks.filter(t => t.assignedTo && t.assignedTo.uid === targetUser.uid);
    const totalCount = personalTasks.length;
    const completedCount = personalTasks.filter(t => t.status === 'เสร็จแล้ว').length;
    const pendingCount = totalCount - completedCount;
    const rate = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
    
    const statPending = document.getElementById('profile-stat-pending');
    const statCompleted = document.getElementById('profile-stat-completed');
    const statRate = document.getElementById('profile-stat-rate');
    const progressBar = document.getElementById('profile-stat-progress-bar');
    
    if (statPending) statPending.textContent = pendingCount;
    if (statCompleted) statCompleted.textContent = completedCount;
    if (statRate) statRate.textContent = `${rate}%`;
    if (progressBar) progressBar.style.width = `${rate}%`;
    
    const listContainer = document.getElementById('profile-assigned-tasks');
    if (listContainer) {
        listContainer.innerHTML = '';
        if (personalTasks.length === 0) {
            listContainer.innerHTML = `
                <div style="text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 2rem 0;">
                    ไม่มีงานที่รับผิดชอบในขณะนี้
                </div>
            `;
        } else {
            personalTasks.forEach(task => {
                const item = document.createElement('div');
                item.className = 'assigned-task-item';
                const dueDetails = calculateDueDetails(task.dueDate, task.status);
                
                item.innerHTML = `
                    <div class="assigned-task-meta">
                        <div class="assigned-task-title">${task.title}</div>
                        <div class="assigned-task-sub">
                            <span class="due-indicator ${dueDetails.class}" style="padding: 0.1rem 0.3rem; border-radius: 4px; font-size: 0.7rem;">
                                <i data-lucide="${dueDetails.icon}" style="width: 10px; height: 10px;"></i>
                                <span>${dueDetails.text}</span>
                            </span>
                        </div>
                    </div>
                    <span class="status-badge ${getStatusClass(task.status)}" style="padding: 0.2rem 0.5rem; font-size: 0.75rem;">
                        ${task.status}
                    </span>
                `;
                
                item.addEventListener('click', () => {
                    openTaskDetailsModal(task.id);
                });
                
                listContainer.appendChild(item);
            });
            lucide.createIcons();
        }
    }
    
    // Render team directory in profile card
    renderTeamDirectory();
}

/**
 * Load and render team members list in the profile card
 */
async function renderTeamDirectory() {
    const listEl = document.getElementById('profile-team-list');
    if (!listEl) return;
    
    if (window.TaskDB.mode !== 'firebase') {
        listEl.innerHTML = `<div style="text-align:center; color:var(--text-muted); font-size:0.82rem; padding:0.75rem 0;">ใช้งานในโหมด Cloud Firebase เพื่อดูรายชื่อทีมงาน</div>`;
        return;
    }
    
    listEl.innerHTML = `<div style="text-align:center; color:var(--text-muted); font-size:0.82rem; padding:0.5rem;">กำลังโหลดรายชื่อทีมงาน...</div>`;
    
    try {
        const users = await window.TaskDB.getAllUsers();
        listEl.innerHTML = '';
        
        if (users.length === 0) {
            listEl.innerHTML = `<div style="text-align:center; color:var(--text-muted); font-size:0.82rem; padding:0.75rem 0;">ยังไม่มีทีมงานในระบบ</div>`;
            return;
        }
        
        // Determine online status by lastSeen within 15 minutes
        const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
        
        users
            .sort((a, b) => (b.lastSeen || '').localeCompare(a.lastSeen || ''))
            .forEach(user => {
                const isOnline = user.lastSeen && user.lastSeen > fifteenMinAgo;
                const isMe = currentLoggedUser && user.uid === currentLoggedUser.uid;
                
                const row = document.createElement('div');
                row.className = 'team-member-row';
                row.innerHTML = `
                    <div style="display:flex; align-items:center; gap:0.6rem; overflow:hidden;">
                        <img class="member-avatar" src="${user.photoURL || ''}" alt="Avatar"
                             onerror="this.src=''; this.style.background='var(--glass-border)'">
                        <div style="overflow:hidden;">
                            <div style="font-size:0.82rem; font-weight:600; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                                ${user.displayName || 'พนักงาน'}${isMe ? ' <span style="font-size:0.7rem; color:var(--accent-earth);">(คุณ)</span>' : ''}
                            </div>
                            <div style="font-size:0.72rem; color:var(--text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${user.email || ''}</div>
                        </div>
                    </div>
                    <div class="member-dot ${isOnline ? 'online' : 'offline'}" title="${isOnline ? 'ออนไลน์ล่าสุดภายใน 15 นาที' : 'ออฟไลน์'}"></div>
                `;
                
                row.addEventListener('click', () => {
                    viewingUserProfileUid = user.uid; // Set target uid
                    renderProfilePage(); // Re-render view with teammate statistics
                    showToast(`กำลังเปิดดูโปรไฟล์ของคุณ "${user.displayName}" 👁️`, 'info');
                });
                
                listEl.appendChild(row);
            });
    } catch (err) {
        console.error('Failed to load team directory:', err);
        listEl.innerHTML = `<div style="text-align:center; color:var(--text-muted); font-size:0.82rem; padding:0.5rem;">โหลดรายชื่อทีมไม่สำเร็จ</div>`;
    }
}

async function populateAssigneesList() {
    const select = document.getElementById('task-assignee-select');
    if (!select) return;
    
    select.innerHTML = '<option value="">-- ไม่ระบุผู้รับผิดชอบ --</option>';
    
    if (window.TaskDB.mode === 'firebase') {
        const users = await window.TaskDB.getAllUsers();
        users.forEach(user => {
            const opt = document.createElement('option');
            opt.value = user.uid;
            opt.textContent = `${user.displayName} (${user.email})`;
            select.appendChild(opt);
        });
    }
}

function setupCommentsSection(taskId) {
    if (activeCommentsUnsubscribe) {
        activeCommentsUnsubscribe();
        activeCommentsUnsubscribe = null;
    }
    
    currentChatPhotoFile = null;
    const photoStatus = document.getElementById('chat-photo-status');
    if (photoStatus) photoStatus.textContent = '';
    
    const feed = document.getElementById('detail-chat-feed');
    const inputWrapper = document.getElementById('detail-chat-input-wrapper');
    
    if (window.TaskDB.mode !== 'firebase') {
        if (feed) feed.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 1rem 0;">ระบบแสดงความคิดเห็นและรูปภาพเปิดใช้งานเฉพาะโหมดเชื่อมต่อคลาวด์ Firebase เท่านั้น</div>`;
        if (inputWrapper) inputWrapper.style.display = 'none';
        return;
    }
    
    if (inputWrapper) {
        if (currentLoggedUser) {
            inputWrapper.style.display = 'block';
        } else {
            inputWrapper.style.display = 'none';
            if (feed) feed.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 1.5rem 0;">กรุณาลงชื่อเข้าใช้งานด้วย Google Account ในแถบโปรไฟล์เพื่อรับสิทธิ์เปิดใช้งานฟีดความคิดเห็น แนบรูปภาพส่งทีมงาน</div>`;
            return;
        }
    }
    
    activeCommentsUnsubscribe = window.TaskDB.getCommentsRealtime(taskId, (comments) => {
        renderCommentsList(comments);
    });
}

function renderCommentsList(comments) {
    const feed = document.getElementById('detail-chat-feed');
    if (!feed) return;
    
    feed.innerHTML = '';
    
    if (comments.length === 0) {
        feed.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 2rem 0;">ยังไม่มีการแสดงความเห็นสำหรับงานนี้ ร่วมแชร์ข้อมูลหรือแนบรูปภาพคนแรก!</div>`;
        return;
    }
    
    comments.forEach(comment => {
        const isSelf = currentLoggedUser && comment.senderUid === currentLoggedUser.uid;
        const bubbleWrapper = document.createElement('div');
        bubbleWrapper.className = `chat-bubble-wrapper ${isSelf ? 'self' : 'other'}`;
        
        const timestamp = formatDateString(comment.createdAt);
        
        bubbleWrapper.innerHTML = `
            <img class="chat-avatar" src="${comment.senderAvatar || ''}" alt="Avatar">
            <div class="chat-bubble-content">
                <div class="chat-bubble-header">
                    <span class="chat-sender-name">${comment.senderName}</span>
                    <span class="chat-time">${timestamp}</span>
                </div>
                <div class="chat-bubble-text">
                    ${comment.message}
                    ${comment.photoUrl ? `
                        <div>
                            <img class="chat-attached-image" src="${comment.photoUrl}" alt="Attached Proof" onclick="window.open('${comment.photoUrl}', '_blank')">
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
        feed.appendChild(bubbleWrapper);
    });
    
    setTimeout(() => {
        feed.scrollTop = feed.scrollHeight;
    }, 50);
}

function setupCommentsInputListeners() {
    const photoBtn = document.getElementById('btn-chat-upload-photo');
    const photoInput = document.getElementById('chat-photo-input');
    const sendBtn = document.getElementById('btn-send-comment');
    const msgInput = document.getElementById('chat-message-input');
    const photoStatus = document.getElementById('chat-photo-status');
    
    if (photoBtn && photoInput) {
        photoBtn.addEventListener('click', () => photoInput.click());
        photoInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                currentChatPhotoFile = e.target.files[0];
                if (photoStatus) photoStatus.textContent = `ไฟล์ที่เลือก: ${currentChatPhotoFile.name}`;
            }
        });
    }
    
    if (sendBtn) {
        sendBtn.addEventListener('click', async () => {
            const currentTitle = document.getElementById('detail-task-title').textContent;
            const activeTask = AppState.tasks.find(t => t.title === currentTitle);
            if (!activeTask) return;
            
            const message = msgInput.value.trim();
            
            if (!message && !currentChatPhotoFile) {
                showToast('กรุณาพิมพ์ข้อความหรือแนบรูปภาพก่อนกดส่ง', 'warning');
                return;
            }
            
            sendBtn.disabled = true;
            const originalHTML = sendBtn.innerHTML;
            sendBtn.innerHTML = '<span>กำลังส่ง...</span>';
            
            try {
                let photoUrl = '';
                
                if (currentChatPhotoFile) {
                    if (window.TaskDB.isGDriveReady()) {
                        if (photoStatus) photoStatus.textContent = 'กำลังอัปโหลดรูปภาพลง Google Drive...';
                        const response = await window.TaskDB.uploadToGoogleDrive(
                            `comment-${Date.now()}-${currentChatPhotoFile.name}`,
                            currentChatPhotoFile.type,
                            currentChatPhotoFile
                        );
                        photoUrl = response.webViewLink;
                    } else {
                        if (photoStatus) photoStatus.textContent = 'กำลังแปลงรูปภาพประกอบ...';
                        const blobToDataURL = (blob) => {
                            return new Promise((resolve, reject) => {
                                const reader = new FileReader();
                                reader.onloadend = () => resolve(reader.result);
                                reader.onerror = reject;
                                reader.readAsDataURL(blob);
                            });
                        };
                        photoUrl = await blobToDataURL(currentChatPhotoFile);
                    }
                }
                
                const comment = {
                    taskId: activeTask.id,
                    senderUid: currentLoggedUser.uid,
                    senderName: currentLoggedUser.displayName,
                    senderAvatar: currentLoggedUser.photoURL,
                    message,
                    photoUrl
                };
                
                await window.TaskDB.saveComment(comment);
                
                msgInput.value = '';
                currentChatPhotoFile = null;
                if (photoStatus) photoStatus.textContent = '';
                if (photoInput) photoInput.value = '';
            } catch (err) {
                console.error("Failed to send comment:", err);
                showToast('ส่งความคิดเห็นล้มเหลว: ' + err.message, 'error', 6000);
            } finally {
                sendBtn.disabled = false;
                sendBtn.innerHTML = originalHTML;
                lucide.createIcons();
            }
        });
    }
}
