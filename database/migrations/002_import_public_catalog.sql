-- Import existing public catalog. No sample activity or user accounts.
BEGIN;
INSERT INTO apps (slug,name,description,link,tech,status,is_published,sort_order) VALUES
('ochilink-news','Ochilink News','Live news & updates feed from the ecosystem',NULL,ARRAY['React','Llama'],'Live',true,0),
('ramonemiami-com','RamoneMiami.com','Personal brand & Miami lifestyle','https://ramonemiami.com',ARRAY['Next.js','CMS'],'Live',true,1),
('ramonewalker-com','RamoneWalker.com','Portfolio & developer hub','https://ramonewalker.com',ARRAY['React','TS'],'Live',true,2),
('pbris-com','PBRIS.com','Property & Business Registry Info System','https://pbris.com',ARRAY['Laravel','MySQL'],'Live',true,3),
('taxdrill-com','TaxDrill.com','Tax training & drill platform','https://taxdrill.com',ARRAY['PHP','MySQL'],'Live',true,4),
('ochilink-calendar','Ochilink Calendar','Scheduling & appointments for consultations',NULL,ARRAY['React','Cal'],'Coming Soon',true,5),
('ochi-rentals-and-classifieds','Ochi Rentals and Classifieds','Rentals, jobs, classifieds for Ocho Rios & Jamaica',NULL,ARRAY['Laravel','PG'],'Coming Soon',true,6),
('anansy-pro-crm','Anansy Pro CRM','Smart CRM for Caribbean businesses',NULL,ARRAY['React','Node'],'Coming Soon',true,7),
('rowpro','RowPro','Real Estate Dealer Hub — management & listings',NULL,ARRAY['TS','PG'],'Coming Soon',true,8),
('trading-app','Trading App','Simple trading & portfolio tracker',NULL,ARRAY['Python','React'],'Coming Soon',true,9),
('repostjamaica','RepostJamaica','IG Repost App for Jamaican creators',NULL,ARRAY['React Native'],'Coming Soon',true,10),
('property-management-software','Property Management Software','Tenants, rent, maintenance',NULL,ARRAY['Laravel','MySQL'],'Coming Soon',true,11)
ON CONFLICT (slug) DO NOTHING;
COMMIT;
