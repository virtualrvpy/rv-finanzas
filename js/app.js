import { getFirebaseConfig, saveFirebaseConfig, clearFirebaseConfig } from "./config.js";
import { getFirebase, onAuthChange, loginWithGoogle, logoutUser } from "./auth.js";
import { getTransactions, saveTransaction, updateTransaction, deleteTransaction, getCategories, saveCategory } from "./db.js";

// === CONSTANTES Y ESTADO GLOBAL ===
let currentUser = null;
let activeTheme = localStorage.getItem('rv_theme') || 'dark';
let activeView = 'dashboard';
let isValuesHidden = localStorage.getItem('rv_privacy') === 'true';
let editTransactionId = null;
let categoriesCache = [];
let transactionsCache = [];
let unsubscribeAuth = null;

// Emojis y colores predeterminados para la creación de categorías
const EMOJIS = ['🍔', '🚗', '🏠', '🎉', '💡', '🏥', '📚', '💵', '🛍', '📈', '🎁', '💰', '🏋️', '🍿', '✈️', '💈', '🐱', '🎮', '❤️', '⚙️', '🏃', '🏅', '🎽', '👟', '🏀', '⚽', '🎾', '🏊', '🚴', '🥾', '🎯', '🧘', '🎿', '🛹', '🤸'];
const COLORS = ['#FF9500', '#007AFF', '#5856D6', '#FF2D55', '#AF52DE', '#34C759', '#5AC8FA', '#FFCC00', '#30B0C7', '#8E8E93', '#1C1D22'];

// === AL CARGAR LA PÁGINA ===
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initPrivacy();
  registerServiceWorker();
  setupEventListeners();
  checkFirebaseSetup();
});

// === CONFIGURACIÓN Y CHEQUEO DE ESTADO ===
function checkFirebaseSetup() {
  const config = getFirebaseConfig();
  
  if (!config) {
    // Si no hay configuración de Firebase, mostrar pantalla de setup y ocultar el resto
    showSetupView();
  } else {
    // Si hay configuración, inicializar Firebase y escuchar autenticación
    initAppWithFirebase();
  }
}

function initAppWithFirebase() {
  // Ocultar setup por si acaso
  document.getElementById('view-setup').style.display = 'none';
  
  const firebase = getFirebase();
  if (!firebase) {
    showToast("Error inicializando Firebase. Revisa tus credenciales.", "error");
    showSetupView();
    return;
  }
  
  // Escuchar estado de autenticación
  if (unsubscribeAuth) unsubscribeAuth();
  
  unsubscribeAuth = onAuthChange((user) => {
    if (user) {
      currentUser = user;
      document.getElementById('view-login').style.display = 'none';
      document.getElementById('main-view').style.display = 'flex';
      
      // Actualizar información del perfil en Ajustes
      updateProfileUI(user);
      
      // Actualizar estado del badge de conexión
      const badge = document.getElementById('firebase-status-badge');
      if (badge) {
        badge.textContent = 'Conectado';
        badge.className = 'firebase-badge active';
      }
      
      // Cargar datos principales
      loadUserData();
      
      // Rutear a la sección correcta
      route();
    } else {
      currentUser = null;
      document.getElementById('main-view').style.display = 'none';
      document.getElementById('view-login').style.display = 'flex';
    }
  });
}

function showSetupView() {
  document.getElementById('view-login').style.display = 'none';
  document.getElementById('main-view').style.display = 'none';
  document.getElementById('view-setup').style.display = 'flex';
  
  // Rellenar con config existente si hay algo (incompleto)
  const config = getFirebaseConfig() || {};
  document.getElementById('setup-apikey').value = config.apiKey || '';
  document.getElementById('setup-authdomain').value = config.authDomain || '';
  document.getElementById('setup-projectid').value = config.projectId || '';
  document.getElementById('setup-storagebucket').value = config.storageBucket || '';
  document.getElementById('setup-messagingid').value = config.messagingSenderId || '';
  document.getElementById('setup-appid').value = config.appId || '';
}

// === CARGA DE DATOS DE USUARIO ===
async function loadUserData() {
  if (!currentUser) return;
  
  try {
    // 1. Cargar Categorías
    categoriesCache = await getCategories(currentUser.uid);
    
    // 2. Cargar Transacciones
    await refreshTransactions();
    
    // 3. Renderizar vistas activas
    renderView(activeView);
  } catch (error) {
    console.error("Error cargando datos de usuario:", error);
    showToast("Error cargando datos. Modo offline activo.", "error");
  }
}

