self.addEventListener("push", (event) => {
  let dados = {};
  try { dados = event.data ? event.data.json() : {}; } catch { dados = { body: event.data?.text() || "Há um novo agendamento." }; }
  event.waitUntil(self.registration.showNotification(dados.title || "Novo agendamento", {
    body: dados.body || "Um cliente marcou um horário.",
    icon: "./img/favicon.svg",
    badge: "./img/favicon.svg",
    data: { url: "./admin.html" }
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((janelas) => {
    for (const janela of janelas) if ("focus" in janela) return janela.focus();
    return clients.openWindow(event.notification.data?.url || "./admin.html");
  }));
});
