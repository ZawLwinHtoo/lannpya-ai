const {expect,saveManual}=require('./fixtures.cjs');
async function buyerLink(page,coordinates){
  await page.goto('/#/manual');const form=page.locator('#manual-form');
  for(const [name,value]of Object.entries({name:'Fictional Prefill Buyer',phone:'09790000000',item:'Test parcel',street:'Synthetic street',landmark:'Test gate',floor:'Floor 3',expected:'25000'}))await form.locator(`[name=${name}]`).fill(value);
  await form.locator('[name=areaId]').selectOption('Hlaing');await form.locator('[name=received]').check();
  if(coordinates){await form.getByText('Known map coordinates (optional)',{exact:true}).click();await form.locator('[name=lat]').fill(coordinates[0]);await form.locator('[name=lng]').fill(coordinates[1]);}
  await saveManual(page,form);const id=new URL(page.url()).hash.split('/').at(-1);
  await page.locator('[data-action=issue]').click();const link=page.getByRole('link',{name:'See what the buyer sees'});await expect(link).toBeVisible();
  const href='/'+await link.getAttribute('href');await page.goto(href);
  await expect(page.locator('#verify-form')).toBeVisible();await expect(page.locator('[data-delivery-address]')).toHaveCount(0);
  await page.locator('[name=digits]').fill('0000');await page.locator('#verify-form button').click();await expect(page.locator('#buyer-map')).toBeVisible();
  return {id,href};
}
module.exports={buyerLink};
