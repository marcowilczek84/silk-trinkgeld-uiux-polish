import test from 'node:test';import assert from 'node:assert/strict';import {personalAccess,unavailable} from './module-runtime.mjs';
test('personal adapter stays disabled without explicit flag',()=>{assert.equal(personalAccess({}),null);assert.equal(personalAccess({MODULE_SSO_ENABLED:'false'}),null);assert.equal(unavailable().status,404);});
test('explicit activation with missing server configuration fails closed',()=>{assert.throws(()=>personalAccess({MODULE_SSO_ENABLED:'true'}));});
