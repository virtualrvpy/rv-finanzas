import { getFirebase } from "./auth.js";
import { 
  collection, 
  doc, 
  addDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  deleteDoc, 
  setDoc,
  Timestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Categorías por defecto para Gastos
export const defaultExpenseCategories = [
  { id: 'cat_comida', name: 'Comida', emoji: '🍔', color: '#FF9500', type: 'expense' },
  { id: 'cat_transporte', name: 'Transporte', emoji: '🚗', color: '#007AFF', type: 'expense' },
  { id: 'cat_vivienda', name: 'Vivienda', emoji: '🏠', color: '#5856D6', type: 'expense' },
  { id: 'cat_entretenimiento', name: 'Entretenimiento', emoji: '🎉', color: '#FF2D55', type: 'expense' },
  { id: 'cat_servicios', name: 'Servicios', emoji: '💡', color: '#AF52DE', type: 'expense' },
  { id: 'cat_salud', name: 'Salud', emoji: '🏥', color: '#34C759', type: 'expense' },
  { id: 'cat_educacion', name: 'Educación', emoji: '📚', color: '#5AC8FA', type: 'expense' },
  { id: 'cat_otros_gasto', name: 'Otros', emoji: '🏷️', color: '#8E8E93', type: 'expense' },
];

// Categorías por defecto para Ingresos
export const defaultIncomeCategories = [
  { id: 'cat_sueldo', name: 'Sueldo', emoji: '💵', color: '#34C759', type: 'income' },
  { id: 'cat_venta', name: 'Venta', emoji: '🛍️', color: '#FFCC00', type: 'income' },
  { id: 'cat_inversion', name: 'Inversión', emoji: '📈', color: '#30B0C7', type: 'income' },
  { id: 'cat_regalo', name: 'Regalo', emoji: '🎁', color: '#FF9500', type: 'income' },
  { id: 'cat_otros_ingreso', name: 'Otros', emoji: '💰', color: '#8E8E93', type: 'income' },
];

/**
 * Guarda una transacción (gasto o ingreso) en Firestore.
 * @param {string} userId ID del usuario autenticado.
 * @param {Object} transaction Objeto con los datos de la transacción.
 */
export async function saveTransaction(userId, transaction) {
  const firebase = getFirebase();
  if (!firebase) throw new Error("Firebase no está inicializado.");

  const txCollection = collection(firebase.db, "users", userId, "transactions");
  
  // Convertir fecha de JS (Date) a Timestamp de Firestore
  const data = {
    amount: parseFloat(transaction.amount),
    type: transaction.type, // 'expense' | 'income'
    categoryId: transaction.categoryId,
    categoryName: transaction.categoryName,
    categoryEmoji: transaction.categoryEmoji,
    categoryColor: transaction.categoryColor,
    description: transaction.description || "",
    comments: transaction.comments || "",
    date: Timestamp.fromDate(new Date(transaction.date)), // Soporta fecha y hora
    createdAt: Timestamp.now()
  };

  const docRef = await addDoc(txCollection, data);
  return { id: docRef.id, ...data };
}

/**
 * Obtiene las transacciones de un usuario filtradas y ordenadas por fecha.
 * @param {string} userId ID del usuario autenticado.
 * @param {Object} filters Opciones de filtro (type, dateRange, categoryId, etc.)
 */
export async function getTransactions(userId, filters = {}) {
  const firebase = getFirebase();
  if (!firebase) return [];

  const txCollection = collection(firebase.db, "users", userId, "transactions");
  
  // Consulta base ordenada por fecha descendente
  let q = query(txCollection, orderBy("date", "desc"));

  // Firestore no permite múltiples desigualdades en distintos campos fácilmente sin índices,
  // por lo que aplicaremos filtros adicionales en memoria para mantener simplicidad extrema
  // y asegurar compatibilidad inmediata sin configurar índices en la consola de Firebase.
  const querySnapshot = await getDocs(q);
  const results = [];
  
  querySnapshot.forEach((doc) => {
    const data = doc.data();
    const dateJS = data.date ? data.date.toDate() : new Date();
    results.push({
      id: doc.id,
      ...data,
      date: dateJS // Convertimos a Date de JS para manejo simple en el cliente
    });
  });

  // Filtrado en memoria
  return results.filter(tx => {
    // Filtro por tipo
    if (filters.type && filters.type !== 'all' && tx.type !== filters.type) {
      return false;
    }
    // Filtro por categoría
    if (filters.categoryId && filters.categoryId !== 'all' && tx.categoryId !== filters.categoryId) {
      return false;
    }
    // Filtro por rango de fechas
    if (filters.startDate) {
      const start = new Date(filters.startDate);
      if (tx.date < start) return false;
    }
    if (filters.endDate) {
      const end = new Date(filters.endDate);
      // Ajustamos el fin del día
      end.setHours(23, 59, 59, 999);
      if (tx.date > end) return false;
    }
    // Filtro por texto (búsqueda en descripción o comentarios)
    if (filters.searchText) {
      const search = filters.searchText.toLowerCase().trim();
      const descMatch = tx.description && tx.description.toLowerCase().includes(search);
      const commentMatch = tx.comments && tx.comments.toLowerCase().includes(search);
      if (!descMatch && !commentMatch) return false;
    }
    return true;
  });
}

/**
 * Actualiza una transacción existente.
 */
export async function updateTransaction(userId, transactionId, transaction) {
  const firebase = getFirebase();
  if (!firebase) throw new Error("Firebase no está inicializado.");

  const docRef = doc(firebase.db, "users", userId, "transactions", transactionId);
  
  const data = {
    amount: parseFloat(transaction.amount),
    type: transaction.type,
    categoryId: transaction.categoryId,
    categoryName: transaction.categoryName,
    categoryEmoji: transaction.categoryEmoji,
    categoryColor: transaction.categoryColor,
    description: transaction.description || "",
    comments: transaction.comments || "",
    date: Timestamp.fromDate(new Date(transaction.date)),
    updatedAt: Timestamp.now()
  };

  await setDoc(docRef, data, { merge: true });
  return { id: transactionId, ...data };
}

/**
 * Elimina una transacción por su ID.
 */
export async function deleteTransaction(userId, transactionId) {
  const firebase = getFirebase();
  if (!firebase) throw new Error("Firebase no está inicializado.");

  const docRef = doc(firebase.db, "users", userId, "transactions", transactionId);
  await deleteDoc(docRef);
}

/**
 * Obtiene todas las categorías del usuario (predeterminadas + personalizadas de Firestore).
 */
export async function getCategories(userId) {
  const firebase = getFirebase();
  if (!firebase) {
    return [...defaultExpenseCategories, ...defaultIncomeCategories];
  }

  const catCollection = collection(firebase.db, "users", userId, "categories");
  const querySnapshot = await getDocs(catCollection);
  
  const customCategories = [];
  const overrides = {};
  querySnapshot.forEach((doc) => {
    const data = { id: doc.id, ...doc.data() };
    if (data.originalId) {
      overrides[data.originalId] = data;
    } else {
      customCategories.push(data);
    }
  });

  const mergedExpense = defaultExpenseCategories.map(cat => overrides[cat.id] || cat);
  const mergedIncome = defaultIncomeCategories.map(cat => overrides[cat.id] || cat);

  return [...mergedExpense, ...mergedIncome, ...customCategories];
}

/**
 * Guarda una nueva categoría personalizada para el usuario.
 */
export async function saveCategory(userId, category) {
  const firebase = getFirebase();
  if (!firebase) throw new Error("Firebase no está inicializado.");

  const catCollection = collection(firebase.db, "users", userId, "categories");
  
  const id = 'custom_' + Date.now();
  const data = {
    id: id,
    name: category.name.trim(),
    emoji: category.emoji.trim() || '🏷️',
    color: category.color || '#8E8E93',
    type: category.type
  };

  await setDoc(doc(catCollection, id), data);
  return data;
}

/**
 * Actualiza una categoría existente (incluye sobrescribir predeterminadas).
 */
export async function updateCategory(userId, categoryId, category) {
  const firebase = getFirebase();
  if (!firebase) throw new Error("Firebase no está inicializado.");

  const catCollection = collection(firebase.db, "users", userId, "categories");
  const docId = categoryId.startsWith('cat_') ? 'override_' + categoryId : categoryId;

  const data = {
    id: docId,
    originalId: categoryId.startsWith('cat_') ? categoryId : null,
    name: category.name.trim(),
    emoji: category.emoji.trim() || '🏷️',
    color: category.color || '#8E8E93',
    type: category.type
  };

  await setDoc(doc(catCollection, docId), data);
  return { ...data, id: categoryId };
}
