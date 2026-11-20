// Only handles shopping notifications; regular navigation and network requests are left to the browser.
self.addEventListener('push',event=>{
  let data={};
  try{data=event.data.json()}catch{}
  event.waitUntil(self.registration.showNotification('Okti · Wspólne zakupy',{
    body:data.nick?'Do zakupów dołącza '+data.nick+'.':'Nowy uczestnik dołącza do zakupów.',
    tag:'shopping-join-'+data.id+'-'+data.revision,icon:new URL('app-icon-180.png',self.registration.scope).href,
    data:{id:data.id,key:data.key}
  }));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const data=event.notification.data || {};
  event.waitUntil((async()=>{
    const root=new URL(self.registration.scope);
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const app=windows.find(client=>{
      const u=new URL(client.url);
      return u.origin===root.origin && [root.pathname,root.pathname+'index.html'].includes(u.pathname);
    });
    if(app){
      await app.focus();app.postMessage({type:'shopping-participants',...data});return;
    }
    root.searchParams.set('source','home-screen');
    root.hash=new URLSearchParams({uczestnicy:data.id || '',osoba:data.key || ''}).toString();
    await self.clients.openWindow(root.href);
  })());
});
