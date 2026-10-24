-- Normalize the Ochilink Hub public catalog to the current ecosystem.
-- Preserves cover_image_url so Admin-managed screenshots are never overwritten.
BEGIN;

INSERT INTO public.apps
    (slug,name,description,link,tech,status,is_published,sort_order)
VALUES
('ochilink-database-cloud','Ochilink Database Cloud','Database projects, environments, schemas, tables, SQL tooling, connections, backups and monitoring.',NULL,ARRAY['Next.js','React','TypeScript','PostgreSQL','Docker'],'Coming Soon',true,0),
('ochilink-calendar','Ochilink Calendar','Scheduling, appointments, reminders and recurring events in one workspace.',NULL,ARRAY['PHP','MySQL','JavaScript','CSS','FullCalendar'],'Coming Soon',true,1),
('ochilink-rental-application','Ochilink Rental Application','Secure multi-step residential rental application workflow with applicant summaries and fee handling.',NULL,ARRAY['Web App','Responsive UI','Database TBD'],'Coming Soon',true,2),
('anansy-crm','Anansy CRM','CRM for leads, tasks, customer workflows and business operations.',NULL,ARRAY['Next.js','React','TypeScript','Supabase'],'Coming Soon',true,3),
('bull-mountain-trading-journal','Bull Mountain Trading Journal','Trading journal, analytics, reviews and performance tracking.',NULL,ARRAY['PHP','MySQL','JavaScript','CSS'],'Coming Soon',true,4),
('ochi-classifieds-rental','Ochi Classifieds & Rental','Classifieds, rentals and marketplace workflows for local communities.',NULL,ARRAY['React','Supabase','JavaScript','CSS'],'Coming Soon',true,5),
('rowpro-dealer-hub','ROWPRO Dealer Hub','Real-estate investor and wholesaler dealer hub for opportunities, contacts and deal workflows.',NULL,ARRAY['Web App','Supabase','Database TBD'],'Coming Soon',true,6),
('ochilink-vault','Ochilink Vault Password Manager','Encrypted local password manager and secure vault application.',NULL,ARRAY['Electron','Node.js','PostgreSQL','JavaScript','GitHub'],'Live',true,7),
('ochilink-news','Ochilink News','Live news, editorial workflow and ecosystem updates.','https://news.ochilink.com',ARRAY['React','Supabase','JavaScript','Vercel','GitHub'],'Live',true,8),
('ochilink-dev-tools','Ochilink Dev Tools','Project tracking, build progress, launch planning, backups and development workflows.',NULL,ARRAY['JavaScript','Node.js','PostgreSQL','HTML','CSS'],'Coming Soon',true,9),
('ochilink-websites-app-management','Ochilink Websites & App Management','Deployment, website and application management with live pipeline visibility.',NULL,ARRAY['JavaScript','Vercel API','HTML','CSS'],'Coming Soon',true,10),
('repost-jamaica','Repost Jamaica','Social reposting and publishing workflow for Jamaican creators and brands.',NULL,ARRAY['React Native','Social API','JavaScript'],'Coming Soon',true,11),
('pbris-com','PBRIS.com','Property and business registry information system with real-estate discovery and listing tools.','https://pbris.com',ARRAY['PHP','MySQL','HTML','CSS','JavaScript','Bootstrap'],'Live',true,12),
('taxdrill-com','TaxDrill.com','Bank-statement parsing, transaction review, Schedule C workflows and tax-ready reporting.','https://taxdrill.com',ARRAY['Next.js','React','TypeScript','FastAPI','Python','PostgreSQL','Render'],'Live',true,13),
('hummingbird-trading-app','Hummingbird Trading App','Trading application with portfolio, watchlist and alert workflows.',NULL,ARRAY['Laravel','React','Next.js','Tailwind','PostgreSQL','GitHub'],'Coming Soon',true,14),
('ochilink-hub','Ochilink Hub','Central directory, booking, administration and services hub for the Ochilink ecosystem.','https://ochilink.com',ARRAY['React','Tailwind','Node.js','PostgreSQL','Neon','Vercel','GitHub'],'Live',true,15),
('ramonemiami-com','RamoneMiami.com','Miami real-estate and lifestyle brand experience.','https://ramonemiami.com',ARRAY['HTML','CSS','JavaScript','GitHub'],'Live',true,16),
('ramonewalker-com','RamoneWalker.com','Portfolio, personal brand and developer hub.','https://ramonewalker.com',ARRAY['React','TypeScript','CSS'],'Live',true,17),
('ochilink-document-storage','Ochilink Document Storage','Document storage workspace with folders, search, uploads and file organization.',NULL,ARRAY['Web App','Document Storage','Database TBD'],'Coming Soon',true,18),
('ochitours','OchiTours','Ocho Rios travel, accommodations, tours, flights, rentals and airport transportation.',NULL,ARRAY['HTML','CSS','JavaScript','Travel Platform'],'Coming Soon',true,19),
('community-association-management','Community Association Management','Resident and property-manager portal for HOA documents, messages and maintenance tickets.',NULL,ARRAY['SPA','Tailwind','JavaScript','Lucide'],'Coming Soon',true,20),
('ochishop','OchiShop','Ochilink ecommerce storefront for limited drops, apparel and branded products.',NULL,ARRAY['Ecommerce','Web App','HTML','CSS'],'Coming Soon',true,21),
('ochilink-lower-body-analytics','Ochilink Lower Body Analytics','Workout, volume, muscle-balance, measurements and personal-record analytics.',NULL,ARRAY['JavaScript','PostgreSQL','REST API','CSS'],'Coming Soon',true,22),
('ochilink-admin','Ochilink Admin','Unified administration, role-aware access, audit visibility and ecosystem controls.',NULL,ARRAY['React','Laravel','PostgreSQL','MySQL','Llama'],'Coming Soon',true,23),
('row-pro-repost-studio','ROW PRO Repost Studio','Real-estate listing publisher with Instagram Reel preview, caption generation and publishing workflow.',NULL,ARRAY['Instagram Graph API','REST API','JavaScript','Social Publishing'],'Coming Soon',true,24)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    link = EXCLUDED.link,
    tech = EXCLUDED.tech,
    status = EXCLUDED.status,
    is_published = EXCLUDED.is_published,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

-- Retire superseded legacy catalog rows without deleting historical records.
UPDATE public.apps
SET is_published = false,
    updated_at = now()
WHERE slug IN (
    'ochi-rentals-and-classifieds',
    'anansy-pro-crm',
    'rowpro',
    'trading-app',
    'repostjamaica',
    'property-management-software'
);

INSERT INTO public.hub_schema_migrations (version)
VALUES ('010_full_ecosystem_catalog')
ON CONFLICT (version) DO NOTHING;

COMMIT;
