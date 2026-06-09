-- Seed data for the RISE demo account. Runs on `supabase db reset` (fresh DB).
-- Profiles are intentionally NOT seeded here: a user's profile is created by
-- the on_auth_user_created trigger from a matching row in account_invites
-- (see migration 20260609064531) when they first sign in.

-- Guard: only seed if the RISE account isn't already present.
insert into public.accounts (company, short_name, tier, market, since)
select 'RISE Association Management Group','RISE','Accelerate','Austin–Round Rock TX','Mar 2025'
where not exists (select 1 from public.accounts where short_name='RISE');

-- ===== Recurring services =====
insert into public.recurring_services (account_id, name, short, cadence, lane, color, last_touch, note, sort)
select id, v.* from public.accounts a,
(values
  ('Local Takeover','LT','Always-on','BoardReach','pink','Updated yesterday','12 locations · top-3 in 8 markets',0),
  ('GBP Optimization','GBP','Weekly','BoardReach','yellow','Posts published Mon','3 listings · 2,840 monthly views',1),
  ('PPC Management','PPC','Daily monitoring','BoardMatch','purple','Optimized 6h ago','$3.2K/mo · 4.1× ROAS',2),
  ('SEO / GEO','SEO','Monthly','BoardReach','blue','Report sent Mar 1','Tracking 142 keywords',3),
  ('Review Generation','REV','Always-on','BoardRetain','green','8 new reviews this week','4.8★ avg · 312 total',4)
) as v(name,short,cadence,lane,color,last_touch,note,sort)
where a.short_name='RISE';

-- ===== Projects =====
insert into public.projects (account_id, code, title, phase, engines, pct, status, due_label, due_rel, owners, pulse, sort)
select id, v.* from public.accounts a,
(values
  ('PR-218','Geo landing pages — North Austin cluster','BoardReach','{reach}'::text[],72,'in-progress','Apr 12','in 26 days','{JG,SN}'::text[],'Last update 2h ago',0),
  ('PR-201','Proposal redesign v2 — Premium kit','BoardMatch','{match}'::text[],88,'review','Mar 21','needs your review','{CL}'::text[],'Awaiting your approval',1),
  ('PR-194','Outsmarting AI Search · micro-course','Energy','{reach,match,retain}'::text[],100,'live','Mar 14','shipped','{JG,SN,CL}'::text[],'Live · 247 views',2),
  ('PR-225','Q1 board education program — Module 3','BoardRetain','{retain}'::text[],34,'in-progress','Apr 28','in 6 wks','{SN,CL}'::text[],'Drafting outline',3),
  ('PR-211','GBP listings refresh — all 3 locations','BoardReach','{reach,retain}'::text[],18,'review','Apr 4','awaiting your photos','{JG}'::text[],'Need photos from you',4),
  ('PR-188','RISE case study — Lakeway Villas signing','BoardReach','{reach,match}'::text[],100,'live','Feb 22','shipped','{CL,SN}'::text[],'Live · 1.4K views',5),
  ('PR-230','Pillar page · HOA budgeting authority hub','BoardReach','{reach}'::text[],52,'in-progress','May 9','in 8 wks','{JG,CL}'::text[],'Outline approved · drafting',6),
  ('PR-232','BD discovery script · v3 rollout','BoardMatch','{match}'::text[],28,'in-progress','May 2','in 7 wks','{CL}'::text[],'First training session booked',7),
  ('PR-235','Round Rock geo cluster · 10 pages','BoardReach','{reach}'::text[],12,'planning','May 24','in 10 wks','{JG,SN}'::text[],'Keyword brief in review',8),
  ('PR-237','Manager transition playbook · refresh','BoardRetain','{retain}'::text[],46,'in-progress','Apr 30','in 6 wks','{SN}'::text[],'2 sections to go',9),
  ('PR-240','Quarterly proposal kit · digital v3','BoardMatch','{match,retain}'::text[],8,'assigned','Jun 6','in 12 wks','{CL,JG}'::text[],'Discovery kickoff this week',10),
  ('PR-242','Westwind onboarding · web + GBP','BoardReach','{reach,retain}'::text[],64,'review','Apr 21','awaiting your approval','{JG}'::text[],'Final copy ready for sign-off',11),
  ('PR-244','CAI Austin chapter · sponsorship assets','Energy','{reach,match}'::text[],22,'planning','Apr 18','in 4 wks','{CL,SN}'::text[],'Booth design approved',12)
) as v(code,title,phase,engines,pct,status,due_label,due_rel,owners,pulse,sort)
where a.short_name='RISE';

