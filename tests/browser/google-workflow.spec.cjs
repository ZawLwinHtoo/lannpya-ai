// Synthetic fixture responses only. Every Compute Routes operation is intercepted locally.
const {test,expect,saveManual}=require('./fixtures.cjs');
const fs=require('node:fs');
const path=require('node:path');
test.beforeEach(async({page})=>{await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));});
async function order(page){
  await page.goto('/#/manual');const f=page.locator('#manual-form');await expect(f).toBeVisible();
  for(const [k,v]of Object.entries({name:'Fictional Google Test Buyer',phone:'09790000000',item:'Test shirt',street:'Synthetic street',expected:'25000'}))await f.locator(`[name=${k}]`).fill(v);
  await f.locator('[name=areaId]').selectOption('Hlaing');await f.locator('[name=received]').check();
  await saveManual(page,f);
  return new URL(page.url()).hash.split('/').at(-1);
}
async function mockGoogle(page,fail=false,observation='GOOGLE_MOCK'){
  const posts=[];
  await page.route('**/dashboard/api',route=>{
    const q=route.request().postDataJSON();
    if(q.path==='/api/routes/google-demo/status')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({status:200,data:{enabled:true,maximum_requests:1,reserved_requests:posts.length,remaining_requests:1-posts.length,explicit_consent_required:true,matrix_supported:false}})});
    if(q.path!=='/api/routes/google-demo')return route.continue();
    posts.push(q);
    if(fail)return route.fulfill({status:429,contentType:'application/json',body:JSON.stringify({error:{code:'ROUTING_RATE_LIMITED',message:'Google quota rejected this request'}})});
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({status:200,data:{observation,order_id:q.body.order_id,request_id:q.body.request_id,route:{provider:'google',origin:q.body.origin,destination:{latitude:16.815,longitude:96.125},mode:'DRIVE',distance_meters:1741,duration_seconds:405,geometry:{type:'LineString',coordinates:[[96.13,16.825],[96.125,16.815]]},quality:'ROAD_STATIC',traffic_aware:false,warnings:['Synthetic fixture response; not a new Google call'],attribution:'Google Maps'}}})});
  });
  return posts;
}
async function fill(page,id){
  const f=page.locator('[data-google-estimate]');await expect(f).toBeVisible();
  await f.locator('[name=latitude]').fill('16.825');await f.locator('[name=longitude]').fill('96.13');
  await f.locator('[name=order_id]').selectOption(id);return f;
}
test('dispatcher explicitly requests one Google estimate; mock identity, attribution and map boundary remain clear',async({page})=>{
  const id=await order(page),posts=await mockGoogle(page);await page.goto('/#/routes');const f=await fill(page,id);
  await f.locator('button').click();expect(posts).toHaveLength(0); // Browser requires consent.
  await f.locator('[name=consent]').check();await f.locator('button').click();
  const result=page.locator('[data-google-result]');await expect(result).toContainText('GOOGLE_MOCK');
  await expect(result).toContainText('1.741 km');await expect(result).toContainText('6.75 min');
  await expect(result).toContainText('Google Maps');await expect(result).toContainText('not drawn on Leaflet');
  const navigation=result.getByRole('link',{name:'Open this route in Google Maps'});
  await expect(navigation).toBeVisible();const nav=new URL(await navigation.getAttribute('href'));
  expect(nav.searchParams.get('origin')).toBe('16.825,96.13');expect(nav.searchParams.get('destination')).toBe('16.815,96.125');expect(nav.searchParams.has('key')).toBe(false);
  await expect(result.locator('.leaflet-container')).toHaveCount(0);await expect(f.locator('button')).toBeDisabled();
  expect(posts).toHaveLength(1);expect(posts[0].body.authorize_external_request).toBe(true);
  expect(posts[0].body.order_id).toBe(id);expect(posts[0].body).not.toHaveProperty('destination');
  await page.reload();await expect(page.locator('[data-google-estimate] button')).toBeDisabled();
  await expect(page.locator('[data-google-result]')).toBeEmpty();expect(posts).toHaveLength(1);
});
test('Google failure remains explicit with no repeated request or simulated success',async({page})=>{
  page.audit.expectedHttp.add(429);const id=await order(page),posts=await mockGoogle(page,true);
  await page.goto('/#/routes');const f=await fill(page,id);await f.locator('[name=consent]').check();await f.locator('button').click();
  await expect(page.locator('[data-google-result]')).toContainText('ROUTING_RATE_LIMITED');
  await expect(page.locator('[data-google-result]')).not.toContainText('GOOGLE_LIVE');
  await expect(f.locator('button')).toBeDisabled();expect(posts).toHaveLength(1);
});
test('default server configuration prevents live dispatcher requests',async({page})=>{
  await page.goto('/#/routes');await expect(page.locator('.google-road-estimate')).toContainText('Live Google requests disabled');
  await expect(page.locator('[data-google-estimate] button')).toBeDisabled();
});
test('recorded mocked success payload exercises GOOGLE_LIVE presentation without an external request',async({page})=>{
  const id=await order(page),posts=await mockGoogle(page,false,'GOOGLE_LIVE');
  await page.goto('/#/routes');const f=await fill(page,id);await f.locator('[name=consent]').check();await f.locator('button').click();
  await expect(page.locator('[data-google-result]')).toContainText('GOOGLE_LIVE');
  await expect(page.locator('[data-google-result]')).toContainText('Static estimate, not live traffic');
  expect(posts).toHaveLength(1);
});

