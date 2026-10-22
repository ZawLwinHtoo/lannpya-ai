// Planning views only. Business rules, authorization and all assignments remain server-owned.
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const localTime=ms=>new Date(ms+23400000).toISOString().slice(0,16);
const when=t=>new Date(t).toLocaleString('en-GB',{timeZone:'Asia/Yangon'});
const duration=n=>`${(n/60).toFixed(2)} min`;
const report=(node,error)=>{node.textContent=`${error.code||'CONNECTION_ERROR'}: ${error.message}. No simulated success was substituted.`;};
export function planningRequest(form,snapshot){
  for(const [name,limit]of [['latitude',90],['longitude',180]]){
    const value=String(form.get(name)??'');if(!value.trim()||!Number.isFinite(Number(value))||Math.abs(Number(value))>limit)throw Error('Select or enter a valid hub '+name+'. No default origin is assumed.');
  }
  const orders=snapshot.orders.filter(o=>form.has('order-'+o.id)).map(o=>{const priority=Number(form.get('priority-'+o.id)||0);if(!Number.isInteger(priority)||priority<0||priority>5)throw Error('Delivery priority must be an integer from 0 to 5.');return {order_id:o.id,demand:1,service_seconds:Number(form.get('service_seconds')),...(priority?{priority}:{})};});
  const riders=snapshot.riders.filter(r=>form.has('rider-'+r.id)).map(r=>({rider_id:r.id,capacity:Number(form.get('capacity-'+r.id))}));
  return {origin:{latitude:Number(form.get('latitude')),longitude:Number(form.get('longitude'))},
    orders,riders,operating_window:{start:form.get('start')+':00+06:30',end:form.get('end')+':00+06:30'},
    mode:form.get('mode'),allow_simulation:form.has('allow_simulation'),return_to_hub:form.has('return_to_hub'),
    objective:form.get('objective'),solver_seconds:Number(form.get('solver_seconds')),...(form.has('authorize_external_request')?{authorize_external_request:true,request_id:form.get('external_request_id')}: {})};
}
export function previewAvailability(status){
  if(status.availability_unavailable)return {ready:false,message:'Routing budget status unavailable. Refresh before requesting another live preview.'};
  if(status.provider==='offline')return {ready:true,message:'SIMULATED previews require explicit test-data acknowledgement.'};
  if(status.provider!=='ors')return {ready:false,message:'Multi-stop provider unavailable. Configure ORS or explicit offline simulation on the server.'};
  if(!status.external_requests_enabled)return {ready:false,message:'Live ORS disabled by server configuration. No external request can be made.'};
  if(!status.key_configured)return {ready:false,message:'Server-side ORS credential unavailable. Never enter private keys in this browser.'};
  if(!(status.remaining_requests>0))return {ready:false,message:'Authorized ORS budget exhausted. A new provider request requires separately approved server allowance.'};
  return {ready:true,message:`ORS server budget: ${status.remaining_requests} request(s), matrix cap ${status.max_matrix_elements} cells. Explicit consent required; no automatic requests.`};
}
export function observationNotice(result){
  if(result.matrix_observation==='ORS_MOCK_MATRIX')return 'Recorded/mocked TEST RESPONSE; no new live provider call.';
  if(result.matrix_observation==='ORS_ROAD_MATRIX')return 'Road-provider matrix; static estimates, not live traffic.';
  if(result.quality==='SIMULATED')return 'SIMULATED / TEST DATA; not measured road distances or travel times.';
  return 'Provider observation not recorded; do not infer live verification.';
}
function resultHTML(plan){
  const r=plan.result;
  return `<h3>Plan ${esc(plan.id)}</h3><p class="live-notice">${esc(r.matrix_observation||r.quality)} | ${esc(r.provider)} | ${esc(r.travel_profile||r.quality)} | ${esc(plan.state)}${plan.stale?' | STALE: recalculate before applying':''}</p><p>${esc(observationNotice(r))}</p><p>Operating period: ${esc(when(plan.operating_window.start))} to ${esc(when(plan.operating_window.end))} (Yangon).</p><p>${esc(r.solver)}: ${esc(r.solver_status)}; ${r.elapsed_ms} ms; ${r.matrix_size} matrix locations. Bounded heuristic, no global optimality guarantee. Static planned times, no live traffic.</p><p>${esc(r.attribution)}</p>${r.vehicles.map(v=>`<section class="plan-vehicle"><h4>Rider ${esc(v.rider_id)}</h4><p>Capacity use: ${v.load??v.stops.reduce((n,s)=>n+s.demand,0)} / ${v.capacity??"capacity not recorded"} parcels.</p><p>${(v.distance_meters/1000).toFixed(3)} km; ${duration(v.duration_seconds)} including service/wait; travel ${duration(v.travel_seconds)}.</p><ol>${v.stops.map(s=>`<li><b>Stop ${s.sequence}</b> | ${esc(s.order_id)}<br>Planned arrival ${esc(when(s.arrival))}; leave ${esc(when(s.departure))}<br>Priority ${Number(s.priority)||0}; window: ${s.delivery_window?esc(when(s.delivery_window.start))+" ? "+esc(when(s.delivery_window.end)):"Any time within operating period"}</li>`).join('')}</ol>${v.geometry?`<div class="live-map" data-plan-map="${esc(v.rider_id)}" aria-label="Planned route geometry"></div>`:v.stops.length?`<div class="live-map" data-stop-map="${esc(v.rider_id)}" aria-label="Approved delivery stop pins"></div><p>Stop pins only; the matrix supplies no road geometry. Marker order is not a drawn road route.</p>`:''}${v.geometry_warning?`<p>${esc(v.geometry_warning)}</p>`:''}</section>`).join('')}<h4>Excluded / unassigned (${r.unassigned.length})</h4><ul>${r.unassigned.map(o=>`<li>${esc(o.order_id)}: ${esc(o.reason)}</li>`).join('')}</ul><details><summary>Routing warnings</summary><ul>${r.warnings.map(w=>`<li>${esc(w)}</li>`).join('')}</ul></details>`;
}
function maps(root,plan){
  for(const v of plan.result.vehicles){
    const node=root.querySelector(`[data-plan-map="${v.rider_id}"]`);
    if(node&&v.geometry)globalThis.LannPyaCustomerMap?.routeView(node,v.geometry,plan.result.provider,v.stops);
    else globalThis.LannPyaCustomerMap?.stopsView(root.querySelector(`[data-stop-map="${v.rider_id}"]`),v.stops,plan.origin);
  }
}
export async function mountPlanner({container,store,afterCommit}){
  let status=await store.routingStatus();if(!container.isConnected)return;
  const snapshot=store.snapshot(),prior=snapshot.plans[0],origin=prior?.origin;
  const orders=snapshot.orders.filter(o=>!['delivered','cancelled','returned','return_pending'].includes(o.state));
  container.innerHTML=`<h2>Road routing and dispatch planning</h2><p id="routing-provider">Provider: ${esc(status.provider)}. ${status.provider==='offline'?'SIMULATED / TEST DATA; invented graph, not Yangon road measurements.':status.external_requests_enabled?'External provider enabled by server configuration.':'External requests disabled; no automatic offline fallback.'}</p><p data-routing-availability role="status">${esc(previewAvailability(status).message)}</p><form id="routing-plan-form"><h3>Mode B: Multi-stop optimization</h3><p>${status.provider==='ors'?'ORS driving-car road matrix; one request per preview, no route-geometry requests.':status.provider==='offline'?'SIMULATED matrix ? TEST DATA; not real roads or live traffic.':'Matrix unavailable for this provider. Configure ORS or explicit offline simulation; Google Demo is single-route only.'}</p>${status.provider==='ors'?`<p>ORS matrix cap: ${status.max_matrix_elements} cells. No request on page load.</p><label class="inline-check"><input type="checkbox" name="authorize_external_request" required> I authorize ONE ORS matrix request within the separately approved server budget.</label><input type="hidden" name="external_request_id" value="${crypto.randomUUID()}">`:""}<fieldset><legend>Courier origin and operating period (Yangon time)</legend><div class="form-grid"><label>Hub latitude<input name="latitude" type="number" min="-90" max="90" step="any" required value="${esc(origin?.latitude??'')}"></label><label>Hub longitude<input name="longitude" type="number" min="-180" max="180" step="any" required value="${esc(origin?.longitude??'')}"></label><label>Start<input name="start" type="datetime-local" required value="${localTime(Date.now())}"></label><label>End<input name="end" type="datetime-local" required value="${localTime(Date.now()+8*3600000)}"></label></div><p>Enter the real courier origin yourself. No hub location is invented. Map clicks change only this planning origin.</p><div class="live-map" data-pin-map data-pin-note="Planning origin only; previewing does not modify deliveries." aria-label="Select routing origin"></div><button type="button" class="btn sm" data-load-tiles>Load street tiles (OpenStreetMap)</button><p data-pin-status>No origin selected.</p></fieldset><fieldset><legend>Available riders and parcel capacities</legend>${snapshot.riders.map(r=>`<label class="inline-check"><input type="checkbox" name="rider-${esc(r.id)}" ${r.operational_status==='AVAILABLE'?'checked':'disabled'}>${esc(r.name)} (${esc(r.operational_status)})</label><label>Parcel capacity for ${esc(r.name)}<input name="capacity-${esc(r.id)}" type="number" min="1" max="200" required value="20"></label>`).join('')||'<p>Create a rider in the developer API workspace first.</p>'}</fieldset><fieldset><legend>Orders (maximum ${status.max_stops})</legend><p>Existing active rider assignments are fixed. Include every active stop for each selected rider. Missing pins/review problems will be reported as excluded.</p>${orders.map(o=>`<label class="inline-check"><input type="checkbox" name="order-${esc(o.id)}" ${o.pin&&o.received?'checked':''}>${esc(o.name||o.id)} | ${esc(o.id)} | ${esc(o.date)} | ${o.pin?'Stored pin, accuracy unverified':'Missing pin'} | ${esc(o.time)}</label><label>Priority for ${esc(o.name||o.id)} (0 normal, 5 urgent)<input name="priority-${esc(o.id)}" type="number" min="0" max="5" step="1" value="0"></label>`).join('')||'<p>No eligible orders. Create and review delivery orders first.</p>'}</fieldset><div class="form-grid"><label>Service seconds per stop<input name="service_seconds" type="number" min="0" max="3600" value="180" required></label><label>Solver budget (seconds)<input name="solver_seconds" type="number" min="1" max="10" value="2" required></label><label>Travel mode<select name="mode"><option value="DRIVE">Driving</option>${status.two_wheeler_enabled?'<option value="TWO_WHEELER">Two-wheeler (Google coverage, not locally verified)</option>':''}</select></label><label>Cost objective<select name="objective"><option value="duration">Travel time</option><option value="distance">Road distance</option></select></label></div><label class="inline-check"><input name="return_to_hub" type="checkbox" checked> Return to hub within operating period</label><label class="inline-check"><input name="allow_simulation" type="checkbox" ${status.provider==='offline'?'required':''}> I explicitly authorize SIMULATED test routing, not real road/traffic estimates</label><button class="btn primary" type="submit" ${previewAvailability(status).ready?'':'disabled'}>Optimize preview (no assignments)</button><p id="routing-error" role="alert"></p></form><section id="routing-preview" aria-live="polite"></section><section><h3>Saved plans</h3>${snapshot.plans.map(p=>`<p><button type="button" class="btn sm" data-open-plan="${esc(p.id)}">Open ${esc(p.id)}</button> ${esc(p.state)}${p.stale?' | STALE':''}</p>`).join('')||'<p>No saved plans yet.</p>'}</section>`;
  globalThis.LannPyaCustomerMap?.mount();
  const form=container.querySelector('#routing-plan-form'),error=container.querySelector('#routing-error'),view=container.querySelector('#routing-preview');
  let pending=false,displayed=null,requiresChangedInput=false;
  const previewButton=form.querySelector('[type=submit]');
  function availability(){
    if(!container.isConnected)return;
    const current=previewAvailability(status);
    previewButton.disabled=pending||!current.ready||requiresChangedInput;
    container.querySelector('[data-routing-availability]').textContent=current.message+(requiresChangedInput&&current.ready?' Previous request already attempted. Change planning inputs and explicitly authorize again before another request.':'');
  }
  function renderPlan(plan){
    displayed=plan;view.innerHTML=resultHTML(plan)+`<p>Previewing never assigns parcels. Changes to orders, riders or their queues invalidate this plan.</p>${plan.state==='PREVIEW'&&!plan.stale&&plan.result.vehicles.length?'<form id="commit-routing-plan"><label class="inline-check"><input type="checkbox" name="ack" required> I reviewed delivery pins and acknowledge unverified geospatial accuracy.</label>'+(plan.result.quality==='SIMULATED'?'<label class="inline-check"><input type="checkbox" name="simulation" required> I acknowledge that synthetic routing is TEST DATA.</label>':'')+'<button type="submit" class="btn primary">Commit assignments and stop order</button><p role="alert"></p></form>':''}<button type="button" class="btn" id="replan-routing">Recalculate from current records</button>`;maps(view,plan);
    const commit=view.querySelector('#commit-routing-plan');if(commit&&pending)commit.querySelector('button').disabled=true;if(commit)commit.onsubmit=async e=>{e.preventDefault();if(pending)return;pending=true;const button=commit.querySelector('button');button.disabled=true;try{const d=new FormData(commit);await store.commitPlan(plan,{acknowledge_unverified_location:d.has('ack'),allow_simulation:d.has('simulation')});await afterCommit();}catch(err){report(commit.querySelector('[role=alert]'),err);}finally{pending=false;button.disabled=false;}};
    view.querySelector('#replan-routing').onclick=()=>{if(status.provider==='ors'&&!previewAvailability(status).ready){error.textContent=previewAvailability(status).message+' Current saved plan retained.';return;}view.innerHTML='<p>Recalculating requires a new preview. Review the selected current orders/riders above, then Optimize preview. Completed/failed/cancelled stops are excluded; existing assignments remain fixed.</p>';displayed=null;form.scrollIntoView({block:'start'});};
  }
  form.oninput=e=>{if(pending)return;if(e.target.name!=='authorize_external_request'&&form.elements.external_request_id){form.elements.external_request_id.value=crypto.randomUUID();form.elements.authorize_external_request.checked=false;requiresChangedInput=false;}availability();if(displayed?.state==='PREVIEW'){displayed=null;view.innerHTML='<p>Inputs changed. Create a new preview before committing.</p>';}};
  form.onsubmit=async e=>{
    e.preventDefault();if(pending||requiresChangedInput||!previewAvailability(status).ready||!form.reportValidity())return;
    let request;try{request=planningRequest(new FormData(form),snapshot);}catch(err){report(error,err);return;}
    pending=true;error.textContent='';displayed=null;view.innerHTML='<p>Calculating a new preview; assignments remain unchanged.</p>';
    const controls=[...form.elements].map(control=>[control,control.disabled]);controls.forEach(([control])=>control.disabled=true);
    requiresChangedInput=status.provider==='ors';
    try{const plan=await store.previewPlan(request);if(container.isConnected)renderPlan(plan);}
    catch(err){view.innerHTML='<p>No new preview was produced. Saved plans can be reopened below.</p>';report(error,err);}
    finally{
      if(status.provider==='ors')try{status=await store.routingStatus();}catch{status={...status,availability_unavailable:true};if(container.isConnected)error.textContent+=' Routing budget status unavailable. Refresh before another live request.';}
      controls.forEach(([control,disabled])=>control.disabled=disabled);pending=false;availability();const commitButton=view.querySelector('#commit-routing-plan button');if(commitButton)commitButton.disabled=false;
    }
  };
  container.querySelectorAll('[data-open-plan]').forEach(b=>b.onclick=async()=>{try{const plan=await store.getPlan(b.dataset.openPlan);if(container.isConnected)renderPlan(plan);}catch(err){report(error,err);}});
  await mountGoogleEstimate({container,store});
}
export async function mountRiderPlan({container,store}){
  const plan=store.snapshot().riderPlans.find(p=>p.result.vehicles.length);
  if(!plan){container.innerHTML='<p>No committed optimization plan. Follow the existing dispatcher stop order and refresh for updates.</p>';return;}
  container.innerHTML=`<h2>Assigned route plan</h2>${plan.stale?'<p class="live-notice">Plan is stale after an order/queue change. Estimates need dispatcher review; follow the current queue and navigation pin.</p>':''}`+resultHTML(plan);
  maps(container,plan);
  
}