-- ===== Leads =====
insert into public.leads (account_id, name, source, quality, value, type, time_label, sort)
select id, v.* from public.accounts a,
(values
  ('Westwind HOA · Karen Maslo','Google Ads · ''hoa management austin''','qualified','$48K/yr','call','12 min ago',0),
  ('Cedar Park Townhomes','Organic · /services/board-management','hot','$72K/yr','form','1h ago',1),
  ('Riverstone Master Assoc.','GBP · Round Rock listing','review','$110K/yr','call','3h ago',2),
  ('Brushy Creek Community','Direct · referral form','qualified','$58K/yr','form','yesterday',3)
) as v(name,source,quality,value,type,time_label,sort)
where a.short_name='RISE';

-- ===== Activity =====
insert into public.activity (account_id, color, text, meta, sort)
select id, v.* from public.accounts a,
(values
  ('pink','Lakeway Villas signed — $54K/yr contract attributed to Alloy','Just now · BoardMatch · +1 badge unlocked',0),
  ('yellow','12 new qualified leads from your Google Ads campaign','1h ago · WhatConverts',1),
  ('blue','Justin sent the new proposal v2 for your review','3h ago · BoardMatch · 2 changes',2),
  ('green','Your Google review average climbed to 4.8★ (+0.2)','Yesterday · BoardRetain',3),
  ('purple','Q1 strategy session notes published','Mar 12 · 14 priorities tracked',4)
) as v(color,text,meta,sort)
where a.short_name='RISE';

-- ===== Tickets (read-only cache; Zendesk is the source of truth) =====
insert into public.tickets (account_id, code, title, priority, status, agent, excerpt, time_label, sort)
select id, v.* from public.accounts a,
(values
  ('ZD-4218','Update phone number on every site footer','med','open','Cameron Lange','Hi team — we just changed our main 800 number to 855-555-0144. Can you push it everywhere it shows on our site, including the GBP listings, footer, and contact page?','12 min ago',0),
  ('ZD-4209','Need a quick edit on the Westwind case study','low','in-progress','Skyler Nelson','Board chair sent over a corrected quote — can we swap it on the case study page?','2h ago',1),
  ('ZD-4187','Question on Q2 budget — adding board education?','high','open','Justin Guenther','Want to talk through whether we have point budget room to add a 4-module board education program in Q2.','Yesterday',2),
  ('ZD-4156','Feedback on proposal v2 design','med','answered','Cameron Lange','Loved the new layout — one note on the cover page typography.','3 days ago',3),
  ('ZD-4144','Send tradeshow assets for CAI Austin chapter','med','answered','Justin Guenther','Need the booth banner and table topper files by Friday for the printer.','Last week',4)
) as v(code,title,priority,status,agent,excerpt,time_label,sort)
where a.short_name='RISE';

-- ===== ROI =====
insert into public.roi (account_id, year_label, invested, contract_value, boards_signed, ratio, rankings_tracked, rankings_top10)
select id,'Mar 2025 – Mar 2026',84000,612000,9,7.3,142,47 from public.accounts where short_name='RISE';

-- ===== KPIs =====
insert into public.kpis (account_id, label, value, trend, up, icon, tone, sort)
select id, v.* from public.accounts a,
(values
  ('Boards signed (12 mo)','9','+3',true,'trophy','pink',0),
  ('Qualified opportunities','412','+38%',true,'phone','yellow',1),
  ('Investment ratio','7.3×','+1.4×',true,'trend','purple',2),
  ('Avg review rating','4.8','+0.2',true,'star','green',3)
) as v(label,value,trend,up,icon,tone,sort)
where a.short_name='RISE';