// Historical Phase 27 distance/duration; geometry and SDK are synthetic test fixtures.
// These exercise the real application in Chromium, never genuine Google map tiles.
test.describe('Browser-purpose configuration with fixture SDK',()=>{
test.use({googleBrowser:true});
for(const [width,height] of [[1440,900],[1366,768],[768,1024],[390,844],[360,740]]){
 test(`Google route viewer integration with fixture SDK at ${width}x${height}`,async({page})=>{
  await page.setViewportSize({width,height});let sdkLoads=0;
  await page.route('**/maps-config.js',r=>r.fulfill({contentType:'text/javascript',body:'globalThis.LANNPYA_MAPS={googleKey:"fictional-browser-only-fixture"};'}));
  await page.route('https://maps.googleapis.com/maps/api/js?*',r=>{
   sdkLoads++;
   return r.fulfill({contentType:'text/javascript',body:`globalThis.mapFixture={pins:[],path:[]};globalThis.google={maps:{
    Map:class{constructor(n){n.dataset.googleFixture='true';n.style.background='#e3ecdf';n.setAttribute('aria-label','Fixture Google map; not live SDK');}fitBounds(){}},
    Marker:class{constructor(o){mapFixture.pins.push(o.title);}setMap(){}},
    Polyline:class{constructor(o){mapFixture.path=o.path;}setMap(){}},
    LatLngBounds:class{extend(){}},event:{clearInstanceListeners(){}}}};__lannpyaMapsReady();`});
  });
  const id=await order(page),posts=await mockGoogle(page);await page.goto('/#/routes');
  const form=await fill(page,id);await form.locator('[name=consent]').check();await form.locator('button').click();
  const result=page.locator('[data-google-result]');
  await expect(result).toContainText('GOOGLE_MOCK');await expect(result).toContainText('1.741 km');await expect(result).toContainText('6.75 min');
  expect(sdkLoads).toBe(0); // Rendering needs a separate deliberate action.
  await result.getByRole('button',{name:'Show route on Google map'}).click();
  await expect(result.locator('[data-google-fixture]')).toBeVisible();
  expect(sdkLoads).toBe(1);expect(posts).toHaveLength(1);
  expect(await page.evaluate(()=>mapFixture.pins)).toEqual(['Road route start','Road route end','Approved stop 1; geospatial accuracy unverified']);
  expect(await page.evaluate(()=>mapFixture.path)).toEqual([{lat:16.825,lng:96.13},{lat:16.815,lng:96.125}]);
  await expect(result.locator('.leaflet-container')).toHaveCount(0);
  const box=await result.locator('[data-google-fixture]').boundingBox();expect(box.width).toBeGreaterThan(200);expect(box.height).toBeGreaterThan(150);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const folder=path.resolve('.tmp/phase38/screenshots');fs.mkdirSync(folder,{recursive:true});
  await page.screenshot({path:path.join(folder,`google-sdk-fixture-${width}.png`),fullPage:true});
 });
}
});