export async function mountGoogleEstimate({container,store,side='admin'}){
  // Reads status only. Mounting/refreshing never requests a Google route.
  if(!store.googleEstimateStatus)return;
  const panel=document.createElement('section');panel.className='plan-vehicle google-road-estimate';
  panel.innerHTML='<h3>Mode A: Google road estimate — single delivery</h3><p data-google-status>Checking authorization…</p>';
  container.append(panel);
  let status;
  try{status=await store.googleEstimateStatus(side);}catch(error){report(panel.querySelector('[data-google-status]'),error);return;}
  if(!panel.isConnected)return;
  let available=status.enabled&&status.remaining_requests>0;
  const orders=store.snapshot().orders.filter(o=>!['delivered','cancelled','returned','return_pending'].includes(o.state));
  panel.innerHTML=`<h3>Mode A: Google road estimate — single delivery</h3><p data-google-status>${available?'Server authorization enabled':'Live Google requests disabled or budget exhausted'}. Remaining server request budget: ${Number(status.remaining_requests)||0}. No request is made until you explicitly authorize and submit.</p><p>This single-delivery estimate is separate from Mode B multi-stop optimization; provider estimates are not interchangeable. Approved delivery pins are checked on the server; accuracy remains unverified.</p><form data-google-estimate><div class="form-grid"><label>Origin latitude<input name="latitude" type="number" min="-90" max="90" step="any" required></label><label>Origin longitude<input name="longitude" type="number" min="-180" max="180" step="any" required></label><label>Delivery<select name="order_id" required><option value="">Select a delivery</option>${orders.map(o=>`<option value="${esc(o.id)}">${esc(o.name||o.id)} — ${o.pin?'Stored pin; review required by server':'Missing pin'}</option>`).join('')}</select></label></div><label class="inline-check"><input name="consent" type="checkbox" required> I authorize ONE external Google request using these coordinates under the separately approved server budget.</label><button class="btn" type="submit" ${available?'':'disabled'}>Request Google road estimate</button></form><div data-google-result aria-live="polite"></div>`;
  const form=panel.querySelector('form'),result=panel.querySelector('[data-google-result]'),button=form.querySelector('button');
  let pending=false,requestId=null;
  form.oninput=e=>{if(!pending&&e.target.name!=='consent'){requestId=null;button.disabled=!available;result.textContent='Inputs changed; explicitly authorize a new request. Previous estimates are no longer displayed.';form.elements.consent.checked=false;}};
  form.onsubmit=async e=>{
    e.preventDefault();if(pending||!available||!form.reportValidity())return;
    requestId??=crypto.randomUUID();pending=true;button.disabled=true;
    const values=new FormData(form);for(const control of form.elements)control.disabled=true;result.textContent='Requesting Google road estimate. No automatic retry or simulated fallback.';
    try{
      const data=await store.googleEstimate({request_id:requestId,order_id:values.get('order_id'),origin:{latitude:Number(values.get('latitude')),longitude:Number(values.get('longitude'))},authorize_external_request:true},side);
      if(!panel.isConnected)return;
      const route=data.route;
      if(!['GOOGLE_LIVE','GOOGLE_MOCK'].includes(data.observation)||route.provider!=='google'||route.quality!=='ROAD_STATIC')throw Error('Unexpected routing response; no live result accepted.');
      result.innerHTML=`<p class="live-notice">${esc(data.observation)}${data.observation==='GOOGLE_MOCK'?' — TEST RESPONSE, not an additional live Google call':''}</p><p><strong>${(route.distance_meters/1000).toFixed(3)} km</strong> road distance; <strong>${(route.duration_seconds/60).toFixed(2)} min</strong> estimated travel duration. Static estimate, not live traffic or a delivery appointment.</p><p>Google Maps</p><p>No assignments, optimizer costs, or delivery statuses were changed. This response is not stored for later replay.</p>`;
      if([route.origin?.latitude,route.origin?.longitude,route.destination?.latitude,route.destination?.longitude].every(Number.isFinite)){
        const nav=document.createElement('a');nav.className='btn sm';nav.textContent='Open this route in Google Maps';nav.target='_blank';nav.rel='noopener noreferrer';
        nav.href='https://www.google.com/maps/dir/?api=1&origin='+encodeURIComponent(route.origin.latitude+','+route.origin.longitude)+'&destination='+encodeURIComponent(route.destination.latitude+','+route.destination.longitude)+'&travelmode=driving';result.append(nav);
      }
      if(route.geometry&&globalThis.LannPyaCustomerMap?.googleEnabled()){
        const show=document.createElement('button');show.type='button';show.className='btn sm';show.textContent='Show route on Google map';result.append(show);
        show.onclick=async()=>{show.disabled=true;const map=document.createElement('div');map.className='live-map';map.setAttribute('aria-label','Google road route');result.append(map);await globalThis.LannPyaCustomerMap.routeView(map,route.geometry,'google',[{...route.destination,sequence:1}]);};
      }else{const note=document.createElement('p');note.textContent='Google map display unavailable: a separately restricted browser Maps key is required. Google route geometry is not drawn on Leaflet.';result.append(note);}
    }catch(error){if(panel.isConnected)report(result,error);}
    finally{
      try{const budget=await store.googleEstimateStatus(side);available=budget.enabled&&budget.remaining_requests>0;if(panel.isConnected)panel.querySelector('[data-google-status]').textContent=`Remaining server request budget: ${Number(budget.remaining_requests)||0}. No automatic retry; another request needs explicit consent and remaining authorization.`;}
      catch{available=false;if(panel.isConnected)panel.querySelector('[data-google-status]').textContent='Budget status unavailable. Refresh before requesting another estimate.';}
      pending=false;for(const control of form.elements)if(control!==button)control.disabled=false;/* No automatic repeat: retain nonce and require changed inputs. */
    }
  };
}
