// Real Chromium, local scripts, synthetic geometry; Google SDK is stubbed, never downloaded.
const {test, expect} = require('@playwright/test');
const path = require('node:path');
const geometry = {type:'LineString',coordinates:[[96.13,16.825],[96.128,16.819],[96.125,16.815]]};

test.beforeEach(async ({page}) => {
  await page.route('**/*', route => route.abort());
  await page.setContent('<div id="map" style="width:600px;height:400px"></div>');
});

test('Google route is withheld when an approved Google map is unavailable', async ({page}) => {
  await page.addScriptTag({path:path.resolve('frontend/js/customer-map.js')});
  await page.evaluate(g => LannPyaCustomerMap.routeView(document.querySelector('#map'),g,'google'),geometry);
  await expect(page.locator('#map')).toContainText('Route geometry is withheld');
  await expect(page.locator('.leaflet-container')).toHaveCount(0);
  expect(await page.locator('script[src*="maps.googleapis.com"]').count()).toBe(0);
});

test('Google display contract converts GeoJSON longitude latitude without changing coordinates', async ({page}) => {
  await page.evaluate(() => {
    globalThis.LANNPYA_MAPS={googleKey:'synthetic-public-test-placeholder'};
    globalThis.rendered={};
    globalThis.google={maps:{
      Map:class {constructor(node,options){rendered.center=options.center;} fitBounds(){}},
      Polyline:class {constructor(options){rendered.path=options.path;} setMap(){}},
      Marker:class {constructor(options){(rendered.pins??=[]).push(options);} setMap(){}},
      LatLngBounds:class {extend(p){(rendered.bounds??=[]).push(p);}},event:{clearInstanceListeners(){}},
    }};
  });
  await page.addScriptTag({path:path.resolve('frontend/js/customer-map.js')});
  await page.evaluate(g => LannPyaCustomerMap.routeView(document.querySelector('#map'),g,'google',[{sequence:1,latitude:16.9,longitude:96.2}]),geometry);
  expect(await page.evaluate(() => rendered.path)).toEqual(geometry.coordinates.map(([lng,lat])=>({lat,lng})));
  expect(await page.evaluate(() => rendered.center)).toEqual({lat:16.825,lng:96.13});
  expect(await page.evaluate(() => rendered.pins.map(p=>p.title))).toEqual(['Road route start','Road route end','Approved stop 1; geospatial accuracy unverified']);
  expect(await page.evaluate(() => rendered.bounds)).toContainEqual({lat:16.9,lng:96.2});
  await expect(page.locator('.leaflet-container')).toHaveCount(0);
});

test('empty coordinate attributes never become a fabricated zero-zero delivery pin', async ({page}) => {
  await page.setContent('<div data-view-map data-lat="" data-lng=""></div>');
  await page.evaluate(()=>{globalThis.L={map:()=>{throw Error('Empty pin must not create a map');}};});
  await page.addScriptTag({path:path.resolve('frontend/js/customer-map.js')});
  await page.evaluate(()=>LannPyaCustomerMap.mount());
  await expect(page.locator('.leaflet-container')).toHaveCount(0);
});

