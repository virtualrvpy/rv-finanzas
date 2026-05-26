import { getFirebaseConfig } from "./config.js";
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let appInstance = null;
let authInstance = null;
let dbInstance = null;

/**
 * Inicializa y retorna las instancias de Firebase.
 * Si no hay configuración cargada, retorna null.
 */
export function getFirebase() {
  if (appInstance) {
    return { app: appInstance, auth: authInstance, db: dbInstance };
  }

  const config = getFirebaseConfig();
  if (!config) {
    return null;
  }

  try {
    if (getApps().length === 0) {
      appInstance = initializeApp(config);
      // Inicializar Firestore con soporte offline multi-pestaña
      dbInstance = initializeFirestore(appInstance, {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager()
        })
      });
      authInstance = getAuth(appInstance);
    } else {
      appInstance = getApp();
      authInstance = getAuth(appInstance);
      // db se obtiene con la instancia por defecto si es necesario,
      // pero es mejor mantener la referencia dbInstance
    }
    return { app: appInstance, auth: authInstance, db: dbInstance };
  } catch (error) {
    console.error("Error al inicializar Firebase:", error);
    return null;
  }
}

/**
 * Inicia el proceso de autenticación con Google mediante Popup.
 */
export async function loginWithGoogle() {
  const firebase = getFirebase();
  if (!firebase) {
    throw new Error("Firebase no está configurado.");
  }

  const provider = new GoogleAuthProvider();
  // Forzar selección de cuenta
  provider.setCustomParameters({ prompt: 'select_account' });
  
  try {
    const result = await signInWithPopup(firebase.auth, provider);
    return result.user;
  } catch (error) {
    console.error("Error en Google Sign-In:", error);
    throw error;
  }
}

/**
 * Cierra la sesión activa.
 */
export async function logoutUser() {
  const firebase = getFirebase();
  if (!firebase) return;

  try {
    await signOut(firebase.auth);
  } catch (error) {
    console.error("Error al cerrar sesión:", error);
    throw error;
  }
}

/**
 * Monitorea el estado de autenticación del usuario.
 * @param {Function} callback Función que se ejecutará al cambiar el estado del usuario.
 */
export function onAuthChange(callback) {
  const firebase = getFirebase();
  if (!firebase) {
    // Si no está inicializado, notificamos con null
    setTimeout(() => callback(null), 100);
    return () => {}; // Retornar des-registro vacío
  }

  return onAuthStateChanged(firebase.auth, (user) => {
    callback(user);
  });
}
