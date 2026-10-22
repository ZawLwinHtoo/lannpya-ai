// Regression for reconciling MTT's newer maps with the Phase 32–39 additions.
// Real Leaflet/Chromium, fictional points, local tiles; no provider requests.
const {test,expect}=require('./fixtures.cjs');

test('MTT rider/hub maps coexist with the added stop map and clean up correctly',async({page})=>{
  const providerCalls=[];
  await page.route('https://**/*',route=>{
    const host=new URL(route.request().url()).hostname;
    if(/google|heigit|openrouteservice/.test(host)&&host!=='fonts.googleapis.com')providerCalls.push(host);
    return route.fulfill({status:200,contentType:'text/css',body:''});
  });
  await page.goto('/#/dispatch');
  const maps=await page.evaluate(async()=>{
    const api=globalThis.LannPyaCustomerMap;
    const node=()=>{const el=document.createElement('div');el.style.cssText='width:320px;height:300px';document.body.append(el);return el;};
    const rider=node(),off=await api.riderView(rider,{dest:{lat:16.8,lng:96.13},rider:{lat:16.81,lng:96.14}});
    const riderPins=rider.querySelectorAll('.leaflet-marker-icon').length;
    off();const riderClean=!rider.querySelector('.leaflet-map-pane')&&!rider._leaflet_id;rider.remove();
    const hub=node(),handle=await api.hubView(hub,{hub:{lat:16.82,lng:96.13,name:'Fictional hub'},provider:'leaflet',mini:true});
    handle.setMe({lat:16.81,lng:96.14});
    const hubPins=hub.querySelectorAll('.leaflet-marker-icon').length;
    handle.off();const hubClean=!hub.querySelector('.leaflet-map-pane')&&!hub._leaflet_id;hub.remove();
    const stops=node();api.stopsView(stops,[{latitude:16.81,longitude:96.14,sequence:1}],{latitude:16.82,longitude:96.13});
    const stopPins=stops.querySelectorAll('.leaflet-marker-icon').length;
    const noRoadLine=stops.querySelectorAll('.leaflet-overlay-pane path').length===0;
    api.destroy();const stopClean=!stops.querySelector('.leaflet-map-pane')&&!stops._leaflet_id;stops.remove();
    return {riderPins,riderClean,hubPins,hubClean,stopPins,stopClean,noRoadLine,viewOnePreserved:typeof api.viewOne==='function'};
  });
  expect(maps).toEqual({riderPins:2,riderClean:true,hubPins:2,hubClean:true,stopPins:2,stopClean:true,noRoadLine:true,viewOnePreserved:true});
  expect(providerCalls).toEqual([]);
});
