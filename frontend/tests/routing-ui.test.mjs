import test from 'node:test';
import assert from 'node:assert/strict';
import {planningRequest,previewAvailability,observationNotice} from '../js/routing-ui.mjs';

function form(){
  const f=new FormData();
  for(const [k,v]of Object.entries({latitude:'16.8',longitude:'96.1',start:'2026-12-01T08:00',end:'2026-12-01T18:00',service_seconds:'180',mode:'DRIVE',objective:'duration',solver_seconds:'1','rider-r1':'on','capacity-r1':'5','order-o1':'on',allow_simulation:'on',return_to_hub:'on'}))f.set(k,v);
  return f;
}
const snapshot={orders:[{id:'o1'},{id:'o2'}],riders:[{id:'r1'},{id:'r2'}]};
test('planner maps only selected canonical IDs and explicit capacities',()=>{
  const q=planningRequest(form(),snapshot);
  assert.deepEqual(q.orders,[{order_id:'o1',demand:1,service_seconds:180}]);
  assert.deepEqual(q.riders,[{rider_id:'r1',capacity:5}]);
  assert.equal(q.operating_window.start,'2026-12-01T08:00:00+06:30');
  assert.equal(q.allow_simulation,true);assert.equal(q.return_to_hub,true);
});
test('simulation and return-to-hub are explicit request flags',()=>{
  const f=form();f.delete('allow_simulation');f.delete('return_to_hub');
  const q=planningRequest(f,snapshot);assert.equal(q.allow_simulation,false);assert.equal(q.return_to_hub,false);
});
for(const value of ['', 'NaN', '91'])test('invalid hub latitude is never invented: '+JSON.stringify(value),()=>{
  const f=form();f.set('latitude',value);assert.throws(()=>planningRequest(f,snapshot),/valid hub/);
});
test('explicit parcel priority is passed without changing the default request',()=>{
  const f=form();f.set('priority-o1','5');
  assert.equal(planningRequest(f,snapshot).orders[0].priority,5);
});
for(const priority of ['-1','6','1.5','invalid'])test('invalid delivery priority is rejected: '+priority,()=>{
  const f=form();f.set('priority-o1',priority);assert.throws(()=>planningRequest(f,snapshot),/priority/);
});
test('ORS preview carries explicit external consent and a stable request nonce only when selected',()=>{
  const f=form();f.delete('allow_simulation');f.set('authorize_external_request','on');f.set('external_request_id','fictional-request-id');
  const first=planningRequest(f,snapshot),second=planningRequest(f,snapshot);
  assert.equal(first.request_id,second.request_id);assert.equal(first.authorize_external_request,true);assert.equal(first.allow_simulation,false);
  f.delete('authorize_external_request');const no=planningRequest(f,snapshot);
  assert.equal(no.authorize_external_request,undefined);assert.equal(no.request_id,undefined);
});

const ready={provider:'ors',external_requests_enabled:true,key_configured:true,remaining_requests:1,max_matrix_elements:16};
for(const [changes,reason] of [[{availability_unavailable:true},'unavailable'],[{external_requests_enabled:false},'disabled'],[{key_configured:false},'credential'],[{remaining_requests:0},'exhausted'],[{provider:'google'},'unavailable']])test('ORS preview is blocked with a clear reason: '+reason,()=>{
  const availability=previewAvailability({...ready,...changes});assert.equal(availability.ready,false);assert.match(availability.message,new RegExp(reason,'i'));
});
test('remaining authorization allows explicit previews without implying automatic requests',()=>{
  assert.equal(previewAvailability(ready).ready,true);assert.match(previewAvailability(ready).message,/no automatic requests/);
  assert.equal(previewAvailability({provider:'offline'}).ready,true);
});
test('recorded provider replay cannot be presented as a newly live or simulated matrix',()=>{
  assert.match(observationNotice({matrix_observation:'ORS_MOCK_MATRIX',quality:'ROAD_STATIC'}),/no new live provider call/);
  assert.match(observationNotice({matrix_observation:'ORS_ROAD_MATRIX',quality:'ROAD_STATIC'}),/Road-provider matrix/);
  assert.match(observationNotice({quality:'SIMULATED'}),/not measured road/);
  assert.match(observationNotice({quality:'ROAD_STATIC'}),/do not infer live verification/);
});
