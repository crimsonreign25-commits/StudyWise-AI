import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

test('account foundation enforces one-time Creator setup, sign-in, roles, and institution boundaries', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'studywise-auth-'));
  const port = 18000 + Math.floor(Math.random() * 20000);
  const secret = 'test-creator-setup-secret-very-long';
  const child = spawn(process.execPath, ['server.js'], { cwd: path.resolve('.'), env: { ...process.env, PORT: String(port), NODE_ENV: 'test', CREATOR_SETUP_SECRET: secret, STUDYWISE_DATA_DIR: dir }, stdio: 'ignore' });
  t.after(async () => { child.kill('SIGTERM'); await delay(150); await rm(dir, { recursive: true, force: true }); });
  let ready = false;
  for (let i=0;i<60;i++) { try { const r=await fetch(`http://127.0.0.1:${port}/api/health`); if(r.ok){ready=true;break;} } catch {} await delay(100); }
  assert.equal(ready, true, 'server should start');
  const base=`http://127.0.0.1:${port}`;
  const request=async (url, body, cookie='')=>{const r=await fetch(base+url,{method:'POST',headers:{'content-type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(body)});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]||cookie};};
  let r=await fetch(base+'/api/accounts/status'); assert.equal((await r.json()).setupRequired,true);
  r=await request('/api/accounts/setup-creator',{name:'Creator',email:'creator@example.com',password:'VerySecurePass123',setupSecret:'wrong'}); assert.equal(r.status,403);
  r=await request('/api/accounts/setup-creator',{name:'Creator',email:'creator@example.com',password:'VerySecurePass123',setupSecret:secret}); assert.equal(r.status,201); const creatorCookie=r.cookie; assert.ok(creatorCookie.includes('sw_session='));
  r=await request('/api/accounts/setup-creator',{name:'Attacker',email:'attacker@example.com',password:'VerySecurePass123',setupSecret:secret}); assert.equal(r.status,409);
  r=await request('/api/accounts/users',{name:'School Admin',email:'admin@example.com',password:'AnotherSecure123',role:'institution_admin'},creatorCookie); assert.equal(r.status,201); const institutionId=r.data.user.institutionId; assert.ok(institutionId);
  r=await request('/api/accounts/users',{name:'Teacher',email:'teacher@example.com',password:'TeacherSecure123',role:'teacher',institutionId},creatorCookie); assert.equal(r.status,201);
  r=await request('/api/accounts/login',{email:'teacher@example.com',password:'wrongpassword'}); assert.equal(r.status,401);
  r=await request('/api/accounts/login',{email:'teacher@example.com',password:'TeacherSecure123'}); assert.equal(r.status,200); const teacherCookie=r.cookie;
  r=await request('/api/accounts/users',{name:'Promoted',email:'bad@example.com',password:'BadSecurePass123',role:'institution_admin'},teacherCookie); assert.equal(r.status,403);
  const me=await fetch(base+'/api/accounts/me',{headers:{cookie:teacherCookie}}); assert.equal(me.status,200); assert.equal((await me.json()).user.role,'teacher');
  const audit=await fetch(base+'/api/accounts/audit',{headers:{cookie:teacherCookie}}); assert.equal(audit.status,403);
  r=await request('/api/accounts/login',{email:'admin@example.com',password:'AnotherSecure123'}); assert.equal(r.status,200); const adminCookie=r.cookie;
  r=await request('/api/accounts/users',{name:'School Learner',email:'learner@example.com',password:'LearnerSecure123',role:'learner'},adminCookie); assert.equal(r.status,201); assert.equal(r.data.user.institutionId,institutionId);
  const adminUsers=await fetch(base+'/api/accounts/users',{headers:{cookie:adminCookie}}); const adminList=await adminUsers.json(); assert.equal(adminUsers.status,200); assert.ok(adminList.users.some(u=>u.email==='learner@example.com')); assert.ok(!adminList.users.some(u=>u.role==='creator'));
  const teacherUsers=await fetch(base+'/api/accounts/users',{headers:{cookie:teacherCookie}}); assert.equal(teacherUsers.status,403);
});
