const CACHE='nexo-pwa-v7';
const ASSETS=['./','./index.html','./style.css','./app.js','./manifest.webmanifest'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));self.skipWaiting()});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('nexo-pwa-')&&key!==CACHE).map(key=>caches.delete(key)))));self.clients.claim()});
self.addEventListener('fetch',event=>{
 const req=event.request;
 if(req.method!=='GET'||new URL(req.url).origin!==self.location.origin)return;
 const url=new URL(req.url);
 const isAppFile=url.pathname.endsWith('/')||/\/(index\.html|app\.js|style\.css|manifest\.webmanifest)$/.test(url.pathname);
 if(isAppFile){
  event.respondWith(fetch(req).then(res=>{if(res.ok){const copy=res.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(req,copy)))}return res}).catch(()=>caches.match(req).then(res=>res||caches.match('./index.html'))));
 }else{
  event.respondWith(caches.match(req).then(res=>res||fetch(req)));
 }
});
