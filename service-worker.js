self.addEventListener("push", function (event) {

    let data = {};

    try {

        data = event.data ? event.data.json() : {};

    } catch (e) {

        data = {
            title: "إشعار جديد",
            body: event.data ? event.data.text() : ""
        };

    }

    const title =
        data.title || "مدرسة التراث الكربلائي الحسيني";

    const options = {
        body: data.body || "",
        icon: data.icon || "icon-192.png",
        badge: data.icon || "icon-192.png",
        dir: "rtl",
        vibrate: [200, 100, 200, 100, 300],
        requireInteraction: true,
        renotify: true,
        tag: data.tag || ("n-" + Date.now()),
        silent: false,
        lang: "ar",
        data: { url: data.url || self.registration.scope }
    };

    event.waitUntil(
        self.registration.showNotification(title, options)
    );

});


self.addEventListener("notificationclick", function (event) {

    event.notification.close();

    const url =
        (event.notification.data && event.notification.data.url) || self.registration.scope;

    event.waitUntil(
        clients
            .matchAll({ type: "window", includeUncontrolled: true })
            .then(function (clientList) {

                for (const client of clientList) {

                    if ("focus" in client) {

                        return client.focus();

                    }

                }

                if (clients.openWindow) {

                    return clients.openWindow(url);

                }

            })
    );

});

self.addEventListener("install",()=>self.skipWaiting());
self.addEventListener("activate",e=>e.waitUntil(self.clients.claim()));