async function refreshTransactions() {
  if (!currentUser) return;
  // Obtenemos todas sin filtros para guardar en cache
  transactionsCache = await getTransactions(currentUser.uid);
}

// === ENRUTADO (SPA) ===
window.addEventListener('hashchange', route);

function route() {
  if (!currentUser) {
    // Si no está logueado, forzar vista de login (a menos que esté en setup)
    if (window.location.hash === '#setup') {
      showSetupView();
    } else {
      window.location.hash = '';
      document.getElementById('view-login').style.display = 'flex';
      document.getElementById('main-view').style.display = 'none';
    }
    return;
  }

  const hash = window.location.hash.substring(1) || 'dashboard';
  const allowedViews = ['dashboard', 'history', 'add', 'categories', 'settings'];
  
  if (allowedViews.includes(hash)) {
    activeView = hash;
    
    // Limpiar estado de edición al salir del formulario
    if (hash !== 'add') {
      editTransactionId = null;
    }
    
    // Transición fade-out / fade-in
    const content = document.getElementById('page-content');
    content.classList.add('fade-out');
    
    setTimeout(() => {
      // Ocultar todas las secciones
      document.querySelectorAll('.view-section').forEach(sect => {
        sect.style.display = 'none';
      });
      
      // Mostrar la sección activa
      const activeSectionId = `sect-${hash}`;
      const sect = document.getElementById(activeSectionId);
      if (sect) {
        sect.style.display = 'block';
      }
      
      // Actualizar NavBar
      document.querySelectorAll('.bottom-nav .nav-item').forEach(item => {
        item.classList.remove('active');
      });
      const navItem = document.getElementById(`nav-${hash}`);
      if (navItem) {
        navItem.classList.add('active');
      }
      
      // Renderizar el contenido específico de la sección
      renderView(hash);
      
      content.classList.remove('fade-out');
      window.scrollTo(0, 0);
    }, 150);
  }
}

// === RENDERIZADORES DE VISTAS ===
function renderView(view) {
  switch(view) {
    case 'dashboard':
      renderDashboard();
      break;
    case 'history':
      renderHistory();
      break;
    case 'add':
      renderAddForm();
      break;
    case 'categories':
      renderCategories();
      break;
    case 'settings':
      // El perfil y el dark mode ya se sincronizan mediante eventos y login
      break;
  }
}

// Dashboard Render
function renderDashboard() {
  // Calcular métricas del mes actual
  const now = new Date();
  const currentMonthTransactions = transactionsCache.filter(tx => {
    return tx.date.getMonth() === now.getMonth() && tx.date.getFullYear() === now.getFullYear();
  });
  
  let totalIncome = 0;
  let totalExpense = 0;
  
  currentMonthTransactions.forEach(tx => {
    if (tx.type === 'income') {
      totalIncome += tx.amount;
    } else {
      totalExpense += tx.amount;
    }
  });
  
  const balance = totalIncome - totalExpense;
  
  // Actualizar textos
  document.getElementById('db-balance').textContent = isValuesHidden ? 'Gs. •••••' : formatCurrency(balance);
  document.getElementById('db-income').textContent = isValuesHidden ? 'Gs. •••••' : formatCurrency(totalIncome);
  document.getElementById('db-expense').textContent = isValuesHidden ? 'Gs. •••••' : formatCurrency(totalExpense);
  
  // Colores dinámicos del balance
  const balanceEl = document.getElementById('db-balance');
  if (balance >= 0) {
    balanceEl.style.color = 'var(--text-primary)';
  } else {
    balanceEl.style.color = 'var(--danger)';
  }

  // Renderizar Gráfico de Barras de Distribución por Categoría (Gastos del Mes)
  renderDashboardChart(currentMonthTransactions);

  // Renderizar últimas 5 transacciones
  renderRecentTransactions();
}