-- ===== Weekly snapshots =====
insert into public.weekly_snapshots (account_id, week_label, pdf_path, quarterly_href, summary_waiting, summary_leads, summary_completed, leads_value, is_current, sort)
select id,'Week of Mar 16 – 22','reports/weekly-snapshot-mar-22.pdf','roi',3,4,2,'$288K/yr',true,0 from public.accounts where short_name='RISE';

insert into public.weekly_snapshots (account_id, week_label, pdf_path, is_current, sort)
select id, v.* from public.accounts a,
(values
  ('Week of Mar 9 – 15','reports/weekly-mar-15.pdf',false,1),
  ('Week of Mar 2 – 8','reports/weekly-mar-08.pdf',false,2),
  ('Week of Feb 23 – Mar 1','reports/weekly-mar-01.pdf',false,3),
  ('Week of Feb 16 – 22','reports/weekly-feb-22.pdf',false,4)
) as v(week_label,pdf_path,is_current,sort)
where a.short_name='RISE';

insert into public.weekly_snapshot_items (snapshot_id, kind, text, meta, sort)
select s.id, v.* from public.weekly_snapshots s,
(values
  ('waiting','Approve proposal redesign v2 — Premium kit','PR-201 · BoardMatch',0),
  ('waiting','Send GBP listing photos — all 3 locations','PR-211 · BoardReach',1),
  ('waiting','Qualify Riverstone Master Assoc.','$110K/yr · GBP Round Rock',2),
  ('completed','North Austin geo cluster — 8 pages live','PR-218 · shipped Thu',0),
  ('completed','Lakeway Villas case study published','PR-188 · 1.4K views',1),
  ('upcoming','Westwind onboarding — copy sign-off','Due Apr 21',0),
  ('upcoming','Board education · Module 3 kickoff','Drafting starts Mon',1),
  ('upcoming','Q1 strategy review call','Thu · 2:00 PM CT',2)
) as v(kind,text,meta,sort)
where s.account_id = (select id from public.accounts where short_name='RISE') and s.is_current;

-- ===== Roadmap =====
insert into public.roadmap_quarters (account_id, quarter, months, title, state, pdf_path, sort)
select id, v.* from public.accounts a,
(values
  ('Q1 2026','Jan – Mar','Foundation','done','playbooks/q1-2026-playbook.pdf',0),
  ('Q2 2026','Apr – Jun','Momentum','now','playbooks/q2-2026-playbook.pdf',1),
  ('Q3 2026','Jul – Sep','Scale','next','playbooks/q3-2026-playbook.pdf',2),
  ('Q4 2026','Oct – Dec','Expansion','future','playbooks/q4-2026-playbook.pdf',3)
) as v(quarter,months,title,state,pdf_path,sort)
where a.short_name='RISE';

insert into public.roadmap_focuses (quarter_id, text, status, sort)
select q.id, v.text, v.status, v.sort
from public.roadmap_quarters q
join (values
  ('Q1 2026','Site audit + technical SEO','complete',0),
  ('Q1 2026','GA4 + WhatConverts wired','complete',1),
  ('Q1 2026','Sales messaging refresh','complete',2),
  ('Q1 2026','Review generation campaign','missed',3),
  ('Q1 2026','South Austin geo cluster (12 pages)','missed',4),
  ('Q2 2026','North Austin geo cluster','complete',0),
  ('Q2 2026','GBP refresh — 3 locations','complete',1),
  ('Q2 2026','Premium proposal kit v2','complete',2),
  ('Q2 2026','Board education · Module 3','pending',3),
  ('Q2 2026','Outsmarting AI Search course launch','pending',4),
  ('Q3 2026','Pillar: HOA budgeting authority hub','pending',0),
  ('Q3 2026','Round Rock geo cluster','pending',1),
  ('Q3 2026','BD training · 2 sessions','pending',2),
  ('Q3 2026','Onboarding system v1','pending',3),
  ('Q3 2026','Annual review playbook','pending',4),
  ('Q4 2026','Certification track design','pending',0),
  ('Q4 2026','Second metro market scoping','pending',1),
  ('Q4 2026','RFP system templates','pending',2),
  ('Q4 2026','Board retention review','pending',3),
  ('Q4 2026','2027 roadmap planning','pending',4)
) as v(quarter,text,status,sort) on v.quarter = q.quarter
where q.account_id = (select id from public.accounts where short_name='RISE');

