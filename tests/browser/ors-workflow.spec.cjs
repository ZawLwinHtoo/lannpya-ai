// Real Chromium + real local FastAPI/SQLite. Only the ORS HTTP transport is mocked.
const {test,expect,inspect,saveManual,openDraftRoute}=require('./fixtures.cjs');
test.use({orsMock:true});
for(const width of [1440,390])test(`ORS matrix preview, commit and rider sequence at ${width}px (MOCK provider)`,async({page})=>{
  await page.setViewportSize({width,height:900});
  await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({contentType:'text/css',body:''}));
  await page.goto('/#/manual');const f=page.locator('#manual-form');await expect(f).toBeVisible();
  for(const [name,value]of Object.entries({name:'Fictional ORS Buyer',phone:'09790000000',item:'Test shirt',street:'Synthetic ORS test street',expected:'25000'}))await f.locator(`[name=${name}]`).fill(value);
  await f.locator('[name=areaId]').selectOption('Hlaing');await f.locator('[name=received]').check();
  await f.getByText('Known map coordinates (optional)',{exact:true}).click();
  await f.locator('[name=lat]').fill('16.81');await f.locator('[name=lng]').fill('96.11');await f.locator('[name=locationReviewed]').check();
  await saveManual(page,f);
  const id=new URL(page.url()).hash.split('/').at(-1);
  await page.locator('[data-action=issue]').click();const buyer=page.getByRole('link',{name:'See what the buyer sees'});await expect(buyer).toBeVisible();await page.goto('/'+await buyer.getAttribute('href'));
  await page.locator('[name=digits]').fill('0000');await page.locator('#verify-form button').click();await expect(page.locator('#customer-form')).toBeVisible();
  await page.locator('[name=latitude]').fill('16.81');await page.locator('[name=longitude]').fill('96.11');await page.locator('[name=initial_pin_acknowledged]').check();await page.locator('#customer-form .customer-primary').click();await expect(page.locator('.delivery-request-confirmed')).toBeVisible();
  await page.goto('/#/order/'+id);await expect(page.locator('#edit-form')).toBeVisible();
  if(await page.locator('[data-action=approve-location]').count()){await page.locator('[data-action=approve-location]').click();await page.locator('dialog [name=reason]').fill('Fictional buyer pin review');await page.locator('dialog button[type=submit]').click();await expect(page.locator('dialog')).toHaveCount(0);}
  while(await page.locator('[data-review-request]').count()){await page.locator('[data-review-request]').first().click();await page.locator('dialog [name=reason]').fill('Fictional availability review');await page.locator('dialog button[type=submit]').click();await expect(page.locator('dialog')).toHaveCount(0);}
  await page.goto('/#/routes');const plan=page.locator('#routing-plan-form');await expect(plan).toBeVisible();
  await expect(plan).toContainText('Mode B: Multi-stop optimization');await expect(plan).toContainText('ORS driving-car');
  await plan.locator('[name=latitude]').fill('16.8');await plan.locator('[name=longitude]').fill('96.1');await plan.locator('[name=solver_seconds]').fill('1');
  await plan.locator('[name=authorize_external_request]').check();await plan.locator('[type=submit]').click();
  await expect(page.locator('#routing-preview')).toContainText('ORS_MOCK_MATRIX');await expect(page.locator('#routing-preview')).toContainText('No extra Directions request');
  await expect(page.locator('[data-plan-map]')).toHaveCount(0);
  expect((await inspect(page,'/api/orders/'+id)).status).not.toBe('ASSIGNED');
  const preview=(await inspect(page,'/api/routes/plans')).items[0];expect(preview.result.vehicles[0].travel_seconds).toBe(131);
  const commit=page.locator('#commit-routing-plan');await expect(commit.locator('[name=simulation]')).toHaveCount(0);await commit.locator('[name=ack]').check();await commit.locator('[type=submit]').click();
  await expect(page.locator('a.route-tile')).toBeVisible();
  await openDraftRoute(page);await page.locator('[data-action=dispatch-route]').click();await page.locator('dialog button[type=submit]').click();await expect(page.locator('dialog')).toHaveCount(0);
  await page.goto('/#/ride');await expect(page.locator('body')).toContainText('ORS_MOCK_MATRIX');
  await expect(page.locator('a[href*="google.com/maps/dir"]')).toBeVisible();
  await expect(page.locator('.google-road-estimate')).toHaveCount(0); // Latest MTT keeps Google request controls dispatcher-only.
  await page.reload();await expect(page.locator('body')).toContainText('ORS_MOCK_MATRIX');
  await page.goto('/#/routes');await expect(page.locator('#routing-plan-form [type=submit]')).toBeDisabled();
  expect((await inspect(page,'/api/routes/provider-status')).remaining_requests).toBe(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
});
