// pi-test-node-fixture
import readline from 'node:readline';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const frame = (event, body) => process.stdout.write(JSON.stringify({event, [event]: body}) + '\n');
const lines = readline.createInterface({input: process.stdin})[Symbol.asyncIterator]();
const line = (await lines.next()).value ?? '';
if (line.includes('CHECKPOINT-PROGRESS') || line.includes('GARBAGE-PROGRESS')) {
  frame('init', {});
  for (let i = 0; i < 12; i++) {
    await sleep(100);
    if (line.includes('CHECKPOINT-PROGRESS')) frame('step_update', {step_type:'checkpoint',state:'DONE',step_index:i});
    else { console.log('unrecognized noise'); console.log('{"event":"unknown-progress"}'); }
  }
  frame('result', {status:'SUCCESS',response:'finished after progress'});
} else if (line.includes('SILENT-DROP')) {
  frame('init', {conversation_id:'conv-drop'});
  await sleep(100);
  frame('result', {status:'SUCCESS', response:'', conversation_id:'conv-drop', usage:{input_tokens:0, output_tokens:0, thinking_tokens:0, cache_read_tokens:0, total_tokens:0}});
} else if (line.includes('STDERR-LEAK')) {
  frame('init', {conversation_id:'conv-leak'});
  await sleep(100);
  console.error('boom google key AIzaSyA-1234567890abcdefghijklmnopqrstu');
  process.exit(3);
} else if (line.includes('HANG')) {
  frame('init', {conversation_id:'conv-hang'});
  await sleep(30000);
} else if (line.includes('OVERFLOW-FLOOD')) {
  frame('init', {conversation_id:'conv-overflow'});
  await new Promise(r => process.stdout.write('x'.repeat(34*1024*1024), r));
  await sleep(30000);
} else if (line.includes('NOISE-GLUE')) {
  frame('init', {conversation_id:'conv-noise'});
  await sleep(100);
  console.log('Opening in existing browser session.');
  process.stdout.write('Opening in existing browser session.');
  frame('result', {status:'SUCCESS', response:'AFTER-NOISE'});
} else if (line.includes('KEEP-ALIVE')) {
  for(let i=0;i<2;i++) {
    if(i) await lines.next();
    frame('init', {conversation_id:'conv-777'});
    await sleep(150);
    frame('result', {status:'SUCCESS', response:'KEEP-TURN'});
    await sleep(100);
  }
} else {
  frame('init', {conversation_id:'conv-777'});
  await sleep(150);
  process.stdout.write('{"event":"step_update","step_update":{"step_index":1,"state":"DONE","step_type":"agent_response","text_delta":"HALF-ONE-');
  await sleep(250);
  process.stdout.write('HALF-TWO"}}\n');
  await sleep(150);
  frame('result', {status:'SUCCESS', response:'RESULT-BODY'});
}
await sleep(200);
process.exit(0);
