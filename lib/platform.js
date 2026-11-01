import { readFile } from 'node:fs/promises';
import { currentCustomer } from './customer.js';
export function canSeePlatformApp(app,user,customer){return !!user&&(user.role==='admin'||app.audience==='public'||app.audience==='staff'&&user.role==='staff')||!!customer&&app.audience==='public';}
export async function platformRequest({resource,req,res,pool,user,fail,audit}){
 if(resource!=='platform')return false;
 const customer=user?null:await currentCustomer(pool,req);
 if(!user&&!customer)fail(401,'Sign in to your Ochilink account to open your workspace.');
 if(req.method==='POST'&&req.query?.action==='initialize'){
  if(user?.role!=='admin')fail(403,'Administrator access required.');
  if(process.env.VERCEL_ENV==='preview')fail(403,'Initialize the workspace on the production Hub only.');
  const migration=await readFile(new URL('../database/migrations/018_platform_workspace.sql',import.meta.url),'utf8');
  const client=await pool.connect();try{await client.query(migration);}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  await audit(pool,user.id,'PLATFORM_WORKSPACE_INITIALIZED',{version:'018_platform_workspace'});res.json({initialized:true});return true;
 }
 if(req.method!=='GET')fail(405,'Method not allowed.');
 const identity={name:(user||customer).name,email:(user||customer).email,type:user?'staff':'customer',role:user?.role||'customer'};
 const ready=(await pool.query("SELECT to_regclass('public.platform_apps') AS ready")).rows[0]?.ready;
 if(!ready){res.json({identity,setup_required:user?.role==='admin',apps:[],integrations:[],shared_sign_in:false});return true;}
 const apps=(await pool.query(`SELECT a.id,a.slug,a.name,a.description,a.cover_image_url,p.category,p.lifecycle,p.audience,p.launch_url,p.login_mode FROM platform_apps p JOIN apps a ON a.id=p.app_id ORDER BY p.category,a.name`)).rows.filter(a=>canSeePlatformApp(a,user,customer));
 const slugs=new Set(apps.map(a=>a.slug));
 const integrations=(await pool.query('SELECT id,source_slug,target_slug,name,status,details,updated_at FROM platform_integrations ORDER BY name')).rows.filter(i=>slugs.has(i.source_slug)&&slugs.has(i.target_slug));
 res.setHeader('Cache-Control','no-store');
 res.json({identity,apps:apps.map(({audience,...a})=>a),integrations,shared_sign_in:false});return true;
}