test('Leaflet continues rendering explicitly synthetic offline route geometry locally', async ({page}) => {
  await page.addScriptTag({path:path.resolve('node_modules/leaflet/dist/leaflet.js')});
  await page.addScriptTag({path:path.resolve('frontend/js/customer-map.js')});
  await page.evaluate(g => LannPyaCustomerMap.routeView(document.querySelector('#map'),g,'offline'),geometry);
  await expect(page.locator('.leaflet-container')).toHaveCount(1);
  await expect(page.getByRole('button',{name:'Load street tiles (OpenStreetMap)'})).toBeVisible();
  await page.evaluate(() => LannPyaCustomerMap.destroy());
  // Leaflet retains its container CSS class on remove(); layers and controls are removed.
  await expect(page.locator('.leaflet-map-pane')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Load street tiles (OpenStreetMap)'})).toHaveCount(0);
});

const sdkFixture=`globalThis.rendered={};globalThis.google={maps:{
Map:class{constructor(node,options){rendered.center=options.center;node.dataset.googleMock='true';}fitBounds(){}},
Polyline:class{constructor(o){rendered.path=o.path;}setMap(){}},
Marker:class{constructor(o){(rendered.pins??=[]).push(o.title);}setMap(){}},
LatLngBounds:class{extend(){}},event:{clearInstanceListeners(){}}}};globalThis.__lannpyaMapsReady();`;
async function configured(page){
 await page.evaluate(()=>{globalThis.LANNPYA_MAPS={googleKey:'fictional-public-test-credential'};});
 await page.addScriptTag({path:path.resolve('frontend/js/customer-map.js')});
}

test('Google SDK loader renders mocked geometry and markers without requesting Places',async({page})=>{
 let requests=0;
 await page.route('https://maps.googleapis.com/maps/api/js?*',r=>{requests++;expect(new URL(r.request().url()).searchParams.has('libraries')).toBe(false);return r.fulfill({contentType:'text/javascript',body:sdkFixture});});
 await configured(page);
 await page.evaluate(g=>LannPyaCustomerMap.routeView(document.querySelector('#map'),g,'google'),geometry);
 expect(requests).toBe(1);expect(await page.evaluate(()=>rendered.path)).toHaveLength(3);
 expect(await page.evaluate(()=>rendered.pins)).toEqual(['Road route start','Road route end']);
 await expect(page.locator('[data-google-mock]')).toBeVisible();
 await expect(page.locator('.leaflet-container')).toHaveCount(0);
});

test('Google SDK timeout releases loader for a deliberate retry without a Leaflet overlay',async({page})=>{
 await page.clock.install();
 await page.route('https://maps.googleapis.com/maps/api/js?*',r=>r.fulfill({contentType:'text/javascript',body:'/* no callback: simulated SDK timeout */'}));
 await configured(page);
 await page.evaluate(g=>{globalThis.pendingMap=LannPyaCustomerMap.routeView(document.querySelector('#map'),g,'google');},geometry);
 await expect(page.locator('#map')).toContainText('Loading Google map');
 await page.clock.runFor(8100);await page.evaluate(()=>pendingMap);
 await expect(page.locator('#map')).toContainText('geometry is withheld');
 await page.route('https://maps.googleapis.com/maps/api/js?*',r=>r.fulfill({contentType:'text/javascript',body:sdkFixture}));
 await page.evaluate(g=>LannPyaCustomerMap.routeView(document.querySelector('#map'),g,'google'),geometry);
 await expect(page.locator('[data-google-mock]')).toBeVisible();
});

test('Google map constructor failure withholds geometry and provides navigation guidance',async({page})=>{
 await configured(page);
 await page.evaluate(()=>{globalThis.google={maps:{Map:class{constructor(){throw Error('SDK fixture failure');}}}};});
 await page.evaluate(g=>LannPyaCustomerMap.routeView(document.querySelector('#map'),g,'google'),geometry);
 await expect(page.locator('#map')).toContainText('could not render');
 await expect(page.locator('#map')).toContainText('use the navigation link');
 await expect(page.locator('.leaflet-container')).toHaveCount(0);
});

test('Google authorization failure removes geometry and prevents automatic SDK retries',async({page})=>{
 let calls=0;
 await page.route('https://maps.googleapis.com/maps/api/js?*',r=>{calls++;return r.fulfill({contentType:'text/javascript',body:sdkFixture});});
 await configured(page);
 await page.evaluate(g=>LannPyaCustomerMap.routeView(document.querySelector('#map'),g,'google'),geometry);
 await page.evaluate(()=>gm_authFailure());
 await expect(page.locator('#map')).toContainText('authorization failed');
 await page.evaluate(g=>LannPyaCustomerMap.routeView(document.querySelector('#map'),g,'google'),geometry);
 expect(calls).toBe(1);await expect(page.locator('.leaflet-container')).toHaveCount(0);
});

test('invalid Google geometry is rejected before the SDK can load',async({page})=>{
 await configured(page);
 await page.evaluate(()=>LannPyaCustomerMap.routeView(document.querySelector('#map'),{type:'LineString',coordinates:[[96,16],[999,16]]},'google'));
 await expect(page.locator('#map')).toContainText('Invalid route geometry');
 expect(await page.locator('script[src*="maps.googleapis.com"]').count()).toBe(0);
});

test('configured Google route credential does not change independent Leaflet customer pinning',async({page})=>{
 await page.setContent('<form><input name="latitude"><input name="longitude"><div id="buyer-map" style="width:350px;height:350px"></div><p id="map-selection-status"></p></form>');
 await page.addScriptTag({path:path.resolve('node_modules/leaflet/dist/leaflet.js')});
 await configured(page);await page.evaluate(()=>LannPyaCustomerMap.mount(document.querySelector('form')));
 await expect(page.locator('.leaflet-container')).toBeVisible();
 expect(await page.locator('script[src*="maps.googleapis.com"]').count()).toBe(0);
});