function renderDashboardChart(monthTransactions) {
  const chartContainer = document.getElementById('dashboard-chart-container');
  chartContainer.innerHTML = '';
  
  const expensesOnly = monthTransactions.filter(tx => tx.type === 'expense');
  
  if (expensesOnly.length === 0) {
    chartContainer.innerHTML = `<div style="width:100%; text-align:center; padding: 40px 0; color:var(--text-secondary); font-size:14px;">No hay gastos registrados este mes.</div>`;
    return;
  }
  
  // Agrupar por categoría
  const categoryTotals = {};
  let maxAmount = 0;
  
  expensesOnly.forEach(tx => {
    const key = tx.categoryName || 'Otros';
    categoryTotals[key] = (categoryTotals[key] || 0) + tx.amount;
  });
  
  // Obtener top 5 categorías
  const sortedCategories = Object.entries(categoryTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  
  const topMax = sortedCategories[0][1];
  
  sortedCategories.forEach(([name, amount]) => {
    // Encontrar emoji y color original
    const catData = categoriesCache.find(c => c.name === name) || {};
    const emoji = catData.emoji || '🏷️';
    const color = catData.color || 'var(--danger)';
    const percentageHeight = (amount / topMax) * 100;
    
    const col = document.createElement('div');
    col.className = 'bar-chart-column';
    col.innerHTML = `
      <div style="font-size: 11px; font-weight:600; margin-bottom:4px;">${formatCurrency(amount, true)}</div>
      <div class="bar-chart-fill expense" style="height: ${Math.max(percentageHeight, 8)}%; background: ${color}; width: 18px;"></div>
      <div class="bar-chart-label" title="${name}">${emoji}</div>
    `;
    chartContainer.appendChild(col);
  });
}

function renderRecentTransactions() {
  const listContainer = document.getElementById('db-recent-list');
  listContainer.innerHTML = '';
  
  const now = new Date();
  const currentMonthExpenses = transactionsCache.filter(tx => {
    return tx.type === 'expense' && 
           tx.date.getMonth() === now.getMonth() && 
           tx.date.getFullYear() === now.getFullYear();
  });
  
  if (currentMonthExpenses.length === 0) {
    listContainer.innerHTML = `<div style="text-align:center; padding: 30px 0; color:var(--text-secondary); font-size:14px;">No hay gastos registrados en el mes actual.</div>`;
    return;
  }
  
  currentMonthExpenses.forEach(tx => {
    const item = createTransactionDOM(tx);
    listContainer.appendChild(item);
  });
}

// Historial Render
async function renderHistory() {
  // Cargar categorías en el selector de filtros (si no se ha hecho)
  const catFilter = document.getElementById('hist-filter-category');
  const activeCatId = catFilter.value;
  
  catFilter.innerHTML = '<option value="all">Todas las Categorías</option>';
  
  // Filtrar según el tipo de movimiento seleccionado para mostrar solo categorías relevantes
  const typeFilterVal = document.getElementById('hist-filter-type').value;
  const categoriesToShow = categoriesCache.filter(c => typeFilterVal === 'all' || c.type === typeFilterVal);
  
  categoriesToShow.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = `${c.emoji} ${c.name}`;
    catFilter.appendChild(opt);
  });
  
  // Restaurar selección si existe en la nueva lista
  if (Array.from(catFilter.options).some(opt => opt.value === activeCatId)) {
    catFilter.value = activeCatId;
  }

  // Filtrar localmente según los controles de la UI
  const type = document.getElementById('hist-filter-type').value;
  const categoryId = catFilter.value;
  const dateOption = document.getElementById('hist-filter-date').value;
  const searchText = document.getElementById('hist-search').value;
  
  let startDate = null;
  let endDate = null;
  const now = new Date();
  
  if (dateOption === 'this-month') {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (dateOption === 'last-month') {
    startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    endDate = new Date(now.getFullYear(), now.getMonth(), 0);
  } else if (dateOption === 'last-7-days') {
    startDate = new Date();
    startDate.setDate(now.getDate() - 7);
  } else if (dateOption === 'custom') {
    const startInput = document.getElementById('hist-date-start').value;
    const endInput = document.getElementById('hist-date-end').value;
    if (startInput) startDate = new Date(startInput);
    if (endInput) endDate = new Date(endInput);
  }
  
  // Aplicar filtros en memoria
  const filtered = transactionsCache.filter(tx => {
    if (type !== 'all' && tx.type !== type) return false;
    if (categoryId !== 'all' && tx.categoryId !== categoryId) return false;
    
    if (startDate) {
      // Normalizar horas
      const txZero = new Date(tx.date.getFullYear(), tx.date.getMonth(), tx.date.getDate());
      const startZero = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
      if (txZero < startZero) return false;
    }
    
    if (endDate) {
      const txZero = new Date(tx.date.getFullYear(), tx.date.getMonth(), tx.date.getDate());
      const endZero = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
      if (txZero > endZero) return false;
    }
    
    if (searchText) {
      const queryText = searchText.toLowerCase().trim();
      const descMatch = tx.description && tx.description.toLowerCase().includes(queryText);
      const commentMatch = tx.comments && tx.comments.toLowerCase().includes(queryText);
      if (!descMatch && !commentMatch) return false;
    }
    
    return true;
  });
  
  // Renderizar la lista
  const listContainer = document.getElementById('history-list');
  listContainer.innerHTML = '';
  
  if (filtered.length === 0) {
    listContainer.innerHTML = `<div style="text-align:center; padding: 40px 0; color:var(--text-secondary); font-size:14px;">No se encontraron registros coincidentes.</div>`;
    return;
  }
  
  filtered.forEach(tx => {
    const item = createTransactionDOM(tx);
    listContainer.appendChild(item);
  });
}

