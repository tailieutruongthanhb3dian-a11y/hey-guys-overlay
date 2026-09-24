// Giới hạn thời gian riêng cho luồng đọc nhanh và thao tác có job máy chủ.
import assert from 'node:assert/strict';
import { rpcTimeout, reconnectDelay } from '../src/lib/connection-policy.ts';
assert.equal(rpcTimeout('web_events'),4000);
assert.equal(rpcTimeout('era_live_state'),4000);
assert.equal(rpcTimeout('era_garage_action'),120000);
assert.equal(rpcTimeout('era_skin_apply'),60000);
assert.deepEqual([1,2,3,4,5,100].map(n=>reconnectDelay(n)),[1000,2000,4000,8000,10000,10000]);
assert.equal(reconnectDelay(1,true),30000);
console.log('PASS: fast read timeouts, long operation budgets, capped reconnect backoff, expired-pair pacing.');
