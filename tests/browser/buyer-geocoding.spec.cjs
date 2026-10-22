// Genuine application/SQLite workflow in Chromium; Google SDK AND v4 HTTP are mocked.
const {test,expect,inspect}=require('./fixtures.cjs');
const {buyerLink}=require('./buyer-map-fixtures.cjs');
const {installGoogleBuyerFixture}=require('./google-buyer-fixture.cjs');

test.describe('automatic address-to-pin using mocked Google v4',()=>{
  test.use({googleBrowser:true,geocodingMock:'success'});
  test.beforeEach(async({page})=>installGoogleBuyerFixture(page));
  test('merchant text → suggested Google pin → cache/revisit → explicit confirmation → dispatcher approval',async({page})=>{
    const {id}=await buyerLink(page);
    await expect(page.locator('[data-location-prefill]')).toContainText('Suggested approximate location from Google Maps (mocked provider response)');
    await expect(page.locator('[name=latitude]')).toHaveValue('16.8102468');
    await expect(page.locator('[name=longitude]')).toHaveValue('96.1101357');
    await expect(page.locator('#buyer-map [data-google-fixture-marker]')).toBeVisible();
    expect((await inspect(page,`/api/orders/${id}`)).latitude).toBeNull();
    expect((await inspect(page,`/api/orders/${id}/buyer-requests`)).total).toBe(0);
    await page.reload();await expect(page.locator('[name=latitude]')).toHaveValue('16.8102468');
    await expect(page.locator('[data-location-prefill]')).toContainText('not a buyer-confirmed');
    await page.locator('[name=initial_pin_acknowledged]').check();await page.locator('#customer-form .customer-primary').click();
    await expect(page.locator('.delivery-request-confirmed')).toBeVisible();
    expect((await inspect(page,`/api/orders/${id}`)).latitude).toBeNull();
    await page.goto('/#/order/'+id);await page.locator('[data-action=approve-location]').click();
    await page.locator('dialog [name=reason]').fill('Reviewed synthetic buyer-confirmed suggestion');await page.locator('dialog button[type=submit]').click();await expect(page.locator('dialog')).toHaveCount(0);
    const saved=await inspect(page,`/api/orders/${id}`);expect(Number(saved.latitude)).toBe(16.8102468);expect(saved.field_sources.latitude.method).toBe('buyer_confirmation');expect(saved.confidence_level).not.toBe('GREEN');
  });
  test('existing coordinates bypass geocoding even when a mocked provider is available',async({page})=>{
    await buyerLink(page,['16.82','96.12']);await expect(page.locator('[name=latitude]')).toHaveValue('16.82');
    await expect(page.locator('[data-location-prefill]')).toContainText('Existing delivery pin');
    await expect(page.locator('[data-location-prefill]')).not.toContainText('Suggested approximate');
  });
  test('SDK failure withholds a Google-derived suggestion and preserves independent manual entry',async({page})=>{
    await page.route('https://maps.googleapis.com/maps/api/js?*',route=>route.fulfill({contentType:'text/javascript',body:'globalThis.gm_authFailure();'}));
    await buyerLink(page);await expect(page.locator('#buyer-map')).toContainText('Google map unavailable');
    await expect(page.locator('[name=latitude]')).toHaveValue('');await expect(page.locator('[data-location-prefill]')).toContainText('withheld');
    await page.locator('[name=latitude]').fill('16.83');await expect(page.locator('[name=latitude]')).toHaveValue('16.83');
  });
});

for(const [mode,message] of [['ambiguous','address match is ambiguous'],['failure','CREDENTIAL_OR_PERMISSION_DENIED']]){
  test.describe(mode+' geocoding response',()=>{
    test.use({googleBrowser:true,geocodingMock:mode});
    test('falls back to manual selection without inventing a doorstep',async({page})=>{
      await installGoogleBuyerFixture(page);await buyerLink(page);
      await expect(page.locator('[data-location-prefill]')).toContainText(message);
      await expect(page.locator('[name=latitude]')).toHaveValue('');await expect(page.locator('#buyer-map [data-google-fixture-marker]')).toHaveCount(0);
      await page.locator('#buyer-map').click({position:{x:180,y:150}});await expect(page.locator('#buyer-map [data-google-fixture-marker]')).toBeVisible();
    });
  });
}