// Formulario de Transacción (+)
function renderAddForm() {
  const submitBtn = document.querySelector('#add-transaction-form button[type="submit"]');
  const heading = document.querySelector('#sect-add h1');
  let cancelBtn = document.getElementById('cancel-edit-btn');

  if (editTransactionId) {
    const tx = transactionsCache.find(t => t.id === editTransactionId);
    if (!tx) {
      editTransactionId = null;
      showToast("Error al cargar la transacción.", "error");
      window.location.hash = '#dashboard';
      return;
    }

    // Pre-fill form
    document.getElementById('add-amount').value = tx.amount;
    document.getElementById('add-description').value = tx.description || '';
    document.getElementById('add-comments').value = tx.comments || '';

    const d = tx.date;
    const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    document.getElementById('add-datetime').value = dateStr;

    // Set type selector
    const optExpense = document.getElementById('type-opt-expense');
    const optIncome = document.getElementById('type-opt-income');
    if (tx.type === 'expense') {
      optExpense.classList.add('selected');
      optIncome.classList.remove('selected');
    } else {
      optIncome.classList.add('selected');
      optExpense.classList.remove('selected');
    }

    updateAddCategoryGrid();

    // Select matching category after grid is rendered
    requestAnimationFrame(() => {
      document.querySelectorAll('.category-select-item').forEach(el => {
        el.classList.toggle('selected', el.dataset.id === tx.categoryId);
      });
    });

    submitBtn.textContent = 'Actualizar Cambios';
    heading.textContent = 'Editar Movimiento';

    if (!cancelBtn) {
      cancelBtn = document.createElement('button');
      cancelBtn.id = 'cancel-edit-btn';
      cancelBtn.type = 'button';
      cancelBtn.className = 'btn-primary';
      cancelBtn.style.cssText = 'background: var(--bg-tertiary); color: var(--text-primary); margin-top: 12px; box-shadow: none;';
      cancelBtn.textContent = 'Cancelar';
      submitBtn.parentNode.insertBefore(cancelBtn, submitBtn.nextSibling);
      cancelBtn.addEventListener('click', () => {
        editTransactionId = null;
        window.location.hash = '#history';
      });
    }
    cancelBtn.style.display = 'block';
    return;
  }

  // Default: new transaction
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  document.getElementById('add-datetime').value = `${year}-${month}-${day}T${hours}:${minutes}`;
  document.getElementById('add-amount').value = '';
  document.getElementById('add-description').value = '';
  document.getElementById('add-comments').value = '';

  updateAddCategoryGrid();

  submitBtn.textContent = 'Guardar Transacción';
  heading.textContent = 'Nuevo Movimiento';
  if (cancelBtn) cancelBtn.style.display = 'none';
}

function updateAddCategoryGrid() {
  const isExpense = document.getElementById('type-opt-expense').classList.contains('selected');
  const type = isExpense ? 'expense' : 'income';
  
  const grid = document.getElementById('add-category-grid');
  grid.innerHTML = '';
  
  const relevantCategories = categoriesCache.filter(c => c.type === type);
  
  relevantCategories.forEach((cat, index) => {
    const item = document.createElement('div');
    item.className = 'category-select-item';
    if (index === 0) item.classList.add('selected'); // Selecciona la primera por defecto
    item.dataset.id = cat.id;
    item.dataset.name = cat.name;
    item.dataset.emoji = cat.emoji;
    item.dataset.color = cat.color;
    
    item.innerHTML = `
      <div class="category-emoji-badge" style="background-color: ${cat.color}25; color: ${cat.color};">
        ${cat.emoji}
      </div>
      <span>${cat.name}</span>
    `;
    
    item.addEventListener('click', () => {
      document.querySelectorAll('.category-select-item').forEach(el => el.classList.remove('selected'));
      item.classList.add('selected');
    });
    
    grid.appendChild(item);
  });
}

