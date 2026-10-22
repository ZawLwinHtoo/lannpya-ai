// Delivery-point maps for dispatcher, buyer and rider.
// Google route views require a separately restricted browser key, served as /maps-config.js.
// Buyer confirmation uses Google; other Leaflet maps and route-provider boundaries stay independent.
(()=>{
  const YANGON={lat:16.8,lng:96.15};
  const valid=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a)<=90&&Math.abs(b)<=180;
  const key=()=>globalThis.LANNPYA_MAPS?.googleKey||'';
  let googleReady=null;
  let googleAuthFailed=false;
  function loadGoogle(){
    if(googleAuthFailed)return Promise.resolve(null);
    if(!key())return Promise.resolve(null);
    if(globalThis.google?.maps?.Map)return Promise.resolve(globalThis.google.maps);
    googleReady??=new Promise(resolve=>{
      let settled=false;
      const finish=maps=>{if(settled)return;settled=true;clearTimeout(timer);if(!maps){googleReady=null;s.remove();}resolve(maps);};
      const timer=setTimeout(()=>finish(null),8000);
      globalThis.__lannpyaMapsReady=()=>finish(globalThis.google?.maps||null);
      globalThis.gm_authFailure=()=>{googleAuthFailed=true;finish(null);globalThis.dispatchEvent(new Event('lannpya-google-auth-failure'));};
      const s=document.createElement('script');
      s.src=`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key())}&loading=async&auth_referrer_policy=origin&callback=__lannpyaMapsReady`;
      s.referrerPolicy='strict-origin-when-cross-origin';
      s.async=true;s.onerror=()=>finish(null);
      document.head.append(s);
    });
    return googleReady;
  }
  const mounted=[];
  function destroy(){while(mounted.length)mounted.pop()();}

  // Editable pin bound to a form's latitude/longitude fields.
  async function picker(form,{node,search,status,note,provider}){
    if(!node)return;
    const latitude=form.querySelector('[name=latitude]'),longitude=form.querySelector('[name=longitude]');
    const current=()=>latitude.value!==''&&longitude.value!==''&&valid(Number(latitude.value),Number(longitude.value))?{lat:Number(latitude.value),lng:Number(longitude.value)}:null;
    const say=(a,b)=>{if(status)status.textContent=`Pinned at ${a.toFixed(6)}, ${b.toFixed(6)}. ${note}`;};
    const set=(a,b)=>{if(!valid(a,b))return;latitude.value=a.toFixed(7);longitude.value=b.toFixed(7);say(a,b);latitude.dispatchEvent(new Event('input',{bubbles:true}));};
    const googleOnly=provider==='google';
    const googleRequested=googleOnly||globalThis.LANNPYA_MAPS?.pinProvider==='google';
    const unavailable=()=>{if(form.dataset.pinSource==='geocoded_suggestion'){latitude.value='';longitude.value='';latitude.dispatchEvent(new Event('input',{bubbles:true}));const hint=form.querySelector('[data-location-prefill]');if(hint)hint.textContent='The suggested point is withheld because the Google map could not load. Use device location or manually enter your independently selected coordinates.';}node.textContent='Google map unavailable. A separately restricted Maps JavaScript credential must authorize this local origin. Use device location or enter coordinates manually; no pin has been inferred.';if(status)status.textContent=current()?'Existing coordinates retained. Confirm or correct them before submitting.':'No delivery point selected. Google map setup is required for map selection.';};
    if(googleOnly){
      node.dataset.mapProvider='google';node.textContent='Loading Google map...';
      form.querySelectorAll('[data-load-tiles],#load-street-tiles,[data-osm-note]').forEach(n=>n.hidden=true);
    }
    const g=googleRequested?await loadGoogle():null;
    if(!form.isConnected)return;
    if(g){
      const start=current();
      let map,marker,markerKind='legacy',dragEnd;
      const extraCleanups=[];
      const off=new AbortController();
      const cleanup=()=>{off.abort();for(const release of extraCleanups)release();if(map)g.event.clearInstanceListeners(map);if(marker){if(markerKind==='advanced'){if(dragEnd)marker.removeEventListener('gmp-dragend',dragEnd);marker.map=null;}else{g.event.clearInstanceListeners(marker);marker.setMap(null);}}node.replaceChildren();};
      try{
        const markerLibrary=await g.importLibrary('marker');
        const AdvancedMarker=markerLibrary.AdvancedMarkerElement;
        const LegacyMarker=markerLibrary.Marker||g.Marker;
        if(typeof AdvancedMarker!=='function'&&typeof LegacyMarker!=='function')throw new Error('Google marker library unavailable');
        map=new g.Map(node,{center:start||YANGON,zoom:start?17:12,...(AdvancedMarker?{mapId:globalThis.LANNPYA_MAPS?.mapId||'DEMO_MAP_ID'}:{}),mapTypeControl:false,streetViewControl:false,fullscreenControl:false,clickableIcons:false});
        node.dataset.mapProvider='google';
        if(AdvancedMarker){
          markerKind='advanced';
          const pin=typeof markerLibrary.PinElement==='function'?new markerLibrary.PinElement({background:'#d93c34',borderColor:'#a72d27',glyphColor:'#fff'}):null;
          marker=new AdvancedMarker({map:start?map:null,position:start||undefined,gmpDraggable:true,title:'Drag delivery pin',...(pin?{content:pin.element}:{})});
        }else marker=new LegacyMarker({map:start?map:null,position:start||undefined,draggable:true,title:'Drag delivery pin'});
        const place=p=>{const a=typeof p?.lat==='function'?p.lat():p?.lat,b=typeof p?.lng==='function'?p.lng():p?.lng;if(!valid(a,b))return;const point={lat:a,lng:b};if(markerKind==='advanced'){marker.position=point;marker.map=map;}else{marker.setPosition(point);marker.setMap(map);}map.panTo(point);map.setZoom(17);set(a,b);};
        map.addListener('click',e=>place(e.latLng));
        if(markerKind==='advanced'){dragEnd=()=>place(marker.position);marker.addEventListener('gmp-dragend',dragEnd);}
        else marker.addListener('dragend',()=>place(marker.getPosition()));
        // Retain existing optional search behavior on non-buyer forms only.
        if(search&&!googleOnly){
          if(g.places?.PlaceAutocompleteElement){
            // Current Places widget; legacy Autocomplete is unavailable to new API projects.
            const el=new g.places.PlaceAutocompleteElement({includedRegionCodes:['mm']});
            el.className='pin-autocomplete';search.hidden=true;search.after(el);
            el.addEventListener('gmp-select',async({placePrediction})=>{const p=placePrediction.toPlace();await p.fetchFields({fields:['location']});if(p.location)place(p.location,true);},{signal:off.signal});
            extraCleanups.push(()=>el.remove(),()=>{search.hidden=false;});
          }else if(g.places?.Autocomplete){
            const ac=new g.places.Autocomplete(search,{componentRestrictions:{country:'mm'},fields:['geometry']});
            ac.addListener('place_changed',()=>{const loc=ac.getPlace()?.geometry?.location;if(loc)place(loc,true);});
            search.addEventListener('keydown',e=>{if(e.key==='Enter')e.preventDefault();},{signal:off.signal});
            extraCleanups.push(()=>g.event.clearInstanceListeners(ac),()=>document.querySelectorAll('.pac-container').forEach(n=>n.remove()));
          }else search.closest('label')?.setAttribute('hidden','');
        }
        const sync=()=>{const p=current();if(p){if(markerKind==='advanced'){marker.position=p;marker.map=map;}else{marker.setPosition(p);marker.setMap(map);}map.panTo(p);say(p.lat,p.lng);}else{if(markerKind==='advanced')marker.map=null;else marker.setMap(null);if(status)status.textContent='No delivery point selected.';}};
        for(const f of [latitude,longitude])f.addEventListener('change',sync,{signal:off.signal});
        globalThis.addEventListener('lannpya-google-auth-failure',()=>{cleanup();unavailable();},{signal:off.signal});
        if(start)say(start.lat,start.lng);
        // No implicit Places/Geocoder calls: Maps JavaScript permission is insufficient.
        if(googleOnly)search?.closest('label')?.setAttribute('hidden','');
        form.querySelectorAll('[data-load-tiles],#load-street-tiles,[data-osm-note]').forEach(n=>n.hidden=true);
        mounted.push(cleanup);
      }catch{cleanup();unavailable();}
      return;
    }
    if(googleOnly){unavailable();return;}
    search?.closest('label')?.setAttribute('hidden','');
    if(!globalThis.L){node.textContent='Map library unavailable. Type coordinates manually or contact the shop.';return;}
    const start=current();
    const map=L.map(node,{worldCopyJump:true}).setView(start?[start.lat,start.lng]:[YANGON.lat,YANGON.lng],start?16:11);
    const icon=L.divIcon({className:'buyer-map-pin',html:'<span aria-hidden="true">●</span>',iconSize:[30,38],iconAnchor:[15,30]});
    let marker;
    const place=(a,b,select)=>{if(!valid(a,b))return;if(!marker){marker=L.marker([a,b],{draggable:true,icon,autoPan:true,title:'Drag delivery pin',alt:'Selected delivery point'}).addTo(map);marker.on('dragend',()=>{const p=marker.getLatLng().wrap();place(p.lat,p.lng,true);});}else marker.setLatLng([a,b]);if(select)set(a,b);else say(a,b);};
    map.on('click',e=>{const p=e.latlng.wrap();place(p.lat,p.lng,true);});
    const off=new AbortController();
    const sync=()=>{const p=current();if(p){place(p.lat,p.lng,false);map.setView([p.lat,p.lng],16);}};
    for(const f of [latitude,longitude]){f.addEventListener('input',()=>{const p=current();if(p)say(p.lat,p.lng);},{signal:off.signal});f.addEventListener('change',sync,{signal:off.signal});}
    if(start)place(start.lat,start.lng,false);
    const tilesButton=form.querySelector('[data-load-tiles],#load-street-tiles');
    if(tilesButton)tilesButton.onclick=()=>{
      const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',referrerPolicy:'origin'}).addTo(map);
      tiles.on('tileerror',()=>{if(!form.querySelector('[data-map-error]')){const p=document.createElement('p');p.className='small';p.setAttribute('data-map-error','');p.textContent='Street tiles unavailable. Coordinate selection still works; no location has been verified.';node.after(p);}});
      tilesButton.disabled=true;
    };
    map.whenReady(()=>map.invalidateSize());
    node.closest('details')?.addEventListener('toggle',()=>map.invalidateSize(),{signal:off.signal});
    mounted.push(()=>{off.abort();map.remove();});
  }

  // Read-only pin for the rider and the buyer. Without a key the node keeps its fallback text and link.
  async function view(node){
    if(!node.dataset.lat?.trim()||!node.dataset.lng?.trim())return;
    const a=Number(node.dataset.lat),b=Number(node.dataset.lng);
    if(!valid(a,b))return;
    const g=globalThis.LANNPYA_MAPS?.pinProvider==='google'?await loadGoogle():null;
    if(!node.isConnected)return;
    if(!g){
      if(!globalThis.L)return;
      node.replaceChildren();
      const map=L.map(node).setView([a,b],16);
      L.marker([a,b],{icon:L.divIcon({className:'buyer-map-pin',html:'<span aria-hidden="true">●</span>',iconSize:[30,38],iconAnchor:[15,30]}),title:'Saved delivery point'}).addTo(map);
      const button=document.createElement('button');button.type='button';button.className='btn sm';button.textContent='Load street tiles (OpenStreetMap)';node.after(button);
      button.onclick=()=>{const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',referrerPolicy:'origin'}).addTo(map);tiles.on('tileerror',()=>{button.textContent='Tiles unavailable; saved coordinates remain available.';});button.disabled=true;};
      map.whenReady(()=>map.invalidateSize());mounted.push(()=>{map.remove();button.remove();});return;
    }
    node.replaceChildren();node.classList.add('is-google');
    const map=new g.Map(node,{center:{lat:a,lng:b},zoom:17,disableDefaultUI:true,gestureHandling:'cooperative',clickableIcons:false});
    const marker=new g.Marker({map,position:{lat:a,lng:b},title:'Delivery point'});
    mounted.push(()=>{marker.setMap(null);g.event.clearInstanceListeners(map);node.replaceChildren();});
  }

  function mount(buyerForm){
    if(buyerForm)picker(buyerForm,{node:buyerForm.querySelector('#buyer-map'),status:buyerForm.querySelector('#map-selection-status'),note:'Submit for server validation and dispatcher review.',provider:globalThis.LANNPYA_MAPS?.buyerPinProvider||'google'});
    document.querySelectorAll('form [data-pin-map]').forEach(node=>{const form=node.closest('form');picker(form,{node,search:form.querySelector('[data-pin-search]'),status:form.querySelector('[data-pin-status]'),note:node.dataset.pinNote||'Save to send this point to the rider and buyer.'});});
    document.querySelectorAll('[data-view-map]').forEach(view);
  }
  async function routeView(node,geometry,provider,stops=[]){
    if(!node?.isConnected||!geometry)return;
    if(geometry.type!=='LineString'||!Array.isArray(geometry.coordinates)||geometry.coordinates.length<2||geometry.coordinates.some(p=>!Array.isArray(p)||p.length!==2||!valid(p[1],p[0]))){node.textContent='Invalid route geometry. Use the approved stop list and navigation link.';return false;}
    // Google road data is never drawn on an unrelated Leaflet basemap.
    if(provider==='google'){
      node.textContent='Loading Google map. Route geometry will remain withheld if loading fails.';
      const g=await loadGoogle();if(!node.isConnected)return;
      if(!g){node.textContent='Google map unavailable. Route geometry is withheld; use the navigation link.';return;}
      const path=geometry.coordinates.map(([lng,lat])=>({lat,lng}));
      let map,line,pins=[];
      try{
      node.replaceChildren();
      map=new g.Map(node,{center:path[0],zoom:14,mapTypeControl:false,streetViewControl:false,gestureHandling:'cooperative'});
      line=new g.Polyline({path,map,strokeColor:'#D23F2E'});const bounds=new g.LatLngBounds();path.forEach(p=>bounds.extend(p));stops.filter(s=>valid(s.latitude,s.longitude)).forEach(s=>bounds.extend({lat:s.latitude,lng:s.longitude}));map.fitBounds(bounds);
      pins=[{position:path[0],title:'Road route start'},{position:path.at(-1),title:'Road route end'},...stops.filter(s=>valid(s.latitude,s.longitude)).map(s=>({position:{lat:s.latitude,lng:s.longitude},title:`Approved stop ${s.sequence}; geospatial accuracy unverified`}))].map(p=>new g.Marker({...p,map}));
      }catch{pins.forEach(p=>p.setMap(null));line?.setMap(null);if(map)g.event.clearInstanceListeners(map);node.textContent='Google map could not render. Geometry is withheld; use the navigation link.';return false;}
      const denied=()=>{pins.forEach(p=>p.setMap(null));line.setMap(null);node.textContent='Google map authorization failed. Geometry is withheld; use the navigation link.';};
      globalThis.addEventListener('lannpya-google-auth-failure',denied,{once:true});
      mounted.push(()=>{globalThis.removeEventListener('lannpya-google-auth-failure',denied);pins.forEach(p=>p.setMap(null));line.setMap(null);g.event.clearInstanceListeners(map);node.replaceChildren();});return true;
    }
    if(!globalThis.L){node.textContent='Map library unavailable. The ordered stop list remains available.';return;}
    const map=L.map(node),line=L.geoJSON(geometry,{style:{color:'#D23F2E',weight:4}}).addTo(map);
    for(const stop of stops)L.marker([stop.latitude,stop.longitude],{title:`Stop ${stop.sequence}`,icon:L.divIcon({className:'buyer-map-pin',html:`<b>${Number(stop.sequence)}</b>`,iconSize:[28,28]})}).addTo(map);
    map.fitBounds(line.getBounds(),{padding:[20,20],maxZoom:17});
    const button=document.createElement('button');button.type='button';button.className='btn sm';button.textContent='Load street tiles (OpenStreetMap)';node.after(button);
    button.onclick=()=>{const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',referrerPolicy:'origin'}).addTo(map);tiles.on('tileerror',()=>button.textContent='Tiles unavailable; route geometry remains visible.');button.disabled=true;};
    mounted.push(()=>{map.remove();button.remove();});
  }
  // Independent approved coordinates only. A matrix does not contain road geometry.
  function stopsView(node,stops,origin){
    if(!node?.isConnected)return;
    if(!globalThis.L){node.textContent='Map unavailable; the persisted ordered stop list remains available.';return;}
    const points=stops.filter(s=>valid(s.latitude,s.longitude));
    if(!points.length){node.textContent='No approved stop coordinates available.';return;}
    const map=L.map(node),bounds=[];
    for(const stop of points){const position=[stop.latitude,stop.longitude];bounds.push(position);L.marker(position,{title:`Approved stop ${stop.sequence}; independent accuracy unverified`,icon:L.divIcon({className:'buyer-map-pin',html:`<b>${Number(stop.sequence)}</b>`,iconSize:[28,28]})}).addTo(map);}
    if(origin&&valid(origin.latitude,origin.longitude)){const position=[origin.latitude,origin.longitude];bounds.push(position);L.marker(position,{title:'Dispatcher-selected hub',icon:L.divIcon({className:'buyer-map-pin',html:'<b>H</b>',iconSize:[28,28]})}).addTo(map);}
    map.fitBounds(bounds,{padding:[20,20],maxZoom:16});map.whenReady(()=>map.invalidateSize());
    const button=document.createElement('button');button.type='button';button.className='btn sm';button.textContent='Load street tiles (OpenStreetMap)';node.after(button);
    button.onclick=()=>{const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',referrerPolicy:'origin'}).addTo(map);tiles.on('tileerror',()=>button.textContent='Tiles unavailable; approved stop pins remain visible.');button.disabled=true;};
    mounted.push(()=>{map.remove();button.remove();});
  }
  // Buyer's map while the parcel is out: their delivery point and the rider's position. Returns its own cleanup.
  async function riderView(node,{dest,rider}){
    const none=()=>{};
    if(!node?.isConnected||!valid(dest?.lat,dest?.lng)||!valid(rider?.lat,rider?.lng))return none;
    const g=await loadGoogle();
    if(!node.isConnected)return none;
    if(g){
      const map=new g.Map(node,{center:rider,zoom:14,disableDefaultUI:true,zoomControl:true,zoomControlOptions:{position:g.ControlPosition.RIGHT_TOP},clickableIcons:false,gestureHandling:'greedy'});
      const home=new g.Marker({map,position:dest,title:'Your delivery point'});
      const bike=new g.Marker({map,position:rider,title:'Your rider',icon:{path:g.SymbolPath.CIRCLE,scale:9,fillColor:'#F0A032',fillOpacity:1,strokeColor:'#16263A',strokeWeight:3}});
      const bounds=new g.LatLngBounds();bounds.extend(dest);bounds.extend(rider);map.fitBounds(bounds,72);
      return ()=>{home.setMap(null);bike.setMap(null);g.event.clearInstanceListeners(map);node.replaceChildren();};
    }
    if(!globalThis.L){node.textContent='Map unavailable. The road view still shows where your rider is.';return none;}
    node.replaceChildren();
    const map=L.map(node,{zoomControl:false});L.control.zoom({position:'topright'}).addTo(map);
    L.marker([dest.lat,dest.lng],{icon:L.divIcon({className:'buyer-map-pin',html:'<span aria-hidden="true">●</span>',iconSize:[30,38],iconAnchor:[15,30]}),title:'Your delivery point'}).addTo(map);
    L.marker([rider.lat,rider.lng],{icon:L.divIcon({className:'rider-map-dot',html:'<i></i>',iconSize:[24,24],iconAnchor:[12,12]}),title:'Your rider'}).addTo(map);
    map.fitBounds([[dest.lat,dest.lng],[rider.lat,rider.lng]],{padding:[72,72],maxZoom:16});
    const button=document.createElement('button');button.type='button';button.className='btn sm map-tiles';button.textContent='Load street tiles (OpenStreetMap)';node.after(button);
    button.onclick=()=>{const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',referrerPolicy:'origin'}).addTo(map);tiles.on('tileerror',()=>{button.textContent='Tiles unavailable; the pins remain.';});button.disabled=true;};
    map.whenReady(()=>map.invalidateSize());
    return ()=>{map.remove();button.remove();};
  }
  // Rider's way to the hub. provider 'google' needs a browser key; otherwise Leaflet. Returns {off, setMe}.
  async function hubView(node,{hub,provider,mini=false}){
    const none={off(){},setMe(){}};
    if(!node?.isConnected||!valid(hub?.lat,hub?.lng))return none;
    const g=provider==='leaflet'?null:await loadGoogle();
    if(!node.isConnected)return none;
    const h={lat:hub.lat,lng:hub.lng},hubIcon='<span class="hub-map-pin" aria-hidden="true"><img src="assets/brand/mark-dark.svg" alt=""></span>';
    if(g){
      const map=new g.Map(node,{center:h,zoom:mini?15:16,disableDefaultUI:true,zoomControl:!mini,zoomControlOptions:{position:g.ControlPosition.RIGHT_CENTER},clickableIcons:false,gestureHandling:mini?'none':'greedy',keyboardShortcuts:!mini});
      const pin=new g.Marker({map,position:h,title:hub.name,icon:{path:g.SymbolPath.CIRCLE,scale:11,fillColor:'#16263A',fillOpacity:1,strokeColor:'#F0A032',strokeWeight:3}});
      let me=null,line=null;
      return {off(){pin.setMap(null);me?.setMap(null);line?.setMap(null);g.event.clearInstanceListeners(map);node.replaceChildren();},
        setMe(p){if(!valid(p?.lat,p?.lng))return;me?.setMap(null);line?.setMap(null);me=new g.Marker({map,position:p,title:'You',icon:{path:g.SymbolPath.CIRCLE,scale:8,fillColor:'#F0A032',fillOpacity:1,strokeColor:'#16263A',strokeWeight:3}});
          line=new g.Polyline({map,path:[p,h],strokeColor:'#16263A',strokeOpacity:0,icons:[{icon:{path:'M 0,-1 0,1',strokeOpacity:1,scale:3},offset:'0',repeat:'12px'}]});const b=new g.LatLngBounds();b.extend(p);b.extend(h);map.fitBounds(b,80);}};
    }
    if(!globalThis.L){node.textContent='Map unavailable. Use the hub address above.';return none;}
    node.replaceChildren();
    const map=L.map(node,{zoomControl:false,dragging:!mini,scrollWheelZoom:!mini,doubleClickZoom:!mini,touchZoom:!mini,keyboard:!mini,attributionControl:!mini}).setView([h.lat,h.lng],mini?15:16);
    if(!mini)L.control.zoom({position:'topright'}).addTo(map);
    // Leaflet tiles load here without a button: the rider asked for the map by opening it.
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',referrerPolicy:'origin'}).addTo(map);
    L.marker([h.lat,h.lng],{icon:L.divIcon({className:'',html:hubIcon,iconSize:[40,40],iconAnchor:[20,20]}),title:hub.name}).addTo(map);
    let me=null,line=null;map.whenReady(()=>map.invalidateSize());
    return {off(){map.remove();},
      setMe(p){if(!valid(p?.lat,p?.lng))return;me?.remove();line?.remove();me=L.marker([p.lat,p.lng],{icon:L.divIcon({className:'rider-map-dot',html:'<i></i>',iconSize:[24,24],iconAnchor:[12,12]}),title:'You'}).addTo(map);
        line=L.polyline([[p.lat,p.lng],[h.lat,h.lng]],{color:'#16263A',weight:4,dashArray:'2 10',lineCap:'round'}).addTo(map);map.fitBounds(line.getBounds(),{padding:[80,80],maxZoom:17});}};
  }
  globalThis.LannPyaCustomerMap={mount,destroy,routeView,stopsView,riderView,hubView,viewOne:view,googleEnabled:()=>!!key()};
})();
