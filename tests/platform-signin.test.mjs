import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';import {exchangeHandoff,signinRequest,challengeFor,SIGNIN_CLIENTS,validateHandoff} from '../lib/platform-signin.js';
const fail=(status,message)=>{throw Object.assign(Error(message),{status})};
test('linked sign-in binds client, nonce and PKCE; expires and consumes codes once',async()=>{const db=new PGlite();try{
for(const f of ['001_ochilink_hub','003_complete_hub','009_app_cover_images','014_rental_application','018_platform_workspace','019_linked_sign_in','019_linked_sign_in'])await db.exec(await readFile('database/migrations/'+f+'.sql','utf8'));
const pool={query:(s,p)=>db.query(s,p)},audit=async()=>{},user=(await db.query("INSERT INTO users(email,name,password_hash,role) VALUES('fixture@example.invalid','Fixture','not-a-password','admin') RETURNING *")).rows[0];let result;const res={setHeader(){},json(d){result=d}},verifier='v'.repeat(64),data={client_id:'crm',redirect_uri:SIGNIN_CLIENTS.crm.redirect,code_challenge_method:'S256',code_challenge:challengeFor(verifier),nonce:'n'.repeat(43),state:'s'.repeat(43)};
const issue=async()=>{await signinRequest({resource:'platform-signin',req:{method:'POST',headers:{}},res,body:data,pool,user,fail,audit});return new URL(result.redirect).searchParams.get('code')};
await signinRequest({resource:'platform-signin',req:{method:'GET',headers:{},query:data},res,pool,user:null,fail,audit});assert.equal(result.signed_in,false);
assert.throws(()=>validateHandoff({...data,redirect_uri:'https://evil.invalid'},fail),{status:400});assert.throws(()=>validateHandoff({...data,client_id:'__proto__'},fail),{status:400});
let code=await issue();const exchange=(patch={},headers={})=>exchangeHandoff({pool,body:{client_id:'crm',redirect_uri:data.redirect_uri,code,code_verifier:verifier,...patch},req:{method:'POST',headers},fail,audit});
await assert.rejects(()=>exchange({}, {origin:'https://evil.invalid'}),{status:403});await assert.rejects(()=>exchange({code_verifier:'x'.repeat(64)}),{status:401});await assert.rejects(()=>exchange({client_id:'calendar',redirect_uri:SIGNIN_CLIENTS.calendar.redirect}),{status:401});
const identity=await exchange();assert.equal(identity.subject,'staff:'+user.id);assert.equal(identity.nonce,data.nonce);assert.equal(identity.role,'admin');await assert.rejects(()=>exchange(),{status:401});
code=await issue();await db.exec("UPDATE platform_signin_codes SET expires_at=now()-interval '1 second'");await assert.rejects(()=>exchange(),{status:401});
code=await issue();await db.query('UPDATE users SET is_active=false WHERE id=$1',[user.id]);await assert.rejects(()=>exchange(),{status:401});
assert.equal((await db.query('SELECT count(*)::int n FROM users')).rows[0].n,1);
}finally{await db.close()}});