// Categorías Render
function renderCategories() {
  const container = document.getElementById('categories-list-container');
  container.innerHTML = '';
  
  categoriesCache.forEach(cat => {
    const item = document.createElement('div');
    item.className = 'category-card-item';
    item.innerHTML = `
      <div class="category-card-emoji" style="background-color: ${cat.color}20; color: ${cat.color};">
        ${cat.emoji}
      </div>
      <div class="category-card-info">
        <div class="category-card-name">${cat.name}</div>
        <div class="category-card-type">${cat.type === 'expense' ? 'Gasto' : 'Ingreso'}</div>
      </div>
    `;
    container.appendChild(item);
  });

  // Renderizar selectores de emoji y color en el formulario de creación
  renderEmojiSelector();
  renderColorSelector();
}

function renderEmojiSelector() {
  const container = document.getElementById('new-cat-emoji-list');
  container.innerHTML = '';
  
  EMOJIS.forEach((emoji, index) => {
    const item = document.createElement('div');
    item.className = 'emoji-option';
    if (index === 0) item.classList.add('selected');
    item.textContent = emoji;
    item.dataset.emoji = emoji;
    
    item.addEventListener('click', () => {
      document.querySelectorAll('#new-cat-emoji-list .emoji-option').forEach(el => el.classList.remove('selected'));
      item.classList.add('selected');
    });
    container.appendChild(item);
  });
}

function renderColorSelector() {
  const container = document.getElementById('new-cat-color-list');
  container.innerHTML = '';
  
  COLORS.forEach((color, index) => {
    const item = document.createElement('div');
    item.className = 'color-option';
    if (index === 0) item.classList.add('selected');
    item.style.backgroundColor = color;
    item.dataset.color = color;
    
    item.addEventListener('click', () => {
      document.querySelectorAll('#new-cat-color-list .color-option').forEach(el => el.classList.remove('selected'));
      item.classList.add('selected');
    });
    container.appendChild(item);
  });
}

// === TRANSACCIONES DOM CREATION ===
function createTransactionDOM(tx) {
  const item = document.createElement('div');
  item.className = 'transaction-item';
  
  const sign = tx.type === 'income' ? '+' : '-';
  const amountClass = tx.type === 'income' ? 'income' : 'expense';
  
  // Formatear Fecha y Hora
  const dateOptions = { day: '2-digit', month: '2-digit', year: 'numeric' };
  const timeOptions = { hour: '2-digit', minute: '2-digit' };
  const formattedDate = tx.date.toLocaleDateString('es-PY', dateOptions);
  const formattedTime = tx.date.toLocaleTimeString('es-PY', timeOptions);
  
  item.innerHTML = `
    <div class="transaction-header">
      <div class="transaction-emoji" style="background-color: ${tx.categoryColor || '#8E8E93'}20; color: ${tx.categoryColor || '#8E8E93'}">
        ${tx.categoryEmoji || '🏷️'}
      </div>
      <div class="transaction-info">
        <div class="transaction-desc">${escapeHTML(tx.description)}</div>
        <div class="transaction-date">${formattedDate} a las ${formattedTime} • ${tx.categoryName}</div>
      </div>
      <div class="transaction-amount ${amountClass}">
        ${sign}${formatCurrency(tx.amount)}
      </div>
    </div>
    <div class="transaction-details">
      <div class="details-content">
        <div class="details-comment">
          <strong>Detalles:</strong> ${tx.comments ? escapeHTML(tx.comments) : '<i>Sin comentarios adicionales.</i>'}
        </div>
        <div class="details-meta">
          <span>ID de Transacción: ${tx.id.substring(0, 8)}...</span>
          <div>
            <button class="edit-btn-sm" data-id="${tx.id}">Editar</button>
            <button class="delete-btn-sm" data-id="${tx.id}">Eliminar</button>
          </div>
        </div>
      </div>
    </div>
  `;
  
  // Agregar listener para expandir/colapsar al hacer clic en el encabezado
  item.querySelector('.transaction-header').addEventListener('click', (e) => {
    // Si hace clic en eliminar, no expandir
    if (e.target.classList.contains('delete-btn-sm')) return;
    
    // Cerrar otras transacciones expandidas para un comportamiento limpio
    document.querySelectorAll('.transaction-item.expanded').forEach(otherItem => {
      if (otherItem !== item) {
        otherItem.classList.remove('expanded');
      }
    });
    
    item.classList.toggle('expanded');
  });
  
  // Listener para editar transacción
  item.querySelector('.edit-btn-sm').addEventListener('click', (e) => {
    e.stopPropagation();
    editTransactionId = e.target.dataset.id;
    window.location.hash = '#add';
  });

  // Listener para borrar transacción
  item.querySelector('.delete-btn-sm').addEventListener('click', async (e) => {
    e.stopPropagation();
    const id = e.target.dataset.id;
    if (confirm('¿Seguro que deseas eliminar esta transacción?')) {
      try {
        await deleteTransaction(currentUser.uid, id);
        showToast('Transacción eliminada', 'success');
        await refreshTransactions();
        
        // Recargar Dashboard o Historial según dónde estemos
        if (activeView === 'dashboard') {
          renderDashboard();
        } else if (activeView === 'history') {
          renderHistory();
        }
      } catch (err) {
        console.error("Error eliminando transacción:", err);
        showToast('Error al eliminar', 'error');
      }
    }
  });
  
  return item;
}

