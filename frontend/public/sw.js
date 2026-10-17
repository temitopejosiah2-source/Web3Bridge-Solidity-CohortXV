self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }

  const title = typeof payload.title === "string" ? payload.title : "Mintroom";
  const options = {
    body: typeof payload.body === "string" ? payload.body : "There is new activity on ClassNFT.",
    icon: typeof payload.icon === "string" ? payload.icon : "/favicon.ico",
    tag: typeof payload.tag === "string" ? payload.tag : undefined,
    data: { url: typeof payload.url === "string" ? payload.url : "/activity" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const requestedUrl = event.notification.data && event.notification.data.url;
  const destination = new URL(
    typeof requestedUrl === "string"
      && requestedUrl.startsWith("/")
      && !requestedUrl.startsWith("//")
      && !requestedUrl.startsWith("/\\")
      ? requestedUrl
      : "/activity",
    self.location.origin,
  ).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          return client.focus().then(() => client.navigate(destination));
        }
      }
      return self.clients.openWindow(destination);
    }),
  );
});
