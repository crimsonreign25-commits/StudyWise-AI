const $=s=>document.querySelector(s); const boxes=['#setup','#login','#signup','#dashboard'];
function show(which){boxes.forEach(x=>$(x).hidden=x!==which)}
function notice(text){$('#notice').textContent=text;$('#notice').hidden=!text}
async function api(path,opts={}){const res=await fetch(path,{...opts,credentials:'same-origin',headers:{'content-type':'application/json',...(opts.headers||{})}});const data=await res.json();if(!res.ok)throw Error(data.error||`Request failed (${res.status})`);return data}
function payload(form){return Object.fromEntries(new FormData(form).entries())}
// Accessible show/hide controls for every password field, including dynamically reused forms.
document.querySelectorAll('input[type="password"]').forEach(input=>{
  const toggle=input.parentElement?.querySelector('[data-password-toggle]');
  if(!toggle)return;
  toggle.setAttribute('aria-label','Show password');
  toggle.setAttribute('aria-pressed','false');
  toggle.addEventListener('click',()=>{
    const reveal=input.type==='password';
    input.type=reveal?'text':'password';
    toggle.textContent=reveal?'Hide':'Show';
    toggle.setAttribute('aria-label',reveal?'Hide password':'Show password');
    toggle.setAttribute('aria-pressed',String(reveal));
    input.focus();
  });
});
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
async function status(){try{const s=await api('/api/accounts/status');if(s.setupRequired){show('#setup');return}try{const m=await api('/api/accounts/me');signedIn(m.user)}catch{show('#login')}}catch(e){notice(e.message)}}
$('#show-signup')?.addEventListener('click',()=>{show('#signup');notice('')});$('#setup-signup')?.addEventListener('click',()=>{show('#signup');notice('')});$('#show-login')?.addEventListener('click',()=>{show('#login');notice('')});$('#forgot-password')?.addEventListener('click',()=>notice('Password recovery is not connected to the app yet. Please contact the site administrator for account recovery; never share your password.'));
function signedIn(user){show('#dashboard');$('#welcome').textContent=`Welcome, ${user.name}`;$('#role').textContent=`${user.role.replaceAll('_',' ')} · ${user.email}`;$('#new-role').innerHTML=(user.role==='creator'?[['institution_admin','Institution Administrator'],['teacher','Teacher'],['learner','Learner'],['parent_guardian','Parent / Guardian'],['support_staff','Support Staff']]:[['teacher','Teacher'],['learner','Learner'],['parent_guardian','Parent / Guardian']]).map(([v,l])=>`<option value="${v}">${l}</option>`).join('');$('#institution-field').hidden=user.role!=='creator';$('#audit-area').hidden=user.role!=='creator';$('#create-form').hidden=!['creator','institution_admin'].includes(user.role);loadUsers()}
async function loadUsers(){try{const d=await api('/api/accounts/users');$('#users').innerHTML=d.users.length?d.users.map(u=>`<div class="account-user"><span><b>${esc(u.name)}</b><br>${esc(u.email)}<br>${esc(u.role.replaceAll('_',' '))}</span><small>${esc(u.institutionId||'No institution')}</small></div>`).join(''):'No managed accounts yet.'}catch(e){$('#users').textContent=e.message}}
$('#setup-form').addEventListener('submit',async e=>{e.preventDefault();try{const d=await api('/api/accounts/setup-creator',{method:'POST',body:JSON.stringify(payload(e.target))});notice('Creator account created successfully. Store your login credentials safely.');signedIn(d.user)}catch(err){notice(err.message)}});
$('#login-form').addEventListener('submit',async e=>{e.preventDefault();try{const d=await api('/api/accounts/login',{method:'POST',body:JSON.stringify(payload(e.target))});notice('Signed in successfully.');signedIn(d.user)}catch(err){notice(err.message)}});
$('#signup-form').addEventListener('submit',async e=>{e.preventDefault();try{const d=await api('/api/accounts/signup',{method:'POST',body:JSON.stringify(payload(e.target))});notice(d.message||'Account created.');if(d.needsEmailConfirmation){show('#login');return}if(d.user)signedIn(d.user)}catch(err){notice(err.message)}});
$('#create-form').addEventListener('submit',async e=>{e.preventDefault();try{const d=await api('/api/accounts/users',{method:'POST',body:JSON.stringify(payload(e.target))});notice(`Account created for ${d.user.email}. Share temporary credentials securely and ask them to change their password when password-change support is added.`);e.target.reset();loadUsers()}catch(err){notice(err.message)}});
$('#refresh-users').addEventListener('click',loadUsers);$('#logout').addEventListener('click',async()=>{try{await api('/api/accounts/logout',{method:'POST',body:'{}'});notice('Signed out.');show('#login')}catch(e){notice(e.message)}});
$('#audit').addEventListener('click',async()=>{try{const d=await api('/api/accounts/audit');$('#audit-list').innerHTML=d.events.map(x=>`<div class="account-user"><span><b>${esc(x.action)}</b><br>Actor: ${esc(x.actor)} · Target: ${esc(x.target||'—')}</span><small>${esc(x.at)}</small></div>`).join('')}catch(e){notice(e.message)}});
status();