// === CONFIGURACIÓN DE EVENT LISTENERS ===
function setupEventListeners() {
  // --- PRIVACIDAD ---
  const privacyBtn = document.getElementById('toggle-privacy-btn');
  if (privacyBtn) {
    privacyBtn.addEventListener('click', togglePrivacy);
  }

  // --- LOGIN ---
  document.getElementById('google-login-btn').addEventListener('click', async () => {
    try {
      await loginWithGoogle();
      showToast("¡Sesión iniciada con éxito!", "success");
    } catch (err) {
      showToast("Error en inicio de sesión.", "error");
    }
  });

  // --- SETUP FIREBASE ---
  document.getElementById('firebase-setup-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const config = {
      apiKey: document.getElementById('setup-apikey').value.trim(),
      authDomain: document.getElementById('setup-authdomain').value.trim(),
      projectId: document.getElementById('setup-projectid').value.trim(),
      storageBucket: document.getElementById('setup-storagebucket').value.trim(),
      messagingSenderId: document.getElementById('setup-messagingid').value.trim(),
      appId: document.getElementById('setup-appid').value.trim()
    };
    
    try {
      saveFirebaseConfig(config);
      showToast("Credenciales de Firebase configuradas.", "success");
      
      // Reiniciar app con Firebase
      initAppWithFirebase();
    } catch (err) {
      showToast("Configuración inválida.", "error");
    }
  });
  
  document.getElementById('setup-cancel-btn').addEventListener('click', () => {
    // Volver a login si es posible
    document.getElementById('view-setup').style.display = 'none';
    document.getElementById('view-login').style.display = 'flex';
  });

  // --- AJUSTES ---
  // Tema Oscuro / Claro
  const themeToggle = document.getElementById('settings-darkmode-toggle');
  if (themeToggle) {
    themeToggle.addEventListener('change', (e) => {
      const newTheme = e.target.checked ? 'dark' : 'light';
      setTheme(newTheme);
    });
  }
  
  // Reestablecer Configuración de Firebase
  document.getElementById('reset-config-option').addEventListener('click', () => {
    if (confirm('¿Estás seguro de que deseas eliminar las credenciales de Firebase? Se cerrará la sesión actual.')) {
      clearFirebaseConfig();
      if (unsubscribeAuth) unsubscribeAuth();
      currentUser = null;
      document.getElementById('main-view').style.display = 'none';
      showSetupView();
      showToast("Configuración borrada.", "success");
    }
  });
  
  // Cerrar Sesión
  document.getElementById('logout-btn').addEventListener('click', async () => {
    if (confirm('¿Cerrar sesión activa?')) {
      try {
        await logoutUser();
        showToast("Sesión cerrada.", "success");
      } catch (err) {
        showToast("Error al cerrar sesión.", "error");
      }
    }
  });

  // --- PESTAÑA AÑADIR MOVIMIENTO ---
  // Alternar Gasto / Ingreso en Formulario
  const optExpense = document.getElementById('type-opt-expense');
  const optIncome = document.getElementById('type-opt-income');
  
  optExpense.addEventListener('click', () => {
    optExpense.classList.add('selected');
    optIncome.classList.remove('selected');
    updateAddCategoryGrid();
  });
  
  optIncome.addEventListener('click', () => {
    optIncome.classList.add('selected');
    optExpense.classList.remove('selected');
    updateAddCategoryGrid();
  });
  
  // Submit Formulario Añadir Transacción
  document.getElementById('add-transaction-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const amount = Math.round(parseFloat(document.getElementById('add-amount').value));
    const description = document.getElementById('add-description').value.trim();
    const datetime = document.getElementById('add-datetime').value;
    const comments = document.getElementById('add-comments').value.trim();
    
    // Obtener tipo activo
    const isExpense = optExpense.classList.contains('selected');
    const type = isExpense ? 'expense' : 'income';
    
    // Obtener categoría seleccionada
    const selectedCatEl = document.querySelector('.category-select-item.selected');
    if (!selectedCatEl) {
      showToast("Por favor selecciona una categoría.", "error");
      return;
    }
    
    const categoryId = selectedCatEl.dataset.id;
    const categoryName = selectedCatEl.dataset.name;
    const categoryEmoji = selectedCatEl.dataset.emoji;
    const categoryColor = selectedCatEl.dataset.color;
    
    const transaction = {
      amount,
      type,
      categoryId,
      categoryName,
      categoryEmoji,
      categoryColor,
      description,
      comments,
      date: new Date(datetime)
    };
    
    try {
      const submitBtn = e.target.querySelector('button[type="submit"]');
      submitBtn.disabled = true;

      if (editTransactionId) {
        await updateTransaction(currentUser.uid, editTransactionId, transaction);
        showToast("Transacción actualizada con éxito.", "success");
      } else {
        await saveTransaction(currentUser.uid, transaction);
        showToast("Transacción registrada con éxito.", "success");
      }

      // Limpiar Formulario
      editTransactionId = null;
      document.getElementById('add-amount').value = '';
      document.getElementById('add-description').value = '';
      document.getElementById('add-comments').value = '';

      submitBtn.disabled = false;

      // Refrescar y redirigir
      await refreshTransactions();
      window.location.hash = '#dashboard';
    } catch (err) {
      console.error(err);
      showToast("Error al guardar la transacción.", "error");
      e.target.querySelector('button[type="submit"]').disabled = false;
    }
  });

  // --- FILTROS DE HISTORIAL ---
  document.getElementById('hist-filter-type').addEventListener('change', renderHistory);
  document.getElementById('hist-filter-category').addEventListener('change', renderHistory);
  document.getElementById('hist-search').addEventListener('input', renderHistory);
  
  const dateFilter = document.getElementById('hist-filter-date');
  dateFilter.addEventListener('change', (e) => {
    const customRow = document.getElementById('hist-custom-date-row');
    if (e.target.value === 'custom') {
      customRow.style.display = 'flex';
    } else {
      customRow.style.display = 'none';
      renderHistory();
    }
  });
  
  document.getElementById('hist-date-start').addEventListener('change', renderHistory);
  document.getElementById('hist-date-end').addEventListener('change', renderHistory);

  // --- PESTAÑA CATEGORÍAS ---
  // Alternar tipo de categoría a crear
  const catTypeExpense = document.getElementById('cat-type-expense');
  const catTypeIncome = document.getElementById('cat-type-income');
  
  catTypeExpense.addEventListener('click', () => {
    catTypeExpense.classList.add('selected');
    catTypeIncome.classList.remove('selected');
  });
  
  catTypeIncome.addEventListener('click', () => {
    catTypeIncome.classList.add('selected');
    catTypeExpense.classList.remove('selected');
  });

  // Submit Creación Categoría
  document.getElementById('create-category-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const name = document.getElementById('new-cat-name').value.trim();
    const type = catTypeExpense.classList.contains('selected') ? 'expense' : 'income';
    
    // Emoji y Color seleccionados
    const selectedEmojiEl = document.querySelector('#new-cat-emoji-list .emoji-option.selected');
    const selectedColorEl = document.querySelector('#new-cat-color-list .color-option.selected');
    
    const emoji = selectedEmojiEl ? selectedEmojiEl.dataset.emoji : '🏷️';
    const color = selectedColorEl ? selectedColorEl.dataset.color : '#8E8E93';
    
    const category = {
      name,
      type,
      emoji,
      color
    };
    
    try {
      const submitBtn = e.target.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      
      await saveCategory(currentUser.uid, category);
      
      showToast("Categoría creada.", "success");
      document.getElementById('new-cat-name').value = '';
      
      submitBtn.disabled = false;
      
      // Refrescar caché de categorías y volver a listar
      categoriesCache = await getCategories(currentUser.uid);
      renderCategories();
    } catch (err) {
      console.error(err);
      showToast("Error al crear categoría.", "error");
      e.target.querySelector('button[type="submit"]').disabled = false;
    }
  });
}

