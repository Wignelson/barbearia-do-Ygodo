// ============================================================
// CONFIGURAÇÃO DO FIREBASE
// ============================================================

export const firebaseConfig = {
  apiKey: "AIzaSyBOS6khjcNOM8hAO5yOCA6GchVqQh3dC-A",
  authDomain: "barbearia-agendamento-e071c.firebaseapp.com",
  databaseURL: "https://barbearia-agendamento-e071c-default-rtdb.firebaseio.com",
  projectId: "barbearia-agendamento-e071c",
  storageBucket: "barbearia-agendamento-e071c.firebasestorage.app",
  messagingSenderId: "282927640906",
  appId: "1:282927640906:web:68d4234605f95f3886d1b3",
  // Chave pública VAPID do Web Push (é seguro ficar no site).
  webPushPublicKey: "COLE_A_CHAVE_PUBLICA_VAPID_AQUI"
};

// WhatsApp do barbeiro no formato internacional: país + DDD + número, somente dígitos.
export const BARBER_WHATSAPP = "5511961161605";

// E-mail da conta autorizada para entrar no painel do barbeiro.
export const ADMIN_EMAIL = "wignercordeiropedroso@gmail.com";
