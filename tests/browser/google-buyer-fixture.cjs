// Synthetic Maps SDK contract for Chromium tests. No live tiles or geocoding.
const sdk=`(()=>{
  const state=globalThis.googleBuyerFixture={maps:[],markers:[]};
  class Map {
    constructor(node,options){this.node=node;this.options=options;this.center=options.center;this.handlers={};state.maps.push(this);node.textContent='';node.dataset.googleBuyerFixture='true';node.style.position='relative';
      node.addEventListener('click',event=>{if(event.target.closest('[data-google-fixture-marker]'))return;const box=node.getBoundingClientRect();this.handlers.click?.({latLng:{lat:()=>this.center.lat+(event.clientY-box.y-box.height/2)*0.00001,lng:()=>this.center.lng+(event.clientX-box.x-box.width/2)*0.00001}});});}
    addListener(name,handler){this.handlers[name]=handler;}panTo(p){this.center=p;}setZoom(z){this.zoom=z;}
  }
  class Marker {
    constructor(options){this.position=options.position;this.handlers={};this.node=document.createElement('button');this.node.type='button';this.node.textContent='Synthetic draggable Google pin';this.node.dataset.googleFixtureMarker='true';this.node.style.cssText='position:absolute;left:45%;top:45%;width:30px;height:30px;font-size:0;touch-action:none';this.node.setAttribute('aria-label',options.title);state.markers.push(this);this.setMap(options.map);
      let start=null;this.node.addEventListener('pointerdown',e=>{start={x:e.clientX,y:e.clientY,p:{...this.position}};this.node.setPointerCapture(e.pointerId);e.stopPropagation();});
      this.node.addEventListener('pointerup',e=>{if(!start)return;const moved=e.clientX!==start.x||e.clientY!==start.y;this.position={lat:start.p.lat+(e.clientY-start.y)*0.00001,lng:start.p.lng+(e.clientX-start.x)*0.00001};start=null;if(moved)this.handlers.dragend?.();e.stopPropagation();});}
    addListener(name,handler){this.handlers[name]=handler;}setPosition(p){this.position=p;}getPosition(){return this.position;}setMap(map){this.node.remove();this.map=map;if(map&&this.position)map.node.append(this.node);}
  }
  globalThis.google={maps:{Map,Marker,importLibrary:async name=>name==='marker'?{Marker}:Promise.reject(new Error('Unsupported fixture library')),event:{clearInstanceListeners(object){object.handlers={};}}}};
  globalThis.__lannpyaMapsReady();
})();`;
async function installGoogleBuyerFixture(page){
  await page.route('https://maps.googleapis.com/maps/api/js?*',route=>route.fulfill({contentType:'text/javascript',body:sdk}));
}
module.exports={installGoogleBuyerFixture};