-- ===== Badges (global templates) =====
insert into public.badges (slug, name, description, color, category) values
  ('first-board','First Board','Signed your first contract attributed to Alloy.','pink','milestone'),
  ('five-wins','Five Wins','5 boards signed through the Alloy growth engine.','pink','milestone'),
  ('100k-pipeline','$100K Pipeline','Crossed $100K in attributed contract value.','yellow','pipeline'),
  ('500k-pipeline','Half-Mil Mark','Crossed $500K in lifetime attributed value.','yellow','pipeline'),
  ('review-streak','Review Magnet','Maintained 4.5★+ average across 100+ reviews.','green','health'),
  ('engagement-30','30-Day Streak','Logged into the portal 30 days running.','blue','engagement'),
  ('authority-tier','Authority Tier','Unlocked Authority status with 2+ published courses.','purple','tier'),
  ('ten-wins','Ten Wins','10 boards signed — graduate to elite client status.','pink','milestone'),
  ('geo-titan','Geo Titan','Top-3 ranking in 3 distinct geo markets.','yellow','visibility'),
  ('no-churn','Zero Churn ''26','Make it through the calendar year with no association loss.','green','health'),
  ('million-pipeline','$1M Mark','Cross $1M in lifetime Alloy-attributed value.','yellow','pipeline'),
  ('ascend','Ascend Tier','Graduate to the Ascend tier — multi-market expansion.','purple','tier'),
  ('founders-day','Founders'' Day','Spend a full strategy day with the Alloy partners in Austin.','pink','reward')
on conflict (slug) do nothing;

-- ===== Account badges (RISE state) =====
insert into public.account_badges (account_id, badge_id, state, pct, earned_label, sort)
select (select id from public.accounts where short_name='RISE'), b.id, v.state, v.pct, v.earned_label, v.sort
from public.badges b
join (values
  ('first-board','earned',null::int,'Earned May 2025',0),
  ('five-wins','earned',null,'Earned Nov 2025',1),
  ('100k-pipeline','earned',null,'Earned Jul 2025',2),
  ('500k-pipeline','earned',null,'Earned Feb 2026',3),
  ('review-streak','earned',null,'Earned Jan 2026',4),
  ('engagement-30','earned',null,'Earned today 🔥',5),
  ('authority-tier','earned',null,'Earned Mar 2026',6),
  ('ten-wins','progress',90,null,7),
  ('geo-titan','progress',60,null,8),
  ('no-churn','progress',22,null,9),
  ('million-pipeline','locked',null,null,10),
  ('ascend','locked',null,null,11),
  ('founders-day','locked',null,null,12)
) as v(slug,state,pct,earned_label,sort) on v.slug = b.slug
on conflict (account_id, badge_id) do nothing;

-- ===== Library (global) =====
insert into public.library_resources (lane, stage, title, meta, description, sort) values
  ('attract','BoardReach','The CAM SEO Field Guide','Guide · 24 min read','Everything you need to outrank generalist competitors in your metro.',0),
  ('attract','BoardReach','Outsmarting AI Search','Course · 5 lessons · in progress','How micro-courses drive citations from Perplexity, Gemini & ChatGPT.',1),
  ('close','BoardMatch','Proposal Anatomy','Playbook · 14 sections','What separates a winning CAM proposal from a discarded PDF.',2),
  ('close','BoardMatch','Discovery Frameworks for BD','Training · 3 sessions','The conversation pattern that gets boards talking honestly.',3),
  ('keep','BoardRetain','Manager Transition Playbook','Guide · 16 min read','Save the association when your manager moves on.',4),
  ('keep','BoardRetain','Board Education · Governance 101','Course · 6 modules','Position your firm as the educator. Reduce churn from misunderstanding.',5),
  ('energy','L&D','Building a Staff Onboarding Engine','Toolkit · templates included','Cut time-to-productivity for new community managers in half.',6),
  ('energy','L&D','Gamification for CAM Staff','Strategy guide · 18 min read','How recognition systems lift retention without feeling corny.',7);
