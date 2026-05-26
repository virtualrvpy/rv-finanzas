// Configuración de Firebase para la aplicación rv_finanzas.
// Puedes editar los valores aquí directamente, o si los dejas vacíos,
// la aplicación te permitirá ingresarlos dinámicamente desde la interfaz y se guardarán en tu navegador.

const FIREBASE_CONFIG_KEY = 'rv_finanzas_firebase_config';

const defaultFirebaseConfig = {
  apiKey: "AIzaSyDcHFo3pdBlOQLwujRZpcAG4nlLLUIPW5Q",
  authDomain: "rv-finance-3dea8.firebaseapp.com",
  projectId: "rv-finance-3dea8",
  storageBucket: "rv-finance-3dea8.firebasestorage.app",
  messagingSenderId: "1095762464446",
  appId: "1:1095762464446:web:fa8734924323bc472998ef",
  measurementId: "G-N61E8RX1CT"
};

/**
 * Obtiene la configuración de Firebase activa (estática en código o guardada en localStorage).
 */
export function getFirebaseConfig() {
  // Primero intentamos leer si hay alguna configuración guardada en localStorage
  try {
    const savedConfig = localStorage.getItem(FIREBASE_CONFIG_KEY);
    if (savedConfig) {
      const parsed = JSON.parse(savedConfig);
      // Validamos que tenga al menos las claves esenciales
      if (parsed && parsed.apiKey && parsed.projectId) {
        return parsed;
      }
    }
  } catch (e) {
    console.error("Error leyendo configuración desde localStorage:", e);
  }

  // Si no hay configuración dinámica, usamos la estática del código si está definida
  if (defaultFirebaseConfig.apiKey && defaultFirebaseConfig.projectId) {
    return defaultFirebaseConfig;
  }

  return null;
}

/**
 * Guarda una nueva configuración de Firebase de manera dinámica.
 */
export function saveFirebaseConfig(config) {
  if (!config || !config.apiKey || !config.projectId) {
    throw new Error("Configuración inválida de Firebase.");
  }
  localStorage.setItem(FIREBASE_CONFIG_KEY, JSON.stringify(config));
}

/**
 * Elimina la configuración dinámica de Firebase.
 */
export function clearFirebaseConfig() {
  localStorage.removeItem(FIREBASE_CONFIG_KEY);
}
