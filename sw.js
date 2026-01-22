// Basic service worker: cache shell assets for faster loads and limited offline support
const CACHE_NAME = 'lgc-ia-podcast-v1'
const ASSETS = [
    '/',
    '/index.html',
    '/css/main.css',
    '/js/app.js',
    '/favicon/favicon-32x32.png',
    '/favicon/favicon-16x16.png',
    '/favicon/apple-touch-icon.png',
]

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS)
        })
    )
})

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys
                    .filter((key) => key !== CACHE_NAME)
                    .map((oldKey) => caches.delete(oldKey))
            )
        )
    )
})

self.addEventListener('fetch', (event) => {
    const { request } = event

    if (request.method !== 'GET') return
    if (new URL(request.url).origin !== self.location.origin) return

    event.respondWith(
        caches.match(request).then((cached) => {
            if (cached) return cached
            return fetch(request).then((response) => {
                const clone = response.clone()
                caches.open(CACHE_NAME).then((cache) => cache.put(request, clone))
                return response
            })
        })
    )
})
