import {createHash,randomBytes} from 'node:crypto';
import {currentCustomer} from './customer.js';
const ISSUER='https://ochilink.com';
export const SIGNIN_CLIENTS=Object.freeze({crm:{name:'Ochilink Real Estate Processor CRM',redirect:'https://crm.ochilink.com/api/account/hub/callback'},calendar:{name:'Ochilink Calendar',redirect:'https://calendar-test.ochilink.com/index.php?path=auth/hub&action=callback'}});
const hash=v=>createHash('sha256').update(v).digest('hex');
export const challengeFor=v=>createHash('sha256').update(v).digest('base64url');
export function validateHandoff(data,fail){const c=Object.hasOwn(SIGNIN_CLIENTS,data.client_id)?SIGNIN_CLIENTS[data.client_id]:null;if(!c||data.redirect_uri!==c.redirect||data.code_challenge_method!=='S256'||!/^[A-Za-z0-9_-]{43}$/.test(data.code_challenge||'')||!/^[A-Za-z0-9_-]{32,128}$/.test(data.state||'')||!/^[A-Za-z0-9_-]{32,128}$/.test(data.nonce||''))fail(400,'Restart sign-in from the destination app.');return c;}
export async function exchangeHandoff({pool,body,fail,throttle,req,audit}){
 if(req.method!=='POST'||req.headers.origin)fail(403,'This endpoint accepts server-to-server exchanges only.');
 const client=Object.hasOwn(SIGNIN_CLIENTS,body.client_id)?SIGNIN_CLIENTS[body.client_id]:null;
 if(!client||body.redirect_uri!==client.redirect||!/^[A-Za-z0-9_-]{43}$/.test(body.code||'')||!/^[A-Za-z0-9._~-]{43,128}$/.test(body.code_verifier||''))fail(400,'Invalid sign-in exchange.');
 const code=(await pool.query('DELETE FROM platform_signin_codes WHERE code_hash=$1 AND client_id=$2 AND redirect_uri=$3 AND pkce_challenge=$4 AND expires_at>now() RETURNING *',[hash(body.code),body.client_id,client.redirect,challengeFor(body.code_verifier)])).rows[0];
 if(!code)fail(401,'Sign-in expired or was already used. Start again.');
 const table=code.subject_kind==='staff'?'users':'customer_accounts';
 const identity=(await pool.query(`SELECT id,email,name${code.subject_kind==='staff'?',role':''} FROM ${table} WHERE id=$1 AND is_active${code.subject_kind==='staff'?' AND (locked_until IS NULL OR locked_until<now())':''}`,[code.subject_id])).rows[0];
 if(!identity)fail(401,'This Hub account is unavailable.');
 await audit(pool,code.subject_kind==='staff'?identity.id:null,'PLATFORM_SIGN_IN_EXCHANGED',{client:body.client_id,subject_kind:code.subject_kind});
 return {issuer:ISSUER,audience:body.client_id,subject:code.subject_kind+':'+identity.id,subject_kind:code.subject_kind,email:identity.email,name:identity.name,role:identity.role||'customer',nonce:code.nonce,expires_at:Math.floor(Date.now()/1000)+60};
}
export async function signinRequest({resource,req,res,body,pool,user,fail,audit}){
 if(resource!=='platform-signin')return false;
 const customer=user?null:await currentCustomer(pool,req);
 res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
 const data=req.method==='GET'?req.query:body;const client=validateHandoff(data,fail);
 const ready=(await pool.query("SELECT to_regclass('public.platform_signin_codes') AS ready")).rows[0]?.ready;if(!ready)fail(503,'Shared sign-in has not been activated by your Hub administrator.');
 if(!user&&!customer){res.json({signed_in:false,app:client.name});return true;}
 const identity=user||customer;
 if(req.method==='GET'){res.json({signed_in:true,app:client.name,name:identity.name,email:identity.email,subject_kind:user?'staff':'customer'});return true;}
 if(req.method!=='POST')fail(405,'Method not allowed.');
 const code=randomBytes(32).toString('base64url');
 await pool.query('DELETE FROM platform_signin_codes WHERE expires_at<now()');
 await pool.query('INSERT INTO platform_signin_codes(code_hash,client_id,redirect_uri,pkce_challenge,nonce,subject_kind,subject_id) VALUES($1,$2,$3,$4,$5,$6,$7)',[hash(code),data.client_id,client.redirect,data.code_challenge,data.nonce,user?'staff':'customer',identity.id]);
 await audit(pool,user?.id||null,'PLATFORM_SIGN_IN_AUTHORIZED',{client:data.client_id,subject_kind:user?'staff':'customer'});
 const url=new URL(client.redirect);url.searchParams.set('code',code);url.searchParams.set('state',data.state);url.searchParams.set('iss',ISSUER);res.json({redirect:url.href});return true;
}
