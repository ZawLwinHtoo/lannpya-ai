const {test:base,expect}=require('@playwright/test');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const net=require('node:net');
const fs=require('node:fs');
const path=require('node:path');
const {setTimeout:delay}=require('node:timers/promises');
const {pythonPath,root}=require('../../scripts/python_path.cjs');
const shots=path.join(root,'docs/visual-testing/screenshots');
const sanitize=s=>String(s).replace(/[A-Za-z0-9_-]{43,}/g,'[redacted]').replace(/\/confirm\/[^/?\s]+/g,'/confirm/[redacted]');
const test=base.extend({
  orsMock:[false,{option:true}],
  googleBrowser:[false,{option:true}],
  geocodingMock:[false,{option:true}],
  app:async({orsMock,googleBrowser,geocodingMock},use,testInfo)=>{
    if(orsMock&&geocodingMock)throw Error('Use separate isolated ORS and geocoding fixtures; no combined external transport.');
    const probe=net.createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');
    const port=probe.address().port;await new Promise(r=>probe.close(r));
    const origin=`http://127.0.0.1:${port}`;
    const mockCode=`import json, os, tempfile
from pathlib import Path
import httpx2 as httpx
from app.routing.http import HTTPProvider
from tools.integrated_workspace import main
original = HTTPProvider.__init__
def handle(request):
    assert str(request.url) == 'https://api.heigit.org/openrouteservice/v2/matrix/driving-car'
    recording_path = os.environ.get('LANNPYA_ORS_TEST_RECORDING')
    if recording_path:
        recording = json.loads(Path(recording_path).read_text(encoding='utf-8'))
        assert json.loads(request.content)['locations'] == recording['locations']
        return httpx.Response(200, json={k: recording[k] for k in ('distances', 'durations')})
    n = len(json.loads(request.content)['locations'])
    return httpx.Response(200, json={'distances': [[0 if i == j else 1000+i*100+j for j in range(n)] for i in range(n)], 'durations': [[0 if i == j else 60+i*10+j for j in range(n)] for i in range(n)]})
def initialize(self, settings, *, transport=None):
    assert settings.routing_provider == 'ors'
    original(self, settings, transport=httpx.MockTransport(handle))
HTTPProvider.__init__ = initialize
with tempfile.TemporaryDirectory(prefix='lannpya-ors-browser-budget-') as ledger:
    os.environ['LANNPYA_ORS_BUDGET_DIRECTORY'] = ledger
    main()
`;
    const geocodingCode=`import json, os, tempfile
from pathlib import Path
import httpx2 as httpx
from app.services.buyer_geocoding import BuyerGeocoder
from tools.integrated_workspace import main
original = BuyerGeocoder.__init__
def handle(request):
    assert request.method == 'GET' and request.url.host == 'geocode.googleapis.com'
    assert request.url.path.startswith('/v4/geocode/address/')
    data = json.loads(Path(os.environ['LANNPYA_GEOCODING_TEST_RECORDING']).read_text())
    mode = os.environ['LANNPYA_GEOCODING_TEST_MODE']
    if mode == 'ambiguous':
        data['results'][0]['granularity'] = 'APPROXIMATE'
        data['results'][0]['types'] = ['locality']
    return httpx.Response(403 if mode == 'failure' else 200, json=data)
def initialize(self, settings, **kwargs):
    original(self, settings, transport=httpx.MockTransport(handle))
BuyerGeocoder.__init__ = initialize
with tempfile.TemporaryDirectory(prefix='lannpya-geocoding-fixture-budget-') as ledger:
    os.environ['LANNPYA_GOOGLE_GEOCODING_BUDGET_DIRECTORY'] = ledger
    main()
`;
    const argv=geocodingMock?['-c',geocodingCode,'--port',String(port),'--temporary']:orsMock?['-c',mockCode,'--port',String(port),'--temporary']:['-m','tools.integrated_workspace','--port',String(port),'--temporary'];
    const child=spawn(pythonPath(),argv,{
      cwd:path.join(root,'backend'),stdio:['ignore','ignore','pipe'],windowsHide:true,
      env:{...process.env,LANNPYA_GEOCODING_TEST_RECORDING:path.join(root,'backend/tests/fixtures/geocoding/google_yangon_v4.json'),LANNPYA_GEOCODING_TEST_MODE:geocodingMock||'',LANNPYA_GOOGLE_GEOCODING_API_KEY:geocodingMock?'fictional-server-geocoding-fixture':'',LANNPYA_GOOGLE_GEOCODING_PERMISSIONS_CONFIRMED:geocodingMock?'true':'false',LANNPYA_GOOGLE_GEOCODING_EXTERNAL_REQUESTS_ENABLED:geocodingMock?'true':'false',LANNPYA_GOOGLE_GEOCODING_MAX_REQUESTS:geocodingMock?'1':'0',LANNPYA_ORS_TEST_RECORDING:orsMock==='phase36'?path.join(root,'backend/tests/fixtures/routing/ors_yangon_phase36.json'):'',LANNPYA_ENVIRONMENT:'test',LANNPYA_ROUTING_PROVIDER:orsMock?'ors':'offline',LANNPYA_ROUTING_EXTERNAL_REQUESTS_ENABLED:orsMock?'true':'false',LANNPYA_ORS_API_KEY:orsMock?'fictional-server-only-key':'',LANNPYA_ORS_MAX_REQUESTS:orsMock?'1':'0',LANNPYA_ORS_MAX_MATRIX_ELEMENTS:'16',LANNPYA_GOOGLE_DEMO_ENABLED:'false',LANNPYA_GOOGLE_DEMO_MAX_REQUESTS:'0',LANNPYA_GOOGLE_MAPS_BROWSER_KEY:googleBrowser?'fictional-browser-only-fixture':'',LANNPYA_GOOGLE_MAPS_BROWSER_RESTRICTIONS_CONFIRMED:googleBrowser?'true':'false'},
    });
    let stderr='';child.stderr.on('data',b=>{stderr+=b.toString();});
    const exited=once(child,'exit');let cookie='',csrf;
    const deadline=Date.now()+25000;
    try{
      while(true){
        if(Date.now()>deadline)throw Error('Isolated server startup timed out');
        try{const r=await fetch(origin,{signal:AbortSignal.timeout(1000)});if(r.ok){cookie=r.headers.get('set-cookie').split(';')[0];break;}}
        catch(e){if(child.exitCode!==null||Date.now()>deadline)throw Error('Isolated server startup failed: '+sanitize(stderr||e.message));}
        await delay(50);
      }
      csrf=(await (await fetch(origin+'/dashboard/bootstrap',{headers:{Cookie:cookie}})).json()).csrf;
      await use({origin,stderr:()=>sanitize(stderr)});
    }finally{
      if(child.exitCode===null){
        try{await fetch(origin+'/dashboard/shutdown',{method:'POST',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json','X-Dashboard-CSRF':csrf},body:JSON.stringify({confirm:'STOP LOCAL TOOL'}),signal:AbortSignal.timeout(5000)});await Promise.race([exited,delay(10000).then(()=>{throw Error('Shutdown timed out');})]);}
        catch(e){child.kill();throw e;}
      }
      if(stderr.includes('Traceback'))await testInfo.attach('server-errors',{body:sanitize(stderr),contentType:'text/plain'});
    }
  },
  page:async({browser,app,hasTouch},use,testInfo)=>{
    const context=await browser.newContext({baseURL:app.origin,viewport:testInfo.project.use.viewport||{width:1440,height:900},timezoneId:'Asia/Rangoon',hasTouch});
    // Test-specific page mocks take precedence. Otherwise no remote service is contacted.
    await context.route('**/*',route=>{
      const url=new URL(route.request().url());
      if(['http:','https:'].includes(url.protocol)&&url.origin!==app.origin){
        if(url.hostname==='fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:''});
        return route.fulfill({status:503,contentType:'text/plain',body:'External network disabled in browser tests; provide an explicit fixture.'});
      }
      return route.continue();
    });
    const activity=[],errors=[],network=[],starts=new WeakMap();
    context.on('page',p=>{
      p.on('pageerror',e=>errors.push(sanitize(e.message)));
      p.on('console',m=>{if(m.type()==='error')activity.push({kind:'console',message:sanitize(m.text())});});
      p.on('requestfailed',r=>activity.push({kind:'network',path:sanitize(new URL(r.url()).pathname),error:sanitize(r.failure()?.errorText)}));
      p.on('response',r=>{
        const q=r.request(),body=q.url().endsWith('/dashboard/api')?q.postDataJSON():null;
        network.push({method:q.method(),path:sanitize(body?.path||new URL(r.url()).pathname),status:r.status(),duration_ms:Date.now()-(starts.get(q)||Date.now())});
        if(r.status()>=400)activity.push({kind:'http',path:sanitize(new URL(r.url()).pathname),status:r.status()});
      });
      p.on('request',r=>{starts.set(r,Date.now());if(r.headers()['x-dev-access-token']||r.headers().authorization)errors.push('Privileged credential reached browser request');});
    });
    const page=await context.newPage();
    page.audit={activity,errors,expectedHttp:new Set()};
    try{
      await use(page);expect(errors,'Uncaught JavaScript errors or credential leak').toEqual([]);
      expect(activity.filter(e=>e.kind==='http'&&!page.audit.expectedHttp.has(e.status)&&(e.status>=500||e.path!=='/dashboard/api')),'Unexpected HTTP or static-asset error').toEqual([]);
      expect(activity.filter(e=>e.kind==='console'&&!/^Failed to load resource: (the server responded with a status of 4[0-9]{2} |net::ERR_FAILED)/.test(e.message)&&![...page.audit.expectedHttp].some(status=>e.message.includes('status of '+status+' '))),'Unexpected console errors').toEqual([]);
      if(!testInfo.title.includes('failed real order write'))expect(activity.filter(e=>e.kind==='network'),'Unexpected failed request').toEqual([]);
    }
    finally{await testInfo.attach('sanitized-browser-observations',{body:JSON.stringify({activity,errors,network},null,2),contentType:'application/json'});await context.close();}
  },
});
async function enter(page,side='admin',id=''){
  await page.goto('/api.html#/'+side);
  await expect(page.locator('#connect-form, #create-form, #rider-account').first()).toBeVisible();
  const form=page.locator('#connect-form');if(!await form.count())return;
  if(side==='rider'&&id)await form.locator('[name=actor_id]').fill(id);
  await form.locator('button[type=submit]').click();
  await expect(form).toHaveCount(0);
  await expect(page.locator('#api-status')).toContainText('Connected to the server-bound actor.');
}
async function inspect(page,apiPath){
  const response=await page.request.get('/dashboard/bootstrap');const {csrf}=await response.json();
  const r=await page.request.post('/dashboard/api',{headers:{Origin:new URL(page.url()).origin,'X-Dashboard-CSRF':csrf},data:{method:'GET',path:apiPath,body:null,actor:'dispatcher'}});
  expect(r.ok(),`Read-only inspection ${apiPath}`).toBeTruthy();return (await r.json()).data;
}
async function create(page,{raw='name: Fictional QA Buyer, ၀၉၇၉၀၀၀၀၀၀၀၊ လှိုင်မြို့နယ်၊ COD ၂၅၀၀၀ ကျပ်၊ address: Fictional Red Gate',pin=false}={}){
  await enter(page);
  await page.getByText('Parse a pasted address first (optional)',{exact:true}).click();
  await page.locator('#parse-form [name=raw]').fill(raw);
  await page.locator('#parse-form button[type=submit]').click();
  await expect(page.locator('#parse-result')).toContainText(/AMBER|RED/);
  await page.locator('#create-form [name=item]').fill('FICTIONAL QA parcel');
  await page.locator('[data-action=save-raw]').click();
  await expect(page.locator('#edit-api-form')).toBeVisible();
  const id=new URL(page.url()).hash.split('/').at(-1);
  if(pin){
    await page.locator('#edit-api-form [name=latitude]').fill('0');
    await page.locator('#edit-api-form [name=longitude]').fill('0');
    await page.locator('#edit-api-form button[type=submit]').click();
    await expect(page.locator('#prepare-assignment-form')).toBeVisible();
  }
  return id;
}
async function link(page){
  await page.locator('[data-action=link]').click();
  await expect(page.locator('[name=generated-link]')).toBeVisible();
  return page.locator('[name=generated-link]').inputValue();
}
async function verify(page,url,digits='0000'){
  await page.goto(url);await expect(page.locator('#verify-api-form')).toBeVisible();
  await page.locator('#verify-api-form [name=digits]').fill(digits);
  await page.locator('#verify-api-form button[type=submit]').click();
}
async function approve(page,id){
  await page.locator('[data-action=refresh]').first().click();await expect(page.locator('#edit-api-form')).toBeVisible();
  while(await page.locator('[data-action=review]').count()){
    await page.locator('[data-action=review]').first().click();
    await page.locator('dialog [name=reason]').fill('Fictional QA dispatcher review; location accuracy unverified');
    await page.locator('dialog button[type=submit]').click();await expect(page.locator('dialog')).toHaveCount(0);
    await expect(page.locator('#edit-api-form')).toBeVisible();
  }
}
async function assignDispatch(page){
  const form=page.locator('#prepare-assignment-form');await expect(form).toBeVisible();
  if(await form.locator('[name=received]').count())await form.locator('[name=received]').check();
  await form.locator('[name=ack]').check();await form.locator('button[type=submit]').click();
  await expect(page.locator('[data-action=dispatch]')).toBeVisible();
  await page.locator('[data-action=dispatch]').click();await page.locator('dialog button[type=submit]').click();
  await expect(page.locator('dialog')).toHaveCount(0);
}
async function shot(page,name){
  fs.mkdirSync(shots,{recursive:true});
  await page.screenshot({path:path.join(shots,name+'.png'),fullPage:true,mask:[page.locator('[name=generated-link]')],animations:'disabled'});
}
// MTT keeps the new-order form open and confirms creation in its own modal.
// Exercise that real UI rather than restoring the older automatic navigation.
async function saveManual(page,form){
  await form.locator('aside button').click();
  await expect(page.locator('.created-dialog')).toBeVisible();
  await page.locator('.created-dialog [data-created=open]').click();
  await expect(page.locator('#edit-form')).toBeVisible();
}
async function openDraftRoute(page){
  // Current MTT places departure on the route sheet, reached from its route tile.
  if(!await page.locator('[data-action=dispatch-route]').count())await page.locator('a.route-tile').first().click();
  await expect(page.locator('[data-action=dispatch-route]')).toBeVisible();
}
module.exports={test,expect,enter,inspect,create,link,verify,approve,assignDispatch,shot,saveManual,openDraftRoute};