// === TEMA OSCURO / CLARO ===
function initTheme() {
  document.body.setAttribute('data-theme', activeTheme);
  const toggle = document.getElementById('settings-darkmode-toggle');
  if (toggle) {
    toggle.checked = activeTheme === 'dark';
  }
}

function setTheme(theme) {
  activeTheme = theme;
  document.body.setAttribute('data-theme', theme);
  localStorage.setItem('rv_theme', theme);
}

// === PRIVACIDAD Y OCULTAR VALORES ===
function initPrivacy() {
  updatePrivacyIcon();
  if (isValuesHidden) {
    const balance = document.getElementById('db-balance');
    const income = document.getElementById('db-income');
    const expense = document.getElementById('db-expense');
    if (balance) balance.textContent = 'Gs. \u2022\u2022\u2022\u2022\u2022';
    if (income) income.textContent = 'Gs. \u2022\u2022\u2022\u2022\u2022';
    if (expense) expense.textContent = 'Gs. \u2022\u2022\u2022\u2022\u2022';
  }
}

function updatePrivacyIcon() {
  const icon = document.getElementById('privacy-icon');
  if (!icon) return;
  
  if (isValuesHidden) {
    // Ojo tachado (eye-slash)
    icon.innerHTML = `
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
      <line x1="1" y1="1" x2="23" y2="23"></line>
    `;
  } else {
    // Ojo abierto (eye)
    icon.innerHTML = `
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
      <circle cx="12" cy="12" r="3"></circle>
    `;
  }
}

