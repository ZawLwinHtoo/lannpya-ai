// Phase 36 road values replayed through MockTransport. No live routing or map service calls.
const {test,expect,inspect,saveManual,openDraftRoute}=require('./fixtures.cjs');
const fs=require('node:fs'),path=require('node:path');
test.use({orsMock:'phase36'});
const points=[[96.130,16.825],[96.125,16.815],[96.142,16.810],[96.153,16.800]];
async function order(page,label,index,{buyer=false}={}){
  await page.goto('/#/manual');const f=page.locator('#manual-form');await expect(f).toBeVisible();
  for(const [name,value]of Object.entries({name:label,phone:'09790000000',item:'Fictional recorded road parcel',street:'စမ်းသပ်လမ်း',landmark:'Fictional test gate',expected:'25000'}))await f.locator(`[name=${name}]`).fill(value);
  await f.locator('[name=areaId]').selectOption('Hlaing');await f.locator('[name=received]').check();
  if(index&&!buyer){await f.getByText('Known map coordinates (optional)',{exact:true}).click();await f.locator('[name=lat]').fill(String(points[index][1]));await f.locator('[name=lng]').fill(String(points[index][0]));await f.locator('[name=locationReviewed]').check();}
  await saveManual(page,f);const id=new URL(page.url()).hash.split('/').at(-1);
  if(buyer){
    await page.locator('[data-action=issue]').click();const link=page.getByRole('link',{name:'See what the buyer sees'});await expect(link).toBeVisible();await page.goto('/'+await link.getAttribute('href'));
    await page.locator('[name=digits]').fill('0000');await page.locator('#verify-form button').click();await expect(page.locator('#customer-form')).toBeVisible();
    await page.locator('[name=latitude]').fill(String(points[index][1]));await page.locator('[name=longitude]').fill(String(points[index][0]));await page.locator('[name=initial_pin_acknowledged]').check();await page.locator('#customer-form .customer-primary').click();
    await expect(page.locator('.delivery-request-confirmed')).toBeVisible();expect((await inspect(page,'/api/orders/'+id)).latitude).toBeNull();
    await page.goto('/#/order/'+id);await page.locator('[data-action=approve-location]').click();await page.locator('dialog [name=reason]').fill('Recorded fixture doorstep review; no independent geospatial accuracy claim');await page.locator('dialog button[type=submit]').click();await expect(page.locator('dialog')).toHaveCount(0);
    while(await page.locator('[data-review-request]').count()){await page.locator('[data-review-request]').first().click();await page.locator('dialog [name=reason]').fill('Fictional buyer response reviewed');await page.locator('dialog button[type=submit]').click();await expect(page.locator('dialog')).toHaveCount(0);}
  }
  return id;
}
async function origin(page){
  await page.goto('/#/routes');const f=page.locator('#routing-plan-form');await expect(f).toBeVisible();
  await f.locator('[name=latitude]').fill('16.825');await f.locator('[name=longitude]').fill('96.130');await f.locator('[name=solver_seconds]').fill('1');
  for(const input of await f.locator('[name^="capacity-"]').all())await input.fill('3');
  return f;
}
for(const [width,height]of [[1440,900],[1366,768],[768,1024],[390,844],[360,740]])test(`recorded ORS three-stop dispatcher-to-rider journey ${width}x${height}`,async({page})=>{
  await page.setViewportSize({width,height});const external=[];
  await page.route('https://**/*',route=>{external.push(new URL(route.request().url()).hostname);return route.fulfill({contentType:'text/css',body:''});});
  let previews=0,commits=0;
  page.on('request',r=>{if(!r.url().endsWith('/dashboard/api'))return;const body=r.postDataJSON();if(body.path==='/api/routes/optimize')previews++;if(body.path.endsWith('/commit'))commits++;});
  // Creation order makes the backend's newest-first list exactly D1,D2,D3.
  const d3=await order(page,'Fictional recorded D3',3),d2=await order(page,'Fictional recorded D2',2),d1=await order(page,'Fictional recorded D1',1,{buyer:true});
  const missing=await order(page,'Fictional missing pin',null);
  const f=await origin(page);await f.locator(`[name="order-${missing}"]`).check();
  expect(previews).toBe(0);expect((await inspect(page,'/api/routes/provider-status')).remaining_requests).toBe(1);
  await f.locator('[type=submit]').click();expect(previews).toBe(0); // Browser enforces explicit consent.
  await f.locator('[name=authorize_external_request]').check();await f.locator('[type=submit]').click();
  const view=page.locator('#routing-preview');await expect(view).toContainText('ORS_MOCK_MATRIX');await expect(view).toContainText('Recorded/mocked TEST RESPONSE');
  await expect(view).toContainText('11.565 km');await expect(view).toContainText('travel 18.58 min');await expect(view).toContainText('Capacity use: 3 / 3');await expect(view).toContainText('MISSING_DELIVERY_PIN');
  await expect(view.locator('[data-stop-map].leaflet-container')).toHaveCount(1);await expect(view.locator('.leaflet-marker-icon')).toHaveCount(4);await expect(view.locator('.leaflet-overlay-pane path')).toHaveCount(0);
  await expect(page.locator('[data-routing-availability]')).toContainText('exhausted');await expect(f.locator('[type=submit]')).toBeDisabled();expect(previews).toBe(1);
  await page.locator('#replan-routing').click();await expect(view).toContainText('ORS_MOCK_MATRIX');await expect(page.locator('#routing-error')).toContainText('Current saved plan retained');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
  const output=path.resolve('.tmp/phase37/screenshots');fs.mkdirSync(output,{recursive:true});await page.screenshot({path:path.join(output,`${width}-recorded-dispatcher.png`),fullPage:true});
  const preview=(await inspect(page,'/api/routes/plans')).items[0],vehicle=preview.result.vehicles[0];
  expect(vehicle.stops.map(s=>s.order_id)).toEqual([d1,d3,d2]);expect(vehicle.travel_seconds).toBe(1115);expect(preview.result.matrix_observation).toBe('ORS_MOCK_MATRIX');
  expect((await inspect(page,'/api/orders/'+d1)).status).not.toBe('ASSIGNED');
  const commit=page.locator('#commit-routing-plan');await commit.locator('[type=submit]').click();expect(commits).toBe(0);
  await commit.locator('[name=ack]').check();await commit.locator('[type=submit]').click();await expect(page.locator('a.route-tile')).toBeVisible();expect(commits).toBe(1);
  await page.reload();await page.locator('[data-open-plan]').click();await expect(page.locator('#routing-preview')).toContainText('COMMITTED');await expect(page.locator('#commit-routing-plan')).toHaveCount(0);
  expect((await inspect(page,'/api/routes/plans/'+preview.id)).result.vehicles[0].stops.map(s=>s.order_id)).toEqual([d1,d3,d2]);
  await openDraftRoute(page);await page.locator('[data-action=dispatch-route]').click();await page.locator('dialog button[type=submit]').click();await expect(page.locator('dialog')).toHaveCount(0);
  await page.goto('/#/ride');await expect(page.locator('body')).toContainText('ORS_MOCK_MATRIX');await expect(page.locator('body')).toContainText('Recorded/mocked TEST RESPONSE');await expect(page.locator('[data-stop-map].leaflet-container')).toHaveCount(1);
  const queue=await inspect(page,`/api/riders/${vehicle.rider_id}/queue`);expect(queue.items.map(i=>i.order_id)).toEqual([d1,d3,d2]);
  await expect(page.locator('a[href*="google.com/maps/dir"]')).toBeVisible();
  await page.locator('[data-action=delivered]').click();await page.locator('dialog [name=amount]').fill('25000');await page.locator('dialog [name=codCollected]').check();await page.locator('dialog button[type=submit]').click();await expect(page.locator('dialog')).toHaveCount(0);
  expect((await inspect(page,'/api/orders/'+d1)).status).toBe('DELIVERED');
  await page.reload();await expect(page.locator('body')).toContainText('STALE', {ignoreCase:true});
  expect((await inspect(page,'/api/orders/'+d1+'/events')).items.some(e=>e.event_type==='DELIVERY_COMPLETED')).toBe(true);
  expect((await page.request.get('/api/orders')).status()).toBe(404);
  expect((await page.request.post('/dashboard/api',{data:{method:'GET',path:'/api/orders'}})).status()).toBe(403);
  expect(previews).toBe(1);expect(external.filter(host=>host!=='fonts.googleapis.com')).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
  const out=path.resolve('.tmp/phase37/screenshots');fs.mkdirSync(out,{recursive:true});await page.screenshot({path:path.join(out,`${width}-recorded-rider.png`),fullPage:true});
});

test('failed ORS preview is explicit and cannot repeat without new intent',async({page})=>{
  await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
  const f=await origin(page);let attempts=0;
  await page.route('**/dashboard/api',route=>{const body=route.request().postDataJSON();if(body.path!=='/api/routes/optimize')return route.continue();attempts++;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{code:'ROUTING_CREDENTIAL_OR_QUOTA_REJECTED',message:'Provider rejected the request'}})});});
  page.audit.expectedHttp.add(503);await f.locator('[name=authorize_external_request]').check();await f.locator('[type=submit]').click();
  await expect(page.locator('#routing-error')).toContainText('ROUTING_CREDENTIAL_OR_QUOTA_REJECTED');await expect(page.locator('#routing-error')).toContainText('No simulated success');await expect(page.locator('#commit-routing-plan')).toHaveCount(0);
  await expect(f.locator('[type=submit]')).toBeDisabled();expect(attempts).toBe(1);expect((await inspect(page,'/api/routes/plans')).total).toBe(0);
});
