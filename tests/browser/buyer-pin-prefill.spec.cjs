// Real Chromium + isolated HTTP backend. No external geocoding/routing calls.
const {test,expect,inspect}=require('./fixtures.cjs');
const {installGoogleBuyerFixture}=require('./google-buyer-fixture.cjs');
test.use({googleBrowser:true});
test.beforeEach(async({page})=>installGoogleBuyerFixture(page));

const {buyerLink}=require('./buyer-map-fixtures.cjs');

test('existing merchant coordinates prefill the real buyer map, survive revisit and still require explicit submission',async({page})=>{
  const {id}=await buyerLink(page,['16.8100000','96.1100000']);
  await expect(page.locator('[name=latitude]')).toHaveValue('16.81');await expect(page.locator('[name=longitude]')).toHaveValue('96.11');
  await expect(page.locator('#buyer-map [data-google-fixture-marker]')).toBeVisible();
  await expect(page.locator('#buyer-map.leaflet-container')).toHaveCount(0);
  expect(await page.evaluate(()=>googleBuyerFixture.maps.at(-1).options.center)).toEqual({lat:16.81,lng:96.11});
  await expect(page.locator('[data-delivery-address]')).toContainText('Synthetic street, Test gate, floor: Floor 3, Hlaing');
  await expect(page.locator('[data-location-prefill]')).toContainText('Existing delivery pin');
  expect((await inspect(page,`/api/orders/${id}/buyer-requests`)).total).toBe(0);
  await page.reload();await expect(page.locator('#buyer-map [data-google-fixture-marker]')).toBeVisible();await expect(page.locator('[name=latitude]')).toHaveValue('16.81');
  expect((await inspect(page,`/api/orders/${id}`)).field_sources.latitude.method).toBe('manual_correction');
});

test('a buyer capability link opened as a fresh page hydrates without a prior customer-page navigation',async({page})=>{
  const {href}=await buyerLink(page,['16.8100000','96.1100000']);
  const context=await page.context().browser().newContext({baseURL:new URL(page.url()).origin});
  const fresh=await context.newPage();
  await installGoogleBuyerFixture(fresh);
  await fresh.goto(new URL(href,page.url()).toString());
  await expect(fresh.locator('#verify-form')).toBeVisible();
  await fresh.locator('[name=digits]').fill('0000');
  await fresh.locator('#verify-form button').click();
  await expect(fresh.locator('#buyer-map [data-google-fixture-marker]')).toBeVisible();
  await expect(fresh.locator('[name=latitude]')).toHaveValue('16.81');
  await context.close();
});

test('text-only address has an honest manual fallback, persists the selected pin separately and restores pending then approved coordinates',async({page})=>{
  const {id,href}=await buyerLink(page);
  await expect(page.locator('[data-location-prefill]')).toContainText('Address lookup unavailable (DISABLED)');
  await expect(page.locator('#buyer-map [data-google-fixture-marker]')).toHaveCount(0);await expect(page.locator('[name=latitude]')).toHaveValue('');
  await expect(page.locator('[data-delivery-address]')).toContainText('Synthetic street');
  await page.locator('#buyer-map').click({position:{x:180,y:150}});await expect(page.locator('#buyer-map [data-google-fixture-marker]')).toBeVisible();
  const before=await page.locator('[name=longitude]').inputValue();const pin=page.locator('#buyer-map [data-google-fixture-marker]');const box=await pin.boundingBox();
  await page.mouse.move(box.x+10,box.y+10);await page.mouse.down();await page.mouse.move(box.x+50,box.y+20,{steps:5});await page.mouse.up();await expect(page.locator('[name=longitude]')).not.toHaveValue(before);
  const latitude=await page.locator('[name=latitude]').inputValue(),longitude=await page.locator('[name=longitude]').inputValue();
  await page.locator('[name=initial_pin_acknowledged]').check();await page.locator('#customer-form .customer-primary').click();await expect(page.locator('.delivery-request-confirmed')).toBeVisible();
  expect((await inspect(page,`/api/orders/${id}`)).latitude).toBeNull();
  await page.reload();await expect(page.locator('[name=latitude]')).toHaveValue(String(Number(latitude)));await expect(page.locator('[data-location-prefill]')).toContainText('awaiting dispatcher review');
  await expect(page.locator('#buyer-map [data-google-fixture-marker]')).toBeVisible();
  const requests=await inspect(page,`/api/orders/${id}/buyer-requests`);expect(requests.items.find(r=>r.kind==='LOCATION').submitted_values.longitude).toBe(longitude);
  await page.goto('/#/order/'+id);await page.locator('[data-action=approve-location]').click();await page.locator('dialog [name=reason]').fill('Checked synthetic pin with fictional buyer');await page.locator('dialog button[type=submit]').click();await expect(page.locator('dialog')).toHaveCount(0);
  await page.goto(href);await expect(page.locator('[name=latitude]')).toHaveValue(String(Number(latitude)));await expect(page.locator('[data-location-prefill]')).not.toContainText('awaiting dispatcher review');
  const saved=await inspect(page,`/api/orders/${id}`);expect(Number(saved.latitude)).toBe(Number(latitude));expect(saved.field_sources.latitude.method).toBe('buyer_confirmation');expect(saved.confidence_level).not.toBe('GREEN');
});

test('missing Google credential is explicit and never switches the buyer to OpenStreetMap',async({page})=>{
  await page.route('**/maps-config.js',route=>route.fulfill({contentType:'text/javascript',body:'globalThis.LANNPYA_MAPS={googleKey:"",buyerPinProvider:"google"};'}));
  await buyerLink(page,['16.8100000','96.1100000']);
  await expect(page.locator('#buyer-map')).toContainText('Google map unavailable');
  await expect(page.locator('[name=latitude]')).toHaveValue('16.81');
  await expect(page.locator('#buyer-map.leaflet-container')).toHaveCount(0);
  await expect(page.locator('#load-street-tiles')).toBeHidden();
  expect(await page.locator('script[src*="maps.googleapis.com"]').count()).toBe(0);
});

test('Google SDK authorization failure preserves manual GPS fields without a false suggested pin',async({page})=>{
  await page.route('https://maps.googleapis.com/maps/api/js?*',route=>route.fulfill({contentType:'text/javascript',body:'globalThis.gm_authFailure();'}));
  await buyerLink(page);
  await expect(page.locator('#buyer-map')).toContainText('Google map unavailable');
  await expect(page.locator('[name=latitude]')).toHaveValue('');await expect(page.locator('#buyer-map.leaflet-container')).toHaveCount(0);
  await page.locator('[name=latitude]').fill('16.81');await page.locator('[name=longitude]').fill('96.11');await expect(page.locator('[name=latitude]')).toHaveValue('16.81');
});