function togglePrivacy() {
  isValuesHidden = !isValuesHidden;
  localStorage.setItem('rv_privacy', isValuesHidden.toString());
  updatePrivacyIcon();
  
  // Actualizar directamente los textos del balance card
  if (isValuesHidden) {
    document.getElementById('db-balance').textContent = 'Gs. •••••';
    document.getElementById('db-income').textContent = 'Gs. •••••';
    document.getElementById('db-expense').textContent = 'Gs. •••••';
  }
  
  // Re-renderizar la vista actual para ocultar o mostrar montos
  if (currentUser) {
    renderView(activeView);
  }
}

// === ACTUALIZAR PERFIL DE USUARIO ===
function updateProfileUI(user) {
  const avatarImg = document.getElementById('user-avatar');
  const avatarPlaceholder = document.getElementById('user-avatar-placeholder');
  
  if (user.photoURL) {
    avatarImg.src = user.photoURL;
    avatarImg.style.display = 'block';
    avatarPlaceholder.style.display = 'none';
  } else {
    avatarImg.style.display = 'none';
    avatarPlaceholder.style.display = 'flex';
    avatarPlaceholder.textContent = (user.displayName || user.email || 'U').substring(0, 1).toUpperCase();
  }
  
  document.getElementById('user-display-name').textContent = user.displayName || 'Usuario';
  document.getElementById('user-email').textContent = user.email || '';
}

// === UTILERÍAS ===
function formatCurrency(value, compact = false) {
  const isNegative = value < 0;
  const absValue = Math.abs(value);
  
  let formatted = '';
  if (compact && absValue >= 1000000) {
    formatted = (absValue / 1000000).toFixed(0) + 'M';
  } else if (compact && absValue >= 1000) {
    formatted = (absValue / 1000).toFixed(0) + 'k';
  } else {
    formatted = new Intl.NumberFormat('es-PY', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(absValue);
  }
  
  return (isNegative ? '-' : '') + 'Gs. ' + formatted;
}

function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

// Mostrar Toast Notification flotante
let toastTimeout = null;
function showToast(message, type = "success") {
  const toast = document.getElementById('toast-notification');
  if (!toast) return;

  toast.textContent = message;
  toast.className = `toast-notification show ${type}`;
  
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// === SERVICE WORKER ===
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then(reg => console.log('Service Worker registrado.', reg.scope))
        .catch(err => console.log('Fallo al registrar Service Worker.', err));
    });
  }
}
